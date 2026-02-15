import { Logger } from 'homebridge';
import { DahuaApi } from './api';
/**
 * Event listener callback type
 */
export type MotionEventCallback = (channelId: number, eventType: string, active: boolean) => void;
/**
 * Dahua HTTP API event stream handler for motion detection
 * Connects to /cgi-bin/eventManager.cgi?action=attach&codes=[VideoMotion]
 */
export declare class DahuaEvents {
    private readonly api;
    private readonly log;
    private eventStream;
    private buffer;
    private listeners;
    private readonly debug;
    constructor(api: DahuaApi, log: Logger, debug?: boolean);
    /**
     * Start listening for motion events
     */
    start(): void;
    /**
     * Stop listening for events
     */
    stop(): void;
    /**
     * Register a listener for a specific channel
     */
    onMotion(channelId: number, callback: MotionEventCallback): void;
    /**
     * Remove a listener for a specific channel
     */
    offMotion(channelId: number, callback: MotionEventCallback): void;
    /**
     * Handle incoming data chunk from event stream
     * Dahua format:
     *   Code=VideoMotion;action=Start;index=0
     */
    private handleChunk;
    /**
     * Parse a single event
     */
    private parseEvent;
    /**
     * Notify registered listeners of a motion event
     */
    private notifyListeners;
    /**
     * Handle stream error
     */
    private handleError;
    /**
     * Handle stream close
     */
    private handleClose;
}
