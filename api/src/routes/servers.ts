import { Router } from 'express'
import { randomBytes } from 'crypto'
import { query } from '../db/client.js'

export const serversRouter = Router()

// ── POST /servers/register ────────────────────────────────────────────────────
// Called by the agent on first run. Validates the API_SECRET, creates a server
// record, and issues a unique agent_key for all future metric submissions.

serversRouter.post('/register', async (req, res) => {
  const { name, hostname, secret } = req.body as {
    name?: string
    hostname?: string
    secret?: string
  }

  if (!name || !hostname || !secret) {
    return res.status(400).json({ error: 'name, hostname, and secret are required' })
  }

  if (secret !== process.env.API_SECRET) {
    return res.status(403).json({ error: 'Invalid secret' })
  }

  // Generate a cryptographically random 48-char agent key
  const agentKey = randomBytes(24).toString('hex')

  try {
    const rows = await query<{ id: string }>(
      `INSERT INTO servers (name, hostname, agent_key)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [name, hostname, agentKey]
    )

    console.log(`[servers] Registered: ${name} (${hostname}) → ${rows[0].id}`)

    return res.status(201).json({
      server_id: rows[0].id,
      agent_key: agentKey,
    })
  } catch (err) {
    console.error('[servers] register error:', err)
    return res.status(500).json({ error: 'Registration failed' })
  }
})

// ── GET /servers ──────────────────────────────────────────────────────────────
// Returns all registered servers with their latest metric snapshot.

serversRouter.get('/', async (_req, res) => {
  try {
    const rows = await query(`
      SELECT
        s.id,
        s.name,
        s.hostname,
        s.last_seen_at,
        s.created_at,
        m.cpu_percent,
        m.memory_percent,
        m.disk_percent,
        m.load_avg_1,
        m.gpu_percent,
        m.vram_percent,
        m.gpu_temp_c,
        m.cpu_temp_c,
        m.collected_at AS latest_metric_at
      FROM servers s
      LEFT JOIN LATERAL (
        SELECT * FROM metrics WHERE server_id = s.id
        ORDER BY collected_at DESC LIMIT 1
      ) m ON TRUE
      ORDER BY s.created_at DESC
    `)
    return res.json(rows)
  } catch (err) {
    console.error('[servers] list error:', err)
    return res.status(500).json({ error: 'Failed to list servers' })
  }
})

// ── GET /servers/:id ──────────────────────────────────────────────────────────

serversRouter.get('/:id', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM servers WHERE id = $1',
      [req.params.id]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Server not found' })
    return res.json(rows[0])
  } catch (err) {
    console.error('[servers] get error:', err)
    return res.status(500).json({ error: 'Failed to get server' })
  }
})

// ── DELETE /servers/:id ───────────────────────────────────────────────────────

serversRouter.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM servers WHERE id = $1', [req.params.id])
    return res.status(204).send()
  } catch (err) {
    console.error('[servers] delete error:', err)
    return res.status(500).json({ error: 'Failed to delete server' })
  }
})
