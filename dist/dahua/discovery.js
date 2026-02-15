"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DahuaDiscovery = void 0;
/**
 * Response from /ISAPI/ContentMgmt/InputProxy/channels
 */
/**
 * Response from /ISAPI/System/deviceInfo
 */
/**
 * Discover cameras from Dahua NVR via ISAPI
 */
class DahuaDiscovery {
    api;
    host;
    port;
    secure;
    username;
    password;
    log;
    constructor(api, host, port, secure, username, password, log) {
        this.api = api;
        this.host = host;
        this.port = port;
        this.secure = secure;
        this.username = username;
        this.password = password;
        this.log = log;
    }
    /**
     * Get NVR device information
     */
    async getDeviceInfo() {
        try {
            // Dahua uses multiple endpoints for device info
            const sysInfo = await this.api.get('/cgi-bin/magicBox.cgi?action=getSystemInfo');
            const deviceType = await this.api.get('/cgi-bin/magicBox.cgi?action=getDeviceType');
            return {
                name: sysInfo.deviceName || sysInfo.machineName,
                model: deviceType.type || sysInfo.deviceType,
                serialNumber: sysInfo.serialNumber,
                firmwareVersion: sysInfo.softwareVersion,
            };
        }
        catch (err) {
            this.log.warn(`Failed to get device info: ${err}`);
            return {};
        }
    }
    /**
     * Get camera device info from channel
     */
    getCameraDeviceInfo(channel) {
        const descriptor = channel.sourceInputPortDescriptor;
        if (!descriptor) {
            return {};
        }
        return {
            manufacturer: descriptor.manufacturer || 'Dahua',
            model: descriptor.model,
            serialNumber: descriptor.serialNumber,
            firmwareVersion: descriptor.firmwareVersion,
        };
    }
    /**
     * Discover all input channels from NVR
     */
    async discoverChannels() {
        try {
            // Get encoding configuration which contains all channels
            const encodeConfig = await this.api.get('/cgi-bin/configManager.cgi?action=getConfig&name=Encode');
            const titleConfig = await this.api.get('/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle');
            // Parse channels from Encode configuration
            // Format: table.Encode[N].MainFormat[0].VideoEnable=true
            const channelMap = new Map();
            for (const [key, value] of Object.entries(encodeConfig)) {
                const match = key.match(/^table\.Encode\[(\d+)\]\.MainFormat\[0\]\.VideoEnable$/);
                if (match) {
                    const channelIndex = parseInt(match[1], 10);
                    const enabled = value.toLowerCase() === 'true';
                    if (!channelMap.has(channelIndex)) {
                        channelMap.set(channelIndex, { enabled });
                    }
                }
            }
            // Add channel names from ChannelTitle
            for (const [key, value] of Object.entries(titleConfig)) {
                const match = key.match(/^table\.ChannelTitle\[(\d+)\]\.Name$/);
                if (match) {
                    const channelIndex = parseInt(match[1], 10);
                    if (!channelMap.has(channelIndex)) {
                        channelMap.set(channelIndex, { enabled: true, name: value });
                    }
                    else {
                        channelMap.get(channelIndex).name = value;
                    }
                }
            }
            if (channelMap.size === 0) {
                this.log.warn('No channels found in NVR response');
                return [];
            }
            // Convert to DiscoveredChannel array
            const channels = [];
            for (const [channelIndex, info] of channelMap.entries()) {
                if (!info.enabled)
                    continue;
                // Dahua uses 0-based indexing in API, but 1-based for RTSP
                const rtspChannelId = channelIndex + 1;
                const channelName = info.name || `Channel${rtspChannelId}`;
                // Smart discovery: Auto-disable channels with default names
                // Default names match pattern: "Channel1", "Channel2", "Channel 3", etc.
                const isDefaultName = /^Channel\s*\d+$/i.test(channelName);
                const shouldEnable = !isDefaultName; // Only enable channels with custom names
                channels.push({
                    id: rtspChannelId,
                    name: channelName,
                    inputPort: rtspChannelId,
                    enabled: shouldEnable,
                    deviceInfo: {
                        manufacturer: 'Dahua',
                        model: 'Dahua IP Camera', // Default model
                    },
                });
                if (isDefaultName) {
                    this.log.info(`Auto-disabling channel ${rtspChannelId}: "${channelName}" (default name detected)`);
                }
            }
            channels.sort((a, b) => a.id - b.id);
            this.log.info(`Discovered ${channels.length} channel(s) on NVR`);
            const enabledCount = channels.filter(c => c.enabled).length;
            this.log.info(`${enabledCount} channel(s) have custom names and will be enabled`);
            return channels;
        }
        catch (err) {
            this.log.error(`Failed to discover channels: ${err}`);
            throw err;
        }
    }
    /**
     * Build RTSP URL for a channel
     * Dahua format: rtsp://user:pass@host:554/cam/realmonitor?channel=N&subtype=0
     */
    buildRtspUrl(channelId, streamType = "mainstream") {
        // Map stream type to Dahua subtype
        // mainstream = 0, substream = 1, thirdstream = 2
        let subtype = 0;
        if (streamType === 'substream') {
            subtype = 1;
        }
        else if (streamType === 'thirdstream') {
            subtype = 2;
        }
        const encodedUsername = encodeURIComponent(this.username);
        const encodedPassword = encodeURIComponent(this.password);
        return `rtsp://${encodedUsername}:${encodedPassword}@${this.host}:${554}/cam/realmonitor?channel=${channelId}&subtype=${subtype}`;
    }
    /**
     * Build still image URL for a channel
     */
    buildStillImageUrl(channelId, streamType = "mainstream") {
        // Dahua snapshot API uses 1-based channel indexing (same as RTSP)
        // Auto-detect HTTPS if port is 443
        const protocol = (this.port === 443 || this.secure) ? 'https' : 'http';
        return `${protocol}://${this.host}:${this.port}/cgi-bin/snapshot.cgi?channel=${channelId}`;
    }
    /**
     * Build FFmpeg source string for a channel
     */
    buildFfmpegSource(channelId, streamType = "mainstream") {
        const rtspUrl = this.buildRtspUrl(channelId, streamType);
        return `-rtsp_transport tcp -i ${rtspUrl}`;
    }
    /**
     * Build FFmpeg still image source string for a channel
     */
    buildFfmpegStillSource(channelId, streamType = "mainstream") {
        // Dahua snapshot API uses 1-based channel indexing (same as RTSP)
        // D1 = channel=1, D2 = channel=2, etc.
        const encodedUsername = encodeURIComponent(this.username);
        const encodedPassword = encodeURIComponent(this.password);
        // Auto-detect HTTPS if port is 443
        const protocol = (this.port === 443 || this.secure) ? 'https' : 'http';
        const snapshotUrl = `${protocol}://${encodedUsername}:${encodedPassword}@${this.host}:${this.port}/cgi-bin/snapshot.cgi?channel=${channelId}`;
        return `-i ${snapshotUrl}`;
    }
}
exports.DahuaDiscovery = DahuaDiscovery;
