import { Logger } from 'homebridge';
import { DahuaApi } from './api';
import { DiscoveredChannel, StreamType } from '../configTypes';
/**
 * Response from /ISAPI/ContentMgmt/InputProxy/channels
 */
/**
 * Response from /ISAPI/System/deviceInfo
 */
/**
 * Discover cameras from Dahua NVR via ISAPI
 */
export declare class DahuaDiscovery {
    private readonly api;
    private readonly host;
    private readonly port;
    private readonly secure;
    private readonly username;
    private readonly password;
    private readonly log;
    private readonly rtspPort;
    constructor(api: DahuaApi, host: string, port: number, secure: boolean, username: string, password: string, log: Logger, rtspPort?: number);
    /**
     * Get NVR device information
     */
    getDeviceInfo(): Promise<{
        name?: string;
        model?: string;
        serialNumber?: string;
        firmwareVersion?: string;
    }>;
    /**
     * Get camera device info from channel
     */
    getCameraDeviceInfo(channel: any): {
        manufacturer?: string;
        model?: string;
        serialNumber?: string;
        firmwareVersion?: string;
    };
    /**
     * Discover all input channels from NVR
     */
    discoverChannels(): Promise<DiscoveredChannel[]>;
    /**
     * Build RTSP URL for a channel
     * Dahua format: rtsp://user:pass@host:554/cam/realmonitor?channel=N&subtype=0
     */
    buildRtspUrl(channelId: number, streamType?: StreamType): string;
    /**
     * Build still image URL for a channel
     */
    buildStillImageUrl(channelId: number, _streamType?: StreamType): string;
    /**
     * Build FFmpeg source string for a channel
     */
    buildFfmpegSource(channelId: number, streamType?: StreamType): string;
    /**
     * Build FFmpeg still image source string for a channel
     * @deprecated Snapshots should use DahuaApi.getSnapshot() for proper digest auth.
     * This method is kept for backward compatibility with existing stored configs.
     */
    buildFfmpegStillSource(channelId: number, _streamType?: StreamType): string;
}
