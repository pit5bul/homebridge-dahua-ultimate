# Changelog

All notable changes to homebridge-dahua-ultimate will be documented in this file.

## [2.0.10] - 2026-07-04

### Fixed
- **No video ever displayed in HomeKit despite a completely healthy FFmpeg pipeline** — the 2.0.9 stall watchdog gave us, for the first time, hard confirmation that FFmpeg was producing frames continuously for 55+ seconds with zero interruption on multiple cameras, yet no video displayed in HomeKit at all. This ruled out FFmpeg/VAAPI stalling as the (sole) explanation and pointed at something in what's actually being sent. Root cause: this plugin never set `-profile:v`/`-level:v` on the encoder to match what HomeKit actually negotiates per-session (`request.video.profile`/`request.video.level`) — every encoder path (VAAPI, software, AMF, QuickSync, NVENC) just used its own default (VAAPI defaults to High profile regardless of what was asked for). Every reference implementation checked (HAP-NodeJS's own example accessory, go2rtc) explicitly maps HomeKit's negotiated profile/level onto the encoder; this plugin was the outlier in not doing so. If a viewing session negotiated a profile/level the encoder wasn't honoring, the client could fail to decode a bitstream it never agreed to, while FFmpeg itself reports success throughout, since it has no way to know the receiving client rejected it.

### Added
- FFmpeg now receives explicit `-profile:v` / `-level:v` flags derived from HomeKit's actual per-session negotiation (`baseline`/`main`/`high` and `3.1`/`3.2`/`4.0`), for every encoder path.
- The negotiated profile/level is now logged on every stream start (`HomeKit negotiated: profile=... level=...`), so this can be directly verified against real sessions going forward instead of inferred.

### Notes
- This does not replace the 2.0.9 stall watchdog — that fix addresses a separate, confirmed-real FFmpeg+VAAPI+Mesa/radeonsi driver hang (reproducible independent of this plugin). This fix addresses a different failure mode: a stream that runs perfectly from FFmpeg's perspective but was never decodable by the specific client that requested it.
- Channel 7 (Outside Fridge, this deployment)'s repeated total stall-and-give-up pattern is a separate, pre-existing issue (RTSP setup never completing — consistent with an already-documented SPS/H.264 parameter issue on that specific channel) and is not addressed by this change.

## [2.0.9] - 2026-07-04

### Added
- **Stall watchdog** — detects a frozen FFmpeg video pipeline and force-restarts it before HomeKit gives up on the stream. Root cause context: direct testing on the host (bare `ffmpeg -hwaccel vaapi ... -f null -`, no plugin, no network output, no HomeKit involved at all) reproduced multi-second freezes in FFmpeg's own frame counter, confirming this is a known, reproducible FFmpeg+VAAPI+Mesa/radeonsi driver-level hang — not something fixable in plugin code. However, HomeKit's live-view player does not reliably self-recover from an interruption during stream startup, so a rare, brief, otherwise-harmless hang can present as a permanent black screen for that viewing attempt. The watchdog parses `-progress pipe:1` output (previously fully discarded), tracks whether the frame counter is actually advancing, and if it's frozen for longer than `stallTimeoutMs` (default 4000ms), kills and silently restarts FFmpeg using the same session/SRTP parameters already negotiated with HomeKit — no renegotiation, and ideally the viewer never notices. Restarts are capped at 3 per session (`MAX_STALL_RESTARTS`); beyond that the watchdog logs and steps back, letting HomeKit's own timeout take over rather than restart-looping a camera that's persistently broken.
- New videoConfig options: `stallWatchdog` (boolean, default `true`) and `stallTimeoutMs` (number, default `4000`).
- All watchdog activity is logged clearly with a `⚠️ STALL WATCHDOG:` prefix — stall detected (with frozen frame number and stall duration), each restart attempt, and the give-up case after max restarts — so this is visible and greppable in Homebridge logs rather than silent.

### Fixed
- `-progress pipe:1` output was being fully drained and discarded rather than parsed. It's now the data source for the stall watchdog.

### Notes
- This does not fix the underlying FFmpeg/VAAPI/Mesa driver hang — that lives upstream, outside this plugin, and was confirmed to reproduce in a bare `ffmpeg` process with zero plugin involvement. This makes the plugin resilient to it instead.
- If you see `STALL WATCHDOG` messages in your logs, that's expected and means the watchdog did its job — the alternative would have been a black screen with no recovery at all. Frequent stalls on a specific camera are still worth investigating at the hardware/driver level (e.g. try `"encoder": "software"` to rule VAAPI in or out for that camera).

## [2.0.8] - 2026-07-04

