"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CameraAccessory = void 0;
const delegate_1 = require("../streaming/delegate");
const recordingDelegate_1 = require("../streaming/recordingDelegate");
const settings_1 = require("../settings");
class CameraAccessory {
    accessory;
    cameraConfig;
    log;
    hap;
    api;
    motionService;
    streamingDelegate;
    recordingDelegate;
    motionDetected = false;
    motionTimeout;
    constructor(api, accessory, cameraConfig, videoProcessor, log, dahuaApi) {
        this.accessory = accessory;
        this.cameraConfig = cameraConfig;
        this.log = log;
        this.hap = api.hap;
        this.api = api;
        const accessoryInfo = this.accessory.getService(this.hap.Service.AccessoryInformation);
        if (accessoryInfo) {
            accessoryInfo
                .setCharacteristic(this.hap.Characteristic.Manufacturer, cameraConfig.manufacturer || settings_1.DEFAULT_CAMERA_CONFIG.manufacturer)
                .setCharacteristic(this.hap.Characteristic.Model, cameraConfig.model || settings_1.DEFAULT_CAMERA_CONFIG.model)
                .setCharacteristic(this.hap.Characteristic.SerialNumber, cameraConfig.serialNumber || `HK-${cameraConfig.channelId}`);
            if (cameraConfig.firmwareRevision) {
                accessoryInfo.setCharacteristic(this.hap.Characteristic.FirmwareRevision, cameraConfig.firmwareRevision);
            }
        }
        this.streamingDelegate = new delegate_1.StreamingDelegate(this.hap, cameraConfig, videoProcessor, log, dahuaApi);
        // Create recording delegate if HKSV is enabled
        if (cameraConfig.videoConfig?.recording) {
            this.log.info(`[HKSV] Recording enabled for ${cameraConfig.name}`);
            this.recordingDelegate = new recordingDelegate_1.RecordingDelegate(this.log, cameraConfig.name || 'Camera', cameraConfig.videoConfig, this.api, videoProcessor);
        }
        const maxFPS = cameraConfig.videoConfig?.maxFPS || 15;
        // Principle: declare only what's real. homebridge-unifi-protect computes its
        // supported resolution list from the camera's actual RTSP channel capabilities
        // at runtime rather than a fixed, hopeful list. Dahua's NVR channel capability
        // isn't queried dynamically here (that would mean parsing undocumented CGI
        // response fields we haven't verified against this NVR), but the same principle
        // applies safely as an opt-in: if the user tells us the channel's real native
        // resolution (nativeWidth/nativeHeight), don't offer HomeKit anything larger —
        // upscaling a declared-but-undeliverable resolution serves no one.
        const nativeWidth = cameraConfig.videoConfig?.nativeWidth;
        const nativeHeight = cameraConfig.videoConfig?.nativeHeight;
        const allResolutions = [
            [1920, 1080, maxFPS], [1280, 720, maxFPS], [640, 480, maxFPS], [640, 360, maxFPS],
            [480, 360, maxFPS], [480, 270, maxFPS], [320, 240, maxFPS], [320, 240, Math.min(maxFPS, 15)], [320, 180, maxFPS],
        ];
        const resolutions = (nativeWidth && nativeHeight)
            ? allResolutions.filter(([w, h]) => w <= nativeWidth && h <= nativeHeight)
            : allResolutions;
        if (resolutions.length === 0) {
            // Native resolution smaller than our smallest declared entry — keep at least
            // the smallest one rather than declaring nothing.
            resolutions.push(allResolutions[allResolutions.length - 1]);
        }
        const cameraControllerOptions = {
            cameraStreamCount: cameraConfig.videoConfig?.maxStreams || 2,
            delegate: this.streamingDelegate,
            streamingOptions: {
                supportedCryptoSuites: [0 /* this.hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80 */],
                video: {
                    resolutions,
                    codec: {
                        profiles: [0 /* this.hap.H264Profile.BASELINE */, 1 /* this.hap.H264Profile.MAIN */, 2 /* this.hap.H264Profile.HIGH */],
                        levels: [0 /* this.hap.H264Level.LEVEL3_1 */, 1 /* this.hap.H264Level.LEVEL3_2 */, 2 /* this.hap.H264Level.LEVEL4_0 */],
                    },
                },
                audio: cameraConfig.videoConfig?.audio ? {
                    twoWayAudio: false,
                    codecs: [{ type: "AAC-eld" /* this.hap.AudioStreamingCodecType.AAC_ELD */, samplerate: 16 /* this.hap.AudioStreamingSamplerate.KHZ_16 */ }],
                } : undefined,
            },
            // Add HKSV recording configuration if enabled
            recording: !this.recordingDelegate ? undefined : {
                options: {
                    prebufferLength: cameraConfig.videoConfig?.prebufferLength || 4000,
                    overrideEventTriggerOptions: [
                        1 /* this.hap.EventTriggerOption.MOTION */,
                        2 /* this.hap.EventTriggerOption.DOORBELL */,
                    ],
                    mediaContainerConfiguration: [{
                            type: 0,
                            fragmentLength: 4000,
                        }],
                    video: {
                        type: 0 /* this.hap.VideoCodecType.H264 */,
                        parameters: {
                            levels: [
                                0 /* this.hap.H264Level.LEVEL3_1 */,
                                1 /* this.hap.H264Level.LEVEL3_2 */,
                                2 /* this.hap.H264Level.LEVEL4_0 */,
                            ],
                            profiles: [
                                0 /* this.hap.H264Profile.BASELINE */,
                                1 /* this.hap.H264Profile.MAIN */,
                                2 /* this.hap.H264Profile.HIGH */,
                            ],
                        },
                        resolutions: [
                            [320, 180, maxFPS],
                            [320, 240, Math.min(maxFPS, 15)],
                            [320, 240, maxFPS],
                            [480, 270, maxFPS],
                            [480, 360, maxFPS],
                            [640, 360, maxFPS],
                            [640, 480, maxFPS],
                            [1280, 720, maxFPS],
                            [1280, 960, maxFPS],
                            [1920, 1080, maxFPS],
                            [1600, 1200, maxFPS],
                        ],
                    },
                    audio: {
                        codecs: [{
                                type: 0 /* AudioRecordingCodecType.AAC_LC */,
                                bitrateMode: 0,
                                samplerate: [3 /* AudioRecordingSamplerate.KHZ_32 */],
                                audioChannels: 1,
                            }],
                    },
                },
                delegate: this.recordingDelegate,
            },
        };
        const cameraController = new this.hap.CameraController(cameraControllerOptions);
        this.accessory.configureController(cameraController);
        // Give the delegate a way to honestly terminate a HAP session (used by the stall
        // watchdog) rather than silently managing FFmpeg behind HomeKit's back.
        this.streamingDelegate.setController(cameraController);
        const motionEnabled = cameraConfig.motion !== false;
        if (motionEnabled) {
            this.motionService = this.accessory.getService(this.hap.Service.MotionSensor) ||
                this.accessory.addService(this.hap.Service.MotionSensor, `${cameraConfig.name} Motion`);
            this.motionService.getCharacteristic(this.hap.Characteristic.MotionDetected).onGet(() => this.motionDetected);
        }
        else {
            const existingMotion = this.accessory.getService(this.hap.Service.MotionSensor);
            if (existingMotion)
                this.accessory.removeService(existingMotion);
        }
    }
    get channelId() {
        return this.cameraConfig.channelId;
    }
    triggerMotion(active) {
        if (!this.motionService)
            return;
        if (this.motionTimeout) {
            clearTimeout(this.motionTimeout);
            this.motionTimeout = undefined;
        }
        if (active) {
            this.motionDetected = true;
            this.motionService.updateCharacteristic(this.hap.Characteristic.MotionDetected, true);
            this.log.debug(`Motion detected: ${this.cameraConfig.name}`);
            const timeout = (this.cameraConfig.motionTimeout ?? settings_1.DEFAULT_CAMERA_CONFIG.motionTimeout) * 1000;
            if (timeout > 0) {
                this.motionTimeout = setTimeout(() => this.triggerMotion(false), timeout);
            }
        }
        else {
            this.motionDetected = false;
            this.motionService.updateCharacteristic(this.hap.Characteristic.MotionDetected, false);
            this.log.debug(`Motion cleared: ${this.cameraConfig.name}`);
        }
    }
    shutdown() {
        if (this.motionTimeout)
            clearTimeout(this.motionTimeout);
        this.streamingDelegate.stopAllStreams();
    }
}
exports.CameraAccessory = CameraAccessory;
