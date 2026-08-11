import {
  AudioStreamingCodecType,
  CameraController,
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
  STALL_CHECK_INTERVAL_MS,
  DEFAULT_FORCE_KEYFRAME_INTERVAL_SECONDS,
} from '../settings';
import { pickPort } from 'pick-port';
import { validateVaapi } from '../ffmpeg/hwaccel';

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
  watchdogTimer?: NodeJS.Timeout;
  lastFrame?: number;
  lastFrameChangeTime?: number;
}

interface ResolutionInfo {
  width: number;
  height: number;
  videoFilter?: string;
}

/**
 * Architectural principles this file follows, adopted after direct comparison with
 * homebridge-unifi-protect's real source (protect-stream.ts, homebridge-plugin-utils):
 *
 * 1. Never trust a capability just because it's configured or reported — verify it with
 *    a real test before relying on it (see validateVaapi in ../ffmpeg/hwaccel.ts).
 * 2. When something breaks mid-session, terminate the HAP session honestly via the
 *    official CameraController API and let HomeKit's own retry logic recover, rather
 *    than silently swapping the underlying process behind HomeKit's back.
 * 3. Build FFmpeg arguments as a typed array, one argument per push, not a giant
 *    template string — this is what makes every other change here auditable, and it's
 *    what let a real port-mismatch bug hide undetected across several releases.
 * 4. Avoid transcoding entirely when the source already satisfies HomeKit's
 *    requirements (see the stream-copy path for already-H.264 sources).
 */
export class StreamingDelegate implements CameraStreamingDelegate {
  private readonly hap: HAP;
  private readonly videoConfig: VideoConfig;
  private readonly videoProcessor: string;
  private readonly dahuaApi?: DahuaApi;
  private controller?: CameraController;
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

  /**
   * Wires up the CameraController reference after it's constructed (camera.ts creates
   * this delegate before the controller exists, so it can't be passed in the
   * constructor). Required for clean, honest session termination — see stopStream and
   * the stall watchdog below, both of which call controller.forceStopStreamingSession()
   * rather than silently managing the FFmpeg process behind HomeKit's back.
   */
  setController(controller: CameraController): void {
    this.controller = controller;
  }

  private determineResolution(request: SnapshotRequest | VideoInfo, isSnapshot: boolean, resolvedEncoder?: string): ResolutionInfo {
    const resInfo: ResolutionInfo = { width: 0, height: 0 };
    let requestedWidth = request.width;
    let requestedHeight = request.height;
    const maxWidth = Math.min(this.videoConfig.maxWidth || HOMEKIT_MAX_WIDTH, HOMEKIT_MAX_WIDTH);
    const maxHeight = Math.min(this.videoConfig.maxHeight || HOMEKIT_MAX_HEIGHT, HOMEKIT_MAX_HEIGHT);

    if (!isSnapshot && this.videoConfig.qualityPreset) {
      requestedWidth = maxWidth;
      requestedHeight = maxHeight;
    }

    if (requestedWidth > maxWidth) requestedWidth = maxWidth;
    if (requestedHeight > maxHeight) requestedHeight = maxHeight;
    resInfo.width = requestedWidth;
    resInfo.height = requestedHeight;

    // Use the resolved encoder (post hardware-validation) when supplied, not the
    // static config value — otherwise a VAAPI validation failure that downgrades
    // the actual encoder to software never reaches this method, and it keeps
    // building a scale_vaapi filter for a plain software encoder that can't use
    // it. FFmpeg then fails immediately: "Impossible to convert between the
    // formats supported by the filter" — the encoder and filter were disagreeing
    // about whether hardware frames exist at all.
    const encoder = resolvedEncoder ?? (this.videoConfig.encoder || 'software');
    const useHardwareAccel = encoder !== 'software' && !isSnapshot;

    if (resInfo.width > 0 || resInfo.height > 0) {
      const filters: string[] = [];

      if (this.videoConfig.hflip) filters.push('hflip');
      if (this.videoConfig.vflip) filters.push('vflip');

      if (useHardwareAccel) {
        if (encoder === 'vaapi') {
          filters.push('scale_vaapi=' +
            (resInfo.width > 0 ? `w='min(${resInfo.width},iw)'` : 'w=iw') + ':' +
            (resInfo.height > 0 ? `h='min(${resInfo.height},ih)'` : 'h=ih') +
            ':format=nv12');
        } else if (encoder === 'amf') {
          filters.push('scale=' +
            (resInfo.width > 0 ? `'min(${resInfo.width},iw)'` : 'iw') + ':' +
            (resInfo.height > 0 ? `'min(${resInfo.height},ih)'` : 'ih') +
            ':force_original_aspect_ratio=decrease');
          filters.push('format=nv12');
        } else if (encoder === 'quicksync') {
          filters.push('scale=' +
            (resInfo.width > 0 ? `'min(${resInfo.width},iw)'` : 'iw') + ':' +
            (resInfo.height > 0 ? `'min(${resInfo.height},ih)'` : 'ih') +
            ':force_original_aspect_ratio=decrease');
          filters.push('format=nv12');
          filters.push('hwupload=extra_hw_frames=64');
        } else if (encoder === 'nvenc') {
          filters.push('scale=' +
            (resInfo.width > 0 ? `'min(${resInfo.width},iw)'` : 'iw') + ':' +
            (resInfo.height > 0 ? `'min(${resInfo.height},ih)'` : 'ih') +
            ':force_original_aspect_ratio=decrease');
          filters.push('format=nv12');
          filters.push('hwupload_cuda');
        }
      } else {
        filters.push('scale=' +
          (resInfo.width > 0 ? `'min(${resInfo.width},iw)'` : 'iw') + ':' +
          (resInfo.height > 0 ? `'min(${resInfo.height},ih)'` : 'ih') +
          ':force_original_aspect_ratio=decrease');
      }

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
    const videoReturnPort = await pickPort({ type: 'udp', ip: ipv6 ? '::' : '0.0.0.0', reserveTimeout: 15 });
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
      video: { port: videoReturnPort, ssrc: sessionInfo.videoSSRC, srtp_key: request.video.srtp_key, srtp_salt: request.video.srtp_salt },
      audio: { port: audioReturnPort, ssrc: sessionInfo.audioSSRC, srtp_key: request.audio.srtp_key, srtp_salt: request.audio.srtp_salt },
    };

    this.log.debug(`Stream prepared: ${request.targetAddress}:${request.video.port}`, this.cameraConfig.name);
    callback(undefined, response);
  }

