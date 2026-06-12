# homebridge-dahua-ultimate

[![npm version](https://badge.fury.io/js/homebridge-dahua-ultimate.svg)](https://www.npmjs.com/package/homebridge-dahua-ultimate)
[![npm downloads](https://badgen.net/npm/dt/homebridge-dahua-ultimate)](https://www.npmjs.com/package/homebridge-dahua-ultimate)
[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=flat)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Homebridge plugin for Dahua NVR cameras with automatic discovery, motion detection, and hardware-accelerated streaming.

## Features

- **Automatic camera discovery** — connects to your Dahua NVR and discovers all cameras automatically
- **Motion detection** — real-time events via Dahua CGI event stream (VideoMotion, CrossLine, CrossRegion, AlarmLocal)
- **Hardware acceleration** — VAAPI, NVENC, QuickSync, AMF, VideoToolbox, V4L2
- **Audio streaming** — AAC-ELD and Opus support with optional pass-through
- **HomeKit Secure Video** — full HKSV recording support with prebuffer
- **HTTPS support** — works with Dahua NVRs on port 443 with self-signed certificates

## Installation

```bash
sudo npm install -g homebridge-dahua-ultimate
```

Or install via Homebridge Config UI X.

## Minimum Configuration

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

On first startup the plugin will auto-discover all cameras and populate the config.

## Platform Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `platform` | string | — | **Required.** Must be `DahuaUltimate` |
| `name` | string | `Dahua NVR` | Platform name |
| `host` | string | — | **Required.** NVR IP or hostname |
| `port` | number | 80 | NVR port (use 443 for HTTPS) |
| `secure` | boolean | false | Use HTTPS |
| `username` | string | — | **Required.** NVR username |
| `password` | string | — | **Required.** NVR password |
| `streamType` | string | `mainstream` | `mainstream` or `substream` |
| `forceDiscovery` | boolean | false | Force re-discovery on next start |
| `debugMotion` | boolean | false | Verbose motion event logging |

## Camera videoConfig Options

| Option | Type | Description |
|--------|------|-------------|
| `source` | string | Full FFmpeg source args including `-i` |
| `stillImageSource` | string | FFmpeg args for snapshot |
| `maxStreams` | number | Max concurrent streams (default 2) |
| `maxWidth` | number | Max stream width |
| `maxHeight` | number | Max stream height |
| `maxBitrate` | number | Max bitrate in kbps |
| `encoder` | string | `software`, `vaapi`, `amf`, `quicksync`, `nvenc`, `videotoolbox`, `v4l2` |
| `qualityProfile` | string | `speed`, `balanced`, `quality` |
| `hwaccelDevice` | string | Hardware device path (e.g. `/dev/dri/renderD128`) |
| `audio` | boolean | Enable audio |
| `copyAudio` | boolean | Pass audio through without transcoding |
| `recording` | boolean | Enable HKSV recording |
| `prebuffer` | boolean | Enable HKSV prebuffer |
| `debug` | boolean | Verbose FFmpeg logging |

## Hardware Acceleration

Set `encoder` in `videoConfig`:

```json
{
  "videoConfig": {
    "encoder": "vaapi",
    "hwaccelDevice": "/dev/dri/renderD128",
    "qualityProfile": "speed"
  }
}
```

| Encoder | Platform |
|---------|----------|
| `vaapi` | Intel/AMD on Linux |
| `nvenc` | NVIDIA |
| `quicksync` | Intel |
| `amf` | AMD on Windows |
| `videotoolbox` | macOS |
| `v4l2` | Raspberry Pi 4+ |
| `software` | CPU (libx264, works everywhere) |

The bundled `ffmpeg-for-homebridge` does not include hardware encoder support. Install or compile a custom FFmpeg binary with the required codecs.

## Stream Types

Dahua NVRs provide multiple streams per camera:

| subtype | Description |
|---------|-------------|
| `subtype=0` | Mainstream — full resolution, high bitrate |
| `subtype=1` | Substream — lower resolution, lower bitrate |

Set via the `source` field or use the global `streamType` option.

## Motion Detection

Supported event types: `VideoMotion`, `CrossLineDetection`, `CrossRegionDetection`, `AlarmLocal`, `VideoLoss`, `VideoBlind`.

```json
{
  "motion": true,
  "motionTimeout": 15
}
```

## Troubleshooting

### No video / stream not starting
Enable `debug: true` in `videoConfig` and check Homebridge logs for the FFmpeg command and any errors.

### Snapshots failing
Verify port and `secure` match your NVR. Some Dahua NVR channels (e.g. doorbell) have snapshot endpoints that consistently time out — this is an NVR firmware limitation.

### SSL certificate errors
The plugin automatically ignores self-signed certificate errors for HTTPS NVR connections.

### Hardware acceleration not working
Verify your FFmpeg build has the required encoder:
```bash
ffmpeg -encoders | grep vaapi
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for full version history.

## Credits

Based on [homebridge-hikvision-ultimate](https://github.com/pit5bul/homebridge-hikvision-ultimate) architecture, adapted for Dahua NVR CGI API.

## License

PERSONAL-USE LICENSE — See [LICENSE](LICENSE) for details.
