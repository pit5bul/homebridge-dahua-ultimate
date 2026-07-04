/**
 * Platform name - must match pluginAlias in config.schema.json
 */
export declare const PLATFORM_NAME = "DahuaUltimate";
/**
 * Plugin name - must match name in package.json
 */
export declare const PLUGIN_NAME = "homebridge-dahua-ultimate";
/**
 * HomeKit maximum constraints
 */
export declare const HOMEKIT_MAX_WIDTH = 1920;
export declare const HOMEKIT_MAX_HEIGHT = 1080;
export declare const HOMEKIT_MAX_FPS = 30;
/**
 * Quality preset definitions
 * Maps user-friendly presets to concrete video parameters
 */
export declare const QUALITY_PRESETS: {
    readonly '480p-standard': {
        readonly maxWidth: 854;
        readonly maxHeight: 480;
        readonly maxBitrate: 500;
    };
    readonly '720p-standard': {
        readonly maxWidth: 1280;
        readonly maxHeight: 720;
        readonly maxBitrate: 1500;
    };
    readonly '1080p-standard': {
        readonly maxWidth: 1920;
        readonly maxHeight: 1080;
        readonly maxBitrate: 2000;
    };
    readonly '1080p-hq': {
        readonly maxWidth: 1920;
        readonly maxHeight: 1080;
        readonly maxBitrate: 4000;
    };
};
/**
 * Default quality preset
 */
export declare const DEFAULT_QUALITY_PRESET = "1080p-standard";
/**
 * Stream analysis (probesize/analyzeduration) defaults by source codec.
 *
 * H.265/HEVC cameras advertise full stream parameters in the RTSP SDP, so FFmpeg
 * can start with almost no analysis — this is what makes startup fast (<2s).
 * H.264 cameras need more data before FFmpeg reliably detects parameters; too small
 * a probe window causes "Output file does not contain any stream" crashes.
 *
 * These are only applied when the camera's `videoConfig.codec` is set AND the user
 * hasn't already provided explicit `probeSize`/`analyzeDuration` overrides. Cameras
 * with no `codec` set fall back to FFmpeg's own defaults (safe but slower to start).
 */
export declare const PROBE_DEFAULTS_BY_CODEC: {
    readonly h265: {
        readonly probeSize: 32;
        readonly analyzeDuration: 0;
    };
    readonly h264: {
        readonly probeSize: 500000;
        readonly analyzeDuration: 1000000;
    };
};
/**
 * Default values for video configuration
 */
export declare const DEFAULT_VIDEO_CONFIG: {
    maxStreams: number;
    maxWidth: number;
    maxHeight: number;
    maxFPS: number;
    maxBitrate: number;
    encoder: "software";
    audio: boolean;
    copyAudio: boolean;
    copyVideo: boolean;
    packetSize: number;
    debug: boolean;
    debugReturn: boolean;
    vflip: boolean;
    hflip: boolean;
};
/**
 * Default platform values
 */
export declare const DEFAULT_PLATFORM_CONFIG: {
    port: number;
    secure: boolean;
    streamType: "mainstream";
    probeOnStartup: boolean;
    probeTimeout: number;
    debugMotion: boolean;
};
/**
 * Default camera values
 */
export declare const DEFAULT_CAMERA_CONFIG: {
    motion: boolean;
    motionTimeout: number;
    unbridge: boolean;
    enabled: boolean;
    manufacturer: string;
    model: string;
};
/**
 * RTSP port (standard)
 */
export declare const DEFAULT_RTSP_PORT = 554;
/**
 * Motion event types from Dahua CGI API
 */
export declare const MOTION_EVENT_TYPES: string[];
/**
 * Stall watchdog defaults.
 *
 * Detects a frozen FFmpeg video pipeline — observed in the wild as a reproducible
 * FFmpeg+VAAPI+Mesa/radeonsi driver-level hang (confirmed independent of this plugin:
 * reproduces in a bare `ffmpeg` process with no network output and no HomeKit
 * involved) — and honestly terminates the HAP session via
 * CameraController.forceStopStreamingSession(), letting HomeKit's own reconnection
 * logic establish a fresh session. Earlier versions of this plugin silently killed
 * and respawned FFmpeg in place, reusing the same session HomeKit still believed was
 * healthy — comparison against homebridge-unifi-protect's own FfmpegStreamingProcess
 * showed that failing honestly, rather than patching around a failure HomeKit doesn't
 * know about, is the more reliable design.
 */
export declare const DEFAULT_STALL_TIMEOUT_MS = 4000;
export declare const STALL_CHECK_INTERVAL_MS = 1000;
/**
 * Wall-clock forced keyframe interval, in seconds. HAP-NodeJS's own source documents
 * "minimum keyframe interval is about 5 seconds" as HomeKit's tolerance. 4 seconds
 * matches the proven production value used by homebridge-unifi-protect, keeping a
 * safety margin under the ~5s limit.
 */
export declare const DEFAULT_FORCE_KEYFRAME_INTERVAL_SECONDS = 4;
