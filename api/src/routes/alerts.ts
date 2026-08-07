import { Router } from 'express'
import { query } from '../db/client.js'

export const alertsRouter = Router()

// ── GET /alerts/:serverId ─────────────────────────────────────────────────────
alertsRouter.get('/:serverId', async (req, res) => {
  try {
    const rows = await query(
      `SELECT a.*, COUNT(ae.id) FILTER (WHERE ae.resolved_at IS NULL) AS active_count
       FROM alerts a
       LEFT JOIN alert_events ae ON ae.alert_id = a.id
       WHERE a.server_id = $1
       GROUP BY a.id
       ORDER BY a.created_at DESC`,
      [req.params.serverId]
    )
    return res.json(rows)
  } catch (err) {
    console.error('[alerts] list error:', err)
    return res.status(500).json({ error: 'Failed to list alerts' })
  }
})

// ── POST /alerts ──────────────────────────────────────────────────────────────
alertsRouter.post('/', async (req, res) => {
  const { server_id, metric, condition, threshold, channel, destination } = req.body as {
    server_id:   string
    metric:      string
    condition:   string
    threshold:   number
    channel:     string
    destination: string
  }

  if (!server_id || !metric || !condition || threshold == null || !channel || !destination) {
    return res.status(400).json({ error: 'All alert fields are required' })
  }

  try {
    const rows = await query<{ id: string }>(
      `INSERT INTO alerts (server_id, metric, condition, threshold, channel, destination)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [server_id, metric, condition, threshold, channel, destination]
    )
    return res.status(201).json({ id: rows[0].id })
  } catch (err) {
    console.error('[alerts] create error:', err)
    return res.status(500).json({ error: 'Failed to create alert' })
  }
})

// ── PATCH /alerts/:id ─────────────────────────────────────────────────────────
alertsRouter.patch('/:id', async (req, res) => {
  const { enabled } = req.body as { enabled: boolean }
  try {
    await query('UPDATE alerts SET enabled = $1 WHERE id = $2', [enabled, req.params.id])
    return res.status(204).send()
  } catch (err) {
    console.error('[alerts] update error:', err)
    return res.status(500).json({ error: 'Failed to update alert' })
  }
})

// ── DELETE /alerts/:id ────────────────────────────────────────────────────────
alertsRouter.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM alerts WHERE id = $1', [req.params.id])
    return res.status(204).send()
  } catch (err) {
    console.error('[alerts] delete error:', err)
    return res.status(500).json({ error: 'Failed to delete alert' })
  }
})

// ── GET /alerts/:serverId/events ──────────────────────────────────────────────
alertsRouter.get('/:serverId/events', async (req, res) => {
  try {
    const rows = await query(
      `SELECT ae.*, a.metric, a.condition, a.threshold
       FROM alert_events ae
       JOIN alerts a ON a.id = ae.alert_id
       WHERE ae.server_id = $1
       ORDER BY ae.triggered_at DESC
       LIMIT 100`,
      [req.params.serverId]
    )
    return res.json(rows)
  } catch (err) {
    console.error('[alerts] events error:', err)
    return res.status(500).json({ error: 'Failed to fetch alert events' })
  }
})
