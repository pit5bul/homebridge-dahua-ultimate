# homebridge-dahua-ultimate

[![npm version](https://badge.fury.io/js/homebridge-dahua-ultimate.svg)](https://www.npmjs.com/package/homebridge-dahua-ultimate)
[![npm downloads](https://badgen.net/npm/dt/homebridge-dahua-ultimate)](https://www.npmjs.com/package/homebridge-dahua-ultimate)

Homebridge plugin for Dahua NVR cameras with **automatic discovery**, motion detection, and hardware-accelerated streaming.

## Features

### 🔍 Automatic Discovery
- Zero-configuration camera setup
- Automatically detects all cameras connected to your Dahua NVR
- Smart channel detection (auto-disables channels without cameras)
- Auto-generates optimal RTSP URLs for each camera
- Saves discovered cameras to config.json automatically

### 📹 High-Quality Streaming
- 1080p @ 30fps streaming to HomeKit
- Hardware acceleration support (reduces CPU usage by 75-87% with VAAPI)
- Software encoding fallback for immediate operation
- Configurable bitrate and resolution per camera
- **Resolution mode control** for hardware encoder optimization

### 🎯 Motion Detection
- Real-time motion events via CGI API event streams
- Native Dahua motion detection (no video analysis needed)
- Configurable motion timeout
- Triggers HomeKit motion sensor
- Support for multiple event types (VideoMotion, CrossLine, etc.)

### 🚀 Hardware Acceleration
- **VAAPI** - Intel/AMD GPUs on Linux
- **QuickSync** - Intel integrated graphics
- **NVENC** - NVIDIA GPUs
- **AMF** - AMD GPUs on Windows
- **VideoToolbox** - Apple Silicon and Intel Macs
- **V4L2** - Raspberry Pi 4+

### 📸 Fast Snapshots
- CGI-based snapshots (instant response)
- No video decoding required
- Optimized for HomeKit responsiveness
- Automatic HTTPS/HTTP detection

### 🎥 HomeKit Secure Video (HKSV)
- Full recording support with iCloud storage
- Prebuffering for instant recording start
- Efficient vcodec copy mode
- Activity zones and notifications

### ⚙️ Easy Configuration
- Homebridge Config UI X integration
- Visual camera configuration
- Live config updates without restart
- Automatic cleanup of orphaned accessories

## Installation

### 1. Install Homebridge

If you haven't already, install Homebridge:
```bash
sudo npm install -g --unsafe-perm homebridge
```

Or follow the [official installation guides](https://github.com/homebridge/homebridge/wiki).

### 2. Install Plugin

```bash
sudo npm install -g homebridge-dahua-ultimate
```

### 3. Configure via UI

1. Open Homebridge Config UI X
2. Navigate to Plugins → homebridge-dahua-ultimate
3. Click Settings
4. Enter your NVR connection details:
   - NVR IP address/hostname
   - Port (80 for HTTP, 443 for HTTPS)
   - Enable "Secure" if using HTTPS
   - Username (admin user with camera access)
   - Password
5. Save and restart Homebridge

The plugin will automatically discover all cameras and add them to your config.

## Quick Start

### Minimum Configuration

```json
{
  "platforms": [
    {
      "platform": "DahuaUltimate",
      "name": "Dahua NVR",
      "host": "192.168.1.100",
      "port": 443,
      "secure": true,
      "username": "admin",
      "password": "your_password"
    }
  ]
}
```

### First Run

On first startup with the minimum config above:
1. Plugin connects to your NVR
2. Discovers all cameras automatically
3. Only cameras with custom names are enabled (channels with default names like "Channel6" are auto-disabled)
4. Cameras appear in HomeKit within 30 seconds
5. Configuration is saved to config.json

### After Discovery

After the first discovery, your config will look like:

```json
{
  "platform": "DahuaUltimate",
  "name": "Dahua NVR",
  "host": "192.168.1.100",
  "port": 443,
  "secure": true,
  "username": "admin",
  "password": "your_password",
  "forceDiscovery": false,
  "cameras": [
    {
      "channelId": 1,
      "name": "Front Door",
      "enabled": true,
      "manufacturer": "Dahua",
      "model": "Dahua IP Camera"
    },
    {
      "channelId": 2,
      "name": "Backyard",
      "enabled": true
    },
    {
      "channelId": 6,
      "name": "Channel6",
      "enabled": false
    }
  ]
}
```

## Configuration

### Platform Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `platform` | string | - | **Required.** Must be "DahuaUltimate" |
| `name` | string | "Dahua NVR" | Platform name in logs |
| `host` | string | - | **Required.** NVR IP address or hostname |
| `port` | number | 80 | HTTP (80) or HTTPS (443) port |
| `secure` | boolean | false | Use HTTPS. Auto-enabled for port 443 |
| `username` | string | - | **Required.** NVR username |
| `password` | string | - | **Required.** NVR password |
| `forceDiscovery` | boolean | false | Force re-discovery (auto-resets to false) |
| `debugMotion` | boolean | false | Enable verbose motion event logging |
| `cameras` | array | [] | Camera configurations (auto-populated) |

### Camera Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `channelId` | number | - | **Required.** Camera channel ID (1-based) |
| `name` | string | - | **Required.** Camera display name |
| `enabled` | boolean | true | Enable/disable this camera |
| `manufacturer` | string | "Dahua" | Camera manufacturer |
| `model` | string | "Dahua IP Camera" | Camera model |
| `motion` | boolean | true | Enable motion detection |
| `motionTimeout` | number | 15 | Motion clear timeout (seconds) |
| `unbridge` | boolean | false | Run as separate accessory (for HKSV) |
| `videoConfig` | object | - | Advanced video configuration |

### Advanced Video Configuration

```json
{
  "videoConfig": {
    "source": "-rtsp_transport tcp -i rtsp://...",
    "stillImageSource": "-i https://...",
    "maxStreams": 2,
    "maxWidth": 1920,
    "maxHeight": 1080,
    "maxFPS": 30,
    "maxBitrate": 4000,
    "encoderOptions": "libx264",
    "videoFilter": "scale=1920:1080",
    "audio": false
  }
}
```

## Hardware Acceleration

### Benefits
- ✅ Reduced CPU usage (75-87% reduction with VAAPI)
- ✅ Multiple concurrent streams
- ✅ Lower power consumption
- ✅ Better system performance

### Setup

**IMPORTANT:** The bundled `ffmpeg-for-homebridge` package **ONLY contains software codecs** and does NOT include hardware acceleration support. To enable hardware acceleration, you MUST install or compile a custom FFmpeg with hardware encoder support for your specific GPU.

#### 1. Install FFmpeg with Hardware Support

You must install or compile FFmpeg with the appropriate hardware codecs for your system:
- **VAAPI** - Intel/AMD GPUs on Linux
- **QuickSync** - Intel integrated graphics
- **NVENC** - NVIDIA GPUs
- **AMF** - AMD GPUs on Windows
- **VideoToolbox** - Apple Silicon and Intel Macs
- **V4L2** - Raspberry Pi 4+

This is system-specific and beyond the scope of this plugin documentation. The plugin cannot provide hardware acceleration without a properly compiled FFmpeg binary.

**Verify your FFmpeg has hardware support:**
```bash
# Check for VAAPI
ffmpeg -encoders | grep vaapi

# Check for NVENC
ffmpeg -encoders | grep nvenc

# Check for QuickSync
ffmpeg -encoders | grep qsv

# Check for VideoToolbox
ffmpeg -encoders | grep videotoolbox
```

#### 2. Configure Hardware Encoder

Edit your camera's `videoConfig`:

```json
{
  "videoConfig": {
    "encoderOptions": "h264_vaapi",
    "videoFilter": "format=nv12,hwupload"
  }
}
```

**VAAPI Example (Intel/AMD):**
```json
{
  "encoderOptions": "h264_vaapi",
  "videoFilter": "format=nv12,hwupload"
}
```

**NVENC Example (NVIDIA):**
```json
{
  "encoderOptions": "h264_nvenc",
  "videoFilter": "scale_npp=format=nv12"
}
```

If hardware encoding fails, the plugin will automatically fall back to software encoding (libx264).

## Motion Detection

### Setup
1. Motion detection is enabled by default
2. Events are received via Dahua's CGI event stream
3. Motion events trigger HomeKit notifications
4. Configure timeout to prevent rapid on/off cycling

### Configuration

```json
{
  "motion": true,
  "motionTimeout": 15
}
```

### Supported Events
- VideoMotion - General motion detection
- CrossLineDetection - Line crossing
- CrossRegionDetection - Intrusion detection
- AlarmLocal - Local alarm trigger

## Troubleshooting

### Cameras Not Appearing

1. **Check NVR credentials** - Ensure correct username/password
2. **Verify network connectivity** - Can you ping the NVR?
3. **Check Homebridge logs** for errors
4. **Force re-discovery**:
   ```json
   {
     "forceDiscovery": true
   }
   ```
5. Restart Homebridge

### Motion Detection Not Working

1. **Verify motion is enabled** in camera config
2. **Check NVR motion settings** - Must be enabled in Dahua NVR
3. **Enable debug logging**:
   ```json
   {
     "debugMotion": true
   }
   ```
4. Check logs for motion events

### Snapshots Failing

**Symptoms:** "Snapshot FFmpeg exited with code 8"

**Common Causes:**
- Wrong port (using HTTP on HTTPS port or vice versa)
- Incorrect credentials
- NVR blocking snapshot requests

**Solution:**
```json
{
  "port": 443,
  "secure": true
}
```

Or try:
```json
{
  "port": 80,
  "secure": false
}
```

### Streams Not Starting

1. **Verify RTSP URLs** - Check logs for generated URLs
2. **Test RTSP manually**:
   ```bash
   ffplay -rtsp_transport tcp "rtsp://admin:password@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0"
   ```
3. **Check FFmpeg** is installed and accessible
4. **Try software encoding** if hardware encoding fails

### SSL Certificate Errors

The plugin automatically disables SSL certificate verification for self-signed certificates. No action needed.

## API Compatibility

This plugin uses Dahua's HTTP CGI API:
- Device info: `/cgi-bin/magicBox.cgi?action=getSystemInfo`
- Channel discovery: `/cgi-bin/configManager.cgi?action=getConfig&name=Encode`
- Events: `/cgi-bin/eventManager.cgi?action=attach&codes=[...]`
- RTSP: `rtsp://host:554/cam/realmonitor?channel=N&subtype=0`
- Snapshots: `/cgi-bin/snapshot.cgi?channel=N`

Tested with Dahua NVR firmware 4.x and newer.

## Stream Types

Dahua cameras provide multiple streams:

- **Mainstream** (subtype=0): Full resolution, high bitrate - best quality
- **Substream** (subtype=1): Lower resolution - for remote viewing
- **Thirdstream** (subtype=2): Lowest resolution - for slow connections

The plugin automatically uses mainstream for local HomeKit viewing.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.

## Support

- **Issues**: [GitHub Issues](https://github.com/pit5bul/homebridge-dahua-ultimate/issues)
- **Homebridge Discord**: [#plugin-development](https://discord.gg/homebridge)
- **Funding**: [Buy Me a Coffee](https://buymeacoffee.com/pit5bul)

## Credits

- **Author**: pit5bul
- **Based on**: homebridge-hikvision-ultimate architecture
- **Inspired by**: homebridge-camera-ffmpeg
- **FFmpeg**: The FFmpeg team for the incredible video processing library

## License

PERSONAL‑USE LICENSE AGREEMENT - See [LICENSE](LICENSE) file for details
