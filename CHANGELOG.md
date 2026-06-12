# Changelog

All notable changes to homebridge-dahua-ultimate will be documented in this file.

## [1.3.3] - 2026-06-13

### Added
- **`maxFPS` config option** — set the maximum frame rate advertised to HomeKit per camera. Defaults to `15` to match Dahua NVR output. Previously hardcoded to 30fps which caused HomeKit to buffer duplicate frames before rendering, resulting in slow stream startup. Set `"maxFPS": 30` in `videoConfig` to override if your camera supports higher frame rates.

### Fixed
- **Slow stream startup / long delay before video appears** — HomeKit was negotiating 30fps but the NVR sends 15fps, causing FFmpeg to duplicate frames and HomeKit to buffer before rendering. `maxFPS` now defaults to 15.

## [1.3.2] - 2026-06-12

### Added
- `480p-standard` quality preset added back for Dahua NVR substreams (704x576)
- Dahua CGI motion event types restored (`VideoMotion`, `CrossLineDetection`, etc.)

## [1.3.1] - 2026-06-12

### Fixed
- `QualityPreset` type updated to include `480p-standard`

## [1.3.0] - 2026-06-12

### Changed
- **Full codebase realignment with homebridge-hikvision-ultimate** — streaming, accessory, and platform code rebuilt to exactly match the working Hikvision plugin architecture. Experimental additions introduced in v1.1.7–v1.2.0 were removed as they caused regressions.

### Fixed
- **Audio never streamed** — audio output format corrected from `-f null` to `-f rtp`
- **Stray quote characters in FFmpeg args** — caused FFmpeg to crash immediately on stream start
- **`RecordingDelegate` constructor mismatch** — extra argument removed

### Added
- **HTTPS snapshot timeout** — `-timeout 8000000` automatically applied when `stillImageSource` uses `https://`

## [1.2.0] - 2026-06-12

### Fixed
- Critical: FFmpeg crash on stream start — stray quotes in `-an -sn -dn`
- Critical: Audio discarded — `-f null` changed to `-f rtp`

### Changed
- CI workflow now triggers on version tags only

## [1.1.9] - 2026-06-11

### Fixed
- 20+ second stream buffering delay — added `-use_wallclock_as_timestamps 1` (reverted in v1.3.0)

## [1.1.8] - 2026-06-10

### Added
- `qualityPreset` option (reverted in v1.3.0)

## [1.1.7] - 2026-06-09

### Fixed
- Snapshot queue removed — concurrent snapshots are correct HomeKit behaviour

## [1.1.6] - 2026-06-07

### Added
- `encoder` config option for hardware acceleration (vaapi, amf, quicksync, nvenc, videotoolbox, v4l2)
- `qualityProfile` and `hwaccelDevice` options

## [1.1.5] - 2026-06-06

### Fixed
- `copyAudio` now visible in Homebridge Config UI X

## [1.1.4] - 2026-06-05

### Added
- `copyAudio` config option

## [1.1.3] - 2026-06-05

### Fixed
- Snapshot timeout increased, connection timeout added, snapshot cache TTL increased

## [1.1.2] - 2026-02-15

### Fixed
- Critical: Snapshot channel indexing corrected to 1-based

## [1.1.1] - 2026-02-15

### Fixed
- Smart discovery `enabled` flag properly applied

## [1.1.0] - 2026-02-15

First stable release with full Dahua NVR support and smart camera discovery.

## [1.0.0 - 1.0.10] - 2026-02-15

Initial releases. See git history for details.

## Architecture Credits

Based on homebridge-hikvision-ultimate, adapted for Dahua NVR CGI API.

## License

PERSONAL-USE LICENSE — See [LICENSE](LICENSE) for details.
