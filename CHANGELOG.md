# Changelog

All notable changes to homebridge-dahua-ultimate will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-06-12

### Changed
- **Full codebase realignment with homebridge-hikvision-ultimate** — the streaming, accessory, and platform code was rebuilt to exactly match the working Hikvision plugin architecture. Experimental additions introduced in v1.1.7–v1.2.0 (snapshot queue removal, `qualityPreset`, `-use_wallclock_as_timestamps`, soxr resampler, extra interfaces) were removed as they caused regressions.
- **`tsconfig.json`** — strict mode restored to match Hikvision, fixing TypeScript compilation issues.
- **`config.schema.json`** — schema rebuilt from Hikvision base, removing fields no longer in codebase.

### Fixed
- **Audio never streamed** — audio output format corrected from `-f null` (which silently discards audio) to `-f rtp`. This bug existed in both v1.2.0 and the Hikvision plugin.
- **Stray quote characters in FFmpeg args** — removed leftover `'` characters around `-an -sn -dn` that caused FFmpeg to crash immediately on stream start.
- **`RecordingDelegate` constructor mismatch** — extra `this.hap` argument removed from constructor call.

### Added
- **HTTPS snapshot timeout** — when `stillImageSource` uses `https://`, `-timeout 8000000` (8 seconds) is automatically prepended to the FFmpeg snapshot command. Prevents hung processes on slow or unreachable NVR HTTPS endpoints.

## [1.2.0] - 2026-06-12

### Fixed
- **Critical: FFmpeg crash on stream start** — stray single-quote characters injected into FFmpeg args around `-an -sn -dn`.
- **Critical: Audio never streamed** — audio output format set to `-f null`, discarding audio entirely.

### Changed
- **CI: Workflow now triggers on version tags only** — prevents build failure emails on every commit to main.

## [1.1.9] - 2026-06-11

### Fixed
- **20+ second stream buffering delay** — added `-use_wallclock_as_timestamps 1` to fix Dahua NVR irregular PTS timestamps. (Reverted in v1.3.0 — caused regressions.)

### Changed
- **UI schema cleanup** — removed deprecated fields from UI and codebase.

## [1.1.8] - 2026-06-10

### Added
- **`qualityPreset` option** — eliminated HomeKit probe/RECONFIGURE double stream start. (Reverted in v1.3.0.)

## [1.1.7] - 2026-06-09

### Fixed
- **Snapshot queue removed** — concurrent snapshots are correct HomeKit behaviour.

## [1.1.6] - 2026-06-07

### Added
- **`encoder` config option** — hardware acceleration via `vaapi`, `amf`, `quicksync`, `nvenc`, `videotoolbox`, `v4l2`.
- **`qualityProfile` option** — `speed`, `balanced`, `quality` tuning per encoder.
- **`hwaccelDevice` option** — hardware device path (e.g. `/dev/dri/renderD128`).

## [1.1.5] - 2026-06-06

### Fixed
- **`copyAudio` now visible in Homebridge Config UI X.**

## [1.1.4] - 2026-06-05

### Added
- **`copyAudio` config option** — pass audio through without transcoding.

## [1.1.3] - 2026-06-05

### Fixed
- Snapshot timeout increased to 15s.
- Connection timeout added for offline cameras.
- Snapshot cache TTL increased to 5s.

## [1.1.2] - 2026-02-15

### Fixed
- **Critical: Snapshot channel indexing** corrected to 1-based.

### Changed
- License updated to PERSONAL-USE LICENSE.

## [1.1.1] - 2026-02-15

### Fixed
- Smart discovery `enabled` flag properly applied to new cameras.

## [1.1.0] - 2026-02-15

### Added
- Smart Discovery, hardware acceleration documentation, HTTPS snapshot support.

## [1.0.0 - 1.0.10] - 2026-02-15

Initial releases. See git history for details.

## Architecture Credits

Based on homebridge-hikvision-ultimate v2.0.6, adapted for Dahua NVR CGI API.

## License

PERSONAL-USE LICENSE — See [LICENSE](LICENSE) for details.
