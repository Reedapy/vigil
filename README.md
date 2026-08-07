# Vigil — Self-Hosted Infrastructure Monitoring

> Deploy a Go agent to any server. Watch live CPU, memory, disk, and network metrics stream into a dark, industrial dashboard. Get alerted via Slack or email when thresholds are breached.

[![CI](https://img.shields.io/github/actions/workflow/status/damiantrajkovski/vigil/ci.yml?label=CI&style=flat-square)](https://github.com/damiantrajkovski/vigil/actions)
![Go](https://img.shields.io/badge/Go-1.22-00ADD8?style=flat-square&logo=go)
![Node](https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=node.js)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=flat-square&logo=next.js)

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Monitored Server(s)                                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  vigil-agent (Go binary)                             │  │
│  │  • gopsutil collects CPU/mem/disk/net every 10s      │  │
│  │  • POST /metrics  →  Vigil API (Bearer token)        │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────┬───────────────────────────────┘
                             │ HTTPS
                             ▼
┌────────────────────────────────────────────────────────────┐
│  Vigil API  (Node.js / Express)         :4000              │
│  • Validates agent bearer token                            │
│  • Inserts metric row → PostgreSQL                         │
│  • Broadcasts via WebSocket → Dashboard                    │
│  • Evaluates alert thresholds → Slack / Email              │
└──────────────┬────────────────────────────┬────────────────┘
               │                            │ WS /ws?serverId=
               ▼                            ▼
┌──────────────────────┐    ┌───────────────────────────────┐
│  PostgreSQL :5432    │    │  Vigil Dashboard (Next.js 14) │
│  • servers           │    │  • Fleet overview              │
│  • metrics           │    │  • Live area charts           │
│  • alerts            │    │  • Gauge bars                 │
│  • alert_events      │    │  • Alert rule builder         │
└──────────────────────┘    │  • In-app setup docs          │
                            └───────────────────────────────┘
```

---

## Tech Stack

| Layer       | Technology                        |
|-------------|-----------------------------------|
| Agent       | Go 1.22 + gopsutil                |
| API         | Node.js 20 + Express + TypeScript |
| Real-time   | WebSockets (ws library)           |
| Database    | PostgreSQL 16                     |
| Dashboard   | Next.js 14 + Recharts + Tailwind  |
| Alerting    | Slack webhooks + Nodemailer       |
| Container   | Docker + Docker Compose           |
| CI/CD       | GitHub Actions                    |

---

## Quick Start

### Prerequisites
- Docker 24+ and Docker Compose
- Go 1.22+ (for agent development only)
- Node.js 20+ (for dashboard development only)

### 1 · Clone & configure

```bash
git clone https://github.com/damiantrajkovski/vigil.git
cd vigil
cp .env.example .env
```

Edit `.env` — at minimum set `POSTGRES_PASSWORD` and `API_SECRET` to strong random values.

### 2 · Start the stack

```bash
docker compose up -d
```

- Dashboard → http://localhost:3000
- API → http://localhost:4000
- API health → http://localhost:4000/health

### 3 · Build & register the agent

```bash
cd agent
go build -o vigil-agent ./main.go

# Register with the API (one-time):
export VIGIL_SERVER_NAME="my-server"
export VIGIL_API_URL="http://localhost:4000"
export VIGIL_API_SECRET="your_secret_from_env"

./vigil-agent
# Prints the VIGIL_AGENT_KEY — copy it!
```

### 4 · Start sending metrics

```bash
export VIGIL_AGENT_KEY="abc123..."   # from registration
./vigil-agent
# ✓ metrics shipped — cpu: 12.3% mem: 45.1% disk: 22.8%
```

Your server now appears in the dashboard with live charts.

---

## Development

### API (hot reload)

```bash
cd api
npm install
npm run dev   # starts tsx watch on :4000
```

### Dashboard (hot reload)

```bash
cd dashboard
npm install
npm run dev   # starts Next.js dev server on :3000
```

### Agent

```bash
cd agent
go run ./main.go
```

### Run tests

```bash
# API unit tests
cd api && npm test

# Go vet
cd agent && go vet ./...
```

---

## Project Structure

```
vigil/
├── agent/                      # Go binary — runs on monitored servers
│   ├── collector/
│   │   └── metrics.go          # gopsutil: CPU, mem, disk, net, load
│   ├── sender/
│   │   └── http.go             # HTTP client: POST /metrics + registration
│   ├── main.go                 # Entrypoint: config, registration, metric loop
│   ├── go.mod
│   └── Dockerfile
│
├── api/                        # Node.js API server
│   ├── src/
│   │   ├── db/
│   │   │   ├── schema.sql      # PostgreSQL DDL (auto-applied by Docker)
│   │   │   └── client.ts       # pg Pool + typed query helper
│   │   ├── middleware/
│   │   │   └── agentAuth.ts    # Bearer token auth middleware
│   │   ├── routes/
│   │   │   ├── servers.ts      # GET/POST/DELETE /servers
│   │   │   ├── metrics.ts      # POST/GET /metrics
│   │   │   └── alerts.ts       # CRUD /alerts
│   │   ├── services/
│   │   │   └── alerts.ts       # Threshold evaluation + Slack/email dispatch
│   │   ├── ws/
│   │   │   └── broadcast.ts    # WebSocket server + per-server subscriber sets
│   │   └── index.ts            # Express app + HTTP server + graceful shutdown
│   ├── tests/
│   │   └── alerts.test.ts      # Vitest unit tests (mocked DB)
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── dashboard/                  # Next.js 14 monitoring UI
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx      # Root layout: fonts, sidebar
│   │   │   ├── page.tsx        # / — Fleet overview (server grid)
│   │   │   ├── servers/[id]/
│   │   │   │   └── page.tsx    # /servers/:id — live charts + alerts
│   │   │   ├── alerts/
│   │   │   │   └── page.tsx    # /alerts — fleet alert log
│   │   │   └── docs/
│   │   │       └── page.tsx    # /docs — in-app setup guide
│   │   ├── components/
│   │   │   ├── charts/
│   │   │   │   └── MetricChart.tsx  # Recharts area chart
│   │   │   └── ui/
│   │   │       ├── Sidebar.tsx      # Navigation sidebar
│   │   │       ├── StatCard.tsx     # Metric stat card
│   │   │       ├── GaugeBar.tsx     # Animated percentage bar
│   │   │       ├── LiveMetricPanel.tsx  # WebSocket client + chart grid
│   │   │       └── AlertsPanel.tsx  # Alert CRUD UI
│   │   ├── lib/
│   │   │   └── api.ts          # Typed fetch wrappers for all API endpoints
│   │   └── types/
│   │       └── index.ts        # Shared types + helpers
│   ├── package.json
│   ├── tailwind.config.ts
│   └── Dockerfile
│
├── .github/
│   └── workflows/
│       └── ci.yml              # Go vet + Node tests + Next build + compose smoke
│
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
└── README.md
```

---

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`    | `/health`                     | —            | Liveness check |
| `GET`    | `/servers`                    | —            | List all servers with latest metrics |
| `GET`    | `/servers/:id`                | —            | Get single server |
| `DELETE` | `/servers/:id`                | —            | Remove server and all its data |
| `POST`   | `/servers/register`           | API_SECRET   | Register agent, returns agent_key |
| `POST`   | `/metrics`                    | Bearer token | Ingest metric snapshot |
| `GET`    | `/metrics/:id?minutes=60`     | —            | Fetch time-series history |
| `GET`    | `/metrics/:id/latest`         | —            | Latest snapshot only |
| `GET`    | `/alerts/:serverId`           | —            | List alert rules |
| `POST`   | `/alerts`                     | —            | Create alert rule |
| `PATCH`  | `/alerts/:id`                 | —            | Toggle enabled |
| `DELETE` | `/alerts/:id`                 | —            | Delete alert rule |
| `GET`    | `/alerts/:serverId/events`    | —            | Alert event log |

---

## Stretch Goals / Roadmap

- [ ] **TimescaleDB** — drop-in PostgreSQL extension for automatic time-series partitioning and `time_bucket` queries
- [ ] **Multi-user auth** — JWT auth for the dashboard so it's safe to expose publicly
- [ ] **Anomaly detection** — flag statistical outliers using rolling z-score on each metric
- [ ] **Custom dashboards** — drag-and-drop panel layout with saved configurations
- [ ] **Agent auto-update** — poll a version endpoint and self-update the binary
- [ ] **Windows support** — the Go agent already compiles for Windows; test suite coverage
- [ ] **Prometheus exporter** — expose `/metrics` in Prometheus text format for Grafana integration
- [ ] **Mobile-responsive dashboard** — collapsible sidebar for small screens

---

## Deliverables for Portfolio

- ✅ Go binary deployable to any Linux server
- ✅ Production Docker Compose stack (3 services)
- ✅ WebSocket real-time streaming to the browser
- ✅ Dark industrial dashboard with area charts and gauge bars
- ✅ Threshold alerting system (Slack + email) with auto-resolve
- ✅ GitHub Actions CI pipeline (Go vet + unit tests + Next.js build + compose smoke)
- ✅ Full API documentation
- ✅ In-app setup guide (no external docs needed)

---

## License

MIT
