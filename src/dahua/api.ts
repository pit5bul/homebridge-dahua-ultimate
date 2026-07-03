import { Logger } from 'homebridge';
import { createHash, randomBytes } from 'crypto';
import { IncomingMessage } from 'http';
import * as http from 'http';
import * as https from 'https';

/**
 * Digest authentication state
 */
interface DigestAuth {
  realm: string;
  nonce: string;
  qop: string;
  nc: number;
  opaque?: string;
}

/**
 * Dahua HTTP API client with Digest Authentication
 */
export class DahuaApi {
  private readonly protocol: typeof http | typeof https;
  private digestAuth?: DigestAuth;

  constructor(
    private readonly host: string,
    private readonly port: number,
    secure: boolean,
    private readonly username: string,
    private readonly password: string,
    private readonly log: Logger,
  ) {
    // Auto-detect HTTPS if port is 443 (even if secure=false in config)
    const autoSecure = port === 443 ? true : secure;
    this.protocol = autoSecure ? https : http;
    this.log.debug(`Using ${autoSecure ? 'HTTPS' : 'HTTP'} protocol for port ${port}`);
  }

  /**
   * Make an authenticated GET request to the NVR
   */
  async get<T>(path: string): Promise<T> {
    const response = await this.request('GET', path);
    return this.parseResponse<T>(response);
  }

