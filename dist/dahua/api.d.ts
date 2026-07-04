import { Logger } from 'homebridge';
/**
 * Dahua HTTP API client with Digest Authentication
 */
export declare class DahuaApi {
    private readonly host;
    private readonly port;
    private readonly username;
    private readonly password;
    private readonly log;
    private readonly protocol;
    private digestAuth?;
    constructor(host: string, port: number, secure: boolean, username: string, password: string, log: Logger);
    /**
     * Make an authenticated GET request to the NVR
     */
    get<T>(path: string): Promise<T>;
    /**
     * Fetch a JPEG snapshot directly via digest auth — no FFmpeg required.
     * Dahua NVR returns raw JPEG bytes from /cgi-bin/snapshot.cgi?channel=N
     */
    getSnapshot(channelId: number): Promise<Buffer>;
    /**
     * Open a persistent connection for event stream
     */
    openEventStream(path: string, onData: (chunk: string) => void, onError: (err: Error) => void, onClose: () => void): {
        close: () => void;
    };
    /**
     * Make an HTTP request with digest authentication
     */
    private request;
    /**
     * Per-NVR request queue. The Dahua NVR's embedded HTTP server appears unable to
     * reliably service concurrent CGI requests — evidence: specific channels (not a
     * random set) consistently return slow 500s only when multiple snapshot/API calls
     * are in flight at once, regardless of which DahuaApi instance issues them. Giving
     * each camera its own instance (v2.0.5) fixed cross-camera digest-nonce corruption,
     * but did not fix this, because it's a server-side concurrency limit, not a client
     * auth-state bug. Requests to the same host:port are now serialized.
     */
    private static requestQueues;
    /**
     * Make a raw HTTP request with digest auth, returning the response stream.
     * Serialized per-NVR (see requestQueues above) to avoid overloading the NVR's
     * embedded HTTP server with concurrent CGI requests.
     */
    private requestRaw;
    private requestRawSerialized;
    /**
     * Make a single HTTP request
     */
    private makeRequest;
    /**
     * Parse XML response to object
     */
    private parseResponse;
    /**
     * Parse WWW-Authenticate header for Digest auth
     */
    private parseDigestChallenge;
    /**
     * Compute Authorization header for Digest auth
     */
    private computeDigestHeader;
}
