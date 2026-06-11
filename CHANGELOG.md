# Changelog

All notable changes to homebridge-dahua-ultimate will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-06-12

### Fixed
- **Critical: FFmpeg crash on stream start** — stray single-quote characters were being injected into the FFmpeg argument string around `-an -sn -dn`, causing FFmpeg to exit immediately with `Unrecognized option 'dn''` / `Error splitting the argument list`. No streams worked in v1.1.9.
- **Critical: Audio never streamed** — the audio output format was set to `-f null` which discards audio entirely. Changed to `-f rtp` so audio is actually sent to HomeKit.

### Changed
- **CI: Workflow now triggers on version tags only** — previously the publish workflow ran on every push to main, causing build failure emails on non-release commits. Now only `git push --tags` triggers the workflow.

## [1.1.9] - 2026-06-11

### Fixed
- **20+ second stream buffering delay** — Dahua NVRs send RTSP frames with highly irregular PTS timestamps (~0.73-0.99s gaps instead of the expected 0.067s), causing FFmpeg to flood logs with `Past duration too large` warnings and buffer frames for 20+ seconds before HomeKit displayed video. Fixed by prepending `-use_wallclock_as_timestamps 1` to all RTSP source arguments, replacing NVR timestamps with system wall clock time.

### Changed
- **UI schema cleanup** — removed deprecated/unused fields (`resolutionMode`, `customWidth`, `customHeight`, `minBitrate`, `videoFilter`, `mapvideo`, `mapaudio`) from both the UI schema and codebase. Config UI X now shows only relevant options.

## [1.1.8] - 2026-06-10

### Added
- **`qualityPreset` option** — eliminates HomeKit's adaptive probe/RECONFIGURE double stream start. HomeKit always begins streams at 640x360/~132kbps as an adaptive probe, then tears down and restarts at the correct resolution — causing 20-40 second delays. Setting `qualityPreset` forces the correct resolution and bitrate from the very first stream request, eliminating the restart entirely.

### Available presets
- `480p-standard` — 854x480, 500kbps (recommended for NVR substreams at 704x576)
- `720p-standard` — 1280x720, 1500kbps
- `1080p-standard` — 1920x1080, 2000kbps
- `1080p-hq` — 1920x1080, 4000kbps

## [1.1.7] - 2026-06-09

### Fixed
- **Snapshot queue removed** — previously snapshots were serialised through a queue, which blocked stream starts. HomeKit fires snapshot and stream callbacks on completely independent HAP callbacks, so serialising them caused streams to wait for all pending snapshots to finish first. Snapshots are now fully concurrent, which is the correct HomeKit behaviour.

## [1.1.6] - 2026-06-07

### Added
- **`encoder` config option** — replaces manual `encoderOptions`/`videoFilter` approach for hardware acceleration. Set `encoder` to `vaapi`, `amf`, `quicksync`, `nvenc`, `videotoolbox`, or `v4l2`. The plugin automatically builds the correct FFmpeg pipeline including hwaccel init, filter chain, and encoder flags.
- **`qualityProfile` option** — `speed`, `balanced`, or `quality` tuning presets per encoder type.
- **`hwaccelDevice` option** — specify the hardware device path (e.g. `/dev/dri/renderD128` for VAAPI).

## [1.1.5] - 2026-06-06

### Fixed
- **`copyAudio` now visible in Homebridge Config UI X** — the toggle was missing from the UI form despite being in the schema properties. Added to the Audio section of the camera configuration form.

## [1.1.4] - 2026-06-05

### Added
- **`copyAudio` config option** — allows passing the audio stream directly to HomeKit without transcoding. Useful if your camera outputs a HomeKit-compatible codec (AAC-ELD or Opus). For cameras outputting G.711/PCM (most Dahua NVRs), transcoding is still required — leave this disabled.

### Changed
- Audio log now indicates copy mode when enabled (e.g. `Audio enabled: AAC-eld 16kHz 24kbps (copy)`)
- soxr resampler filter is skipped when `copyAudio` is enabled (no transcoding = no resampling needed)

## [1.1.3] - 2026-06-05

### Fixed
- **Snapshot queue**: Snapshot requests are now serialised per camera using an internal queue, preventing concurrent HTTPS requests from overwhelming the NVR. Previously, opening the Home app triggered simultaneous snapshot requests for all cameras which caused timeouts and slow thumbnail loading.
- **Snapshot timeout**: Increased snapshot timeout from 10s to 15s to accommodate slower NVR responses, particularly on HTTPS connections.
- **Snapshot connection timeout**: Added `-timeout 8000000` (8 seconds in microseconds) to FFmpeg HTTPS snapshot commands so dead/offline cameras fail fast instead of hanging until the process timeout fires.
- **Audio quality**: Added `-af aresample=resampler=soxr` to the audio transcoding pipeline, enabling high-quality resampling when converting NVR audio to HomeKit's AAC-ELD format.
- **Snapshot cache extended**: Increased snapshot cache TTL from 3 seconds to 5 seconds to further reduce NVR load during rapid Home app refreshes.

### Changed
- Audio log now includes negotiated sample rate and bitrate for easier debugging (e.g. `Audio enabled: AAC-eld 16kHz 24kbps`)

## [1.1.2] - 2026-02-15

### Fixed
- **Critical**: Snapshot channel indexing corrected to 1-based (same as RTSP)
  - Previously used 0-based indexing causing wrong camera snapshots
  - Example: Side view (channel 5) was getting Garage view (channel 4) snapshot
  - Now correctly maps: D1→channel=1, D2→channel=2, D3→channel=3, etc.
  - Fixed in both `buildFfmpegStillSource()` and `buildStillImageUrl()` methods

### Changed
- **License**: Updated from MIT to PERSONAL-USE LICENSE
- **README**: Added Homebridge Verified badge
- **README**: Updated with new licensing information

## [1.1.1] - 2026-02-15

### Fixed
- **Critical**: Smart discovery `enabled` flag now properly applied to new cameras

### Changed
- **Documentation**: Removed incorrect ISAPI references (Hikvision-specific)

## [1.1.0] - 2026-02-15

### 🎉 Major Release - Production Ready

First stable release with full Dahua NVR support and smart camera discovery.

### Added
- Smart Discovery Logic
- Better Camera Information
- Hardware Acceleration Documentation

### Fixed
- Snapshot URLs fixed for HTTPS
- SSL Certificate Handling
- Port 443 Auto-Detection

## [1.0.0 - 1.0.10] - 2026-02-15

Initial releases — Dahua CGI API implementation, channel discovery, motion events, RTSP streaming, digest authentication. See git history for details.

## Architecture Credits

This plugin is based on the architecture of homebridge-hikvision-ultimate v2.0.6, adapted for Dahua NVR compatibility using Dahua's HTTP CGI API instead of Hikvision's ISAPI.

## License

PERSONAL-USE LICENSE — See [LICENSE](LICENSE) file for details.
