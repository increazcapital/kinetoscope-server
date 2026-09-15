/* ============================================================
   Service: realtime.service.js
   Description: Native Server-Sent Events (SSE) broadcasting
                service to deliver instant, real-time live data
                updates across Super Admin, Client, and Agent portals.
   ============================================================ */

const socketService = require('./socket.service');

class RealtimeService {
  constructor() {
    this.clients = new Set();

    // Heartbeat to keep connections alive across proxies and firewalls
    setInterval(() => {
      this.ping();
    }, 25000);
  }

  /**
   * Register a new client for Server-Sent Events (SSE)
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  handleConnection(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.flushHeaders?.();

    // Send connection handshake
    res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', time: Date.now() })}\n\n`);

    this.clients.add(res);

    req.on('close', () => {
      this.clients.delete(res);
    });

    req.on('error', () => {
      this.clients.delete(res);
    });
  }

  /**
   * Broadcast an event and payload to all connected SSE portals and Socket.io
   * @param {string} event
   * @param {object} data
   */
  broadcast(event, data = {}) {
    const payload = JSON.stringify({ event, ...data, broadcastTime: Date.now() });
    const sseMessage = `event: ${event}\ndata: ${payload}\n\n`;

    for (const client of this.clients) {
      try {
        client.write(sseMessage);
      } catch (err) {
        this.clients.delete(client);
      }
    }

    // Also dispatch to socketService for any socket.io listeners
    try {
      socketService.emit(event, data);
    } catch {
      // Ignored if socket is not active
    }
  }

  /**
   * Send heartbeat comment ping to keep connections active
   */
  ping() {
    for (const client of this.clients) {
      try {
        client.write(': ping\n\n');
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  /**
   * Get active connection count
   */
  getClientCount() {
    return this.clients.size;
  }
}

const realtimeService = new RealtimeService();

module.exports = realtimeService;
