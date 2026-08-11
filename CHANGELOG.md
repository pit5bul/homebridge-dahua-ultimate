# Changelog

All notable changes to homebridge-dahua-ultimate will be documented in this file.

## [2.1.1] - 2026-08-11

Two VAAPI hardware-acceleration bugs, both found and fixed against real hardware
(AMD Radeon 680M, custom-compiled static FFmpeg 8.0.1) during a real deployment.

### Fixed
- **VAAPI validation and streaming failed with "A hardware device reference is required
  to upload frames to."** `-hwaccel_device <path>` alone does not reliably attach a
  hardware device reference to the filter graph on every FFmpeg build — `hwupload` and
  `scale_vaapi` then fail immediately. Fixed by explicitly creating a named device via
  `-init_hw_device vaapi=va:<device>` and referencing it by name (`-hwaccel_device va`,
  `-filter_hw_device va`), matching the pattern this plugin already used for
  `quicksync`/`nvenc`. Confirmed against real hardware: both the validation test and a
  full real-camera H.265 decode → GPU scale → H.264 encode pipeline now succeed where
  they previously failed at the `hwupload`/`scale_vaapi` stage.
- **VAAPI streaming appeared to freeze, updating only once per forced keyframe interval**
  (e.g. once every 4 seconds with the default `forceKeyFrameInterval`). Root cause:
  `getEncoderOptions()`'s default branch for `h264_vaapi` (used whenever `qualityProfile`
  isn't set) passed `bframes: -1`, which skips the `-bf` flag entirely and lets the VAAPI
  encoder fall back to its own default — confirmed on real hardware to be heavy B-frame
  usage (47 B-frames out of 73 total frames in one test, more B-frames than P-frames).
  B-frames require the decoder to buffer and reorder around future frames, which is
  fundamentally incompatible with real-time RTP/HomeKit streaming: if the reference chain
  doesn't arrive in time, playback stalls until the next keyframe. Fixed by defaulting to
  `bframes: 0` for this case, matching the same clean I/P frame structure the `speed` and
  `balanced` quality profiles already used. Confirmed on real hardware: the same camera
  stream went from 47 B-frames (choppy) to zero B-frames (smooth) with this change.

Note: the same `bframes: -1` default pattern also exists for `amf`, `qsv`, and `nvenc` in
this file. It was **not** changed here — their actual B-frame behavior on real hardware
hasn't been verified the way `vaapi`'s was in this release, and changing behavior that
hasn't been confirmed broken isn't warranted. Worth checking if those encoders are in
active use.

## [2.1.0] - 2026-07-04

This release reworks the streaming layer's internal architecture, following a direct,
line-by-line comparison against homebridge-unifi-protect's real production source
(protect-stream.ts, protect-camera.ts, and its shared homebridge-plugin-utils library).
Existing configs continue to work unchanged — everything here is additive or internal.

### Fixed
- **Video never displayed despite FFmpeg reporting completely healthy output.** Root
  cause was a combination of gaps found through this comparison, not any single flag:
  no wall-clock keyframe guarantee (fixed in 2.0.11), missing `-profile:v`/`-level:v`
  negotiation (fixed in 2.0.10), and a genuine port-mismatch bug where the RTCP port
  advertised to HomeKit never matched what FFmpeg actually listened on (fixed in
  2.0.12). This release adds the remaining architectural pieces on top of those fixes.
- **`forceDiscovery: true` could get stuck in `config.json` permanently.** The reset to
  `false` after a successful discovery was only ever applied in memory; the write to
  disk only included the discovered `cameras` array, never the flag itself — meaning a
  full re-discovery would silently re-run on every single restart, discarding whatever
  had already been configured. The reset now happens before saving, and is actually
  persisted to disk.
- **`copyVideo`, `nativeWidth`, and `nativeHeight` were defined in the config schema but
  never added to its `layout` array**, so despite being fully functional, valid config
  options, no control for them ever rendered in the Homebridge Config UI.

### Added
- **Hardware acceleration is now verified before it's trusted, not just configured and
  assumed.** Before a camera configured for `vaapi` is allowed to use it, a real test —
  actual RTSP connect, actual hardware decode, actual `scale_vaapi`, actual hardware
  encode, using that camera's own real source — runs once at platform startup (never
  inside a live stream request, so it can never add latency to an actual viewing
  attempt). If validation fails, that camera automatically and audibly falls back to
  software encoding instead of failing silently deep inside a live session.
- **`copyVideo` option**: for camera sources already in H.264 (set `codec: "h264"`),
  stream copy relays the exact original bytes with no decode, no encode, no GPU, and
  none of the failure modes either one carries. Not appropriate for every source — see
  README for when to use it and when full transcoding is actually more reliable.
- **`nativeWidth`/`nativeHeight` option**: caps the resolutions offered to HomeKit to
  what a camera can actually deliver, rather than always declaring a fixed list
  regardless of the source's real capability.
- **Stream failures are now handled honestly.** When the stall watchdog detects a
  frozen pipeline, it now calls the official, public
  `CameraController.forceStopStreamingSession()` API and lets HomeKit's own
  reconnection logic establish a completely fresh session — new ports, new SRTP keys,
  everything — instead of silently killing and respawning FFmpeg in place behind
  HomeKit's back while reusing a session HomeKit still believes is healthy.

