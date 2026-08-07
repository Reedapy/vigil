import { notFound } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { MetricPoint } from '@/types'
import LiveMetricPanel from '@/components/ui/LiveMetricPanel'
import AlertsPanel     from '@/components/ui/AlertsPanel'

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props) {
  try {
    const s = await api.servers.get(params.id)
    return { title: s.name }
  } catch {
    return { title: 'Server' }
  }
}

export default async function ServerPage({ params }: Props) {
  let server, history, alerts
  try {
    [server, history, alerts] = await Promise.all([
      api.servers.get(params.id),
      api.metrics.history(params.id, 60),
      api.alerts.list(params.id),
    ])
  } catch {
    notFound()
  }

  // Latest snapshot carries the current-state breakdowns (per-core, disks,
  // processes). Fetched separately so a server with no metrics yet still renders.
  let latest: MetricPoint | null = null
  try { latest = await api.metrics.latest(params.id) } catch { /* no metrics yet */ }

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 font-mono text-xs text-dim mb-6">
        <Link href="/" className="hover:text-amber transition-colors">Fleet</Link>
        <span>/</span>
        <span className="text-text">{server.name}</span>
      </div>

      {/* Server header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-semibold text-bright text-2xl">{server.name}</h1>
          <p className="font-mono text-xs text-dim mt-1">{server.hostname} · {server.id}</p>
        </div>
        <span className="font-mono text-[10px] text-dim uppercase tracking-widest">
          Registered {new Date(server.created_at).toLocaleDateString()}
        </span>
      </div>

      {/* Live metrics */}
      <section className="mb-10">
        <h2 className="font-mono text-[10px] tracking-[0.25em] uppercase text-dim mb-5">
          ◈ Live Metrics
        </h2>
        <LiveMetricPanel server={server} initialData={history} initialLatest={latest} />
      </section>

      {/* Alerts */}
      <section>
        <h2 className="font-mono text-[10px] tracking-[0.25em] uppercase text-dim mb-5">
          ⚑ Alert Rules
        </h2>
        <AlertsPanel serverId={server.id} initialAlerts={alerts} />
      </section>
    </div>
  )
}
