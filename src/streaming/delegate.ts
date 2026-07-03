import {
  AudioStreamingCodecType,
  CameraStreamingDelegate,
  HAP,
  Logger,
  PrepareStreamCallback,
  PrepareStreamRequest,
  SnapshotRequest,
  SnapshotRequestCallback,
  StreamingRequest,
  StreamRequestCallback,
  StreamRequestTypes,
  VideoInfo,
} from 'homebridge';
import { spawn, ChildProcess } from 'child_process';
import { DahuaApi } from '../dahua/api';
import { CameraConfig, VideoConfig } from '../configTypes';
import {
  DEFAULT_VIDEO_CONFIG,
  HOMEKIT_MAX_WIDTH,
  HOMEKIT_MAX_HEIGHT,
  QUALITY_PRESETS,
  PROBE_DEFAULTS_BY_CODEC,
  DEFAULT_STALL_TIMEOUT_MS,
  MAX_STALL_RESTARTS,
  STALL_CHECK_INTERVAL_MS,
} from '../settings';
import { pickPort } from 'pick-port';

interface SessionInfo {
  address: string;
  ipv6: boolean;
  videoPort: number;
  videoReturnPort: number;
  videoCryptoSuite: number;
  videoSRTP: Buffer;
  videoSSRC: number;
  audioPort: number;
  audioReturnPort: number;
  audioCryptoSuite: number;
  audioSRTP: Buffer;
  audioSSRC: number;
}

interface ActiveSession {
  sessionInfo: SessionInfo;
  videoProcess?: ChildProcess;
  timeout?: NodeJS.Timeout;
  // Stall watchdog state
  args?: string[];
  watchdogTimer?: NodeJS.Timeout;
  lastFrame?: number;
  lastFrameChangeTime?: number;
  restartCount?: number;
  restarting?: boolean;
}

interface ResolutionInfo {
  width: number;
  height: number;
  videoFilter?: string;
  resizeFilter?: string;
}

export class StreamingDelegate implements CameraStreamingDelegate {
  private readonly hap: HAP;
  private readonly videoConfig: VideoConfig;
  private readonly videoProcessor: string;
  private readonly dahuaApi?: DahuaApi;
  private pendingSessions: Map<string, SessionInfo> = new Map();
  private activeSessions: Map<string, ActiveSession> = new Map();
  private cachedSnapshot?: Buffer;
  private cachedSnapshotTime = 0;

  constructor(
    hap: HAP,
    private readonly cameraConfig: CameraConfig,
    videoProcessor: string,
    private readonly log: Logger,
    dahuaApi?: DahuaApi,
  ) {
    this.hap = hap;
    this.videoProcessor = videoProcessor;
    this.videoConfig = { ...DEFAULT_VIDEO_CONFIG, ...cameraConfig.videoConfig };
    this.dahuaApi = dahuaApi;
  }

