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
    constructor(api: DahuaApi, host: string, port: number, secure: boolean, username: string, password: string, log: Logger);
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
    buildStillImageUrl(channelId: number, streamType?: StreamType): string;
    /**
     * Build FFmpeg source string for a channel
     */
    buildFfmpegSource(channelId: number, streamType?: StreamType): string;
    /**
     * Build FFmpeg still image source string for a channel
     */
    buildFfmpegStillSource(channelId: number, streamType?: StreamType): string;
}
