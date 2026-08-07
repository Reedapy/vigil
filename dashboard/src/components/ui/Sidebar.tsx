'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

const NAV = [
  { href: '/',        label: 'Overview',  icon: '◈' },
  { href: '/alerts',  label: 'Alerts',    icon: '⚑' },
  { href: '/docs',    label: 'Docs',      icon: '⊞' },
]

export default function Sidebar() {
  const path = usePathname()

  return (
    <aside className="w-[220px] flex-shrink-0 bg-surface border-r border-border flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded bg-amber flex items-center justify-center text-void text-xs font-bold font-mono">V</span>
          <span className="font-display font-semibold text-bright tracking-wide text-sm">VIGIL</span>
        </div>
        <p className="font-mono text-[10px] text-dim mt-1 tracking-wider">INFRA MONITOR</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all duration-150',
              path === href
                ? 'bg-amber/10 text-amber border border-amber/20'
                : 'text-dim hover:text-text hover:bg-panel'
            )}
          >
            <span className="font-mono text-base leading-none">{icon}</span>
            <span className="font-display font-medium tracking-wide">{label}</span>
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border">
        <p className="font-mono text-[10px] text-muted">v1.0.0</p>
        <a
          href="https://github.com/damiantrajkovski"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[10px] text-dim hover:text-amber transition-colors"
        >
          github.com/damiantrajkovski
        </a>
      </div>
    </aside>
  )
}
