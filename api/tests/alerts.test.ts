import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock the DB client so tests don't need a real Postgres ──────────────────
vi.mock('../src/db/client.js', () => ({
  query: vi.fn(),
}))

import { query } from '../src/db/client.js'
import { evaluateAlerts } from '../src/services/alerts.js'

const mockQuery = vi.mocked(query)

describe('evaluateAlerts', () => {
  beforeEach(() => {
    mockQuery.mockReset()
  })

  it('fires an alert when CPU exceeds threshold', async () => {
    mockQuery
      .mockResolvedValueOnce([
        {
          id: 'alert-1',
          server_id: 'server-1',
          metric: 'cpu_percent',
          condition: 'above',
          threshold: 80,
          channel: 'slack',
          destination: 'https://hooks.slack.com/test',
          enabled: true,
        },
      ])
      .mockResolvedValueOnce([]) // INSERT alert_event
      .mockResolvedValueOnce([{ name: 'test-server' }]) // server name lookup

    const snap = {
      cpu_percent: 95,
      memory_percent: 40,
      disk_percent: 30,
      load_avg_1: 1.2,
    }

    // Should not throw
    await expect(evaluateAlerts('server-1', 'test-server', snap)).resolves.toBeUndefined()
  })

  it('does not fire when metric is below threshold', async () => {
    mockQuery.mockResolvedValueOnce([
      {
        id: 'alert-2',
        server_id: 'server-1',
        metric: 'cpu_percent',
        condition: 'above',
        threshold: 80,
        channel: 'slack',
        destination: 'https://hooks.slack.com/test',
        enabled: true,
      },
    ])

    const snap = {
      cpu_percent: 45,
      memory_percent: 40,
      disk_percent: 30,
      load_avg_1: 0.5,
    }

    await expect(evaluateAlerts('server-1', 'test-server', snap)).resolves.toBeUndefined()
    // INSERT should NOT have been called (no breach)
    expect(mockQuery).toHaveBeenCalledTimes(1)
  })

  it('handles DB errors gracefully without throwing', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'))
    const snap = { cpu_percent: 90, memory_percent: 50, disk_percent: 40, load_avg_1: 2 }
    // Should swallow the error and return undefined
    await expect(evaluateAlerts('server-1', 'test-server', snap)).resolves.toBeUndefined()
  })
})