  handleStreamRequest(request: StreamingRequest, callback: StreamRequestCallback): void {
    switch (request.type) {
      case StreamRequestTypes.START:
        void this.startStream(request, callback);
        break;
      case StreamRequestTypes.RECONFIGURE:
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

  private async startStream(request: StreamingRequest, callback: StreamRequestCallback): Promise<void> {
    const sessionInfo = this.pendingSessions.get(request.sessionID);
    if (!sessionInfo) {
      this.log.error('Session not found', this.cameraConfig.name);
      callback(new Error('Session not found'));
      return;
    }

    this.pendingSessions.delete(request.sessionID);

    if (!('video' in request)) {
      this.log.error('No video info in start request', this.cameraConfig.name);
      callback(new Error('Invalid request'));
      return;
    }

    // Principle 1: never trust a hardware acceleration method just because it's
    // configured. Validate it with a real test first; fall back to software
    // automatically and audibly if validation fails, rather than discovering the
    // failure deep inside a live stream attempt. This must happen BEFORE
    // determineResolution() below — that method picks the video filter based on
    // which encoder will actually run, and a stale/unresolved encoder value here
    // would cause it to build a hardware-only filter for a software encoder.
    let encoder = this.videoConfig.encoder || 'software';
    if (encoder === 'vaapi') {
      const device = this.videoConfig.hwaccelDevice || '/dev/dri/renderD128';
      const valid = await validateVaapi(this.videoProcessor, device, this.log, this.cameraConfig.name || 'Camera');
      if (!valid) {
        encoder = 'software';
      }
    }

    const resolution = this.determineResolution(request.video, false, encoder);

    let bitrate = request.video.max_bit_rate;
    if (this.videoConfig.maxBitrate && bitrate > this.videoConfig.maxBitrate) bitrate = this.videoConfig.maxBitrate;
    if (this.videoConfig.qualityPreset) {
      const presetBitrate = QUALITY_PRESETS[this.videoConfig.qualityPreset]?.maxBitrate;
      if (presetBitrate && bitrate < presetBitrate) bitrate = presetBitrate;
    }

    this.log.info(`Starting stream: ${resolution.width}x${resolution.height} ${bitrate}kbps`, this.cameraConfig.name);

    const vcodec = this.deriveVcodec(encoder);
    if (encoder === 'software') {
      this.log.info(`Video encoder: ${vcodec} (software)`, this.cameraConfig.name);
    } else if (encoder === 'vaapi') {
      this.log.info(`Video encoder: ${vcodec} (VAAPI - FULL GPU: hw decode+scale+encode)`, this.cameraConfig.name);
    } else {
      this.log.info(`Video encoder: ${vcodec} (${encoder})`, this.cameraConfig.name);
    }

    const source = this.videoConfig.source;
    if (!source) {
      this.log.error('No source configured', this.cameraConfig.name);
      callback(new Error('No source configured'));
      return;
    }

    // Principle 4: avoid transcoding entirely when the source already satisfies
    // HomeKit's requirements. If the camera's source is already H.264 and the user
    // has opted into stream copy, skip decode+encode entirely — no GPU, no CPU
    // encode, none of the failure modes either one carries. Stream copy cannot
    // resize, so this only applies when the source resolution is what HomeKit gets.
    const canCopy = this.videoConfig.copyVideo === true && this.videoConfig.codec === 'h264';

    const ffmpegArgs = this.buildFfmpegArgs(source, sessionInfo, resolution, bitrate, request, encoder, vcodec, canCopy);
    this.log.debug(`FFmpeg command: ${this.videoProcessor} ${ffmpegArgs.join(' ')}`, this.cameraConfig.name);

    if (this.videoConfig.audio) {
      const audioCodecName = 'audio' in request && request.audio.codec === AudioStreamingCodecType.OPUS ? 'OPUS' :
        'audio' in request && request.audio.codec === AudioStreamingCodecType.AAC_ELD ? 'AAC-eld' : 'unknown';
      this.log.info(`Audio enabled: ${audioCodecName}`, this.cameraConfig.name);
    }

    const activeSession: ActiveSession = {
      sessionInfo,
      lastFrame: 0,
      lastFrameChangeTime: Date.now(),
    };
    this.activeSessions.set(request.sessionID, activeSession);

    this.spawnFfmpegProcess(request.sessionID, ffmpegArgs);

    if (this.videoConfig.stallWatchdog !== false) {
      this.startStallWatchdog(request.sessionID);
    }

    callback();
  }

  private spawnFfmpegProcess(sessionID: string, args: string[]): void {
    const activeSession = this.activeSessions.get(sessionID);
    if (!activeSession) return;

    const ffmpeg = spawn(this.videoProcessor, args, { env: process.env });
    activeSession.videoProcess = ffmpeg;

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
      if (activeSession.videoProcess === ffmpeg) this.stopStream(sessionID);
    });

    ffmpeg.on('close', (code) => {
      if (activeSession.videoProcess !== ffmpeg) return;
      if (code !== 0 && code !== null) this.log.warn(`FFmpeg exited with code ${code}`, this.cameraConfig.name);
      this.stopStream(sessionID);
    });
  }

