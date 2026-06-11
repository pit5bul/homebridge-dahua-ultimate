import { PlatformConfig } from 'homebridge';

export type StreamType = 'mainstream' | 'substream' | 'thirdstream';
export type EncoderType = 'software' | 'vaapi' | 'quicksync' | 'nvenc' | 'amf' | 'videotoolbox' | 'v4l2';
export type QualityProfile = '' | 'speed' | 'balanced' | 'quality';
export type QualityPreset = '480p-standard' | '720p-standard' | '1080p-standard' | '1080p-hq';

export interface DahuaPlatformConfig extends PlatformConfig {
  platform: 'DahuaUltimate';
  host: string;
  port?: number;
  secure?: boolean;
  username: string;
  password: string;
  forceDiscovery?: boolean;
  streamType?: StreamType;
  probeOnStartup?: boolean;
  probeTimeout?: number;
  videoProcessor?: string;
  interfaceName?: string;
  debugMotion?: boolean;
  cameras?: CameraConfig[];
}

export interface CameraConfig {
  channelId: number;
  name: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  firmwareRevision?: string;
  streamType?: StreamType | '';
  motion?: boolean;
  motionTimeout?: number;
  unbridge?: boolean;
  enabled?: boolean;
  videoConfig?: VideoConfig;

  // Populated at runtime by ffprobe (not user-configurable)
  detected?: {
    videoCodec?: string;
    width?: number;
    height?: number;
    fps?: number;
    audioCodec?: string;
    probedAt?: string;
  };
}

export interface VideoConfig {
  // Source
  source?: string;
  stillImageSource?: string;

  // Streams
  maxStreams?: number;

  // Quality preset — forces resolution + bitrate floor, eliminates HomeKit RECONFIGURE cycle
  qualityPreset?: QualityPreset;

  // Bitrate limits
  maxBitrate?: number;

  // Resolution limits (set internally from qualityPreset, not exposed in UI)
  maxWidth?: number;
  maxHeight?: number;

  // Codec and Hardware Acceleration
  vcodec?: string;               // Auto-derived from encoder, can be overridden
  encoder?: EncoderType;
  qualityProfile?: QualityProfile;
  encoderOptions?: string;
  hwaccelDevice?: string;

  // Audio
  audio?: boolean;
  copyAudio?: boolean;

  // Flips
  vflip?: boolean;
  hflip?: boolean;

  // Advanced
  packetSize?: number;

  // HKSV
  recording?: boolean;
  prebuffer?: boolean;
  prebufferLength?: number;

  // Debug
  debug?: boolean;
}

export interface DiscoveredChannel {
  id: number;
  name: string;
  inputPort: number;
  enabled: boolean;
}

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
  r_frame_rate?: string;
  avg_frame_rate?: string;
  bit_rate?: string;
  sample_rate?: string;
  channels?: number;
}

export interface FfprobeFormat {
  filename?: string;
  format_name?: string;
  duration?: string;
  bit_rate?: string;
}
