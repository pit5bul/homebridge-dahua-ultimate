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
 * Quality preset definitions — maps user-friendly presets to concrete resolution + bitrate
 * These act as a floor, preventing HomeKit's adaptive probe from starting at 640x360/132kbps
 * and causing a double stream start (RECONFIGURE cycle).
 */
export const QUALITY_PRESETS = {
  '480p-standard':  { maxWidth: 854,  maxHeight: 480,  maxBitrate: 500 },
  '720p-standard':  { maxWidth: 1280, maxHeight: 720,  maxBitrate: 1500 },
  '1080p-standard': { maxWidth: 1920, maxHeight: 1080, maxBitrate: 2000 },
  '1080p-hq':       { maxWidth: 1920, maxHeight: 1080, maxBitrate: 4000 },
} as const;

export const DEFAULT_QUALITY_PRESET = '1080p-standard';

/**
 * Default values for video configuration
 */
export const DEFAULT_VIDEO_CONFIG = {
  maxStreams: 2,
  maxWidth: HOMEKIT_MAX_WIDTH,
  maxHeight: HOMEKIT_MAX_HEIGHT,
  maxBitrate: 2000,
  encoder: 'software' as const,
  audio: true,
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
  motionTimeout: 1,
  unbridge: false,
  enabled: true,
  manufacturer: 'Dahua',
  model: 'IP Camera',
};

/**
 * Stream type to RTSP channel suffix mapping
 * Channel format: {channelId}01 for mainstream, {channelId}02 for substream, etc.
 */
export const STREAM_TYPE_SUFFIX = {
  mainstream: '01',
  substream: '02',
  thirdstream: '03',
};

/**
 * RTSP port (standard)
 */
export const DEFAULT_RTSP_PORT = 554;

/**
 * Motion event types from ISAPI
 */
export const MOTION_EVENT_TYPES = [
  'VMD',           // Video Motion Detection
  'linedetection', // Line Crossing Detection
  'fielddetection', // Intrusion Detection
  'regionEntrance', // Region Entrance
  'regionExiting',  // Region Exiting
  'shelteralarm',   // Video Tampering
];


