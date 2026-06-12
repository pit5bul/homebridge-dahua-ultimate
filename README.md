# homebridge-dahua-ultimate

[![npm version](https://badge.fury.io/js/homebridge-dahua-ultimate.svg)](https://www.npmjs.com/package/homebridge-dahua-ultimate)
[![npm downloads](https://badgen.net/npm/dt/homebridge-dahua-ultimate)](https://www.npmjs.com/package/homebridge-dahua-ultimate)
[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=flat)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Homebridge plugin for Dahua NVR cameras with automatic discovery, motion detection, and hardware-accelerated streaming.

## Features

- **Automatic camera discovery** — connects to your Dahua NVR and discovers all cameras automatically
- **Motion detection** — real-time events via Dahua CGI event stream (VideoMotion, CrossLine, CrossRegion, AlarmLocal)
- **Hardware acceleration** — VAAPI, NVENC, QuickSync, AMF, VideoToolbox, V4L2
- **Audio streaming** — AAC-ELD with optional pass-through
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

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `source` | string | — | Full FFmpeg source args including `-i` |
| `stillImageSource` | string | — | FFmpeg args for snapshot |
| `maxStreams` | number | 2 | Max concurrent streams |
| `maxWidth` | number | 1920 | Max stream width |
| `maxHeight` | number | 1080 | Max stream height |
| `maxBitrate` | number | 2000 | Max bitrate in kbps |
| `maxFPS` | number | **15** | Max frame rate advertised to HomeKit. Set to match your NVR output. Defaults to 15 for Dahua NVRs. |
| `qualityPreset` | string | `1080p-standard` | `480p-standard`, `720p-standard`, `1080p-standard`, `1080p-hq` |
| `encoder` | string | `software` | `software`, `vaapi`, `amf`, `quicksync`, `nvenc`, `videotoolbox`, `v4l2` |
| `qualityProfile` | string | — | `speed`, `balanced`, `quality` |
| `hwaccelDevice` | string | `/dev/dri/renderD128` | Hardware device path |
| `audio` | boolean | true | Enable audio |
| `copyAudio` | boolean | false | Pass audio through without transcoding |
| `recording` | boolean | false | Enable HKSV recording |
| `prebuffer` | boolean | false | Enable HKSV prebuffer |
| `debug` | boolean | false | Verbose FFmpeg logging |

## Frame Rate

Dahua NVRs typically output 15fps. The `maxFPS` option (default `15`) tells HomeKit the maximum frame rate this camera supports. Setting this correctly prevents HomeKit from requesting 30fps and then buffering duplicate frames before rendering — which caused slow stream startup in earlier versions.

If your NVR streams at a different frame rate, set `maxFPS` accordingly:

```json
{
  "videoConfig": {
    "maxFPS": 15
  }
}
```

## Quality Presets

| Preset | Resolution | Bitrate | Use case |
|--------|-----------|---------|----------|
| `480p-standard` | 854x480 | 500kbps | NVR substreams (704x576) |
| `720p-standard` | 1280x720 | 1500kbps | 720p streams |
| `1080p-standard` | 1920x1080 | 2000kbps | 1080p mainstream |
| `1080p-hq` | 1920x1080 | 4000kbps | 1080p high quality |

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
| `software` | CPU (works everywhere) |

## Stream Types

| subtype | Description |
|---------|-------------|
| `subtype=0` | Mainstream — full resolution, high bitrate |
| `subtype=1` | Substream — lower resolution, lower bitrate |

## Motion Detection

Supported event types: `VideoMotion`, `CrossLineDetection`, `CrossRegionDetection`, `AlarmLocal`, `VideoLoss`, `VideoBlind`.

## Troubleshooting

### Slow stream startup / video delayed
Ensure `maxFPS` matches your NVR's actual output frame rate (default is 15). A mismatch causes HomeKit to buffer frames before rendering.

### No video
Enable `debug: true` in `videoConfig` and check Homebridge logs for FFmpeg errors.

### Snapshots failing
Verify `port` and `secure` match your NVR. Doorbell channel snapshots may consistently time out on some NVR firmware — this is an NVR limitation.

### Hardware acceleration not working
Verify your FFmpeg build includes the required encoder:
```bash
ffmpeg -encoders | grep vaapi
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for full version history.

## Credits

Based on [homebridge-hikvision-ultimate](https://github.com/pit5bul/homebridge-hikvision-ultimate), adapted for Dahua NVR CGI API.

## License

PERSONAL-USE LICENSE — See [LICENSE](LICENSE) for details.
