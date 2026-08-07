import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Docs' }

function Code({ children }: { children: string }) {
  return (
    <pre className="bg-void border border-border rounded-lg p-4 font-mono text-xs text-amber overflow-x-auto leading-relaxed mt-3 mb-5">
      <code>{children}</code>
    </pre>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display font-semibold text-bright text-lg mt-10 mb-1">{children}</h2>
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="font-mono text-xs uppercase tracking-widest text-amber mt-7 mb-1">{children}</h3>
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-xs text-dim leading-relaxed mb-2">{children}</p>
}

export default function DocsPage() {
  return (
    <div className="p-8 max-w-3xl">
      <h1 className="font-display font-semibold text-bright text-2xl mb-1">Setup Guide</h1>
      <p className="font-mono text-xs text-dim mb-8">Get from zero to live metrics in under 5 minutes.</p>

      <H2>1 · Start the Vigil stack</H2>
      <P>Clone the repo and spin up the full stack with Docker Compose:</P>
      <Code>{`git clone https://github.com/damiantrajkovski/vigil.git
cd vigil
cp .env.example .env   # edit secrets
docker compose up -d`}</Code>

      <P>The dashboard is now at <span className="text-text">http://localhost:3000</span> and the API at <span className="text-text">http://localhost:4000</span>.</P>

      <H2>2 · Register an agent</H2>
      <P>On the server you want to monitor, set these env vars and run the registration command:</P>
      <Code>{`export VIGIL_SERVER_NAME="my-prod-server"
export VIGIL_API_URL="http://your-vigil-host:4000"
export VIGIL_API_SECRET="your_api_secret_from_env"

./vigil-agent
# ✓ Agent registered. Server ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# ✓ Agent key issued. Add to your environment:
#   export VIGIL_AGENT_KEY=abc123...`}</Code>

      <H3>Build the agent binary</H3>
      <Code>{`cd agent
go build -o vigil-agent ./main.go`}</Code>

      <H2>3 · Start shipping metrics</H2>
      <P>After registration, set VIGIL_AGENT_KEY and restart the agent — it will begin sending metrics every 10 seconds.</P>
      <Code>{`export VIGIL_AGENT_KEY="abc123..."   # from registration output
export VIGIL_INTERVAL=10             # seconds (optional, default: 10)
./vigil-agent`}</Code>

      <H2>4 · Run as a systemd service (Linux)</H2>
      <P>For production, run the agent as a systemd service so it survives reboots:</P>
      <Code>{`# /etc/systemd/system/vigil-agent.service
[Unit]
Description=Vigil Monitoring Agent
After=network.target

[Service]
Type=simple
ExecStart=/opt/vigil/vigil-agent
Restart=always
RestartSec=10
Environment=VIGIL_SERVER_NAME=my-server
Environment=VIGIL_API_URL=http://vigil-host:4000
Environment=VIGIL_AGENT_KEY=abc123...
Environment=VIGIL_INTERVAL=10

[Install]
WantedBy=multi-user.target`}</Code>
      <Code>{`systemctl enable --now vigil-agent`}</Code>

      <H2>5 · Set up alerts</H2>
      <P>Navigate to any server in the dashboard and click &quot;+ Add alert rule&quot;. You can alert on:</P>
      <P>• <span className="text-text">cpu_percent</span> — CPU utilisation</P>
      <P>• <span className="text-text">memory_percent</span> — RAM utilisation</P>
      <P>• <span className="text-text">disk_percent</span> — root disk utilisation</P>
      <P>• <span className="text-text">load_avg_1</span> — 1-minute load average</P>
      <P>• <span className="text-text">gpu_percent</span> — GPU utilisation (NVIDIA)</P>
      <P>• <span className="text-text">vram_percent</span> — VRAM utilisation (NVIDIA)</P>
      <P>• <span className="text-text">gpu_temp_c</span> — GPU temperature °C (NVIDIA)</P>
      <P>• <span className="text-text">cpu_temp_c</span> — CPU temperature °C (where sensors are available)</P>
      <P>Notifications fire via Slack, Discord, a generic webhook, or email when a threshold is breached, and auto-resolve when the metric recovers. For email, configure SMTP on the API via <span className="text-text">SMTP_HOST</span>, <span className="text-text">SMTP_PORT</span>, <span className="text-text">SMTP_USER</span>, <span className="text-text">SMTP_PASS</span>, and <span className="text-text">SMTP_FROM</span> (without SMTP configured, emails are logged rather than sent).</P>
      <P>GPU metrics require an NVIDIA GPU with <span className="text-text">nvidia-smi</span> on PATH. Hosts without one simply omit these panels. CPU temperature depends on hardware sensors and is often unavailable on Windows.</P>

      <H2>API Reference</H2>
      <Code>{`GET  /health                     — liveness check
GET  /servers                    — list all servers
GET  /servers/:id                — get server
DELETE /servers/:id              — remove server

POST /servers/register           — register agent (needs API_SECRET)
     { name, hostname, secret }
     → { server_id, agent_key }

POST /metrics                    — ingest snapshot (Bearer agent_key)
GET  /metrics/:serverId?minutes= — fetch history
GET  /metrics/:serverId/latest   — latest snapshot

GET    /alerts/:serverId         — list alert rules
POST   /alerts                   — create alert rule
PATCH  /alerts/:id               — toggle enabled
DELETE /alerts/:id               — delete alert
GET    /alerts/:serverId/events  — alert event log`}</Code>
    </div>
  )
}
