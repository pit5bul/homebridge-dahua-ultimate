"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateVaapi = validateVaapi;
exports.clearVaapiValidationCache = clearVaapiValidationCache;
const child_process_1 = require("child_process");
const validationCache = new Map();
function cacheKey(videoProcessor, device) {
    return `${videoProcessor}::${device}`;
}
/**
 * Runs a short, real VAAPI encode test against the given device. Returns true only if
 * the test actually succeeds — mirrors HBUP's `probeFfmpegHwAccel` validation step.
 */
function runVaapiTest(videoProcessor, device) {
    return new Promise((resolve) => {
        const args = [
            '-hide_banner', '-loglevel', 'error',
            '-hwaccel', 'vaapi', '-hwaccel_device', device, '-hwaccel_output_format', 'vaapi',
            '-f', 'lavfi', '-i', 'color=black:size=1280x720:rate=5',
            '-t', '1',
            '-vf', 'format=nv12,hwupload',
            '-c:v', 'h264_vaapi',
            '-f', 'null', '-',
        ];
        const proc = (0, child_process_1.spawn)(videoProcessor, args, { env: process.env });
        let settled = false;
        const finish = (ok) => {
            if (settled)
                return;
            settled = true;
            resolve(ok);
        };
        // Defensive timeout — a hung validation test shouldn't be able to block startup
        // indefinitely. If it hasn't finished in 8s, treat it as a failed validation.
        const timeout = setTimeout(() => {
            proc.kill('SIGKILL');
            finish(false);
        }, 8000);
        proc.on('error', () => {
            clearTimeout(timeout);
            finish(false);
        });
        proc.on('close', (code) => {
            clearTimeout(timeout);
            finish(code === 0);
        });
    });
}
/**
 * Validates VAAPI hardware acceleration for a specific device, using a cached result if
 * we've already checked this (videoProcessor, device) pair during this process's lifetime.
 */
async function validateVaapi(videoProcessor, device, log, cameraName) {
    const key = cacheKey(videoProcessor, device);
    const cached = validationCache.get(key);
    if (cached)
        return cached.valid;
    log.info(`Validating VAAPI hardware acceleration on ${device} before trusting it for streaming...`, cameraName);
    const valid = await runVaapiTest(videoProcessor, device);
    validationCache.set(key, { valid, checkedAt: Date.now() });
    if (valid) {
        log.info(`✅ VAAPI validated on ${device} — hardware acceleration available`, cameraName);
    }
    else {
        log.warn(`⚠️ VAAPI validation FAILED on ${device} — this is a known class of driver-level issue ` +
            `(confirmed reproducible independent of this plugin on some hardware). Falling back to ` +
            'software encoding for any camera configured to use this device.', cameraName);
    }
    return valid;
}
/**
 * Clears the validation cache. Exposed for testing; not used in normal operation since
 * validation results are intentionally sticky for the process lifetime.
 */
function clearVaapiValidationCache() {
    validationCache.clear();
}
