# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Cache dependencies
COPY go.mod go.sum ./
COPY perfstat_stub ./perfstat_stub

RUN go mod download

# Build static binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o vigil-agent ./main.go

# ─── Stage 2: Minimal runtime ─────────────────────────────────────────────────
FROM scratch

COPY --from=builder /app/vigil-agent /vigil-agent
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

ENTRYPOINT ["/vigil-agent"]