  private determineResolution(request: SnapshotRequest | VideoInfo, isSnapshot: boolean): ResolutionInfo {
    const resInfo: ResolutionInfo = { width: 0, height: 0 };
    let requestedWidth = request.width;
    let requestedHeight = request.height;
    const maxWidth = Math.min(this.videoConfig.maxWidth || HOMEKIT_MAX_WIDTH, HOMEKIT_MAX_WIDTH);
    const maxHeight = Math.min(this.videoConfig.maxHeight || HOMEKIT_MAX_HEIGHT, HOMEKIT_MAX_HEIGHT);

    // qualityPreset acts as a floor for streaming — force the preset resolution
    // regardless of what HomeKit requests (HomeKit always starts low as a probe)
    if (!isSnapshot && this.videoConfig.qualityPreset) {
      requestedWidth = maxWidth;
      requestedHeight = maxHeight;
    }

    if (requestedWidth > maxWidth) requestedWidth = maxWidth;
    if (requestedHeight > maxHeight) requestedHeight = maxHeight;
    resInfo.width = requestedWidth;
    resInfo.height = requestedHeight;

    // Determine if we're using hardware encoder
    const encoder = this.videoConfig.encoder || 'software';
    const useHardwareAccel = encoder !== 'software' && !isSnapshot;

    if (resInfo.width > 0 || resInfo.height > 0) {
      const filters: string[] = [];
      
      // Add flip filters first (work on software or hardware frames)
      if (this.videoConfig.hflip) filters.push('hflip');
      if (this.videoConfig.vflip) filters.push('vflip');
      
      if (useHardwareAccel) {
        // Hardware acceleration path
        if (encoder === 'vaapi') {
          // FULL GPU: Hardware decode → GPU scale → Hardware encode
          filters.push('scale_vaapi=' +
            (resInfo.width > 0 ? `w='min(${resInfo.width},iw)'` : 'w=iw') + ':' +
            (resInfo.height > 0 ? `h='min(${resInfo.height},ih)'` : 'h=ih') +
            ':format=nv12');
        } else if (encoder === 'amf') {
          // AMF accepts software frames directly (NV12)
          // Just scale and convert to NV12, AMF will upload internally
          filters.push('scale=' +
            (resInfo.width > 0 ? `'min(${resInfo.width},iw)'` : 'iw') + ':' +
            (resInfo.height > 0 ? `'min(${resInfo.height},ih)'` : 'ih') +
            ':force_original_aspect_ratio=decrease');
          filters.push('format=nv12');
        } else if (encoder === 'quicksync') {
          // Software decode → QuickSync encode
          filters.push('scale=' +
            (resInfo.width > 0 ? `'min(${resInfo.width},iw)'` : 'iw') + ':' +
            (resInfo.height > 0 ? `'min(${resInfo.height},ih)'` : 'ih') +
            ':force_original_aspect_ratio=decrease');
          filters.push('format=nv12');
          filters.push('hwupload=extra_hw_frames=64');
        } else if (encoder === 'nvenc') {
          // Software decode → NVENC encode
          filters.push('scale=' +
            (resInfo.width > 0 ? `'min(${resInfo.width},iw)'` : 'iw') + ':' +
            (resInfo.height > 0 ? `'min(${resInfo.height},ih)'` : 'ih') +
            ':force_original_aspect_ratio=decrease');
          filters.push('format=nv12');
          filters.push('hwupload_cuda');
        }
      } else {
        // Software path
        filters.push('scale=' +
          (resInfo.width > 0 ? `'min(${resInfo.width},iw)'` : 'iw') + ':' +
          (resInfo.height > 0 ? `'min(${resInfo.height},ih)'` : 'ih') +
          ':force_original_aspect_ratio=decrease');
      }
      
      // Add custom video filter if provided (and not already hardware scale)
      if (this.videoConfig.videoFilter && !this.videoConfig.videoFilter.includes('scale_')) {
        filters.push(this.videoConfig.videoFilter);
      }
      
      if (filters.length > 0) {
        resInfo.videoFilter = filters.join(',');
      }
    }

    return resInfo;
  }

