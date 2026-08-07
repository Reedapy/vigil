import http from 'http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'

import { pool } from './db/client.js'
import { initWS } from './ws/broadcast.js'
import { serversRouter } from './routes/servers.js'
import { metricsRouter } from './routes/metrics.js'
import { alertsRouter } from './routes/alerts.js'

const app  = express()
const PORT = process.env.API_PORT ?? 4000

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet())
app.use(cors({ origin: '*' }))       // tighten in production via env
app.use(express.json({ limit: '50kb' }))
app.use(morgan('tiny'))

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }))

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/servers', serversRouter)
app.use('/metrics', metricsRouter)
app.use('/alerts',  alertsRouter)

// ─── 404 fallthrough ──────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

// ─── HTTP + WebSocket server ──────────────────────────────────────────────────
const server = http.createServer(app)
initWS(server)

server.listen(PORT, () => {
  console.log(`[api] Vigil API listening on :${PORT}`)
})

// ─── Graceful shutdown ────────────────────────────────────────────────────────
const shutdown = async () => {
  console.log('[api] Shutting down…')
  server.close(async () => {
    await pool.end()
    console.log('[api] DB pool closed. Bye.')
    process.exit(0)
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT',  shutdown)
