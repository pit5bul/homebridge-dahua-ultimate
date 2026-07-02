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
export class DahuaEvents {
  private eventStream: { close: () => void } | null = null;
  private buffer = '';
  private listeners: Map<number, MotionEventCallback[]> = new Map();
  private readonly debug: boolean;

  constructor(
    private readonly api: DahuaApi,
    private readonly log: Logger,
    debug = false,
  ) {
    this.debug = debug;
  }

  /**
   * Start listening for motion events
   */
  start(): void {
    if (this.eventStream) {
      this.log.debug('Event stream already running');
      return;
    }

    this.log.info('🎬 Starting motion event stream...');
    
    // Subscribe to motion-related events
    // Only subscribe to events we actually handle — VideoLoss/VideoBlind are not motion events
    const eventCodes = 'VideoMotion,CrossLineDetection,CrossRegionDetection,AlarmLocal';
    const path = `/cgi-bin/eventManager.cgi?action=attach&codes=[${eventCodes}]&heartbeat=5`;
    
    this.log.info(`📡 Connecting to: ${path}`);
    if (this.listeners.size > 0) {
      this.log.info(`👂 Registered listeners for ${this.listeners.size} camera(s)`);
    } else {
      this.log.warn('⚠️  No cameras registered for motion events!');
    }

    this.eventStream = this.api.openEventStream(
      path,
      (chunk) => this.handleChunk(chunk),
      (err) => this.handleError(err),
      () => this.handleClose(),
    );
  }

  /**
   * Stop listening for events
   */
  stop(): void {
    if (this.eventStream) {
      this.log.info('Stopping motion event stream');
      this.eventStream.close();
      this.eventStream = null;
    }
  }

  /**
   * Register a listener for a specific channel
   */
  onMotion(channelId: number, callback: MotionEventCallback): void {
    if (!this.listeners.has(channelId)) {
      this.listeners.set(channelId, []);
    }
    this.listeners.get(channelId)!.push(callback);
  }

  /**
   * Remove a listener for a specific channel
   */
  offMotion(channelId: number, callback: MotionEventCallback): void {
    const callbacks = this.listeners.get(channelId);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Handle incoming data chunk from event stream
   * Dahua format:
   *   Code=VideoMotion;action=Start;index=0
   */
  private handleChunk(chunk: string): void {
    if (this.buffer.length === 0 && chunk.length > 0) {
      this.log.info('✅ Event stream connected and receiving data');
    }
    
    this.buffer += chunk;

    // Look for complete events
    // Events are in format: Code=EventType;action=Start/Stop;index=N
    const eventRegex = /Code=([^;]+);action=([^;]+);index=(\d+)/g;
    let match;

    while ((match = eventRegex.exec(this.buffer)) !== null) {
      const eventType = match[1];
      const action = match[2];
      const channelIndex = parseInt(match[3], 10);
      
      this.parseEvent(eventType, action, channelIndex);
    }

    // Trim buffer: keep only content after the last fully parsed event line
    // Find the last newline after the last matched event to safely discard processed data
    const lastEventEnd = this.buffer.search(/Code=[^\r\n]+index=\d+[^\r\n]*/);
    if (lastEventEnd > -1) {
      const afterLastEvent = this.buffer.indexOf('\n', lastEventEnd);
      if (afterLastEvent > -1) {
        this.buffer = this.buffer.substring(afterLastEvent + 1);
      }
    }

    if (this.buffer.length > 100000) {
      this.log.warn('Event buffer overflow, clearing');
      this.buffer = '';
    }
  }

  /**
   * Parse a single event
   */
  private parseEvent(eventType: string, action: string, channelIndex: number): void {
    try {
      // Convert 0-based API channel index to 1-based channel ID
      const channelId = channelIndex + 1;
      
      // Determine if event is active
      const active = action.toLowerCase() === 'start';

      if (this.debug) {
        this.log.debug(`📨 Event received: channel=${channelId}, type=${eventType}, action=${action}`);
      }

      // Check if this is a supported motion-related event
      const dahuaMotionEvents = [
        'VideoMotion',
        'CrossLineDetection', 
        'CrossRegionDetection',
        'AlarmLocal',
      ];

      if (!dahuaMotionEvents.includes(eventType)) {
        if (this.debug) {
          this.log.debug(`⏭️  Ignoring non-motion event type: ${eventType}`);
        }
        return;
      }

      this.log.info(`🚨 Motion event: channel=${channelId}, type=${eventType}, active=${active}`);
      this.notifyListeners(channelId, eventType, active);
    } catch (err) {
      this.log.warn(`Failed to parse event: ${err}`);
    }
  }

  /**
   * Notify registered listeners of a motion event
   */
  private notifyListeners(channelId: number, eventType: string, active: boolean): void {
    const callbacks = this.listeners.get(channelId);
    if (callbacks) {
      this.log.info(`📢 Notifying ${callbacks.length} listener(s) for channel ${channelId}`);
      for (const callback of callbacks) {
        try {
          callback(channelId, eventType, active);
        } catch (err) {
          this.log.error(`Error in motion callback: ${err}`);
        }
      }
    } else {
      this.log.warn(`⚠️  No listeners registered for channel ${channelId} (event type: ${eventType})`);
      if (this.listeners.size > 0) {
        const registeredChannels = Array.from(this.listeners.keys()).join(', ');
        this.log.warn(`   Registered channels: ${registeredChannels}`);
      }
    }
  }

  /**
   * Handle stream error
   */
  private handleError(err: Error): void {
    this.log.error(`Event stream error: ${err.message}`);
  }

  /**
   * Handle stream close
   */
  private handleClose(): void {
    this.log.debug('Event stream closed');
  }
}
