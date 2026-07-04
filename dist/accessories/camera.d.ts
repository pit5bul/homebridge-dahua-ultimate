import { API, Logger, PlatformAccessory } from 'homebridge';
import { CameraConfig } from '../configTypes';
import { DahuaApi } from '../dahua/api';
export declare class CameraAccessory {
    private readonly accessory;
    private readonly cameraConfig;
    private readonly log;
    private readonly hap;
    private readonly api;
    private readonly motionService?;
    private readonly streamingDelegate;
    private readonly recordingDelegate?;
    private motionDetected;
    private motionTimeout?;
    constructor(api: API, accessory: PlatformAccessory, cameraConfig: CameraConfig, videoProcessor: string, log: Logger, dahuaApi?: DahuaApi);
    get channelId(): number;
    triggerMotion(active: boolean): void;
    shutdown(): void;
}
