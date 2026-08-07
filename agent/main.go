// Vigil Agent — lightweight system metrics collector.
//
// On first run (VIGIL_AGENT_KEY is empty) it registers with the API
// and prints the issued key, which must be persisted to the environment.
// On subsequent runs it ships a MetricSnapshot every VIGIL_INTERVAL seconds.
//
// Environment variables:
//
//	VIGIL_SERVER_NAME  — display name shown in the dashboard  (required)
//	VIGIL_API_URL      — base URL of the Vigil API             (required)
//	VIGIL_AGENT_KEY    — bearer token issued on registration    (required after first run)
//	VIGIL_INTERVAL     — collection interval in seconds         (default: 10)
//	VIGIL_API_SECRET   — shared secret for registration only    (required for first run)
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	_ "github.com/joho/godotenv/autoload"
	"github.com/damiantrajkovski/vigil-agent/collector"
	"github.com/damiantrajkovski/vigil-agent/sender"
)

func main() {
	// ── Configuration ─────────────────────────────────────────────────────────
	serverName := requireEnv("VIGIL_SERVER_NAME")
	apiURL     := requireEnv("VIGIL_API_URL")
	agentKey   := os.Getenv("VIGIL_AGENT_KEY")
	apiSecret  := os.Getenv("VIGIL_API_SECRET")

	// State file that persists the issued agent key across restarts, so the
	// operator never has to copy/paste it. Overridable via VIGIL_STATE_FILE.
	statePath := os.Getenv("VIGIL_STATE_FILE")
	if statePath == "" {
		statePath = "vigil-agent.key"
	}

	interval := 10
	if raw := os.Getenv("VIGIL_INTERVAL"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			interval = n
		}
	}

	// Fall back to a previously persisted key when the env var isn't set.
	if agentKey == "" {
		agentKey = readStoredKey(statePath)
	}

	// ── Registration (first run only) ─────────────────────────────────────────
	// On success the key is saved to statePath and the agent continues straight
	// into the metric loop — no manual restart or copy/paste required.
	if agentKey == "" {
		if apiSecret == "" {
			log.Fatal("VIGIL_AGENT_KEY is empty — set VIGIL_API_SECRET to register this agent")
		}

		hostname, _ := os.Hostname()
		log.Printf("Registering agent '%s' (hostname: %s) with API at %s …", serverName, hostname, apiURL)

		result, err := sender.Register(apiURL, serverName, hostname, apiSecret)
		if err != nil {
			log.Fatalf("Registration failed: %v", err)
		}
		agentKey = result.AgentKey

		if err := os.WriteFile(statePath, []byte(agentKey), 0o600); err != nil {
			log.Printf("Warning: could not persist agent key to %s: %v", statePath, err)
			log.Printf("Set VIGIL_AGENT_KEY=%s to avoid re-registering.", agentKey)
		} else {
			log.Printf("Agent key persisted to %s", statePath)
		}

		fmt.Printf("\n✓ Agent registered. Server ID: %s\n\n", result.ServerID)
	}

	// ── Metric loop ───────────────────────────────────────────────────────────
	client := sender.New(apiURL, agentKey)
	tick   := time.NewTicker(time.Duration(interval) * time.Second)
	defer tick.Stop()

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	log.Printf("Vigil agent started — server: %s | interval: %ds | api: %s", serverName, interval, apiURL)

	// Collect once immediately, then on each tick
	collect(ctx, client)

	for {
		select {
		case <-tick.C:
			collect(ctx, client)
		case <-ctx.Done():
			log.Println("Vigil agent shutting down.")
			return
		}
	}
}

// collect gathers a metric snapshot and ships it, logging any errors.
func collect(ctx context.Context, client *sender.Client) {
	snap, err := collector.Collect(ctx)
	if err != nil {
		log.Printf("collect error: %v", err)
		return
	}

	if err := client.Send(snap); err != nil {
		log.Printf("send error: %v — will retry next tick", err)
		return
	}

	log.Printf("✓ metrics shipped — cpu: %.1f%% mem: %.1f%% disk: %.1f%%",
		snap.CPUPercent, snap.MemoryPercent, snap.DiskPercent)
}

// readStoredKey returns the agent key saved at path, or "" if it can't be read.
func readStoredKey(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// requireEnv returns the value of an env var or exits with a helpful message.
func requireEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("Required environment variable %s is not set", key)
	}
	return v
}