  /**
   * Fetch a JPEG snapshot directly via digest auth — no FFmpeg required.
   * Dahua NVR returns raw JPEG bytes from /cgi-bin/snapshot.cgi?channel=N
   */
  async getSnapshot(channelId: number): Promise<Buffer> {
    const path = `/cgi-bin/snapshot.cgi?channel=${channelId}`;
    // Reset digest auth so each snapshot does a fresh 401 challenge/response.
    // Reusing a stale nonce across concurrent requests causes 400/500 from the NVR.
    this.digestAuth = undefined;
    const result = await this.requestRaw('GET', path, false);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      result.response.on('data', (chunk: Buffer) => chunks.push(chunk));
      result.response.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length === 0) {
          reject(new Error('Empty snapshot response'));
        } else {
          resolve(buf);
        }
      });
      result.response.on('error', reject);
    });
  }

  /**
   * Open a persistent connection for event stream
   */
  openEventStream(
    path: string,
    onData: (chunk: string) => void,
    onError: (err: Error) => void,
    onClose: () => void,
  ): { close: () => void } {
    let request: http.ClientRequest | null = null;
    let response: IncomingMessage | null = null;
    let closed = false;

    const connect = async () => {
      if (closed) {
        return;
      }

      try {
        const result = await this.requestRaw('GET', path, true);
        request = result.request;
        response = result.response;

        response.on('data', (chunk: Buffer) => {
          if (!closed) {
            onData(chunk.toString());
          }
        });

        response.on('end', () => {
          if (!closed) {
            this.log.debug('Event stream ended, reconnecting...');
            setTimeout(connect, 5000);
          }
        });

        response.on('error', (err) => {
          if (!closed) {
            onError(err);
            setTimeout(connect, 5000);
          }
        });
      } catch (err) {
        if (!closed) {
          onError(err as Error);
          setTimeout(connect, 5000);
        }
      }
    };

    connect();

    return {
      close: () => {
        closed = true;
        if (request) {
          request.destroy();
        }
        if (response) {
          response.destroy();
        }
        onClose();
      },
    };
  }

  /**
   * Make an HTTP request with digest authentication
   */
  private async request(method: string, path: string): Promise<string> {
    const result = await this.requestRaw(method, path, false);
    return new Promise((resolve, reject) => {
      let data = '';
      result.response.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      result.response.on('end', () => {
        resolve(data);
      });
      result.response.on('error', reject);
    });
  }

  /**
   * Per-NVR request queue. The Dahua NVR's embedded HTTP server appears unable to
   * reliably service concurrent CGI requests — evidence: specific channels (not a
   * random set) consistently return slow 500s only when multiple snapshot/API calls
   * are in flight at once, regardless of which DahuaApi instance issues them. Giving
   * each camera its own instance (v2.0.5) fixed cross-camera digest-nonce corruption,
   * but did not fix this, because it's a server-side concurrency limit, not a client
   * auth-state bug. Requests to the same host:port are now serialized.
   */
  private static requestQueues: Map<string, Promise<unknown>> = new Map();

  /**
   * Make a raw HTTP request with digest auth, returning the response stream.
   * Serialized per-NVR (see requestQueues above) to avoid overloading the NVR's
   * embedded HTTP server with concurrent CGI requests.
   */
  private async requestRaw(
    method: string,
    path: string,
    keepAlive: boolean,
  ): Promise<{ request: http.ClientRequest; response: IncomingMessage }> {
    const queueKey = `${this.host}:${this.port}`;
    const previous = DahuaApi.requestQueues.get(queueKey) || Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(() => this.requestRawSerialized(method, path, keepAlive));
    // Store a version that never rejects, so one failed request doesn't jam the queue.
    DahuaApi.requestQueues.set(queueKey, run.catch(() => undefined));
    return run;
  }

  private async requestRawSerialized(
    method: string,
    path: string,
    keepAlive: boolean,
  ): Promise<{ request: http.ClientRequest; response: IncomingMessage }> {
    // First request to get WWW-Authenticate challenge
    const firstResponse = await this.makeRequest(method, path, undefined, keepAlive);

    if (firstResponse.response.statusCode === 401) {
      // Parse WWW-Authenticate header
      const wwwAuth = firstResponse.response.headers['www-authenticate'];
      if (!wwwAuth) {
        throw new Error('No WWW-Authenticate header in 401 response');
      }

      // Drain the first response
      firstResponse.response.resume();

      // Parse and compute digest auth
      this.digestAuth = this.parseDigestChallenge(wwwAuth);
      const authHeader = this.computeDigestHeader(method, path);

      // Second request with auth header
      const authedResponse = await this.makeRequest(method, path, authHeader, keepAlive);
      if (authedResponse.response.statusCode !== 200) {
        // Previously this status was never checked, so a 400/500 body (sometimes just
        // a few bytes of error text) was silently handed back as if it were valid
        // content — e.g. a 21-byte "snapshot" that was actually an error page.
        authedResponse.response.resume();
        throw new Error(`HTTP ${authedResponse.response.statusCode}: ${authedResponse.response.statusMessage}`);
      }
      return authedResponse;
    }

    if (firstResponse.response.statusCode !== 200) {
      throw new Error(`HTTP ${firstResponse.response.statusCode}: ${firstResponse.response.statusMessage}`);
    }

    return firstResponse;
  }

  /**
   * Make a single HTTP request
   */
  private makeRequest(
    method: string,
    path: string,
    authHeader?: string,
    keepAlive = false,
  ): Promise<{ request: http.ClientRequest; response: IncomingMessage }> {
    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: this.host,
        port: this.port,
        path,
        method,
        headers: {
          'Accept': '*/*',
        },
        timeout: keepAlive ? 0 : 30000,
      };
      
      // Disable SSL certificate verification for self-signed certs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (options as any).rejectUnauthorized = false;

      if (authHeader) {
        (options.headers as Record<string, string>)['Authorization'] = authHeader;
      }

      // Debug logging
      this.log.debug(`${method} ${this.protocol === https ? 'https' : 'http'}://${this.host}:${this.port}${path}`);
      if (authHeader) {
        this.log.debug('With authentication');
      }

      const request = this.protocol.request(options, (response) => {
        this.log.debug(`Response status: ${response.statusCode} ${response.statusMessage}`);
        resolve({ request, response });
      });

      request.on('error', (err) => {
        this.log.error(`Request error: ${err.message}`);
        reject(err);
      });
      
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });

      request.end();
    });
  }

  /**
   * Parse XML response to object
   */
  private parseResponse<T>(text: string): T {
    const result: Record<string, string> = {};
    const lines = text.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        result[trimmed.substring(0, eqIndex).trim()] = trimmed.substring(eqIndex + 1).trim();
      }
    }
    
    return result as T;
  }

  /**
   * Parse WWW-Authenticate header for Digest auth
   */
  private parseDigestChallenge(header: string): DigestAuth {
    const auth: DigestAuth = {
      realm: '',
      nonce: '',
      qop: '',
      nc: 0,
    };

    const parts = header.replace(/^Digest\s+/i, '').split(',');
    for (const part of parts) {
      const [key, ...valueParts] = part.trim().split('=');
      const value = valueParts.join('=').replace(/^"|"$/g, '');

      switch (key.toLowerCase()) {
        case 'realm':
          auth.realm = value;
          break;
        case 'nonce':
          auth.nonce = value;
          break;
        case 'qop':
          auth.qop = value;
          break;
        case 'opaque':
          auth.opaque = value;
          break;
      }
    }

    return auth;
  }

  /**
   * Compute Authorization header for Digest auth
   */
  private computeDigestHeader(method: string, uri: string): string {
    if (!this.digestAuth) {
      throw new Error('No digest auth available');
    }

    this.digestAuth.nc++;
    const nc = this.digestAuth.nc.toString(16).padStart(8, '0');
    const cnonce = randomBytes(8).toString('hex');

    // HA1 = MD5(username:realm:password)
    const ha1 = createHash('md5')
      .update(`${this.username}:${this.digestAuth.realm}:${this.password}`)
      .digest('hex');

    // HA2 = MD5(method:uri)
    const ha2 = createHash('md5')
      .update(`${method}:${uri}`)
      .digest('hex');

    // Response = MD5(HA1:nonce:nc:cnonce:qop:HA2)
    const response = createHash('md5')
      .update(`${ha1}:${this.digestAuth.nonce}:${nc}:${cnonce}:auth:${ha2}`)
      .digest('hex');

    let header = `Digest username="${this.username}", ` +
      `realm="${this.digestAuth.realm}", ` +
      `nonce="${this.digestAuth.nonce}", ` +
      `uri="${uri}", ` +
      `qop=auth, ` +
      `nc=${nc}, ` +
      `cnonce="${cnonce}", ` +
      `response="${response}"`;

    if (this.digestAuth.opaque) {
      header += `, opaque="${this.digestAuth.opaque}"`;
    }

    return header;
  }
}
