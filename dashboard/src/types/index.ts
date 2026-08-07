export interface Server {
  id:               string
  name:             string
  hostname:         string
  last_seen_at:     string | null
  created_at:       string
  cpu_percent:      number | null
  memory_percent:   number | null
  disk_percent:     number | null
  load_avg_1:       number | null
  gpu_percent:      number | null
  vram_percent:     number | null
  gpu_temp_c:       number | null
  cpu_temp_c:       number | null
  latest_metric_at: string | null
}

export interface MetricPoint {
  collected_at:       string
  cpu_percent:        number
  memory_percent:     number
  disk_percent:       number
  memory_used_bytes:  number
  memory_total_bytes: number
  disk_used_bytes:    number
  disk_total_bytes:   number
  net_bytes_sent:     number
  net_bytes_recv:     number
  load_avg_1:         number
  gpu_percent:        number | null
  vram_used_bytes:    number | null
  vram_total_bytes:   number | null
  vram_percent:       number | null
  gpu_temp_c:         number | null
  cpu_temp_c:         number | null
  gpu_power_watts:    number | null
  gpu_fan_percent:    number | null
  net_tx_bytes_sec:   number | null
  net_rx_bytes_sec:   number | null
  cpu_per_core:       number[] | null
  disks:              DiskUsage[] | null
  top_processes:      ProcInfo[] | null
}

export interface DiskUsage {
  mount:       string
  total_bytes: number
  used_bytes:  number
  percent:     number
}

export interface ProcInfo {
  pid:         number
  name:        string
  cpu_percent: number
  mem_percent: number
  mem_bytes:   number
}

export interface Alert {
  id:           string
  server_id:    string
  metric:       string
  condition:    'above' | 'below'
  threshold:    number
  channel:      'slack' | 'email' | 'discord' | 'webhook'
  destination:  string
  enabled:      boolean
  created_at:   string
  active_count: number
}

export interface AlertEvent {
  id:           string
  alert_id:     string
  server_id:    string
  metric:       string
  condition:    string
  threshold:    number
  metric_value: number
  triggered_at: string
  resolved_at:  string | null
}

export type ServerStatus = 'online' | 'warning' | 'offline'

export function serverStatus(server: Server): ServerStatus {
  if (!server.last_seen_at) return 'offline'
  const age = Date.now() - new Date(server.last_seen_at).getTime()
  if (age > 60_000)  return 'offline'
  if (age > 30_000)  return 'warning'
  return 'online'
}

export function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k     = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i     = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}