### Fixed
- **`nativeSnapshot: false` didn't actually work — it still hit the Dahua `snapshot.cgi` URL, just via FFmpeg instead of direct HTTP.** `platform.ts` auto-generates a `stillImageSource` (the Dahua snapshot.cgi HTTPS URL) for every camera unconditionally, and the FFmpeg fallback added in 2.0.7 checked `stillImageSource || source` — so it always picked up the auto-generated Dahua URL instead of the RTSP `source`, even with `nativeSnapshot: false` set. In practice this meant ONVIF cameras went from a fast, clean HTTP 400/500 failure to an ~8-10 second FFmpeg `Connection timed out` hang on every single snapshot attempt (FFmpeg's HTTPS demuxer can't do digest auth negotiation at all, so it was always going to fail, just slower). Real-world impact: repeated hung FFmpeg processes tied up system resources and were reported as generally delayed playback. Fixed by using the RTSP `source` directly whenever `nativeSnapshot` is explicitly `false`, bypassing the auto-generated Dahua URL entirely. The `stillImageSource || source` priority is preserved only for the legacy case (no `DahuaApi` client at all), where a user may have deliberately configured their own working `stillImageSource`.

### Notes
- If you set `nativeSnapshot: false` on any camera in 2.0.7, it did not have the intended effect — update to 2.0.8 for the fix to actually take hold. No config changes needed; the same `nativeSnapshot: false` setting now does what it was supposed to.

## [2.0.7] - 2026-07-04

### Fixed
- **Snapshot 500/400 errors on non-Dahua/ONVIF channels (100% failure rate, unaffected by 2.0.6)** — 13 hours of real-world logging after 2.0.6 showed two channels failing on *every single* snapshot attempt with zero correlation to concurrency, timing, or that channel's own stream activity. Confirmed root cause: those two channels are third-party ONVIF cameras patched into the NVR, not genuine Dahua hardware. Dahua's `snapshot.cgi` is a proprietary endpoint only implemented for the NVR's own channels — it was never going to succeed for passthrough ONVIF channels no matter how the request was retried, queued, or re-authenticated. This was not fixable via auth/concurrency changes because it was never an auth or concurrency problem.

### Added
- **`nativeSnapshot` videoConfig option** — set to `false` on non-Dahua/ONVIF channels to use an FFmpeg-from-RTSP snapshot fallback instead of Dahua's `snapshot.cgi` (which the plugin already had built in for cameras without a `DahuaApi` client, just not exposed as a per-camera override). Slower than the direct HTTP path, but works for any camera regardless of brand. Defaults to `true` (unchanged behavior for genuine Dahua channels).

### Notes
- If a channel is failing 100% of the time regardless of load, that's a strong signal it's not a timing/concurrency bug — check whether it's actually a Dahua-branded channel before assuming a code fix will help. The 2.0.6 request-queue change was still a correct fix for genuine cross-camera contention and the unchecked-retry-status bug; it just wasn't the fix for *this* particular failure, since this one was never a Dahua-channel-behaving-badly problem at all.

## [2.0.6] - 2026-07-03

### Fixed
- **Persistent snapshot `500`/garbage-response errors on specific channels, unaffected by the 2.0.5 per-camera `DahuaApi` fix** — real-world testing after 2.0.5 showed the *same* channels (not a random set) kept failing regardless of which `DahuaApi` instance issued the request, which ruled out a cross-camera nonce race as the (sole) cause. Root cause: the Dahua NVR's embedded HTTP server can't reliably service concurrent CGI requests — evidenced by the failing requests taking 15+ seconds before returning 500, consistent with server-side queuing/timeout rather than a fast auth rejection. Requests to the same NVR (`host:port`) are now serialized through a request queue shared across every `DahuaApi` instance (discovery, event stream, and all per-camera snapshot clients), so the NVR only ever sees one CGI request in flight at a time. This does not affect RTSP video streaming, which is a separate connection path.
- **Digest-auth retry response status was never checked** — after sending the authenticated retry following a 401 challenge, the client returned whatever came back without checking its status code. A `400`/`500` error response (sometimes just a few bytes of error text) was silently handed back as if it were valid content — visible in the wild as a "successful" 21-byte snapshot that was actually an error page, not a JPEG. The retry's response status is now validated the same way the initial response's is.

### Notes
- This reverses the assumption behind the v1.1.7 change note ("removing snapshot queue — concurrent snapshots are correct HomeKit behaviour"). That's true from HomeKit's side, but this specific NVR's HTTP server can't back it up — the queue is now on our side instead, transparent to HomeKit, and only serializes requests to the NVR itself.
- If you still see slow snapshot responses after this update, that's expected under heavy load (many cameras' thumbnails refreshing near-simultaneously) — they should now succeed rather than fail, just queued.

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