  async handleSnapshotRequest(request: SnapshotRequest, callback: SnapshotRequestCallback): Promise<void> {
    const resolution = this.determineResolution(request, true);
    this.log.info(`Snapshot request: ${request.width}x${request.height} -> ${resolution.width}x${resolution.height}`, this.cameraConfig.name);

    const now = Date.now();
    if (this.cachedSnapshot && now - this.cachedSnapshotTime < 3000) {
      this.log.debug('Returning cached snapshot', this.cameraConfig.name);
      callback(undefined, this.cachedSnapshot);
      return;
    }

    // Use direct HTTP digest auth if DahuaApi is available — no FFmpeg needed.
    // This is the correct approach for genuine Dahua-brand channels: the NVR's
    // snapshot.cgi returns JPEG directly. It does NOT work for non-Dahua/ONVIF
    // cameras patched into the NVR — Dahua's proprietary CGI endpoints are only
    // implemented for the NVR's own channels, not passthrough ONVIF channels, and
    // return HTTP errors (400/500) 100% of the time for those, no matter how the
    // request is retried, queued, or re-authenticated. Set `nativeSnapshot: false`
    // on those cameras to use the FFmpeg-from-RTSP fallback below instead.
    if (this.dahuaApi && this.videoConfig.nativeSnapshot !== false) {
      try {
        this.log.info(`Snapshot fetch: channel=${this.cameraConfig.channelId}`, this.cameraConfig.name);
        const jpeg = await this.dahuaApi.getSnapshot(this.cameraConfig.channelId);
        this.cachedSnapshot = jpeg;
        this.cachedSnapshotTime = Date.now();
        this.log.info(`Snapshot captured: ${jpeg.length} bytes`, this.cameraConfig.name);
        callback(undefined, jpeg);
      } catch (err) {
        this.log.error(`Snapshot failed: ${err}`, this.cameraConfig.name);
        callback(err as Error);
      }
      return;
    }

    // Fallback: FFmpeg-grab a frame from the RTSP stream.
    // IMPORTANT: platform.ts auto-generates `stillImageSource` for every camera as the
    // Dahua snapshot.cgi HTTPS URL, regardless of `nativeSnapshot`. When we're here
    // specifically because `nativeSnapshot: false` was set (ONVIF/non-Dahua channel),
    // that auto-generated URL is exactly the thing we're trying to avoid — FFmpeg can't
    // do digest auth over HTTPS anyway, so it just times out. Use the RTSP `source`
    // directly in that case. Only fall back to `stillImageSource` first when there's no
    // DahuaApi client at all (legacy/custom setups where the user may have deliberately
    // configured a working stillImageSource of their own).
    const source = this.videoConfig.nativeSnapshot === false
      ? (this.videoConfig.source || this.videoConfig.stillImageSource)
      : (this.videoConfig.stillImageSource || this.videoConfig.source);
    if (!source) {
      this.log.error('No source configured', this.cameraConfig.name);
      callback(new Error('No source configured'));
      return;
    }

    const sourceArgs = source.split(/\s+/);
    const isHttps = source.includes('https://');
    const timeoutArgs = isHttps ? ['-timeout', '8000000'] : [];

    const ffmpegArgs: string[] = ['-hide_banner', ...timeoutArgs, ...sourceArgs, '-frames:v', '1'];
    if (resolution.videoFilter) ffmpegArgs.push('-vf', resolution.videoFilter);
    ffmpegArgs.push('-f', 'image2', '-');

    this.log.debug(`Snapshot command: ${this.videoProcessor} ${ffmpegArgs.join(' ')}`, this.cameraConfig.name);
    const ffmpeg = spawn(this.videoProcessor, ffmpegArgs, { env: process.env });
    const chunks: Buffer[] = [];
    let error = '';

    ffmpeg.stdout.on('data', (data: Buffer) => chunks.push(data));
    ffmpeg.stderr.on('data', (data: Buffer) => { error += data.toString(); });
    ffmpeg.on('error', (err) => { this.log.error(`Snapshot error: ${err.message}`, this.cameraConfig.name); callback(err); });
    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        this.log.error(`Snapshot FFmpeg exited with code ${code}`, this.cameraConfig.name);
        if (this.videoConfig.debug) this.log.debug(`FFmpeg stderr: ${error}`, this.cameraConfig.name);
        callback(new Error(`FFmpeg exited with code ${code}`));
        return;
      }
      const snapshot = Buffer.concat(chunks);
      if (snapshot.length === 0) {
        this.log.error('Empty snapshot received', this.cameraConfig.name);
        callback(new Error('Empty snapshot'));
        return;
      }
      this.cachedSnapshot = snapshot;
      this.cachedSnapshotTime = Date.now();
      this.log.info(`Snapshot captured: ${snapshot.length} bytes`, this.cameraConfig.name);
      callback(undefined, snapshot);
    });

    setTimeout(() => { if (!ffmpeg.killed) { ffmpeg.kill('SIGKILL'); this.log.warn('Snapshot timeout', this.cameraConfig.name); } }, 10000);
  }

  async prepareStream(request: PrepareStreamRequest, callback: PrepareStreamCallback): Promise<void> {
    const ipv6 = request.addressVersion === 'ipv6';
    const videoPort = await pickPort({ type: 'udp', ip: ipv6 ? '::' : '0.0.0.0', reserveTimeout: 15 });
    const videoReturnPort = await pickPort({ type: 'udp', ip: ipv6 ? '::' : '0.0.0.0', reserveTimeout: 15 });
    const audioPort = await pickPort({ type: 'udp', ip: ipv6 ? '::' : '0.0.0.0', reserveTimeout: 15 });
    const audioReturnPort = await pickPort({ type: 'udp', ip: ipv6 ? '::' : '0.0.0.0', reserveTimeout: 15 });

    const sessionInfo: SessionInfo = {
      address: request.targetAddress,
      ipv6,
      videoPort: request.video.port,
      videoReturnPort,
      videoCryptoSuite: request.video.srtpCryptoSuite,
      videoSRTP: Buffer.concat([request.video.srtp_key, request.video.srtp_salt]),
      videoSSRC: this.hap.CameraController.generateSynchronisationSource(),
      audioPort: request.audio.port,
      audioReturnPort,
      audioCryptoSuite: request.audio.srtpCryptoSuite,
      audioSRTP: Buffer.concat([request.audio.srtp_key, request.audio.srtp_salt]),
      audioSSRC: this.hap.CameraController.generateSynchronisationSource(),
    };

    this.pendingSessions.set(request.sessionID, sessionInfo);

    const response = {
      video: { port: videoPort, ssrc: sessionInfo.videoSSRC, srtp_key: request.video.srtp_key, srtp_salt: request.video.srtp_salt },
      audio: { port: audioPort, ssrc: sessionInfo.audioSSRC, srtp_key: request.audio.srtp_key, srtp_salt: request.audio.srtp_salt },
    };

    this.log.debug(`Stream prepared: ${request.targetAddress}:${request.video.port}`, this.cameraConfig.name);
    callback(undefined, response);
  }

  handleStreamRequest(request: StreamingRequest, callback: StreamRequestCallback): void {
    switch (request.type) {
      case StreamRequestTypes.START:
        this.startStream(request, callback);
        break;
      case StreamRequestTypes.RECONFIGURE:
        // qualityPreset forces the start resolution so RECONFIGURE is a no-op
        if ('video' in request) {
          this.log.debug(`Reconfigure ignored (already at preset resolution): ${request.video.width}x${request.video.height}`, this.cameraConfig.name);
        }
        callback();
        break;
      case StreamRequestTypes.STOP:
        this.stopStream(request.sessionID);
        callback();
        break;
    }
  }

  private startStream(request: StreamingRequest, callback: StreamRequestCallback): void {
    const sessionInfo = this.pendingSessions.get(request.sessionID);
    if (!sessionInfo) {
      this.log.error('Session not found', this.cameraConfig.name);
      callback(new Error('Session not found'));
      return;
    }

    this.pendingSessions.delete(request.sessionID);
    
    // Type guard to ensure we have video info
    if (!('video' in request)) {
      this.log.error('No video info in start request', this.cameraConfig.name);
      callback(new Error('Invalid request'));
      return;
    }
    
    const resolution = this.determineResolution(request.video, false);

    let bitrate = request.video.max_bit_rate;
    if (this.videoConfig.maxBitrate && bitrate > this.videoConfig.maxBitrate) bitrate = this.videoConfig.maxBitrate;
    // qualityPreset bitrate is a floor — don't let HomeKit's probe bitrate win
    if (this.videoConfig.qualityPreset) {
      const presetBitrate = QUALITY_PRESETS[this.videoConfig.qualityPreset]?.maxBitrate;
      if (presetBitrate && bitrate < presetBitrate) bitrate = presetBitrate;
    }

    this.log.info(`Starting stream: ${resolution.width}x${resolution.height} ${bitrate}kbps`, this.cameraConfig.name);

    // Log encoder and pipeline being used
    const encoder = this.videoConfig.encoder || 'software';
    const vcodec = this.deriveVcodec(encoder);
    
    if (encoder === 'software') {
      this.log.info(`Video encoder: ${vcodec} (software)`, this.cameraConfig.name);
    } else if (encoder === 'vaapi') {
      this.log.info(`Video encoder: ${vcodec} (VAAPI - FULL GPU: hw decode+scale+encode)`, this.cameraConfig.name);
    } else if (encoder === 'amf') {
      this.log.info(`Video encoder: ${vcodec} (AMF - CPU decode+scale, GPU encode)`, this.cameraConfig.name);
    } else if (encoder === 'quicksync') {
      this.log.info(`Video encoder: ${vcodec} (QuickSync)`, this.cameraConfig.name);
    } else if (encoder === 'nvenc') {
      this.log.info(`Video encoder: ${vcodec} (NVENC)`, this.cameraConfig.name);
    } else {
      this.log.info(`Video encoder: ${vcodec} (${encoder})`, this.cameraConfig.name);
    }

    const source = this.videoConfig.source;
    if (!source) {
      this.log.error('No source configured', this.cameraConfig.name);
      callback(new Error('No source configured'));
      return;
    }

    const ffmpegArgs = this.buildFfmpegArgs(source, sessionInfo, resolution, bitrate, request);
    this.log.debug(`FFmpeg command: ${this.videoProcessor} ${ffmpegArgs}`, this.cameraConfig.name);

    if (this.videoConfig.audio) {
      const audioCodecName = 'audio' in request && request.audio.codec === AudioStreamingCodecType.OPUS ? 'OPUS' : 
                             'audio' in request && request.audio.codec === AudioStreamingCodecType.AAC_ELD ? 'AAC-eld' : 'unknown';
      this.log.info(`Audio enabled: ${audioCodecName}`, this.cameraConfig.name);
    }

    // Split the command string into array for spawn
    const args = ffmpegArgs.split(/\s+/).filter(arg => arg.length > 0);
    const activeSession: ActiveSession = {
      sessionInfo,
      args,
      lastFrame: 0,
      lastFrameChangeTime: Date.now(),
      restartCount: 0,
      restarting: false,
    };
    this.activeSessions.set(request.sessionID, activeSession);

    this.spawnFfmpegProcess(request.sessionID, args);

    if (this.videoConfig.stallWatchdog !== false) {
      this.startStallWatchdog(request.sessionID);
    }

    callback();
  }

  /**
   * Spawns the FFmpeg process for a session and wires up its output handlers.
   * Used both for the initial stream start and for silent stall-recovery restarts
   * (see startStallWatchdog) — a restart reuses the same activeSession entry and the
   * same FFmpeg args (same SRTP ports/keys already negotiated with HomeKit), so
   * HomeKit never needs to know a restart happened.
   */
  private spawnFfmpegProcess(sessionID: string, args: string[]): void {
    const activeSession = this.activeSessions.get(sessionID);
    if (!activeSession) return;

    const ffmpeg = spawn(this.videoProcessor, args, { env: process.env });
    activeSession.videoProcess = ffmpeg;

    // Parse -progress pipe:1 output to track whether frames are actually advancing.
    // Previously this was fully drained/discarded; now it feeds the stall watchdog.
    let progressBuffer = '';
    ffmpeg.stdout?.on('data', (data: Buffer) => {
      progressBuffer += data.toString();
      const lines = progressBuffer.split('\n');
      progressBuffer = lines.pop() || '';
      for (const line of lines) {
        const match = line.match(/^frame=(\d+)/);
        if (match) {
          const frame = parseInt(match[1], 10);
          if (frame !== activeSession.lastFrame) {
            activeSession.lastFrame = frame;
            activeSession.lastFrameChangeTime = Date.now();
          }
        }
      }
    });

    ffmpeg.stderr?.on('data', (data: Buffer) => {
      if (this.videoConfig.debug) {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.length > 0) this.log.debug(`[FFmpeg] ${line}`, this.cameraConfig.name);
        }
      }
    });

    ffmpeg.on('error', (err) => {
      this.log.error(`FFmpeg error: ${err.message}`, this.cameraConfig.name);
      // Only tear down the session if this is still the current process for it —
      // if a stall-watchdog restart already replaced it, this is a late event from
      // the superseded process and must not kill the replacement.
      if (activeSession.videoProcess === ffmpeg) this.stopStream(sessionID);
    });

    ffmpeg.on('close', (code) => {
      if (activeSession.videoProcess !== ffmpeg) {
        // This process was already superseded by a stall-watchdog restart (kill()
        // is async, so this event can arrive well after the replacement is running).
        // Nothing to do — the replacement owns the session now.
        return;
      }
      if (code !== 0 && code !== null) this.log.warn(`FFmpeg exited with code ${code}`, this.cameraConfig.name);
      this.stopStream(sessionID);
    });
  }

  /**
   * Watches for a frozen FFmpeg video pipeline and force-restarts it.
   *
   * Root cause context (confirmed via direct testing on the host, independent of
   * this plugin): this is a known, reproducible FFmpeg+VAAPI+Mesa/radeonsi driver
   * hang — it occurs in a bare `ffmpeg` process with no network output and no
   * HomeKit involved at all, so it cannot be fixed at the plugin level. What the
   * plugin CAN do is stop it from becoming a permanent black screen: HomeKit's
   * live-view player does not reliably self-recover from an interruption during
   * stream startup, so restarting FFmpeg within a couple of seconds — before
   * HomeKit's own patience runs out — turns an otherwise-fatal hang into something
   * the viewer never notices.
   */
  private startStallWatchdog(sessionID: string): void {
    const activeSession = this.activeSessions.get(sessionID);
    if (!activeSession) return;

    const stallTimeoutMs = this.videoConfig.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;

    activeSession.watchdogTimer = setInterval(() => {
      const session = this.activeSessions.get(sessionID);
      if (!session || session.restarting) return;

      const stalledMs = Date.now() - (session.lastFrameChangeTime ?? Date.now());
      if (stalledMs < stallTimeoutMs) return;

      const restartCount = session.restartCount ?? 0;
      if (restartCount >= MAX_STALL_RESTARTS) {
        this.log.error(
          `⚠️ STALL WATCHDOG: frame counter still frozen at ${session.lastFrame} after ${MAX_STALL_RESTARTS} restart attempts — giving up, letting HomeKit time out`,
          this.cameraConfig.name,
        );
        if (session.watchdogTimer) clearInterval(session.watchdogTimer);
        return;
      }

      this.log.warn(
        `⚠️ STALL WATCHDOG: frame counter frozen at ${session.lastFrame} for ${stalledMs}ms — ` +
        `restarting FFmpeg (attempt ${restartCount + 1}/${MAX_STALL_RESTARTS})`,
        this.cameraConfig.name,
      );

      session.restarting = true;
      session.videoProcess?.kill('SIGKILL');
      session.restartCount = restartCount + 1;
      session.lastFrame = 0;
      session.lastFrameChangeTime = Date.now();

      if (session.args) {
        this.spawnFfmpegProcess(sessionID, session.args);
        session.restarting = false;
        this.log.info(
          `⚠️ STALL WATCHDOG: FFmpeg restarted (attempt ${session.restartCount}/${MAX_STALL_RESTARTS})`,
          this.cameraConfig.name,
        );
      }
    }, STALL_CHECK_INTERVAL_MS);
  }

  private buildFfmpegArgs(source: string, sessionInfo: SessionInfo, resolution: ResolutionInfo, bitrate: number, request: StreamingRequest): string {
    const encoder = this.videoConfig.encoder || 'software';
    const vcodec = this.deriveVcodec(encoder);
    
    const mtu = this.videoConfig.packetSize || 1316;
    let encoderOptions = this.videoConfig.encoderOptions;
    
    // Quality profile for hardware encoders - OPTIONAL
    // Only apply if user explicitly set a profile (not empty string)
    const qualityProfile = this.videoConfig.qualityProfile;
    let gopSize = 0;   // 0 = don't add -g flag
    let bframes = -1;  // -1 = don't add -bf flag
    
    // Set default encoder options based on actual vcodec being used
    // KEEP MINIMAL - many hardware encoders work best with NO options!
    if (!encoderOptions) {
      if (vcodec === 'libx264') {
        encoderOptions = '-preset ultrafast -tune zerolatency';
      } else if (vcodec === 'h264_vaapi') {
        // VAAPI - Only apply quality profile if user selected one
        if (qualityProfile === 'speed') {
          gopSize = 25;
          bframes = 0;
          encoderOptions = '-quality 1';
        } else if (qualityProfile === 'quality') {
          gopSize = 13;
          bframes = 2;
          encoderOptions = '-quality 7';
        } else if (qualityProfile === 'balanced') {
          gopSize = 19;
          bframes = 0;
          encoderOptions = '-quality 4';
        } else {
          // No profile selected (empty or undefined) - use VAAPI defaults
          encoderOptions = '';
        }
      } else if (vcodec === 'h264_amf') {
        // AMF - Only apply quality profile if user selected one
        if (qualityProfile === 'speed') {
          gopSize = 25;
          bframes = 0;
          encoderOptions = '-usage transcoding -quality speed';
        } else if (qualityProfile === 'quality') {
          gopSize = 13;
          bframes = 2;
          encoderOptions = '-usage transcoding -quality quality';
        } else if (qualityProfile === 'balanced') {
          gopSize = 19;
          bframes = 0;
          encoderOptions = '-usage transcoding -quality balanced';
        } else {
          // No profile - minimal AMF options
          encoderOptions = '-usage transcoding';
        }
      } else if (vcodec === 'h264_qsv') {
        // QuickSync - Only apply quality profile if user selected one
        if (qualityProfile === 'speed') {
          gopSize = 25;
          bframes = 0;
          encoderOptions = '-preset veryfast';
        } else if (qualityProfile === 'quality') {
          gopSize = 13;
          bframes = 2;
          encoderOptions = '-preset slow';
        } else if (qualityProfile === 'balanced') {
          gopSize = 19;
          bframes = 0;
          encoderOptions = '-preset medium';
        } else {
          // No profile - minimal QuickSync
          encoderOptions = '-preset medium';
        }
      } else if (vcodec.includes('nvenc')) {
        // NVENC - Only apply quality profile if user selected one
        if (qualityProfile === 'speed') {
          gopSize = 25;
          bframes = 0;
          encoderOptions = '-preset p1 -tune ll';
        } else if (qualityProfile === 'quality') {
          gopSize = 13;
          bframes = 2;
          encoderOptions = '-preset p7 -tune hq';
        } else if (qualityProfile === 'balanced') {
          gopSize = 19;
          bframes = 0;
          encoderOptions = '-preset p4 -tune ll';
        } else {
          // No profile - minimal NVENC
          encoderOptions = '-preset p4 -tune ll';
        }
      } else {
        // For any other codec, don't add encoder options
        encoderOptions = '';
      }
    }

    // Type guards
    if (!('video' in request)) {
      throw new Error('No video info in request');
    }
    
    // Start building command
    let ffmpegArgs = '';
    
    // Hardware acceleration setup
    if (encoder === 'vaapi') {
      // FULL GPU: Hardware decode + scale + encode
      const hwDevice = this.videoConfig.hwaccelDevice || '/dev/dri/renderD128';
      ffmpegArgs += `-hwaccel vaapi -hwaccel_device ${hwDevice} -hwaccel_output_format vaapi `;
    } else if (encoder === 'quicksync') {
      ffmpegArgs += `-init_hw_device qsv=hw `;
    } else if (encoder === 'nvenc') {
      ffmpegArgs += `-init_hw_device cuda=cu:0 `;
    }
    // AMF doesn't need special init - it accepts software frames
    
    // Build input args in correct FFmpeg order (all must come before -i):
    // 1. -allowed_media_types (skip audio track if audio disabled)
    // 2. -probesize / -analyzeduration
    //    Priority: explicit user override > codec-based smart default > FFmpeg's own default.
    //    Regression note: v2.0.1-2.0.4 dropped the codec-based default entirely, so any
    //    camera without an explicit probeSize/analyzeDuration fell back to FFmpeg's ~5s
    //    analysis window. For hardware-accelerated H.265 streams this analysis delay was
    //    long enough that HomeKit gave up waiting and never displayed video, even though
    //    FFmpeg itself was running fine. Setting `codec` on the camera restores fast,
    //    reliable startup without needing to hand-tune probeSize/analyzeDuration.
    // 3. -i <url>
    let modifiedSource = source;
    if (source.includes('rtsp://')) {
      const iMatch = source.match(/^(.*?)-i\s+(\S+.*)$/s);
      if (iMatch) {
        const preI = iMatch[1];
        const urlAndRest = iMatch[2];
        const inputArgs: string[] = [];
        if (!this.videoConfig.audio) inputArgs.push('-allowed_media_types video');

        const codecDefaults = this.videoConfig.codec ? PROBE_DEFAULTS_BY_CODEC[this.videoConfig.codec] : undefined;
        const probeSize = this.videoConfig.probeSize !== undefined ? this.videoConfig.probeSize : codecDefaults?.probeSize;
        const analyzeDuration = this.videoConfig.analyzeDuration !== undefined ? this.videoConfig.analyzeDuration : codecDefaults?.analyzeDuration;

        if (probeSize !== undefined || analyzeDuration !== undefined) {
          const resolvedProbeSize = probeSize !== undefined ? probeSize : 5000000;
          const resolvedAnalyzeDuration = analyzeDuration !== undefined ? analyzeDuration : 5000000;
          inputArgs.push(`-probesize ${resolvedProbeSize} -analyzeduration ${resolvedAnalyzeDuration}`);
        }
        if (inputArgs.length > 0) {
          modifiedSource = `${preI}${inputArgs.join(' ')} -i ${urlAndRest}`;
        }
      }
    }
    // Add source (includes -i)
    ffmpegArgs += modifiedSource;

    // Video encoding settings
    const isHardwareEncoder = encoder !== 'software';
    const pixFmt = isHardwareEncoder ? '' : ' -pix_fmt yuv420p'; // Only set for software
    const colorRange = (isHardwareEncoder && encoder !== 'vaapi') ? ' -color_range mpeg' : ''; // Skip for VAAPI (conflicts with scale_vaapi)
    const gopParams = gopSize > 0 ? ` -g ${gopSize}` : ''; // Only add if quality profile set
    const bframeParams = bframes >= 0 ? ` -bf ${bframes}` : ''; // Only add if quality profile set (-1 = skip)
    
    // Map HomeKit's negotiated H264 profile/level onto explicit FFmpeg flags.
    // Without this, the encoder picks its own default (VAAPI defaults to High
    // profile regardless of what HomeKit actually asked for) — if the viewing
    // client negotiated a lower profile/level for this specific session (varies by
    // device, tvOS/iOS version, and network conditions), it may fail to decode a
    // bitstream it never agreed to, even though FFmpeg itself reports success the
    // whole time. This is standard practice in every reference implementation
    // checked (HAP-NodeJS's own example accessory, go2rtc) and was previously
    // missing here for every encoder path.
    const h264ProfileNames = ['baseline', 'main', 'high'];
    const h264LevelNames = ['3.1', '3.2', '4.0'];
    const profileIndex = 'profile' in request.video ? request.video.profile : undefined;
    const levelIndex = 'level' in request.video ? request.video.level : undefined;
    const profileName = profileIndex !== undefined ? h264ProfileNames[profileIndex] : undefined;
    const levelName = levelIndex !== undefined ? h264LevelNames[levelIndex] : undefined;
    if (profileName || levelName) {
      this.log.info(
        `HomeKit negotiated: profile=${profileName ?? 'unknown'} level=${levelName ?? 'unknown'}`,
        this.cameraConfig.name,
      );
    }
    const profileLevelParams = `${profileName ? ` -profile:v ${profileName}` : ''}${levelName ? ` -level:v ${levelName}` : ''}`;

    ffmpegArgs += `${' -an -sn -dn'
      } -codec:v ${vcodec
      }${profileLevelParams
      }${pixFmt
      }${colorRange
      }${resolution.videoFilter ? ` -filter:v ${resolution.videoFilter}` : ''
      }${encoderOptions ? ` ${encoderOptions}` : ''
      }${bframeParams
      }${gopParams
      }${bitrate > 0 ? ` -b:v ${bitrate}k` : ''
      } -payload_type ${'pt' in request.video ? request.video.pt : 99}`;

    // Video Stream
    ffmpegArgs += ` -ssrc ${sessionInfo.videoSSRC
      } -f rtp`
      + ` -srtp_out_suite AES_CM_128_HMAC_SHA1_80`
      + ` -srtp_out_params ${sessionInfo.videoSRTP.toString('base64')
      } srtp://${sessionInfo.address}:${sessionInfo.videoPort
      }?rtcpport=${sessionInfo.videoPort}&pkt_size=${mtu}`;

    // Audio (if enabled)
    if (this.videoConfig.audio && 'audio' in request) {
      if (request.audio.codec === AudioStreamingCodecType.OPUS || request.audio.codec === AudioStreamingCodecType.AAC_ELD) {
        // Use copy if enabled and codec is compatible, otherwise transcode
        const useAudioCopy = this.videoConfig.copyAudio === true;
        ffmpegArgs // Audio
          += `${' -vn -sn -dn'
          + (useAudioCopy
            ? ' -codec:a copy'
            : request.audio.codec === AudioStreamingCodecType.OPUS
              ? ' -codec:a libopus'
              + ' -application lowdelay'
              : ' -codec:a libfdk_aac'
                + ' -profile:a aac_eld')
          } -flags +global_header`
          + ` -f rtp`
          + (useAudioCopy ? '' : ` -ar ${request.audio.sample_rate}k`)
          + (useAudioCopy ? '' : ` -b:a ${request.audio.max_bit_rate}k`)
          + ` -ac ${request.audio.channel
          } -payload_type ${'pt' in request.audio ? request.audio.pt : 110}`;

        ffmpegArgs // Audio Stream
          += ` -ssrc ${sessionInfo.audioSSRC
          } -f rtp`
          + ` -srtp_out_suite AES_CM_128_HMAC_SHA1_80`
          + ` -srtp_out_params ${sessionInfo.audioSRTP.toString('base64')
          } srtp://${sessionInfo.address}:${sessionInfo.audioPort
          }?rtcpport=${sessionInfo.audioPort}&pkt_size=188`;
      } else {
        this.log.error(`Unsupported audio codec requested: ${request.audio.codec}`, this.cameraConfig.name);
      }
    }

    ffmpegArgs += ` -loglevel level${this.videoConfig.debug ? '+verbose' : ''
      } -progress pipe:1`;

    return ffmpegArgs;
  }

  private deriveVcodec(encoder: string): string {
    if (encoder === 'vaapi') return 'h264_vaapi';
    if (encoder === 'amf') return 'h264_amf';
    if (encoder === 'quicksync') return 'h264_qsv';
    if (encoder === 'nvenc') return 'h264_nvenc';
    if (encoder === 'videotoolbox') return 'h264_videotoolbox';
    if (encoder === 'v4l2') return 'h264_v4l2m2m';
    return 'libx264';
  }

  private stopStream(sessionID: string): void {
    const session = this.activeSessions.get(sessionID);
    if (!session) return;

    this.log.info('Stopping stream', this.cameraConfig.name);
    if (session.videoProcess) session.videoProcess.kill('SIGKILL');
    if (session.timeout) clearTimeout(session.timeout);
    if (session.watchdogTimer) clearInterval(session.watchdogTimer);
    this.activeSessions.delete(sessionID);
  }

  stopAllStreams(): void {
    for (const sessionID of this.activeSessions.keys()) {
      this.stopStream(sessionID);
    }
  }
}