### Changed
- FFmpeg command construction rewritten from a single large template string (built via
  deeply nested conditional expressions, then split on whitespace) to a plain typed
  array, one argument pushed at a time. This is what actually made the RTCP port
  mismatch bug (2.0.12) and the VAAPI-fallback filter mismatch bug (found and fixed
  during this rework's own testing) possible to find and fix with confidence — every
  argument is now individually inspectable rather than buried in string concatenation.

## [2.0.12] - 2026-07-04

### Fixed
- **The RTCP return port advertised to HomeKit never matched the port FFmpeg actually listened on — a structural bug present since this plugin's inception, affecting every camera and every deployment.** `prepareStream` allocated two separate, unrelated UDP ports: one (`videoPort`, a throwaway local variable) was sent back to HomeKit as "this is my accessory's RTCP-receiving port" in the `PrepareStreamResponse`; a second, entirely different port (`videoReturnPort`) was the one actually wired into FFmpeg's `localrtcpport` (added in 2.0.11). HomeKit was told about a port nothing ever listened on; FFmpeg listened on a port HomeKit never knew existed. This bug predates the 2.0.11 `localrtcpport` fix too — before that, FFmpeg used an OS-assigned ephemeral port, which was *also* not the port advertised to HomeKit, just via a different mechanism. The same class of bug existed independently on the audio side (`audioPort` vs the never-fully-wired `audioReturnPort`).
- Found by directly comparing this plugin's `prepareStream` against homebridge-unifi-protect's real, production `protect-stream.ts` implementation, which uses a single `videoReturnPort` variable for both purposes rather than allocating a second, unused port. This is a real, generalizable correctness bug — not specific to any one NVR, network configuration, or encoder — and plausibly explains "FFmpeg reports healthy sending, HomeKit never displays anything" independent of every other fix shipped so far (probesize, profile/level, keyframe interval, stall recovery), since none of those matter if the RTCP feedback path HomeKit was told to use was never listened to in the first place.

### Notes
- `response.video.port` and `response.audio.port` now both correctly reference the exact same `videoReturnPort`/`audioReturnPort` values passed to FFmpeg as `localrtcpport`, matching the reference pattern.
- This does not touch the VAAPI/driver stall issue (2.0.9) or the RECONFIGURE-acknowledgment gap, which remain separate, already-documented issues.

## [2.0.11] - 2026-07-04

### Fixed
- **No wall-clock keyframe guarantee anywhere in the pipeline.** HAP-NodeJS's own source documents `// minimum keyframe interval is about 5 seconds` directly on the `VideoInfo` type HomeKit negotiates for every stream — this is HomeKit's own stated tolerance, not an inferred guess. Previously, keyframe timing depended entirely on a frame-count-based `-g` flag that was only set for hardware encoders with an explicit `qualityProfile`, and was never set at all for the software encoder path — meaning `libx264`'s default 250-frame GOP (≈16.7s at 15fps) applied unconditionally on those cameras, more than 3x past HomeKit's documented tolerance, on every single session. Even where `-g` was set, it approximates a time interval only at nominal fps — real-world encode fps fluctuated constantly (13-16fps was typical throughout testing), and a frame-count GOP timer freezes entirely during a stall (see 2.0.9), which is exactly when a client is likely to be waiting on a keyframe.
- **`localrtcpport` was never set on the video RTP output**, unlike HAP-NodeJS's own reference camera accessory implementation, which sets this explicitly. Without it, FFmpeg's local RTCP receive port was left to an OS-assigned ephemeral port rather than the port already reserved for this exact purpose (`sessionInfo.videoReturnPort`, allocated in `prepareStream` but never actually used anywhere).

### Added
- **`-force_key_frames expr:gte(t,n_forced*N)`** applied universally, for every encoder (VAAPI, software, AMF, QuickSync, NVENC) — a wall-clock-based forced keyframe guarantee, independent of actual encode fps or GOP frame-count settings. Matches the exact syntax and interval used in production by homebridge-unifi-protect. New `forceKeyFrameInterval` videoConfig option (seconds, default `4` — a safety margin under HomeKit's ~5s documented tolerance).
- `localrtcpport=${sessionInfo.videoReturnPort}` added to the video RTP output URL.

### Notes
- This does not address the VAAPI/Mesa/radeonsi driver-level hang (see 2.0.9's stall watchdog) or the RECONFIGURE-acknowledgment gap (still an unresolved, industry-wide limitation as of FFmpeg 8 — even homebridge-unifi-protect, on the same FFmpeg major version, still doesn't act on RECONFIGURE). Those remain separate, independently-tracked issues.
- True client-side "is HomeKit actually decoding/displaying this" confirmation is not achievable without a full RTP/RTCP relay proxy sitting between FFmpeg and the client — FFmpeg does not expose received RTCP contents through any interface this plugin can observe. This was investigated and intentionally not implemented in this release; the risk of a hastily-built proxy layer destabilizing an already-fragile pipeline outweighed the diagnostic benefit at this time.

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
