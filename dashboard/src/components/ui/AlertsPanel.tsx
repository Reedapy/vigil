'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import type { Alert } from '@/types'
import clsx from 'clsx'

interface Props {
  serverId:      string
  initialAlerts: Alert[]
}

const METRICS = [
  'cpu_percent', 'memory_percent', 'disk_percent', 'load_avg_1',
  'gpu_percent', 'vram_percent', 'gpu_temp_c', 'cpu_temp_c',
] as const

export default function AlertsPanel({ serverId, initialAlerts }: Props) {
  const [alerts, setAlerts]     = useState<Alert[]>(initialAlerts)
  const [creating, setCreating] = useState(false)
  const [form, setForm]         = useState({
    metric:      'cpu_percent',
    condition:   'above',
    threshold:   '80',
    channel:     'slack',
    destination: '',
  })

  const refresh = async () => {
    const data = await api.alerts.list(serverId)
    setAlerts(data)
  }

  const handleCreate = async () => {
    if (!form.destination) return
    await api.alerts.create({
      server_id:   serverId,
      metric:      form.metric,
      condition:   form.condition as 'above' | 'below',
      threshold:   Number(form.threshold),
      channel:     form.channel as 'slack' | 'email' | 'discord' | 'webhook',
      destination: form.destination,
    })
    setCreating(false)
    await refresh()
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    await api.alerts.toggle(id, !enabled)
    await refresh()
  }

  const handleDelete = async (id: string) => {
    await api.alerts.delete(id)
    setAlerts((prev) => prev.filter((a) => a.id !== id))
  }

  return (
    <div className="space-y-4">
      {/* Alert list */}
      {alerts.length === 0 && !creating && (
        <div className="border border-dashed border-border rounded-lg p-8 text-center">
          <p className="font-mono text-xs text-dim">No alert rules yet.</p>
        </div>
      )}

      {alerts.map((alert) => (
        <div key={alert.id} className="bg-panel border border-border rounded-lg px-5 py-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-xs text-amber">{alert.metric.replace('_', ' ')}</span>
              <span className="font-mono text-xs text-dim">{alert.condition}</span>
              <span className="font-mono text-xs text-bright font-medium">{alert.threshold}</span>
              <span className="font-mono text-[10px] text-muted px-2 py-0.5 border border-border rounded">
                {alert.channel}
              </span>
              {Number(alert.active_count) > 0 && (
                <span className="font-mono text-[10px] text-red px-2 py-0.5 bg-red/10 border border-red/20 rounded">
                  FIRING
                </span>
              )}
            </div>
            <p className="font-mono text-[10px] text-muted mt-1 truncate">{alert.destination}</p>
          </div>

          {/* Toggle */}
          <button
            onClick={() => handleToggle(alert.id, alert.enabled)}
            className={clsx(
              'w-10 h-5 rounded-full relative transition-colors duration-200 flex-shrink-0',
              alert.enabled ? 'bg-amber' : 'bg-muted'
            )}
            aria-label="Toggle alert"
          >
            <span className={clsx(
              'absolute top-0.5 w-4 h-4 rounded-full bg-void transition-all duration-200',
              alert.enabled ? 'left-[calc(100%-18px)]' : 'left-0.5'
            )} />
          </button>

          {/* Delete */}
          <button
            onClick={() => handleDelete(alert.id)}
            className="font-mono text-xs text-muted hover:text-red transition-colors flex-shrink-0"
            aria-label="Delete alert"
          >
            ✕
          </button>
        </div>
      ))}

      {/* Create form */}
      {creating ? (
        <div className="bg-panel border border-amber/30 rounded-lg p-5 space-y-4">
          <h3 className="font-mono text-xs text-amber uppercase tracking-widest">New Alert Rule</h3>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] text-dim uppercase tracking-wider">Metric</span>
              <select
                value={form.metric}
                onChange={(e) => setForm({ ...form, metric: e.target.value })}
                className="bg-void border border-border rounded px-3 py-2 font-mono text-xs text-text focus:outline-none focus:border-amber"
              >
                {METRICS.map((m) => (
                  <option key={m} value={m}>{m.replace('_', ' ')}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] text-dim uppercase tracking-wider">Condition</span>
              <select
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value })}
                className="bg-void border border-border rounded px-3 py-2 font-mono text-xs text-text focus:outline-none focus:border-amber"
              >
                <option value="above">above</option>
                <option value="below">below</option>
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] text-dim uppercase tracking-wider">Threshold</span>
              <input
                type="number"
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                className="bg-void border border-border rounded px-3 py-2 font-mono text-xs text-text focus:outline-none focus:border-amber"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] text-dim uppercase tracking-wider">Channel</span>
              <select
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}
                className="bg-void border border-border rounded px-3 py-2 font-mono text-xs text-text focus:outline-none focus:border-amber"
              >
                <option value="slack">Slack webhook</option>
                <option value="discord">Discord webhook</option>
                <option value="webhook">Generic webhook</option>
                <option value="email">Email</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] text-dim uppercase tracking-wider">
              {form.channel === 'email' ? 'Email address' : 'Webhook URL'}
            </span>
            <input
              type={form.channel === 'email' ? 'email' : 'url'}
              value={form.destination}
              onChange={(e) => setForm({ ...form, destination: e.target.value })}
              placeholder={{
                slack:   'https://hooks.slack.com/services/…',
                discord: 'https://discord.com/api/webhooks/…',
                webhook: 'https://your-service.example.com/hook',
                email:   'you@example.com',
              }[form.channel]}
              className="bg-void border border-border rounded px-3 py-2 font-mono text-xs text-text focus:outline-none focus:border-amber"
            />
          </label>

          <div className="flex gap-3">
            <button onClick={handleCreate} className="font-mono text-xs bg-amber text-void px-4 py-2 rounded hover:bg-amber/90 transition-colors">
              Create Rule
            </button>
            <button onClick={() => setCreating(false)} className="font-mono text-xs text-dim hover:text-text transition-colors px-4 py-2">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="w-full border border-dashed border-border rounded-lg py-3 font-mono text-xs text-dim hover:text-amber hover:border-amber/40 transition-all duration-200"
        >
          + Add alert rule
        </button>
      )}
    </div>
  )
}
