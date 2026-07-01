# Changelog

All notable changes to homebridge-dahua-ultimate will be documented in this file.

## [2.0.1] - 2026-07-02

### Changed
- **Removed automatic probesize/analyzeduration injection** — the plugin no longer forces these values on all cameras by default. FFmpeg's own defaults handle all camera types correctly including H.264 and H.265. Per-camera overrides still work via `probeSize` and `analyzeDuration` in videoConfig.
- **Added `-stimeout 5000000` to all RTSP sources** — prevents FFmpeg from hanging indefinitely on connection issues. 5 second timeout applied automatically.

### Fixed
- **H.264 cameras with unusual streams no longer crash** — the previous auto-injection of `probesize 500000` was insufficient for some H.264 cameras (e.g. cameras that don't send keyframes within the analyze window). Removing the injection lets FFmpeg use its full defaults.
- **Custom `source` overrides now work correctly** — probesize injection was conflicting with user-supplied source args.

## [2.0.0] - 2026-07-02

### Added
- **Per-camera `probeSize` and `analyzeDuration` config fields** — control how much data FFmpeg reads before starting a stream. Exposed in the Advanced/Debug section of each camera in Config UI X.
- **Smart codec-based defaults** — H.265 (HEVC) cameras automatically use `probeSize: 32` and `analyzeDuration: 0` for fastest possible startup. H.264 cameras automatically use `probeSize: 500000` and `analyzeDuration: 1000000` to reliably detect stream parameters and avoid FFmpeg crashes.
- **NVR audio codec support** — G.711A (pcm_alaw) audio from the NVR is now correctly detected and transcoded to AAC-ELD for HomeKit.

### Fixed
- **H.264 cameras crashing on stream start** (e.g. Doorbell, outside cameras) — `probesize 32` was too small to detect H.264 stream parameters causing FFmpeg to exit with `Output file does not contain any stream`. Smart defaults now prevent this.
- **10+ second stream startup delay** — `probesize` and `analyzeduration` are now applied to all streams, eliminating FFmpeg's default 5-second analysis phase.
- **Frame drops with audio timestamp jitter** — removed `-use_wallclock_as_timestamps` which caused mass frame drops with G.711A audio.

### Changed
- Version bumped to 2.0.0 — marks stable production release with all core issues resolved.

## [1.9.97] - 2026-06-14

### Fixed
- `-probesize 32 -analyzeduration 0` added to FFmpeg input to reduce stream startup delay from 10+ seconds to under 2 seconds.
- Removed `-use_wallclock_as_timestamps 1` which caused frame drops.

## [1.9.9] - 2026-06-13

### Added
- `maxFPS` now visible in Config UI X (Advanced section). Default 15, range 1-30.

### Notes
- Pre-release candidate for v2.0.0. All core functionality tested and working.

## [1.3.3] - 2026-06-13

### Added
- `maxFPS` config option — defaults to 15 to match Dahua NVR output. Fixes slow stream startup caused by HomeKit buffering duplicate frames when 30fps was advertised but NVR sends 15fps.

## [1.3.2] - 2026-06-12

### Added
- `480p-standard` quality preset for Dahua NVR substreams (704x576)
- Dahua CGI motion event types restored

## [1.3.1] - 2026-06-12

### Fixed
- `QualityPreset` type updated to include `480p-standard`

## [1.3.0] - 2026-06-12

### Changed
- Full codebase realignment with homebridge-hikvision-ultimate architecture

### Fixed
- Audio never streamed — `-f null` changed to `-f rtp`
- Stray quote characters in FFmpeg args causing crash on stream start
- `RecordingDelegate` constructor mismatch

### Added
- HTTPS snapshot timeout

## [1.2.0] - 2026-06-12

### Fixed
- Critical: FFmpeg crash on stream start
- Critical: Audio discarded

### Changed
- CI workflow now triggers on version tags only

## [1.1.9] - 2026-06-11

### Fixed
- 20+ second stream buffering delay

## [1.1.8] - 2026-06-10

### Added
- `qualityPreset` option

## [1.1.7] - 2026-06-09

### Fixed
- Snapshot queue removed

## [1.1.6] - 2026-06-07

### Added
- `encoder`, `qualityProfile`, `hwaccelDevice` config options for hardware acceleration

## [1.1.5] - 2026-06-06

### Fixed
- `copyAudio` now visible in Config UI X

## [1.1.4] - 2026-06-05

### Added
- `copyAudio` config option

## [1.1.3] - 2026-06-05

### Fixed
- Snapshot timeout, connection timeout, cache TTL improvements

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
