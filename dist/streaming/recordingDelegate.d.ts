import { API, CameraRecordingDelegate, CameraRecordingConfiguration, HDSProtocolSpecificErrorReason, RecordingPacket, Logger } from 'homebridge';
import { VideoConfig } from '../configTypes';
/**
 * RecordingDelegate handles HomeKit Secure Video (HKSV) recording
 * Implements the CameraRecordingDelegate interface from HAP-NodeJS
 */
export declare class RecordingDelegate implements CameraRecordingDelegate {
    private readonly log;
    private readonly cameraName;
    private readonly videoConfig;
    private readonly videoProcessor;
    private readonly intentionallyKilled;
    private readonly terminating;
    private readonly liveProcesses;
    private static readonly KILL_ESCALATION_MS;
    private static readonly STALL_TIMEOUT_MS;
    private static readonly RTSP_IO_TIMEOUT_US;
    private preBufferSession?;
    private preBuffer?;
    private currentRecordingConfiguration?;
    private activeFFmpegProcesses;
    private streamAbortControllers;
    constructor(log: Logger, cameraName: string, videoConfig: VideoConfig, api: API, videoProcessor: string);
    /**
     * True once the OS process has really exited.
     * NOTE: ChildProcess.killed only means "a signal was sent", never "it exited".
     */
    private hasExited;
    /**
     * Stop an FFmpeg process and make sure it is really gone.
     * 1. Close our end of the stdout pipe. FFmpeg blocks writing to a full pipe nobody reads
     *    and does not react to SIGTERM in that state; a closed pipe makes the write fail (EPIPE).
     * 2. Send SIGTERM.
     * 3. If it has not exited after KILL_ESCALATION_MS, send SIGKILL.
     * Idempotent. Resolves when the process has exited.
     */
    private terminateProcess;
    /**
     * Called when user enables/disables recording in Home app
     */
    updateRecordingActive(active: boolean): Promise<void>;
    /**
     * Called when HomeKit selects a recording configuration
     * Configuration includes resolution, bitrate, framerate, audio codec
     */
    updateRecordingConfiguration(configuration: CameraRecordingConfiguration | undefined): Promise<void>;
    /**
     * Main method: Called when motion is detected
     * Must yield MP4 fragments to HomeKit
     */
    handleRecordingStreamRequest(streamId: number): AsyncGenerator<RecordingPacket, any, any>;
    /**
     * Called when recording stops
     * Reason codes indicate why (normal, error, format incompatibility, etc.)
     */
    closeRecordingStream(streamId: number, reason: HDSProtocolSpecificErrorReason | undefined): void;
    /**
     * Start prebuffer if enabled
     */
    startPreBuffer(): Promise<void>;
    /**
     * Handle fragmented MP4 generation for HKSV recording
     */
    private handleFragmentsRequests;
    /**
     * Start FFmpeg process for fragmented MP4 output
     */
    private startFFMPegFragmentedMP4Session;
}