  /**
   * Principle 2: when the video pipeline stalls, terminate the session honestly.
   *
   * The previous approach (homebridge-dahua-ultimate, up through 2.0.12) silently
   * killed and respawned FFmpeg in place, reusing the same HAP session and hoping
   * HomeKit wouldn't notice. Comparing against homebridge-unifi-protect's actual
   * FfmpegStreamingProcess showed a different, more honest design: detect the same
   * class of failure (there, via a UDP progress canary; here, via the same frame
   * counter this plugin already tracked), then call the official, public
   * CameraController.forceStopStreamingSession() API and let HomeKit's own
   * reconnection logic establish a fresh session. We stop trying to be clever behind
   * HomeKit's back and instead tell it the truth as soon as we know it.
   */
  private startStallWatchdog(sessionID: string): void {
    const activeSession = this.activeSessions.get(sessionID);
    if (!activeSession) return;

    const stallTimeoutMs = this.videoConfig.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;

    activeSession.watchdogTimer = setInterval(() => {
      const session = this.activeSessions.get(sessionID);
      if (!session) return;

      const stalledMs = Date.now() - (session.lastFrameChangeTime ?? Date.now());
      if (stalledMs < stallTimeoutMs) return;

      this.log.warn(
        `⚠️ STALL WATCHDOG: frame counter frozen at ${session.lastFrame} for ${stalledMs}ms — ` +
        'ending this session honestly and letting HomeKit reconnect',
        this.cameraConfig.name,
      );

      if (session.watchdogTimer) clearInterval(session.watchdogTimer);

      this.controller?.forceStopStreamingSession(sessionID);
      this.stopStream(sessionID);
    }, STALL_CHECK_INTERVAL_MS);
  }

