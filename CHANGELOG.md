# Changelog

All notable changes to homebridge-dahua-ultimate will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.2] - 2026-02-15

### Fixed
- **Critical**: Snapshot channel indexing corrected to 1-based (same as RTSP)
  - Previously used 0-based indexing causing wrong camera snapshots
  - Example: Side view (channel 5) was getting Garage view (channel 4) snapshot
  - Now correctly maps: D1→channel=1, D2→channel=2, D3→channel=3, etc.
  - Fixed in both `buildFfmpegStillSource()` and `buildStillImageUrl()` methods

### Changed
- **License**: Updated from MIT to PERSONAL-USE LICENSE
  - Personal, non-commercial use is free
  - Commercial use requires paid license from author
  - See LICENSE file for complete terms
- **README**: Added Homebridge Verified badge
- **README**: Updated with new licensing information

### Technical Details
- Removed `apiChannel = channelId - 1` conversion in snapshot URL builders
- Snapshot API now uses `channel=${channelId}` directly (1-based)
- Updated code comments to reflect correct indexing behavior

## [1.1.1] - 2026-02-15

### Fixed
- **Critical**: Smart discovery `enabled` flag now properly applied to new cameras
  - Previously, cameras with default names were still enabled despite detection
  - `createCameraConfig()` was ignoring the `enabled` parameter from discovery
  - Now correctly creates cameras with `enabled: false` for default-named channels
  - Example: "Channel6", "Channel7", "Channel8" now properly disabled on first discovery

### Changed
- **Documentation**: Removed incorrect ISAPI references (Hikvision-specific)
  - Updated package.json description: "ISAPI discovery" → "CGI API discovery"
  - Updated package.json keywords: "isapi" → "cgi-api"
  - Fixed log message: "from ISAPI" → "from CGI API"
  - Note: ISAPI is Hikvision's API; Dahua uses CGI API

### Technical Details
- Updated `createCameraConfig()` method signature to accept `enabled` parameter
- Modified call site to pass `channel.enabled` from discovery results
- No changes to discovery logic itself (was already correct)
- Corrected all API terminology to reflect Dahua CGI API usage

## [1.1.0] - 2026-02-15

### 🎉 Major Release - Production Ready

First stable release with full Dahua NVR support and smart camera discovery.

### Added
- **Smart Discovery Logic**: Automatically disables channels with default names (e.g., "Channel6", "Channel7")
  - Only cameras with custom names are enabled by default
  - Prevents unused NVR channels from appearing in HomeKit
  - Logs which channels were auto-disabled for transparency
- **Better Camera Information**: Auto-populates manufacturer and model fields
  - Manufacturer: "Dahua"
  - Model: "Dahua IP Camera"
  - Ensures proper display in HomeKit accessory info
- **Hardware Acceleration Documentation**: Added comprehensive FFmpeg hardware encoder notes
  - Clear documentation that bundled FFmpeg only supports software codecs
  - Instructions for compiling/installing FFmpeg with hardware support
  - Examples for VAAPI, NVENC, QuickSync, VideoToolbox, V4L2

### Fixed
- **Snapshot URLs**: Fixed hardcoded HTTP port 80 to use correct protocol and port
  - Now correctly uses HTTPS on port 443 when configured
  - Auto-detects protocol based on port and secure flag
  - Snapshots now work with HTTPS-enabled NVRs
- **SSL Certificate Handling**: Self-signed certificates now properly accepted
  - Added `rejectUnauthorized: false` for HTTPS connections
  - No more "unable to verify certificate" errors
- **Port 443 Auto-Detection**: Automatically enables HTTPS when port 443 is used
  - Even if `secure: false` in config, port 443 forces HTTPS
  - Prevents "ECONNRESET" errors from protocol mismatch

### Changed
- Improved discovery logging with clearer status messages
- Enhanced error messages for troubleshooting
- Discovery now logs count of enabled vs disabled channels

### Technical Details
- Platform: `DahuaUltimate`
- Plugin: `homebridge-dahua-ultimate`
- Digest authentication fully working
- Real-time event stream for motion detection
- RTSP URL format: `rtsp://host:554/cam/realmonitor?channel=N&subtype=0`
- Snapshot URL format: `https://host:443/cgi-bin/snapshot.cgi?channel=N`

## [1.0.10] - 2026-02-15

### Fixed
- Added port and secure parameters to discovery class
- Snapshot URLs still using wrong port (partial fix, completed in 1.1.0)

### Known Issues
- Snapshots still failing due to incomplete fix (resolved in 1.1.0)

## [1.0.9] - 2026-02-15

### Added
- Complete branding update from Hikvision to Dahua
- New README.md with Dahua-specific documentation
- Clean CHANGELOG.md
- Updated config.schema.json for Homebridge UI

### Changed
- Platform name: HikvisionUltimate → DahuaUltimate
- Default name: "Hikvision NVR" → "Dahua NVR"
- All documentation references updated

## [1.0.8] - 2026-02-15

### Added
- First working connection to Dahua NVR
- Successful camera discovery (8 channels)
- Motion detection working

### Known Issues
- Homebridge cache conflicts with new accessories

## [1.0.7] - 2026-02-15

### Added
- Disabled SSL certificate verification for self-signed certs
- Added `rejectUnauthorized: false` to HTTPS requests

### Fixed
- "unable to verify the first certificate" errors resolved

## [1.0.6] - 2026-02-15

### Added
- Auto-detect HTTPS when port 443 is used
- Debug logging for protocol selection

### Fixed
- Port 443 now correctly uses HTTPS protocol
- ECONNRESET errors from protocol mismatch

## [1.0.5] - 2026-02-15

### Added
- Debug logging for API requests
- Connection info logging at startup
- Better error messages

### Changed
- Improved error handling in makeRequest

## [1.0.4] - 2026-02-15

### Changed
- Accept header: `application/xml` → `text/plain` for Dahua responses
- Updated API endpoints for Dahua CGI format

### Fixed
- HTTP 400 errors from incorrect Accept header

## [1.0.0 - 1.0.3] - 2026-02-15

### Added
- Initial Dahua NVR support
- CGI API implementation
- Channel discovery via configManager.cgi
- Motion events via eventManager.cgi
- RTSP streaming support
- Digest authentication

### Changed
- Migrated from Hikvision ISAPI to Dahua CGI API
- Response parser: XML → key=value text format
- RTSP URL format updated for Dahua
- Snapshot URL format updated for Dahua
- Event stream format changed to text-based multipart

### Technical Changes
- API endpoints:
  - Device info: `/cgi-bin/magicBox.cgi?action=getSystemInfo`
  - Channels: `/cgi-bin/configManager.cgi?action=getConfig&name=Encode`
  - Events: `/cgi-bin/eventManager.cgi?action=attach&codes=[...]`
  - RTSP: `rtsp://host:554/cam/realmonitor?channel=N&subtype=0`
  - Snapshots: `/cgi-bin/snapshot.cgi?channel=N`

## Architecture Credits

This plugin is based on the architecture of homebridge-hikvision-ultimate v2.0.6, adapted for Dahua NVR compatibility using Dahua's HTTP CGI API instead of Hikvision's ISAPI.

Key architectural differences:
- API protocol: ISAPI (XML) → CGI (text/plain key=value)
- Response parsing: xml2js → custom key=value parser
- Channel indexing: Consistent 1-based → 0-based API, 1-based RTSP
- Event stream: XML multipart → Text multipart with different format

## License

MIT License

Copyright (c) 2026 pit5bul

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
