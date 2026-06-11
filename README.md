# homebridge-dahua-ultimate

[![npm version](https://badge.fury.io/js/homebridge-dahua-ultimate.svg)](https://www.npmjs.com/package/homebridge-dahua-ultimate)
[![npm downloads](https://badgen.net/npm/dt/homebridge-dahua-ultimate)](https://www.npmjs.com/package/homebridge-dahua-ultimate)
[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=flat)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Homebridge plugin for Dahua NVR cameras with **automatic discovery**, motion detection, and hardware-accelerated streaming.

## Features

### 🔍 Automatic Discovery
- Zero-configuration camera setup
- Automatically detects all cameras connected to your Dahua NVR
- Smart channel detection (auto-disables channels without cameras)
- Auto-generates optimal RTSP URLs for each camera
- Saves discovered cameras to config.json automatically

### ⚡ Instant Stream Start
- **`qualityPreset` option** eliminates HomeKit's adaptive probe/RECONFIGURE cycle — streams start immediately at full quality with no restart
- Without a preset, HomeKit starts every stream at 640x360/132kbps, then tears it down and restarts at the correct resolution — causing 20-40 second delays
- Set `qualityPreset` to match your NVR stream: `480p-standard`, `720p-standard`, `1080p-standard`, or `1080p-hq`

### 📹 High-Quality Streaming
- Up to 1080p streaming to HomeKit
- Hardware acceleration support via `encoder` option (VAAPI, NVENC, QuickSync, AMF, VideoToolbox, V4L2)
- Software encoding fallback for immediate operation
- Configurable bitrate and resolution per camera

### 🕐 Dahua NVR Timestamp Fix
- Dahua NVRs send RTSP frames with highly irregular PTS timestamps, which causes FFmpeg to buffer frames for 20+ seconds before HomeKit displays video
- The plugin automatically applies `-use_wallclock_as_timestamps 1` to all RTSP streams, replacing NVR timestamps with system wall clock time and eliminating the buffering delay

### 🎯 Motion Detection
- Real-time motion events via CGI API event streams
- Native Dahua motion detection (no video analysis needed)
- Configurable motion timeout
- Triggers HomeKit motion sensor
- Support for multiple event types (VideoMotion, CrossLine, CrossRegionDetection, AlarmLocal)

### 🚀 Hardware Acceleration
- **VAAPI** — Intel/AMD GPUs on Linux
- **QuickSync** — Intel integrated graphics
- **NVENC** — NVIDIA GPUs
- **AMF** — AMD GPUs on Windows
- **VideoToolbox** — Apple Silicon and Intel Macs
- **V4L2** — Raspberry Pi 4+

### 📸 Fast Snapshots
- CGI-based snapshots via NVR HTTP/HTTPS API
- Concurrent snapshots — all cameras refresh thumbnails simultaneously
- 5-second snapshot cache reduces redundant NVR requests
- Fast-fail on offline cameras (8s connection timeout)
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

## Configuration

### Platform Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `platform` | string | - | **Required.** Must be `DahuaUltimate` |
| `name` | string | `Dahua NVR` | Platform name in logs |
| `host` | string | - | **Required.** NVR IP address or hostname |
| `port` | number | 80 | HTTP (80) or HTTPS (443) port |
| `secure` | boolean | false | Use HTTPS. Auto-enabled for port 443 |
| `username` | string | - | **Required.** NVR username |
| `password` | string | - | **Required.** NVR password |
| `forceDiscovery` | boolean | false | Force re-discovery on next start (auto-resets) |
| `debugMotion` | boolean | false | Enable verbose motion event logging |
| `cameras` | array | [] | Camera configurations (auto-populated) |

### Camera Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `channelId` | number | - | **Required.** Camera channel (1-based) |
| `name` | string | - | **Required.** Camera display name |
| `enabled` | boolean | true | Enable/disable this camera |
| `manufacturer` | string | `Dahua` | Camera manufacturer |
| `model` | string | `Dahua IP Camera` | Camera model |
| `motion` | boolean | true | Enable motion detection |
| `motionTimeout` | number | 15 | Motion clear timeout (seconds) |
| `unbridge` | boolean | false | Run as separate accessory (required for HKSV) |
| `videoConfig` | object | - | Advanced video configuration |

### Video Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `source` | string | - | Full FFmpeg source args including `-i` |
| `stillImageSource` | string | - | FFmpeg args for snapshot |
| `maxStreams` | number | 2 | Maximum concurrent streams |
| `maxWidth` | number | 1920 | Maximum stream width |
| `maxHeight` | number | 1080 | Maximum stream height |
| `maxBitrate` | number | 4000 | Maximum bitrate (kbps) |
| `qualityPreset` | string | - | `480p-standard`, `720p-standard`, `1080p-standard`, `1080p-hq` — see below |
| `encoder` | string | `software` | `software`, `vaapi`, `amf`, `quicksync`, `nvenc`, `videotoolbox`, `v4l2` |
| `qualityProfile` | string | - | `speed`, `balanced`, `quality` |
| `hwaccelDevice` | string | `/dev/dri/renderD128` | Hardware device path (VAAPI) |
| `audio` | boolean | false | Enable audio |
| `copyAudio` | boolean | false | Pass audio through without transcoding |
| `recording` | boolean | false | Enable HKSV recording |
| `prebuffer` | boolean | false | Enable prebuffer for HKSV |
| `prebufferLength` | number | 4000 | Prebuffer length (ms) |
| `packetSize` | number | 1316 | RTP packet size (MTU) |
| `debug` | boolean | false | Enable verbose FFmpeg logging |

## Quality Presets

Setting `qualityPreset` is **strongly recommended**. Without it, HomeKit performs an adaptive probe — starting every stream at 640x360/132kbps — before tearing it down and restarting at the correct resolution. This causes a 20-40 second delay before video appears.

With `qualityPreset` set, the plugin forces the correct resolution and bitrate from the very first stream request, eliminating the restart entirely.

| Preset | Resolution | Bitrate | Use case |
|--------|-----------|---------|----------|
| `480p-standard` | 854x480 | 500kbps | NVR substreams (704x576) |
| `720p-standard` | 1280x720 | 1500kbps | 720p streams |
| `1080p-standard` | 1920x1080 | 2000kbps | 1080p mainstream |
| `1080p-hq` | 1920x1080 | 4000kbps | 1080p high quality |

For Dahua NVR substreams (typically 704x576), use `480p-standard`.

## Hardware Acceleration

**Important:** The bundled `ffmpeg-for-homebridge` package does **not** include hardware encoder support. You must install or compile a custom FFmpeg binary with the appropriate codecs for your GPU.

### Configuration

Set the `encoder` field in `videoConfig`:

```json
{
  "videoConfig": {
    "encoder": "vaapi",
    "hwaccelDevice": "/dev/dri/renderD128",
    "qualityProfile": "speed"
  }
}
```

### VAAPI (Intel/AMD on Linux)

```json
{
  "encoder": "vaapi",
  "hwaccelDevice": "/dev/dri/renderD128",
  "qualityProfile": "speed"
}
```

The plugin uses a full GPU pipeline: hardware decode → GPU scale → hardware encode. Requires a custom FFmpeg build with `--enable-vaapi`.

**Verify your FFmpeg has VAAPI support:**
```bash
ffmpeg -encoders | grep vaapi
```

### Other Encoders

| Encoder | Codec | Notes |
|---------|-------|-------|
| `vaapi` | h264_vaapi | Intel/AMD Linux — full GPU pipeline |
| `nvenc` | h264_nvenc | NVIDIA — software decode, GPU encode |
| `quicksync` | h264_qsv | Intel — software decode, GPU encode |
| `amf` | h264_amf | AMD Windows — software decode, GPU encode |
| `videotoolbox` | h264_videotoolbox | macOS — Apple Silicon and Intel |
| `v4l2` | h264_v4l2m2m | Raspberry Pi 4+ |
| `software` | libx264 | CPU encoding, works everywhere |

## Stream Types

Dahua cameras provide multiple streams:

- **Mainstream** (`subtype=0`): Full resolution, high bitrate — best quality
- **Substream** (`subtype=1`): Lower resolution — recommended for HomeKit to reduce NVR load
- **Thirdstream** (`subtype=2`): Lowest resolution — for slow connections

Use the `source` field in `videoConfig` to select the stream:
```
rtsp://admin:password@nvr-ip:554/cam/realmonitor?channel=1&subtype=0
rtsp://admin:password@nvr-ip:554/cam/realmonitor?channel=1&subtype=1
```

## Motion Detection

Motion detection is enabled by default and uses Dahua's CGI event stream.

### Supported Events
- `VideoMotion` — General motion detection
- `CrossLineDetection` — Line crossing
- `CrossRegionDetection` — Intrusion detection
- `AlarmLocal` — Local alarm trigger

### Configuration

```json
{
  "motion": true,
  "motionTimeout": 15
}
```

## Troubleshooting

### Streams Not Starting / FFmpeg Error

If you see `Unrecognized option` or `Error splitting the argument list` in logs, ensure you are on **v1.2.0 or later**. Earlier versions had a bug that injected stray characters into the FFmpeg argument string.

### Video Delayed 20+ Seconds

Set `qualityPreset` in each camera's `videoConfig`. This eliminates HomeKit's probe/RECONFIGURE cycle.

If using mainstream H.265 streams, Dahua NVRs are known to send irregular PTS timestamps which the plugin automatically corrects with `-use_wallclock_as_timestamps 1`. Ensure you are on v1.1.9 or later.

### No Audio

Ensure you are on **v1.2.0 or later**. Earlier versions had a bug that silently discarded the audio stream.

Set `audio: true` in `videoConfig`. For most Dahua NVRs, leave `copyAudio: false` (transcoding required as NVRs typically output G.711).

### Cameras Not Appearing

1. Check NVR credentials
2. Verify network connectivity
3. Check Homebridge logs for errors
4. Force re-discovery:
   ```json
   { "forceDiscovery": true }
   ```
5. Restart Homebridge

### Snapshots Failing

Verify port and protocol match:
```json
{ "port": 443, "secure": true }
```

Note: The doorbell channel snapshot CGI endpoint on some Dahua NVRs consistently times out. This is an NVR firmware limitation and cannot be fixed in the plugin.

### SSL Certificate Errors

The plugin automatically disables SSL certificate verification for self-signed certificates. No action needed.

### Hardware Acceleration Not Working

Verify your FFmpeg binary has the required encoder:
```bash
ffmpeg -encoders | grep vaapi   # for VAAPI
ffmpeg -encoders | grep nvenc   # for NVENC
```

If hardware encoding fails at runtime, switch `encoder` back to `software` and the plugin will use libx264.

## API Compatibility

This plugin uses Dahua's HTTP CGI API:
- Device info: `/cgi-bin/magicBox.cgi?action=getSystemInfo`
- Channel discovery: `/cgi-bin/configManager.cgi?action=getConfig&name=Encode`
- Events: `/cgi-bin/eventManager.cgi?action=attach&codes=[...]`
- RTSP: `rtsp://host:554/cam/realmonitor?channel=N&subtype=0`
- Snapshots: `/cgi-bin/snapshot.cgi?channel=N`

Tested with Dahua NVR firmware 4.x and newer.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Support

- **Issues**: [GitHub Issues](https://github.com/pit5bul/homebridge-dahua-ultimate/issues)
- **Homebridge Discord**: [#plugin-development](https://discord.gg/homebridge)
- **Funding**: [Buy Me a Coffee](https://buymeacoffee.com/pit5bul)

## Credits

- **Author**: pit5bul
- **Based on**: homebridge-hikvision-ultimate architecture
- **Inspired by**: homebridge-camera-ffmpeg

## License

PERSONAL-USE LICENSE — See [LICENSE](LICENSE) file for details.
