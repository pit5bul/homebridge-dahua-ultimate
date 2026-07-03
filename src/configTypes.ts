import { PlatformConfig } from 'homebridge';

/**
 * Stream type options
 */
export type StreamType = 'mainstream' | 'substream' | 'thirdstream';

/**
 * Hardware encoder types
 */
export type EncoderType = 'software' | 'vaapi' | 'quicksync' | 'nvenc' | 'amf' | 'videotoolbox' | 'v4l2';

/**
 * Quality profile for hardware encoders
 */
export type QualityProfile = '' | 'speed' | 'balanced' | 'quality';

/**
 * Quality preset — maps to fixed resolution + bitrate
 */
export type QualityPreset = '480p-standard' | '720p-standard' | '1080p-standard' | '1080p-hq';

/**
 * Platform configuration interface
 */
export interface DahuaPlatformConfig extends PlatformConfig {
  platform: 'DahuaUltimate';

  // NVR Connection
  host: string;
  port?: number;       // HTTP/HTTPS port (default 80 or 443)
  rtspPort?: number;   // RTSP port (default 554)
  secure?: boolean;
  username: string;
  password: string;

  // Discovery
  forceDiscovery?: boolean;
  streamType?: StreamType;
  probeOnStartup?: boolean;
  probeTimeout?: number;

  // Global Advanced
  videoProcessor?: string;
  interfaceName?: string;
  debugMotion?: boolean;

  // Cameras
  cameras?: CameraConfig[];
}

/**
 * Individual camera configuration
 */
export interface CameraConfig {
  // Identity
  channelId: number;
  name: string;

  // Customization
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  firmwareRevision?: string;

  // Stream
  streamType?: StreamType | '';

  // Motion
  motion?: boolean;
  motionTimeout?: number;

  // Control
  unbridge?: boolean;
  enabled?: boolean;

  // Video Config
  videoConfig?: VideoConfig;

  // Detected info (read-only, populated by discovery/probe)
  detected?: DetectedStreamInfo;
}

/**
 * Video configuration for a camera
 */
export interface VideoConfig {
  // Source
  source?: string;
  stillImageSource?: string;

  // Quality preset (maps to maxWidth/maxHeight/maxBitrate at runtime)
  qualityPreset?: QualityPreset;

  // Limits (populated from qualityPreset at runtime)
  maxStreams?: number;
  maxWidth?: number;
  maxHeight?: number;
  maxFPS?: number;
  maxBitrate?: number;

  // Codec and Hardware Acceleration
  encoder?: EncoderType;
  qualityProfile?: QualityProfile;
  encoderOptions?: string;
  hwaccelDevice?: string;

  // Audio
  audio?: boolean;
  copyAudio?: boolean;

  // Filters
  videoFilter?: string;
  vflip?: boolean;
  hflip?: boolean;

  // Advanced
  packetSize?: number;

  // Source codec — enables automatic probesize/analyzeduration selection.
  // Set this to match the camera's actual RTSP video codec (see NVR's Encode config).
  // Ignored if probeSize/analyzeDuration are explicitly set below.
  codec?: 'h264' | 'h265';

  // Set to false for non-Dahua/ONVIF channels patched into the NVR — Dahua's
  // snapshot.cgi is a proprietary endpoint that only works for genuine Dahua
  // channels and fails 100% of the time (HTTP 400/500) for passthrough ONVIF
  // cameras, regardless of retries. When false, snapshots are grabbed via
  // FFmpeg from the RTSP `source` instead. Defaults to true (use snapshot.cgi).
  nativeSnapshot?: boolean;

  // Stream analysis (probesize/analyzeduration)
  // Explicit overrides always win over the `codec`-based defaults above.
  // H.265 cameras: use probeSize: 32, analyzeDuration: 0 for fastest startup
  // H.264 cameras: use probeSize: 500000, analyzeDuration: 1000000 (or leave unset for auto)
  probeSize?: number;
  analyzeDuration?: number;

  // Debug
  debug?: boolean;

  // HomeKit Secure Video (HKSV)
  recording?: boolean;
  prebuffer?: boolean;
  prebufferLength?: number;
}

/**
 * Detected stream information from ffprobe
 */
export interface DetectedStreamInfo {
  videoCodec?: string;
  videoProfile?: string;
  width?: number;
  height?: number;
  fps?: number;
  videoBitrate?: number;
  audioCodec?: string;
  audioSampleRate?: number;
  audioChannels?: number;
  probedAt?: string;
}

/**
 * Discovered channel from NVR
 */
export interface DiscoveredChannel {
  id: number;
  name: string;
  inputPort: number;
  enabled: boolean;
  resolutions?: string[];
  deviceInfo?: {
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    firmwareVersion?: string;
  };
}

/**
 * ffprobe result structure
 */
export interface FfprobeResult {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

export interface FfprobeStream {
  index: number;
  codec_name?: string;
  codec_long_name?: string;
  profile?: string;
  codec_type?: 'video' | 'audio' | 'subtitle' | 'data';
  width?: number;
  height?: number;
  coded_width?: number;
  coded_height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  bit_rate?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
}

export interface FfprobeFormat {
  filename?: string;
  format_name?: string;
  duration?: string;
  size?: string;
  bit_rate?: string;
}

