import Link from 'next/link'
import { api } from '@/lib/api'
import { serverStatus, type Server } from '@/types'
import GaugeBar from '@/components/ui/GaugeBar'

export const dynamic = "force-dynamic";

function StatusBadge({ server }: { server: Server }) {
  const s = serverStatus(server)
  const cfg = {
    online:  { dot: 'bg-green',  label: 'Online',  text: 'text-green'  },
    warning: { dot: 'bg-amber',  label: 'Warning', text: 'text-amber'  },
    offline: { dot: 'bg-red',    label: 'Offline', text: 'text-red'    },
  }[s]

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

export default async function OverviewPage() {
  let servers: Server[] = []
  try { servers = await api.servers.list() } catch { /* API might not be running locally */ }

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-semibold text-bright text-2xl tracking-tight">Fleet Overview</h1>
          <p className="font-mono text-xs text-dim mt-1">{servers.length} server{servers.length !== 1 ? 's' : ''} registered</p>
        </div>
        <div className="font-mono text-[10px] text-muted uppercase tracking-widest">
          Auto-refreshes every 10s
        </div>
      </div>

      {servers.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {servers.map((s) => (
            <ServerCard key={s.id} server={s} />
          ))}
        </div>
      )}
    </div>
  )
}

function ServerCard({ server }: { server: Server }) {
  return (
    <Link href={`/servers/${server.id}`}>
      <div className="bg-panel border border-border rounded-lg p-5 hover:border-amber/40 transition-all duration-200 group cursor-pointer">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-display font-semibold text-bright group-hover:text-amber transition-colors">{server.name}</h2>
            <p className="font-mono text-[11px] text-dim">{server.hostname}</p>
          </div>
          <StatusBadge server={server} />
        </div>

        <div className="space-y-3">
          <GaugeBar label="CPU"    value={server.cpu_percent    ?? 0} />
          <GaugeBar label="Memory" value={server.memory_percent ?? 0} />
          <GaugeBar label="Disk"   value={server.disk_percent   ?? 0} />
          {server.gpu_percent  != null && <GaugeBar label="GPU"  value={server.gpu_percent}  />}
          {server.vram_percent != null && <GaugeBar label="VRAM" value={server.vram_percent} />}
        </div>

        {server.latest_metric_at && (
          <p className="font-mono text-[10px] text-muted mt-4">
            Last seen {new Date(server.latest_metric_at).toLocaleTimeString()}
          </p>
        )}
      </div>
    </Link>
  )
}

function EmptyState() {
  return (
    <div className="border border-dashed border-border rounded-lg p-16 text-center">
      <p className="font-mono text-4xl text-muted mb-4">⊘</p>
      <h2 className="font-display font-semibold text-text text-lg mb-2">No servers registered</h2>
      <p className="font-mono text-xs text-dim mb-6 max-w-sm mx-auto leading-relaxed">
        Deploy the Vigil agent to a server to start collecting metrics.
        See the Docs page or README for setup instructions.
      </p>
      <Link href="/docs" className="font-mono text-xs text-amber hover:underline">
        View setup docs →
      </Link>
    </div>
  )
}