  private buildFfmpegArgs(
    source: string,
    sessionInfo: SessionInfo,
    resolution: ResolutionInfo,
    bitrate: number,
    request: StreamingRequest,
    encoder: string,
    vcodec: string,
    canCopy: boolean,
  ): string[] {
    if (!('video' in request)) {
      throw new Error('No video info in request');
    }

    const args: string[] = [];
    const mtu = this.videoConfig.packetSize || 1316;

    if (encoder === 'vaapi' && !canCopy) {
      const hwDevice = this.videoConfig.hwaccelDevice || '/dev/dri/renderD128';
      // -hwaccel_device alone does not reliably attach a hardware device reference to
      // the filter graph on every FFmpeg build — scale_vaapi then fails the same way
      // hwupload does in the validation test (see ../ffmpeg/hwaccel.ts). Explicitly
      // creating a named device via -init_hw_device and referencing it by name fixes
      // this, matching the pattern already used below for quicksync/nvenc.
      args.push('-init_hw_device', `vaapi=va:${hwDevice}`, '-hwaccel', 'vaapi', '-hwaccel_device', 'va', '-hwaccel_output_format', 'vaapi');
    } else if (encoder === 'quicksync' && !canCopy) {
      args.push('-init_hw_device', 'qsv=hw');
    } else if (encoder === 'nvenc' && !canCopy) {
      args.push('-init_hw_device', 'cuda=cu:0');
    }

    if (!this.videoConfig.audio) args.push('-allowed_media_types', 'video');

    const codecDefaults = this.videoConfig.codec ? PROBE_DEFAULTS_BY_CODEC[this.videoConfig.codec] : undefined;
    const probeSize = this.videoConfig.probeSize !== undefined ? this.videoConfig.probeSize : codecDefaults?.probeSize;
    const analyzeDuration = this.videoConfig.analyzeDuration !== undefined ? this.videoConfig.analyzeDuration : codecDefaults?.analyzeDuration;
    if (probeSize !== undefined || analyzeDuration !== undefined) {
      args.push('-probesize', String(probeSize ?? 5000000), '-analyzeduration', String(analyzeDuration ?? 5000000));
    }

    const sourceParts = source.split(/\s+/).filter((p) => p.length > 0);
    args.push(...sourceParts);

    args.push('-an', '-sn', '-dn');

    if (canCopy) {
      args.push('-codec:v', 'copy');
    } else {
      const { encoderOptions, gopSize, bframes } = this.getEncoderOptions(vcodec);

      args.push('-codec:v', vcodec);

      const h264ProfileNames = ['baseline', 'main', 'high'];
      const h264LevelNames = ['3.1', '3.2', '4.0'];
      const profileIndex = 'profile' in request.video ? request.video.profile : undefined;
      const levelIndex = 'level' in request.video ? request.video.level : undefined;
      const profileName = profileIndex !== undefined ? h264ProfileNames[profileIndex] : undefined;
      const levelName = levelIndex !== undefined ? h264LevelNames[levelIndex] : undefined;
      if (profileName || levelName) {
        this.log.info(`HomeKit negotiated: profile=${profileName ?? 'unknown'} level=${levelName ?? 'unknown'}`, this.cameraConfig.name);
      }
      if (profileName) args.push('-profile:v', profileName);
      if (levelName) args.push('-level:v', levelName);

      const isHardwareEncoder = encoder !== 'software';
      if (!isHardwareEncoder) args.push('-pix_fmt', 'yuv420p');
      if (isHardwareEncoder && encoder !== 'vaapi') args.push('-color_range', 'mpeg');

      if (resolution.videoFilter) args.push('-filter:v', resolution.videoFilter);

      if (encoderOptions.length > 0) args.push(...encoderOptions);
      if (bframes >= 0) args.push('-bf', String(bframes));
      if (gopSize > 0) args.push('-g', String(gopSize));

      const keyframeInterval = this.videoConfig.forceKeyFrameInterval ?? DEFAULT_FORCE_KEYFRAME_INTERVAL_SECONDS;
      args.push('-force_key_frames', `expr:gte(t,n_forced*${keyframeInterval})`);

      if (bitrate > 0) args.push('-b:v', `${bitrate}k`);
    }

    args.push('-payload_type', String('pt' in request.video ? request.video.pt : 99));
    args.push('-ssrc', String(sessionInfo.videoSSRC));
    args.push('-f', 'rtp');
    args.push('-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80');
    args.push('-srtp_out_params', sessionInfo.videoSRTP.toString('base64'));
    args.push(`srtp://${sessionInfo.address}:${sessionInfo.videoPort}?rtcpport=${sessionInfo.videoPort}&localrtcpport=${sessionInfo.videoReturnPort}&pkt_size=${mtu}`);

    if (this.videoConfig.audio && 'audio' in request) {
      if (request.audio.codec === AudioStreamingCodecType.OPUS || request.audio.codec === AudioStreamingCodecType.AAC_ELD) {
        const useAudioCopy = this.videoConfig.copyAudio === true;

        args.push('-vn', '-sn', '-dn');
        if (useAudioCopy) {
          args.push('-codec:a', 'copy');
        } else if (request.audio.codec === AudioStreamingCodecType.OPUS) {
          args.push('-codec:a', 'libopus', '-application', 'lowdelay');
        } else {
          args.push('-codec:a', 'libfdk_aac', '-profile:a', 'aac_eld');
        }
        args.push('-flags', '+global_header');
        args.push('-f', 'rtp');
        if (!useAudioCopy) {
          args.push('-ar', `${request.audio.sample_rate}k`);
          args.push('-b:a', `${request.audio.max_bit_rate}k`);
        }
        args.push('-ac', String(request.audio.channel));
        args.push('-payload_type', String('pt' in request.audio ? request.audio.pt : 110));
        args.push('-ssrc', String(sessionInfo.audioSSRC));
        args.push('-f', 'rtp');
        args.push('-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80');
        args.push('-srtp_out_params', sessionInfo.audioSRTP.toString('base64'));
        args.push(`srtp://${sessionInfo.address}:${sessionInfo.audioPort}?rtcpport=${sessionInfo.audioPort}&localrtcpport=${sessionInfo.audioReturnPort}&pkt_size=188`);
      } else {
        this.log.error(`Unsupported audio codec requested: ${request.audio.codec}`, this.cameraConfig.name);
      }
    }

    args.push('-loglevel', `level${this.videoConfig.debug ? '+verbose' : ''}`);
    args.push('-progress', 'pipe:1');

    return args;
  }

