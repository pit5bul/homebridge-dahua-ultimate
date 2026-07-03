/**
 * Platform name - must match pluginAlias in config.schema.json
 */
export const PLATFORM_NAME = 'DahuaUltimate';

/**
 * Plugin name - must match name in package.json
 */
export const PLUGIN_NAME = 'homebridge-dahua-ultimate';

/**
 * HomeKit maximum constraints
 */
export const HOMEKIT_MAX_WIDTH = 1920;
export const HOMEKIT_MAX_HEIGHT = 1080;
export const HOMEKIT_MAX_FPS = 30;

/**
 * Quality preset definitions
 * Maps user-friendly presets to concrete video parameters
 */
export const QUALITY_PRESETS = {
  '480p-standard':  { maxWidth: 854,  maxHeight: 480,  maxBitrate: 500 },
  '720p-standard':  { maxWidth: 1280, maxHeight: 720,  maxBitrate: 1500 },
  '1080p-standard': { maxWidth: 1920, maxHeight: 1080, maxBitrate: 2000 },
  '1080p-hq':       { maxWidth: 1920, maxHeight: 1080, maxBitrate: 4000 },
} as const;

/**
 * Default quality preset
 */
export const DEFAULT_QUALITY_PRESET = '1080p-standard';

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
export const PROBE_DEFAULTS_BY_CODEC = {
  h265: { probeSize: 32, analyzeDuration: 0 },
  h264: { probeSize: 500000, analyzeDuration: 1000000 },
} as const;

/**
 * Default values for video configuration
 */
export const DEFAULT_VIDEO_CONFIG = {
  maxStreams: 2,
  maxWidth: HOMEKIT_MAX_WIDTH,
  maxHeight: HOMEKIT_MAX_HEIGHT,
  maxFPS: 15,
  maxBitrate: 2000,
  encoder: 'software' as const,
  audio: true,
  copyAudio: false,
  packetSize: 1316,
  debug: false,
  debugReturn: false,
  vflip: false,
  hflip: false,
};

/**
 * Default platform values
 */
export const DEFAULT_PLATFORM_CONFIG = {
  port: 80,
  secure: false,
  streamType: 'mainstream' as const,
  probeOnStartup: false,
  probeTimeout: 10000,
  debugMotion: false,
};

/**
 * Default camera values
 */
export const DEFAULT_CAMERA_CONFIG = {
  motion: true,
  motionTimeout: 10,  // NVR sends explicit stop events; 10s fallback prevents stuck motion state
  unbridge: false,
  enabled: true,
  manufacturer: 'Dahua',
  model: 'IP Camera',
};

/**
 * RTSP port (standard)
 */
export const DEFAULT_RTSP_PORT = 554;

/**
 * Motion event types from Dahua CGI API
 */
export const MOTION_EVENT_TYPES = [
  'VideoMotion',
  'CrossLineDetection',
  'CrossRegionDetection',
  'AlarmLocal',
];

/**
 * Stall watchdog defaults.
 *
 * Detects a frozen FFmpeg video pipeline — observed in the wild as a reproducible
 * FFmpeg+VAAPI+Mesa/radeonsi driver-level hang (confirmed independent of this plugin:
 * reproduces in a bare `ffmpeg` process with no network output and no HomeKit
 * involved) — and force-restarts FFmpeg before HomeKit's own stream-start patience
 * window runs out. HomeKit's live-view player does not reliably self-recover from an
 * interruption during stream startup, so a fast, silent restart here is the
 * difference between a viewer never noticing and a permanent black screen.
 */
export const DEFAULT_STALL_TIMEOUT_MS = 4000;
export const MAX_STALL_RESTARTS = 3;
export const STALL_CHECK_INTERVAL_MS = 1000;

