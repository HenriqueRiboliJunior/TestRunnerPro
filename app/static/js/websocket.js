/**
 * TestRunner Pro - WebSocket Client
 * Manages real-time log streaming for test executions.
 */

class WSClient {
    /**
     * @param {number|string} executionId - The ID of the test execution to subscribe to.
     */
    constructor(executionId) {
        this.executionId = executionId;
        this.ws = null;
        this.onMessage = null; // Callback: (data, rawEvent) => void
        this.onClose = null;   // Callback: (event) => void
        this.onError = null;   // Callback: (error) => void
        this.onOpen = null;    // Callback: (event) => void
        
        this.reconnectAttempts = 0;
        this.maxReconnects = 5;
        this.reconnectDelay = 1500;
        this.reconnectTimer = null;
        this.isExplicitlyClosed = false;
    }

    /**
     * Connect to the WebSocket endpoint for this execution.
     */
    connect() {
        if (!this.executionId) {
            console.error('[WSClient] Cannot connect: executionId is missing');
            return;
        }

        this.isExplicitlyClosed = false;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host || 'localhost:8000';
        const wsUrl = `${protocol}//${host}/ws/execution/${this.executionId}`;

        try {
            console.log(`[WSClient] Connecting to ${wsUrl}`);
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = (event) => {
                console.log(`[WSClient] Connected to execution ${this.executionId}`);
                this.reconnectAttempts = 0;
                if (typeof this.onOpen === 'function') {
                    this.onOpen(event);
                }
            };

            this.ws.onmessage = (event) => {
                let parsed = event.data;
                try {
                    // Attempt JSON parse
                    parsed = JSON.parse(event.data);
                } catch {
                    // If not JSON, leave as raw string
                    parsed = event.data;
                }

                if (typeof this.onMessage === 'function') {
                    this.onMessage(parsed, event);
                }
            };

            this.ws.onerror = (err) => {
                console.warn(`[WSClient] Error on execution ${this.executionId}:`, err);
                if (typeof this.onError === 'function') {
                    this.onError(err);
                }
            };

            this.ws.onclose = (event) => {
                console.log(`[WSClient] Connection closed (code: ${event.code}, reason: ${event.reason || 'none'})`);
                
                if (typeof this.onClose === 'function') {
                    this.onClose(event);
                }

                // If not intentionally closed and attempts remain, attempt reconnect
                if (!this.isExplicitlyClosed && this.reconnectAttempts < this.maxReconnects && event.code !== 1000) {
                    this.reconnectAttempts++;
                    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
                    console.log(`[WSClient] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}/${this.maxReconnects})...`);
                    this.reconnectTimer = setTimeout(() => {
                        this.connect();
                    }, delay);
                }
            };
        } catch (e) {
            console.error('[WSClient] Connection exception:', e);
            if (typeof this.onError === 'function') {
                this.onError(e);
            }
        }
    }

    /**
     * Send payload to server.
     * @param {string|object} message 
     */
    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const data = typeof message === 'string' ? message : JSON.stringify(message);
            this.ws.send(data);
        } else {
            console.warn('[WSClient] Cannot send message: WebSocket is not open');
        }
    }

    /**
     * Close socket connection gracefully.
     */
    disconnect() {
        this.isExplicitlyClosed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            try {
                this.ws.close(1000, 'Client closed normally');
            } catch (err) {
                console.warn('[WSClient] Error during disconnect:', err);
            }
            this.ws = null;
        }
    }
}

// Make globally accessible
window.WSClient = WSClient;
