# Changelog

All notable changes to homebridge-dahua-ultimate will be documented in this file.

## [2.0.5] - 2026-07-03

### Fixed
- **Black screen / spinning stream on H.265 cameras (regression since 2.0.1)** — v2.0.1 removed the automatic `probesize`/`analyzeduration` injection, assuming "FFmpeg's own defaults handle all camera types correctly." They don't: without an explicit override, RTSP streams fell back to FFmpeg's ~5 second default analysis window. FFmpeg itself started and connected fine (misleadingly, so logs looked healthy), but HomeKit gave up waiting for video before analysis completed, leaving a permanent black screen/spinner. Restored fast, reliable stream startup via a new `codec` setting (see Added below).
- **Intermittent snapshot `500 Internal Server Error` on multiple channels** — root cause was a single shared `DahuaApi` instance (and its mutable digest-auth nonce state) used for every camera's snapshot request. Since HomeKit fetches multiple camera thumbnails concurrently, two in-flight snapshot requests could reset/overwrite each other's nonce mid-request, causing the NVR to reject one of them. Each camera now gets its own dedicated `DahuaApi` instance for snapshots, so concurrent requests no longer interfere with each other. Discovery and the motion event stream continue to share a single client since those aren't concurrent.
- **Dead `VideoLoss`/`VideoBlind` entries removed from `MOTION_EVENT_TYPES`** — these were listed in the constant but never actually part of the event subscription (`events.ts` has hardcoded its own list since 2.0.2); the constant was misleading dead code.

### Added
- **`codec` videoConfig option (`'h264' | 'h265'`)** — set this to your camera's actual RTSP video codec to get fast, reliable stream startup automatically (H.265 → `probeSize: 32, analyzeDuration: 0`; H.264 → `probeSize: 500000, analyzeDuration: 1000000`). Explicit `probeSize`/`analyzeDuration` values always take priority over the `codec` default if both are set. Cameras with no `codec` and no explicit override behave as in 2.0.1-2.0.4 (FFmpeg's own defaults — safe but slow to start).

### Notes
- If you were relying on manually-set `probeSize`/`analyzeDuration` per camera, nothing changes — explicit values still win. Setting `codec` instead is recommended so future firmware/channel changes don't require re-tuning magic numbers by hand.

## [2.0.4] - 2026-07-02

### Fixed
- **Removed invalid `-stimeout` option** — introduced in 2.0.1 to prevent FFmpeg hanging on connection issues; it turned out to be an invalid option in this FFmpeg build and broke all streaming. Removed entirely.
- **`digestAuth` reset before each snapshot** — forces a fresh 401 challenge/response per snapshot request to avoid stale-nonce errors. (Note: this did not fully resolve intermittent 500s — see 2.0.5, which addresses the underlying shared-instance race.)

## [2.0.3] - 2026-07-03

### Fixed
- **Snapshots now use direct HTTP digest authentication** — replaced FFmpeg-based snapshot fetching with a direct HTTP request using the existing `DahuaApi` digest auth client. This fixes all snapshot timeout issues on HTTPS (port 443) and eliminates the concurrent FFmpeg process overload on the NVR that was causing timeouts even on previously working channels.
- **`copyAudio` no longer sends `-b:a` bitrate flag** — bitrate is meaningless with stream copy and was incorrectly included.

### Changed
- `DahuaApi.getSnapshot(channelId)` — new public method returning raw JPEG bytes via digest auth, no FFmpeg involved.
- `StreamingDelegate` now accepts `DahuaApi` instance and uses it for all snapshots. FFmpeg snapshot fallback remains for edge cases where no API client is available.

## [2.0.2] - 2026-07-03

### Fixed
- **FFmpeg input arg ordering** — `-allowed_media_types`, `-stimeout`, and `-probesize`/`-analyzeduration` are now injected in the correct order before `-i`. Previous chained regex replacements could produce wrong ordering.
- **Stdout pipe drain** — FFmpeg streaming process stdout (`-progress pipe:1`) is now properly drained to prevent pipe buffer blocking on long streams.
- **`motionTimeout` default raised from 1s to 10s** — prevents motion state clearing before the NVR sends an explicit stop event.
- **RTSP port hardcoded to 554** — now configurable via `rtspPort` in platform config (default 554).
- **Device name** — `machineName` is now the primary key from `magicBox.cgi?action=getSystemInfo` (Dahua returns this, not `deviceName`).
- **`VideoLoss`/`VideoBlind` removed from event subscription** — these were subscribed but silently discarded. Subscription now only includes handled events: `VideoMotion`, `CrossLineDetection`, `CrossRegionDetection`, `AlarmLocal`.
- **Event buffer trimming** — more robust buffer cleanup after parsing multipart event stream chunks.
- **`maxFPS: 15`** added to `DEFAULT_VIDEO_CONFIG` so it is always applied even if not set in camera config.
- **Dead `STREAM_TYPE_SUFFIX` constant removed** — this was a Hikvision leftover using `01`/`02`/`03` format instead of Dahua's `subtype=0/1/2`.
- **`debugReturn` config field removed** — was defined but never used anywhere in the codebase.

### Added
- **`rtspPort` platform config field** — allows configuring a non-standard RTSP port (default 554).

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
