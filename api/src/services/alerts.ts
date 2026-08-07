import nodemailer, { type Transporter } from 'nodemailer'
import { query } from '../db/client.js'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Alert {
  id: string
  server_id: string
  metric: string
  condition: 'above' | 'below'
  threshold: number
  channel: 'slack' | 'email' | 'discord' | 'webhook'
  destination: string
  enabled: boolean
}

interface MetricSnapshot {
  cpu_percent: number
  memory_percent: number
  disk_percent: number
  load_avg_1: number
  gpu_percent?: number | null
  vram_percent?: number | null
  gpu_temp_c?: number | null
  cpu_temp_c?: number | null
}

// Track which alerts are currently active (fired but not yet resolved)
// Map<alertId, true> — prevents repeated firing for sustained breaches
const activeAlerts = new Set<string>()

// ─── Main evaluation function ─────────────────────────────────────────────────

/**
 * evaluateAlerts
 *
 * Called after every metric insert. Loads enabled alert rules for the server,
 * checks each metric against its threshold, and fires notifications as needed.
 * Once an alert is "active" it won't re-fire until the metric recovers.
 */
export async function evaluateAlerts(
  serverId: string,
  serverName: string,
  snap: MetricSnapshot
): Promise<void> {
  let alerts: Alert[]
  try {
    alerts = await query<Alert>(
      'SELECT * FROM alerts WHERE server_id = $1 AND enabled = true',
      [serverId]
    )
  } catch (err) {
    console.error('[alerts] failed to load alerts:', err)
    return
  }

  for (const alert of alerts) {
    const value = getMetricValue(snap, alert.metric)
    const breached = alert.condition === 'above'
      ? value > alert.threshold
      : value < alert.threshold

    if (breached && !activeAlerts.has(alert.id)) {
      // Mark active immediately so concurrent ticks can't double-fire
      activeAlerts.add(alert.id)

      // Log the event to DB
      await query(
        `INSERT INTO alert_events (alert_id, server_id, metric_value)
         VALUES ($1, $2, $3)`,
        [alert.id, serverId, value]
      )

      // Fire notification (non-blocking — don't await to hold up metric ingestion)
      sendNotification(alert, serverName, value).catch((err) =>
        console.error(`[alerts] notification failed for ${alert.id}:`, err)
      )

      console.log(
        `[alerts] ⚠ Alert fired — server: ${serverName} | ` +
        `metric: ${alert.metric} | value: ${value.toFixed(1)} | ` +
        `threshold: ${alert.condition} ${alert.threshold}`
      )
    } else if (!breached && activeAlerts.has(alert.id)) {
      // Metric has recovered — mark alert resolved
      activeAlerts.delete(alert.id)
      await query(
        `UPDATE alert_events SET resolved_at = NOW()
         WHERE alert_id = $1 AND resolved_at IS NULL`,
        [alert.id]
      )
      console.log(`[alerts] ✓ Alert resolved — ${alert.metric} on ${serverName}`)
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMetricValue(snap: MetricSnapshot, metric: string): number {
  const map: Record<string, number | null | undefined> = {
    cpu_percent:    snap.cpu_percent,
    memory_percent: snap.memory_percent,
    disk_percent:   snap.disk_percent,
    load_avg_1:     snap.load_avg_1,
    gpu_percent:    snap.gpu_percent,
    vram_percent:   snap.vram_percent,
    gpu_temp_c:     snap.gpu_temp_c,
    cpu_temp_c:     snap.cpu_temp_c,
  }
  return map[metric] ?? 0
}

async function sendNotification(
  alert: Alert,
  serverName: string,
  value: number
): Promise<void> {
  const message =
    `🚨 Vigil Alert — ${serverName}\n` +
    `${alert.metric.replace('_', ' ')} is ${alert.condition} ${alert.threshold} (current: ${value.toFixed(1)})`

  switch (alert.channel) {
    case 'slack':
      return sendSlack(alert.destination, message)
    case 'discord':
      return sendDiscord(alert.destination, message)
    case 'webhook':
      return sendWebhook(alert.destination, alert, serverName, value, message)
    case 'email':
      return sendEmail(alert.destination, `Vigil Alert: ${serverName}`, message)
  }
}

async function sendSlack(webhookUrl: string, text: string): Promise<void> {
  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!resp.ok) throw new Error(`Slack webhook returned ${resp.status}`)
}

// Discord incoming webhooks expect a `content` field.
async function sendDiscord(webhookUrl: string, text: string): Promise<void> {
  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: text }),
  })
  if (!resp.ok) throw new Error(`Discord webhook returned ${resp.status}`)
}

// Generic webhook — POSTs a structured JSON payload to any endpoint.
async function sendWebhook(
  url: string,
  alert: Alert,
  serverName: string,
  value: number,
  message: string,
): Promise<void> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      server: serverName,
      metric: alert.metric,
      condition: alert.condition,
      threshold: alert.threshold,
      value,
      message,
      fired_at: new Date().toISOString(),
    }),
  })
  if (!resp.ok) throw new Error(`Webhook returned ${resp.status}`)
}

// ─── Email (nodemailer) ────────────────────────────────────────────────────
// A real SMTP transport is created lazily when SMTP_HOST is configured.
// Without it (e.g. local dev / tests) the message is logged instead of sent.
let transport: Transporter | null = null
let transportReady = false

function getTransport(): Transporter | null {
  if (transportReady) return transport
  transportReady = true

  const host = process.env.SMTP_HOST
  if (!host) return (transport = null)

  transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  })
  return transport
}

async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  const t = getTransport()
  if (!t) {
    // No SMTP configured — log so the code path is still exercised.
    console.log(`[email] (SMTP not configured) To: ${to} | Subject: ${subject}\n${body}`)
    return
  }
  await t.sendMail({
    from: process.env.SMTP_FROM ?? 'vigil@localhost',
    to,
    subject,
    text: body,
  })
}
