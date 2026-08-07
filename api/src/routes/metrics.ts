import { Router } from 'express'
import { query } from '../db/client.js'
import { agentAuth, type AuthenticatedRequest } from '../middleware/agentAuth.js'
import { broadcast } from '../ws/broadcast.js'
import { evaluateAlerts } from '../services/alerts.js'

export const metricsRouter = Router()

// ── POST /metrics ─────────────────────────────────────────────────────────────
// Authenticated endpoint called by the Go agent every tick.
// Inserts the snapshot, broadcasts it via WebSocket, and evaluates alert rules.

metricsRouter.post('/', agentAuth, async (req: AuthenticatedRequest, res) => {
  const serverId = req.serverId!
  const snap = req.body as {
    collected_at:       string
    cpu_percent:        number
    memory_percent:     number
    memory_used_bytes:  number
    memory_total_bytes: number
    disk_percent:       number
    disk_used_bytes:    number
    disk_total_bytes:   number
    net_bytes_sent:     number
    net_bytes_recv:     number
    load_avg_1:         number
    gpu_percent?:       number | null
    vram_used_bytes?:   number | null
    vram_total_bytes?:  number | null
    vram_percent?:      number | null
    gpu_temp_c?:        number | null
    cpu_temp_c?:        number | null
    gpu_power_watts?:   number | null
    gpu_fan_percent?:   number | null
    net_tx_bytes_sec?:  number | null
    net_rx_bytes_sec?:  number | null
    cpu_per_core?:      number[]
    disks?:             unknown[]
    top_processes?:     unknown[]
  }

  // Basic validation
  if (typeof snap.cpu_percent !== 'number') {
    return res.status(400).json({ error: 'Invalid metric payload' })
  }

  try {
    // Insert metric row
    await query(
      `INSERT INTO metrics (
        server_id, collected_at,
        cpu_percent, memory_percent, memory_used_bytes, memory_total_bytes,
        disk_percent, disk_used_bytes, disk_total_bytes,
        net_bytes_sent, net_bytes_recv, load_avg_1,
        gpu_percent, vram_used_bytes, vram_total_bytes, vram_percent,
        gpu_temp_c, cpu_temp_c,
        gpu_power_watts, gpu_fan_percent, net_tx_bytes_sec, net_rx_bytes_sec,
        cpu_per_core, disks, top_processes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
        $19,$20,$21,$22,$23::jsonb,$24::jsonb,$25::jsonb)`,
      [
        serverId, snap.collected_at ?? new Date().toISOString(),
        snap.cpu_percent, snap.memory_percent, snap.memory_used_bytes,
        snap.memory_total_bytes, snap.disk_percent, snap.disk_used_bytes,
        snap.disk_total_bytes, snap.net_bytes_sent, snap.net_bytes_recv,
        snap.load_avg_1,
        snap.gpu_percent ?? null, snap.vram_used_bytes ?? null,
        snap.vram_total_bytes ?? null, snap.vram_percent ?? null,
        snap.gpu_temp_c ?? null, snap.cpu_temp_c ?? null,
        snap.gpu_power_watts ?? null, snap.gpu_fan_percent ?? null,
        snap.net_tx_bytes_sec ?? null, snap.net_rx_bytes_sec ?? null,
        snap.cpu_per_core  ? JSON.stringify(snap.cpu_per_core)  : null,
        snap.disks         ? JSON.stringify(snap.disks)         : null,
        snap.top_processes ? JSON.stringify(snap.top_processes) : null,
      ]
    )

    // Update last_seen_at on the server record
    await query(
      'UPDATE servers SET last_seen_at = NOW() WHERE id = $1',
      [serverId]
    )

    // Push to live dashboard subscribers
    broadcast(serverId, { ...snap, server_id: serverId })

    // Evaluate threshold alerts (non-blocking)
    const nameRows = await query<{ name: string }>(
      'SELECT name FROM servers WHERE id = $1',
      [serverId]
    )
    const serverName = nameRows[0]?.name ?? serverId
    evaluateAlerts(serverId, serverName, snap).catch(console.error)

    return res.status(204).send()
  } catch (err) {
    console.error('[metrics] insert error:', err)
    return res.status(500).json({ error: 'Failed to store metrics' })
  }
})

// ── GET /metrics/:serverId ────────────────────────────────────────────────────
// Returns time-series history for the dashboard charts.
// ?minutes=60  (default: 60)
// ?limit=360   (default: 360 points max)

metricsRouter.get('/:serverId', async (req, res) => {
  const { serverId } = req.params
  const minutes = Math.min(Number(req.query.minutes ?? 60), 1440)  // cap 24h
  const limit   = Math.min(Number(req.query.limit   ?? 360), 2000)

  try {
    const rows = await query(
      `SELECT
        collected_at, cpu_percent, memory_percent, disk_percent,
        memory_used_bytes, memory_total_bytes, disk_used_bytes, disk_total_bytes,
        net_bytes_sent, net_bytes_recv, load_avg_1,
        gpu_percent, vram_used_bytes, vram_total_bytes, vram_percent,
        gpu_temp_c, cpu_temp_c,
        gpu_power_watts, gpu_fan_percent, net_tx_bytes_sec, net_rx_bytes_sec
       FROM metrics
       WHERE server_id = $1
         AND collected_at > NOW() - ($2 || ' minutes')::INTERVAL
       ORDER BY collected_at ASC
       LIMIT $3`,
      [serverId, minutes, limit]
    )
    return res.json(rows)
  } catch (err) {
    console.error('[metrics] query error:', err)
    return res.status(500).json({ error: 'Failed to fetch metrics' })
  }
})

// ── GET /metrics/:serverId/latest ─────────────────────────────────────────────

metricsRouter.get('/:serverId/latest', async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM metrics WHERE server_id = $1
       ORDER BY collected_at DESC LIMIT 1`,
      [req.params.serverId]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'No metrics yet' })
    return res.json(rows[0])
  } catch (err) {
    console.error('[metrics] latest error:', err)
    return res.status(500).json({ error: 'Failed to fetch latest metric' })
  }
})
