import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'

// ─── Per-server subscriber sets ───────────────────────────────────────────────
// Map<serverId, Set<WebSocket>> — allows targeted broadcasts
const subscribers = new Map<string, Set<WebSocket>>()

/**
 * initWS
 *
 * Attaches a WebSocketServer to the existing HTTP server.
 * Dashboard clients connect at:  ws://host/ws?serverId=<uuid>
 *
 * Clients receive JSON messages of shape:
 *   { type: 'metric', serverId, data: MetricSnapshot }
 */
export function initWS(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws, req) => {
    // Parse ?serverId= from the connection URL
    const url    = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const sid    = url.searchParams.get('serverId')

    if (!sid) {
      ws.close(1008, 'serverId query param required')
      return
    }

    // Register subscriber
    if (!subscribers.has(sid)) subscribers.set(sid, new Set())
    subscribers.get(sid)!.add(ws)

    ws.on('close', () => {
      subscribers.get(sid)?.delete(ws)
      if (subscribers.get(sid)?.size === 0) subscribers.delete(sid)
    })

    ws.on('error', (err) => console.error('[ws] client error:', err))

    // Acknowledge the connection
    ws.send(JSON.stringify({ type: 'connected', serverId: sid }))
  })

  console.log('[ws] WebSocket server ready on /ws')
  return wss
}

/**
 * broadcast
 *
 * Sends a metric payload to every dashboard client subscribed to serverId.
 * Called by the /metrics route after a successful DB insert.
 */
export function broadcast(serverId: string, data: unknown): void {
  const clients = subscribers.get(serverId)
  if (!clients || clients.size === 0) return

  const msg = JSON.stringify({ type: 'metric', serverId, data })

  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg)
    }
  }
}