  private getEncoderOptions(vcodec: string): { encoderOptions: string[]; gopSize: number; bframes: number } {
    const qualityProfile = this.videoConfig.qualityProfile;
    const explicit = this.videoConfig.encoderOptions;

    if (explicit) {
      return { encoderOptions: explicit.split(/\s+/).filter((s) => s.length > 0), gopSize: 0, bframes: -1 };
    }

    if (vcodec === 'libx264') {
      return { encoderOptions: ['-preset', 'ultrafast', '-tune', 'zerolatency'], gopSize: 0, bframes: -1 };
    }

    if (vcodec === 'h264_vaapi') {
      if (qualityProfile === 'speed') return { encoderOptions: ['-quality', '1'], gopSize: 25, bframes: 0 };
      if (qualityProfile === 'quality') return { encoderOptions: ['-quality', '7'], gopSize: 13, bframes: 2 };
      if (qualityProfile === 'balanced') return { encoderOptions: ['-quality', '4'], gopSize: 19, bframes: 0 };
      return { encoderOptions: [], gopSize: 0, bframes: -1 };
    }

    if (vcodec === 'h264_amf') {
      if (qualityProfile === 'speed') return { encoderOptions: ['-usage', 'transcoding', '-quality', 'speed'], gopSize: 25, bframes: 0 };
      if (qualityProfile === 'quality') return { encoderOptions: ['-usage', 'transcoding', '-quality', 'quality'], gopSize: 13, bframes: 2 };
      if (qualityProfile === 'balanced') return { encoderOptions: ['-usage', 'transcoding', '-quality', 'balanced'], gopSize: 19, bframes: 0 };
      return { encoderOptions: ['-usage', 'transcoding'], gopSize: 0, bframes: -1 };
    }

    if (vcodec === 'h264_qsv') {
      if (qualityProfile === 'speed') return { encoderOptions: ['-preset', 'veryfast'], gopSize: 25, bframes: 0 };
      if (qualityProfile === 'quality') return { encoderOptions: ['-preset', 'slow'], gopSize: 13, bframes: 2 };
      if (qualityProfile === 'balanced') return { encoderOptions: ['-preset', 'medium'], gopSize: 19, bframes: 0 };
      return { encoderOptions: ['-preset', 'medium'], gopSize: 0, bframes: -1 };
    }

    if (vcodec.includes('nvenc')) {
      if (qualityProfile === 'speed') return { encoderOptions: ['-preset', 'p1', '-tune', 'll'], gopSize: 25, bframes: 0 };
      if (qualityProfile === 'quality') return { encoderOptions: ['-preset', 'p7', '-tune', 'hq'], gopSize: 13, bframes: 2 };
      if (qualityProfile === 'balanced') return { encoderOptions: ['-preset', 'p4', '-tune', 'll'], gopSize: 19, bframes: 0 };
      return { encoderOptions: ['-preset', 'p4', '-tune', 'll'], gopSize: 0, bframes: -1 };
    }

    return { encoderOptions: [], gopSize: 0, bframes: -1 };
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
