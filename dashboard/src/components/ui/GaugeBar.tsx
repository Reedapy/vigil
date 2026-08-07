import clsx from 'clsx'

interface GaugeBarProps {
  value:   number  // 0–100
  label?:  string
}

function barColor(v: number) {
  if (v >= 90) return 'bg-red'
  if (v >= 75) return 'bg-amber'
  return 'bg-green'
}

export default function GaugeBar({ value, label }: GaugeBarProps) {
  const pct = Math.min(100, Math.max(0, value))

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between mb-1.5">
          <span className="font-mono text-[10px] text-dim uppercase tracking-widest">{label}</span>
          <span className={clsx('font-mono text-[11px] font-medium', pct >= 90 ? 'text-red' : pct >= 75 ? 'text-amber' : 'text-green')}>
            {pct.toFixed(1)}%
          </span>
        </div>
      )}
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-700', barColor(pct))}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
