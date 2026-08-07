import type { Request, Response, NextFunction } from 'express'
import { query } from '../db/client.js'

/**
 * agentAuth
 *
 * Middleware that validates the `Authorization: Bearer <agent_key>` header
 * against the servers table. Attaches `req.serverId` on success.
 */
export interface AuthenticatedRequest extends Request {
  serverId?: string
}

export async function agentAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing bearer token' })
    return
  }

  const token = header.slice(7)

  try {
    const rows = await query<{ id: string }>(
      'SELECT id FROM servers WHERE agent_key = $1',
      [token]
    )

    if (rows.length === 0) {
      res.status(401).json({ error: 'Invalid agent key' })
      return
    }

    req.serverId = rows[0].id
    next()
  } catch (err) {
    console.error('[agentAuth]', err)
    res.status(500).json({ error: 'Auth check failed' })
  }
}
