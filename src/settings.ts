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
  'VideoLoss',
  'VideoBlind',
];
