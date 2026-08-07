'use client'

import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { format } from 'date-fns'
import type { MetricPoint } from '@/types'

interface MetricChartProps {
  data:      MetricPoint[]
  dataKey:   keyof MetricPoint
  color:     string
  label:     string
  unit?:     string
  domain?:   [number, number]
}

interface TooltipProps {
  active?:  boolean
  payload?: Array<{ value: number | string }>
  label?:   string | number
  unit?:    string
}

function CustomTooltip({ active, payload, label, unit }: TooltipProps) {
  if (!active || !payload?.length || label == null) return null
  return (
    <div className="bg-panel border border-border rounded px-3 py-2 font-mono text-xs">
      <p className="text-dim mb-1">{format(new Date(label), 'HH:mm:ss')}</p>
      <p className="text-bright">
        {Number(payload[0].value).toFixed(1)}{unit ?? '%'}
      </p>
    </div>
  )
}

export default function MetricChart({ data, dataKey, color, label, unit, domain }: MetricChartProps) {
  const chartData = data.map((d) => ({
    ts:    d.collected_at,
    value: d[dataKey] as number,
  }))

  return (
    <div className="bg-panel border border-border rounded-lg p-5">
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-dim mb-4">{label}</p>
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2428" vertical={false} />
          <XAxis
            dataKey="ts"
            tickFormatter={(v) => format(new Date(v), 'HH:mm')}
            tick={{ fill: '#6B7580', fontSize: 9, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={domain ?? [0, 100]}
            tick={{ fill: '#6B7580', fontSize: 9, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip unit={unit} />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#grad-${dataKey})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
