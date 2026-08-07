import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Alerts' }

export default function AlertsPage() {
  return (
    <div className="p-8 max-w-[1400px]">
      <h1 className="font-display font-semibold text-bright text-2xl mb-1">Alerts</h1>
      <p className="font-mono text-xs text-dim mb-8">
        Alert rules are configured per-server. Navigate to a server to add or manage its rules.
      </p>

      <div className="border border-dashed border-border rounded-lg p-16 text-center">
        <p className="font-mono text-4xl text-muted mb-4">⚑</p>
        <p className="font-mono text-xs text-dim max-w-sm mx-auto leading-relaxed">
          Select a server from the Fleet Overview and scroll to the &quot;Alert Rules&quot; section
          to create threshold-based notifications via Slack or email.
        </p>
      </div>
    </div>
  )
}
