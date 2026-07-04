# homebridge-dahua-ultimate

[![npm version](https://badge.fury.io/js/homebridge-dahua-ultimate.svg)](https://www.npmjs.com/package/homebridge-dahua-ultimate)
[![npm downloads](https://badgen.net/npm/dt/homebridge-dahua-ultimate)](https://www.npmjs.com/package/homebridge-dahua-ultimate)
[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=flat)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Homebridge plugin for Dahua NVR cameras with automatic discovery, motion detection, and hardware-accelerated streaming.

> **v2.0.3** — Snapshots now use direct HTTP digest auth — no FFmpeg, no timeouts. Multiple bug fixes across streaming, events and config.

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
| `stillImageSource` | string | — | Legacy FFmpeg snapshot source. Not needed — plugin now fetches snapshots directly via digest auth. |
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
| `copyVideo` | boolean | false | Pass video through without transcoding — only takes effect when `codec` is set to `h264` (the source must already be H.264). See "Copy Video" below. |
| `nativeWidth` | number | — | This channel's real native resolution width, if known. Caps what's offered to HomeKit — never declares a resolution larger than this. |
| `nativeHeight` | number | — | This channel's real native resolution height, if known. |
| `forceKeyFrameInterval` | number | 4 | Maximum seconds between keyframes, regardless of encoding fps. HomeKit's own tolerance is documented at ~5 seconds. |
| `stallWatchdog` | boolean | true | Detect a frozen video pipeline and end the session cleanly (letting HomeKit reconnect) rather than leaving a dead stream running. |
| `stallTimeoutMs` | number | 4000 | How long the frame counter must be frozen before the stall watchdog acts. |
| `recording` | boolean | false | Enable HKSV recording |
| `prebuffer` | boolean | false | Enable HKSV prebuffer |
| `codec` | string | — | `h264` or `h265` — set this to your camera's actual RTSP codec for fast, reliable stream startup. See below. |
| `nativeSnapshot` | boolean | `true` | Set to `false` for non-Dahua/ONVIF channels — see "Non-Dahua / ONVIF Channels" below. |
| `probeSize` | number | auto | Bytes FFmpeg reads to detect stream params. Overrides the `codec` default if set. H.265: `32`, H.264: `500000`. |
| `analyzeDuration` | number | auto | Microseconds FFmpeg analyses the stream. Overrides the `codec` default if set. H.265: `0`, H.264: `1000000`. |
| `debug` | boolean | false | Verbose FFmpeg logging |

## Copy Video (no transcoding)

If a camera's source is already H.264 (set `codec: "h264"`), you can skip decoding and
re-encoding entirely:

```json
{
  "codec": "h264",
  "copyVideo": true
}
```

This relays the exact original bytes — no decode, no encode, no GPU or CPU cost beyond
relaying packets, and much faster stream startup. It cannot resize the video, so only
use it when the source resolution is already what you want HomeKit to receive.

**This isn't automatically the better choice for every H.264 source.** If a camera's
own bitstream has non-standard characteristics (some ONVIF/third-party cameras patched
into an NVR do), stream copy relays those quirks unchanged and can be less reliable
than a full transcode — which decodes through FFmpeg's own decoder and re-encodes a
clean, standards-compliant bitstream from scratch, effectively fixing the source's
quirks in the process. If `copyVideo` is unreliable on a specific camera, try turning
it off for that camera and leaving full transcoding on instead — test both and use
whichever is actually more reliable for that specific source.

## Hardware Acceleration Validation

When `encoder` is set to `vaapi`, this plugin verifies it actually works before trusting
it — a real test using that camera's own RTSP source (real decode, real scale, real
encode) runs once at platform startup, before any camera accessory exists and before any
stream can be requested. If the test fails, that camera automatically falls back to
software encoding, with a clear log message explaining why. This exists because
`-hwaccels` reporting a method as available only means the FFmpeg build supports it —
it says nothing about whether the actual GPU driver stack will reliably work with it in
practice.

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

## Stream Analysis (codec / probeSize / analyzeDuration)

**Set `codec` on every camera.** Without it, FFmpeg falls back to its own default analysis window (several seconds), which is long enough that HomeKit gives up waiting and shows a black screen or endless spinner — even though the stream is actually running fine in the background. This is not a hypothetical: it's the cause of the v2.0.1–2.0.4 "streams start but never display video" regression.

| Camera codec | Set `codec` to | Resulting probeSize / analyzeDuration |
|---|---|---|
| H.265 (HEVC) | `"h265"` | `32` / `0` — fastest, works because HEVC advertises full stream params in the RTSP SDP |
| H.264 | `"h264"` | `500000` / `1000000` — H.264 needs more data before parameters are reliably detected |

Check your NVR's channel encode settings if you're not sure which codec a camera uses.

If a specific camera needs different values than the codec default (e.g. unusual SPS timing), set `probeSize`/`analyzeDuration` explicitly — they always override the `codec` default:

```json
{
  "videoConfig": {
    "codec": "h264",
    "probeSize": 500000,
    "analyzeDuration": 1000000
  }
}
```

## Non-Dahua / ONVIF Channels

If your NVR has third-party (ONVIF) cameras patched into some channels alongside genuine Dahua cameras, snapshots will fail 100% of the time on those channels with `HTTP 400`/`500` errors, no matter what — Dahua's `snapshot.cgi` is a proprietary endpoint only implemented for the NVR's own camera channels, not passthrough ONVIF ones. This is a hard NVR limitation, not something retries or auth changes can work around.

Set `nativeSnapshot: false` on those specific cameras to fetch snapshots via FFmpeg from the RTSP stream instead:

```json
{
  "videoConfig": {
    "nativeSnapshot": false,
    "source": "-rtsp_transport tcp -i rtsp://user:pass@host:554/cam/realmonitor?channel=6&subtype=0"
  }
}
```

This is slower than the direct HTTP path (spawns FFmpeg per snapshot rather than a lightweight HTTP request) but works regardless of camera brand. Leave `nativeSnapshot` unset (or `true`) for genuine Dahua channels — the direct HTTP path is faster and doesn't need this.

If you're not sure whether a channel is a genuine Dahua camera, check the NVR's web UI under Camera/Channel registration — third-party channels are usually labeled ONVIF or show a different manufacturer.

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
Verify `port` and `secure` match your NVR. Snapshots now use direct digest auth HTTP — if a channel still fails, check the camera is online in the NVR web UI.

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
