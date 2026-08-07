import clsx from 'clsx'

interface StatCardProps {
  label:    string
  value:    string | number
  unit?:    string
  sub?:     string
  status?:  'ok' | 'warn' | 'crit' | 'neutral'
  mono?:    boolean
}

const STATUS_COLORS = {
  ok:      'text-green',
  warn:    'text-amber',
  crit:    'text-red',
  neutral: 'text-bright',
}

export default function StatCard({ label, value, unit, sub, status = 'neutral', mono }: StatCardProps) {
  return (
    <div className="bg-panel border border-border rounded-lg p-5 flex flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-dim">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className={clsx(
          'text-3xl font-semibold leading-none',
          mono ? 'font-mono' : 'font-display',
          STATUS_COLORS[status]
        )}>
          {value}
        </span>
        {unit && <span className="font-mono text-xs text-muted">{unit}</span>}
      </div>
      {sub && <p className="font-mono text-[11px] text-dim">{sub}</p>}
    </div>
  )
}
