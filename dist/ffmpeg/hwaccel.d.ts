import { Logger } from 'homebridge';
/**
 * Validates VAAPI hardware acceleration for a specific device, using a cached result if
 * we've already checked this (videoProcessor, device) pair during this process's lifetime.
 */
export declare function validateVaapi(videoProcessor: string, device: string, log: Logger, cameraName: string): Promise<boolean>;
/**
 * Clears the validation cache. Exposed for testing; not used in normal operation since
 * validation results are intentionally sticky for the process lifetime.
 */
export declare function clearVaapiValidationCache(): void;
