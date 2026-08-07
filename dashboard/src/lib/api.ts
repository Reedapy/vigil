import type { Server, MetricPoint, Alert, AlertEvent } from '@/types'

// The dashboard fetches the API from two different network contexts:
//   • Server components / SSR run inside the container → use the internal
//     Docker service URL (API_INTERNAL_URL), read at runtime.
//   • Client components run in the browser → use the public URL
//     (NEXT_PUBLIC_API_URL), inlined at build time.
const BASE =
  typeof window === 'undefined'
    ? process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    : process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`)
  return res.json() as Promise<T>
}

async function del(path: string): Promise<void> {
  await fetch(`${BASE}${path}`, { method: 'DELETE' })
}

async function patch(path: string, body: unknown): Promise<void> {
  await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

export const api = {
  servers: {
    list:   ()   => get<Server[]>('/servers'),
    get:    (id: string) => get<Server>(`/servers/${id}`),
    delete: (id: string) => del(`/servers/${id}`),
  },
  metrics: {
    history: (serverId: string, minutes = 60) =>
      get<MetricPoint[]>(`/metrics/${serverId}?minutes=${minutes}`),
    latest: (serverId: string) =>
      get<MetricPoint>(`/metrics/${serverId}/latest`),
  },
  alerts: {
    list:   (serverId: string) => get<Alert[]>(`/alerts/${serverId}`),
    events: (serverId: string) => get<AlertEvent[]>(`/alerts/${serverId}/events`),
    create: (body: Partial<Alert>) => post<{ id: string }>('/alerts', body),
    toggle: (id: string, enabled: boolean) => patch(`/alerts/${id}`, { enabled }),
    delete: (id: string) => del(`/alerts/${id}`),
  },
}
