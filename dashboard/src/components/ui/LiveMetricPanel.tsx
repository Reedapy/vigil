'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import MetricChart from '@/components/charts/MetricChart'
import StatCard    from '@/components/ui/StatCard'
import GaugeBar    from '@/components/ui/GaugeBar'
import { fmtBytes } from '@/types'
import type { MetricPoint, Server } from '@/types'

const MAX_POINTS = 120   // 20 min of 10s data
const WS_URL     = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000'

interface Props {
  server:       Server
  initialData:  MetricPoint[]
  initialLatest?: MetricPoint | null
}

export default function LiveMetricPanel({ server, initialData, initialLatest }: Props) {
  const [history, setHistory]   = useState<MetricPoint[]>(initialData.slice(-MAX_POINTS))
  const [latest, setLatest]     = useState<MetricPoint | null>(initialLatest ?? initialData.at(-1) ?? null)
  const [wsStatus, setWsStatus] = useState<'connecting' | 'live' | 'disconnected'>('connecting')
  const wsRef = useRef<WebSocket | null>(null)

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/ws?serverId=${server.id}`)
    wsRef.current = ws

    ws.onopen  = () => setWsStatus('live')
    ws.onclose = () => {
      setWsStatus('disconnected')
      // Auto-reconnect after 5s
      setTimeout(connect, 5_000)
    }
    ws.onerror = () => ws.close()

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string)
        if (msg.type !== 'metric') return
        const point = msg.data as MetricPoint
        setLatest(point)
        setHistory((prev) => [...prev.slice(-(MAX_POINTS - 1)), point])
      } catch { /* ignore malformed frames */ }
    }
  }, [server.id])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [connect])

  const statusColor = {
    live:         'bg-green',
    connecting:   'bg-amber animate-pulse',
    disconnected: 'bg-red',
  }[wsStatus]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Live status bar */}
      <div className="flex items-center gap-3 bg-panel border border-border rounded-lg px-5 py-3">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
        <span className="font-mono text-xs text-dim uppercase tracking-widest">
          {wsStatus === 'live' ? 'Live — streaming' : wsStatus}
        </span>
        {latest && (
          <span className="ml-auto font-mono text-[10px] text-muted">
            last update {new Date(latest.collected_at).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Stat cards */}
      {latest && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="CPU"
            value={latest.cpu_percent.toFixed(1)}
            unit="%"
            status={latest.cpu_percent >= 90 ? 'crit' : latest.cpu_percent >= 75 ? 'warn' : 'ok'}
            mono
          />
          <StatCard
            label="Memory"
            value={latest.memory_percent.toFixed(1)}
            unit="%"
            sub={`${fmtBytes(latest.memory_used_bytes)} / ${fmtBytes(latest.memory_total_bytes)}`}
            status={latest.memory_percent >= 90 ? 'crit' : latest.memory_percent >= 75 ? 'warn' : 'ok'}
            mono
          />
          <StatCard
            label="Disk"
            value={latest.disk_percent.toFixed(1)}
            unit="%"
            sub={`${fmtBytes(latest.disk_used_bytes)} / ${fmtBytes(latest.disk_total_bytes)}`}
            status={latest.disk_percent >= 90 ? 'crit' : latest.disk_percent >= 75 ? 'warn' : 'ok'}
            mono
          />
          <StatCard
            label="Load Avg (1m)"
            value={latest.load_avg_1.toFixed(2)}
            status={latest.load_avg_1 >= 4 ? 'crit' : latest.load_avg_1 >= 2 ? 'warn' : 'ok'}
            mono
          />
        </div>
      )}

      {/* GPU / temperature stat cards — only shown when the host reports them */}
      {latest && (latest.gpu_percent != null || latest.gpu_temp_c != null || latest.cpu_temp_c != null) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {latest.gpu_percent != null && (
            <StatCard
              label="GPU"
              value={latest.gpu_percent.toFixed(1)}
              unit="%"
              sub={[
                latest.gpu_power_watts != null ? `${latest.gpu_power_watts.toFixed(0)} W` : null,
                latest.gpu_fan_percent != null ? `fan ${latest.gpu_fan_percent.toFixed(0)}%` : null,
              ].filter(Boolean).join(' · ') || undefined}
              status={latest.gpu_percent >= 90 ? 'crit' : latest.gpu_percent >= 75 ? 'warn' : 'ok'}
              mono
            />
          )}
          {latest.gpu_percent != null && (
            <StatCard
              label="VRAM"
              value={(latest.vram_percent ?? 0).toFixed(1)}
              unit="%"
              sub={latest.vram_used_bytes != null && latest.vram_total_bytes != null
                ? `${fmtBytes(latest.vram_used_bytes)} / ${fmtBytes(latest.vram_total_bytes)}`
                : undefined}
              status={(latest.vram_percent ?? 0) >= 90 ? 'crit' : (latest.vram_percent ?? 0) >= 75 ? 'warn' : 'ok'}
              mono
            />
          )}
          {latest.gpu_temp_c != null && (
            <StatCard
              label="GPU Temp"
              value={latest.gpu_temp_c.toFixed(0)}
              unit="°C"
              status={latest.gpu_temp_c >= 85 ? 'crit' : latest.gpu_temp_c >= 70 ? 'warn' : 'ok'}
              mono
            />
          )}
          {latest.cpu_temp_c != null && (
            <StatCard
              label="CPU Temp"
              value={latest.cpu_temp_c.toFixed(0)}
              unit="°C"
              status={latest.cpu_temp_c >= 90 ? 'crit' : latest.cpu_temp_c >= 75 ? 'warn' : 'ok'}
              mono
            />
          )}
        </div>
      )}

      {/* Gauge bars */}
      {latest && (
        <div className="bg-panel border border-border rounded-lg p-5 space-y-4">
          <GaugeBar label="CPU"    value={latest.cpu_percent}    />
          <GaugeBar label="Memory" value={latest.memory_percent} />
          <GaugeBar label="Disk"   value={latest.disk_percent}   />
          {latest.gpu_percent  != null && <GaugeBar label="GPU"  value={latest.gpu_percent}       />}
          {latest.vram_percent != null && <GaugeBar label="VRAM" value={latest.vram_percent}      />}
        </div>
      )}

      {/* Time-series charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MetricChart data={history} dataKey="cpu_percent"    color="#F59E0B" label="CPU %"    />
        <MetricChart data={history} dataKey="memory_percent" color="#3B82F6" label="Memory %" />
        <MetricChart data={history} dataKey="disk_percent"   color="#22C55E" label="Disk %"   />
        <MetricChart data={history} dataKey="load_avg_1"     color="#EF4444" label="Load Avg 1m" unit="" domain={[0, 8]} />
      </div>

      {/* GPU / temperature time-series — only when the host reports them */}
      {latest && (latest.gpu_percent != null
        || history.some((h) => h.gpu_temp_c != null)
        || history.some((h) => h.cpu_temp_c != null)) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {latest.gpu_percent != null && (
            <MetricChart data={history} dataKey="gpu_percent"  color="#A855F7" label="GPU %"  />
          )}
          {latest.gpu_percent != null && (
            <MetricChart data={history} dataKey="vram_percent" color="#EC4899" label="VRAM %" />
          )}
          {history.some((h) => h.gpu_temp_c != null) && (
            <MetricChart data={history} dataKey="gpu_temp_c" color="#F97316" label="GPU Temp °C" unit="°C" domain={[0, 100]} />
          )}
          {history.some((h) => h.cpu_temp_c != null) && (
            <MetricChart data={history} dataKey="cpu_temp_c" color="#F43F5E" label="CPU Temp °C" unit="°C" domain={[0, 100]} />
          )}
        </div>
      )}

      {/* Network throughput — live rate, with lifetime total underneath */}
      {latest && (
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            label="Network TX"
            value={`${fmtBytes(latest.net_tx_bytes_sec ?? 0)}/s`}
            sub={`${fmtBytes(latest.net_bytes_sent)} total`}
            mono
          />
          <StatCard
            label="Network RX"
            value={`${fmtBytes(latest.net_rx_bytes_sec ?? 0)}/s`}
            sub={`${fmtBytes(latest.net_bytes_recv)} total`}
            mono
          />
        </div>
      )}

      {/* Per-core CPU */}
      {latest?.cpu_per_core && latest.cpu_per_core.length > 0 && (
        <div className="bg-panel border border-border rounded-lg p-5">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-dim mb-4">Per-core CPU</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
            {latest.cpu_per_core.map((c, i) => (
              <GaugeBar key={i} label={`Core ${i}`} value={c} />
            ))}
          </div>
        </div>
      )}

      {/* Disks — one gauge per mounted filesystem */}
      {latest?.disks && latest.disks.length > 0 && (
        <div className="bg-panel border border-border rounded-lg p-5 space-y-4">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-dim">Disks</p>
          {latest.disks.map((d) => (
            <div key={d.mount}>
              <GaugeBar label={d.mount} value={d.percent} />
              <p className="font-mono text-[10px] text-muted mt-1">
                {fmtBytes(d.used_bytes)} / {fmtBytes(d.total_bytes)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Top processes */}
      {latest?.top_processes && latest.top_processes.length > 0 && (
        <div className="bg-panel border border-border rounded-lg p-5">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-dim mb-4">Top Processes</p>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="text-dim text-[10px] uppercase tracking-wider">
                  <th className="text-left  font-medium pb-2">Process</th>
                  <th className="text-right font-medium pb-2">PID</th>
                  <th className="text-right font-medium pb-2">CPU %</th>
                  <th className="text-right font-medium pb-2">Memory</th>
                </tr>
              </thead>
              <tbody>
                {latest.top_processes.map((p) => (
                  <tr key={p.pid} className="border-t border-border">
                    <td className="py-1.5 text-text truncate max-w-[220px]">{p.name || '—'}</td>
                    <td className="py-1.5 text-right text-muted">{p.pid}</td>
                    <td className="py-1.5 text-right text-bright">{p.cpu_percent.toFixed(1)}</td>
                    <td className="py-1.5 text-right text-dim">{fmtBytes(p.mem_bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
