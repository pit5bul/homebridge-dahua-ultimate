import { CameraController, CameraStreamingDelegate, HAP, Logger, PrepareStreamCallback, PrepareStreamRequest, SnapshotRequest, SnapshotRequestCallback, StreamingRequest, StreamRequestCallback } from 'homebridge';
import { DahuaApi } from '../dahua/api';
import { CameraConfig } from '../configTypes';
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
export declare class StreamingDelegate implements CameraStreamingDelegate {
    private readonly cameraConfig;
    private readonly log;
    private readonly hap;
    private readonly videoConfig;
    private readonly videoProcessor;
    private readonly dahuaApi?;
    private controller?;
    private pendingSessions;
    private activeSessions;
    private cachedSnapshot?;
    private cachedSnapshotTime;
    constructor(hap: HAP, cameraConfig: CameraConfig, videoProcessor: string, log: Logger, dahuaApi?: DahuaApi);
    /**
     * Wires up the CameraController reference after it's constructed (camera.ts creates
     * this delegate before the controller exists, so it can't be passed in the
     * constructor). Required for clean, honest session termination — see stopStream and
     * the stall watchdog below, both of which call controller.forceStopStreamingSession()
     * rather than silently managing the FFmpeg process behind HomeKit's back.
     */
    setController(controller: CameraController): void;
    private determineResolution;
    handleSnapshotRequest(request: SnapshotRequest, callback: SnapshotRequestCallback): Promise<void>;
    prepareStream(request: PrepareStreamRequest, callback: PrepareStreamCallback): Promise<void>;
    handleStreamRequest(request: StreamingRequest, callback: StreamRequestCallback): void;
    private startStream;
    private spawnFfmpegProcess;
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
    private startStallWatchdog;
    private buildFfmpegArgs;
    private getEncoderOptions;
    private deriveVcodec;
    private stopStream;
    stopAllStreams(): void;
}
