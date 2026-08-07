// Package collector gathers system metrics using gopsutil.
// It reads CPU, memory, disk, network, and load average data
// and returns them as a flat MetricSnapshot ready for shipping.
package collector

import (
	"context"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
)

// MetricSnapshot is the payload sent to the Vigil API on each collection tick.
type MetricSnapshot struct {
	CollectedAt      time.Time `json:"collected_at"`
	CPUPercent       float64   `json:"cpu_percent"`
	MemoryPercent    float64   `json:"memory_percent"`
	MemoryUsedBytes  uint64    `json:"memory_used_bytes"`
	MemoryTotalBytes uint64    `json:"memory_total_bytes"`
	DiskPercent      float64   `json:"disk_percent"`
	DiskUsedBytes    uint64    `json:"disk_used_bytes"`
	DiskTotalBytes   uint64    `json:"disk_total_bytes"`
	NetBytesSent     uint64    `json:"net_bytes_sent"`
	NetBytesRecv     uint64    `json:"net_bytes_recv"`
	LoadAvg1         float64   `json:"load_avg_1"`

	// ── Network throughput (bytes/sec) ───────────────────────────────────────
	// Instantaneous rate derived from the delta between ticks. nil on first tick.
	NetTxBytesSec *float64 `json:"net_tx_bytes_sec,omitempty"`
	NetRxBytesSec *float64 `json:"net_rx_bytes_sec,omitempty"`

	// ── GPU (NVIDIA via nvidia-smi) ──────────────────────────────────────────
	// All nil when no NVIDIA GPU is present, so they are omitted from the JSON
	// payload and stored as NULL — the dashboard then hides the GPU panels.
	GPUPercent     *float64 `json:"gpu_percent,omitempty"`
	VRAMUsedBytes  *uint64  `json:"vram_used_bytes,omitempty"`
	VRAMTotalBytes *uint64  `json:"vram_total_bytes,omitempty"`
	VRAMPercent    *float64 `json:"vram_percent,omitempty"`
	GPUTempC       *float64 `json:"gpu_temp_c,omitempty"`
	GPUPowerWatts  *float64 `json:"gpu_power_watts,omitempty"`
	GPUFanPercent  *float64 `json:"gpu_fan_percent,omitempty"`

	// ── Temperatures ─────────────────────────────────────────────────────────
	// CPU temp is best-effort — commonly unavailable on Windows. nil when unknown.
	CPUTempC *float64 `json:"cpu_temp_c,omitempty"`

	// ── Detailed breakdowns (current-state, not charted over time) ───────────
	CPUPerCore   []float64    `json:"cpu_per_core,omitempty"`
	Disks        []DiskUsage  `json:"disks,omitempty"`
	TopProcesses []ProcInfo   `json:"top_processes,omitempty"`
}

// DiskUsage is one mounted filesystem's usage.
type DiskUsage struct {
	Mount      string  `json:"mount"`
	TotalBytes uint64  `json:"total_bytes"`
	UsedBytes  uint64  `json:"used_bytes"`
	Percent    float64 `json:"percent"`
}

// Cross-tick state for network throughput (single collection goroutine → no lock).
var (
	prevNetTime time.Time
	prevNetSent uint64
	prevNetRecv uint64
)

// Collect samples all system metrics and returns a MetricSnapshot.
// A 100 ms interval is used for the CPU percent measurement so it's
// non-blocking but still accurate enough for monitoring purposes.
func Collect(ctx context.Context) (*MetricSnapshot, error) {
	snap := &MetricSnapshot{CollectedAt: time.Now().UTC()}

	// ── CPU (per-core + aggregate) ───────────────────────────────────────────
	perCore, err := cpu.PercentWithContext(ctx, 100*time.Millisecond, true)
	if err != nil {
		return nil, err
	}
	snap.CPUPerCore = perCore
	if len(perCore) > 0 {
		var sum float64
		for _, c := range perCore {
			sum += c
		}
		snap.CPUPercent = sum / float64(len(perCore)) // overall = mean of cores
	}

	// ── Memory ───────────────────────────────────────────────────────────────
	vmStat, err := mem.VirtualMemoryWithContext(ctx)
	if err != nil {
		return nil, err
	}
	snap.MemoryPercent = vmStat.UsedPercent
	snap.MemoryUsedBytes = vmStat.Used
	snap.MemoryTotalBytes = vmStat.Total

	// ── Disk (root partition) ────────────────────────────────────────────────
	diskStat, err := disk.UsageWithContext(ctx, "/")
	if err != nil {
		return nil, err
	}
	snap.DiskPercent = diskStat.UsedPercent
	snap.DiskUsedBytes = diskStat.Used
	snap.DiskTotalBytes = diskStat.Total

	// ── Disks (all physical partitions) ──────────────────────────────────────
	if parts, err := disk.PartitionsWithContext(ctx, false); err == nil {
		for _, p := range parts {
			u, err := disk.UsageWithContext(ctx, p.Mountpoint)
			if err != nil {
				continue // unreadable mount (e.g. empty CD drive) — skip
			}
			snap.Disks = append(snap.Disks, DiskUsage{
				Mount:      p.Mountpoint,
				TotalBytes: u.Total,
				UsedBytes:  u.Used,
				Percent:    u.UsedPercent,
			})
		}
	}

	// ── Network (aggregate all interfaces) ──────────────────────────────────
	netStats, err := net.IOCountersWithContext(ctx, false) // false = aggregate
	if err != nil {
		return nil, err
	}
	if len(netStats) > 0 {
		snap.NetBytesSent = netStats[0].BytesSent
		snap.NetBytesRecv = netStats[0].BytesRecv

		// Throughput rate from the delta since the previous tick.
		nowNet := time.Now()
		if !prevNetTime.IsZero() {
			if elapsed := nowNet.Sub(prevNetTime).Seconds(); elapsed > 0 {
				if snap.NetBytesSent >= prevNetSent { // guard counter reset
					tx := float64(snap.NetBytesSent-prevNetSent) / elapsed
					snap.NetTxBytesSec = &tx
				}
				if snap.NetBytesRecv >= prevNetRecv {
					rx := float64(snap.NetBytesRecv-prevNetRecv) / elapsed
					snap.NetRxBytesSec = &rx
				}
			}
		}
		prevNetTime = nowNet
		prevNetSent = snap.NetBytesSent
		prevNetRecv = snap.NetBytesRecv
	}

	// ── Load Average ─────────────────────────────────────────────────────────
	loadStat, err := load.AvgWithContext(ctx)
	if err != nil {
		// Load average not available on all platforms (e.g. Windows) — don't fail
		snap.LoadAvg1 = 0
	} else {
		snap.LoadAvg1 = loadStat.Load1
	}

	// ── GPU (best-effort; nil fields when no NVIDIA GPU) ─────────────────────
	gpu := collectGPU(ctx)
	snap.GPUPercent = gpu.UtilPercent
	snap.VRAMUsedBytes = gpu.MemUsed
	snap.VRAMTotalBytes = gpu.MemTotal
	snap.VRAMPercent = gpu.MemPercent
	snap.GPUTempC = gpu.TempC
	snap.GPUPowerWatts = gpu.PowerWatts
	snap.GPUFanPercent = gpu.FanPercent

	// ── CPU temperature (best-effort; often unavailable on Windows) ──────────
	snap.CPUTempC = collectCPUTemp(ctx)

	// ── Top processes (by instantaneous CPU, then memory) ────────────────────
	snap.TopProcesses = collectTopProcesses(ctx, 8)

	return snap, nil
}

// collectCPUTemp reads hardware sensors and returns a representative CPU
// temperature in °C, or nil if no usable sensor is found. Sensor availability
// varies widely by OS/hardware (reliable on Linux, often empty on Windows).
func collectCPUTemp(ctx context.Context) *float64 {
	temps, err := host.SensorsTemperaturesWithContext(ctx)
	if err != nil || len(temps) == 0 {
		return nil
	}

	// Prefer a recognisable CPU-package sensor.
	for _, t := range temps {
		key := strings.ToLower(t.SensorKey)
		isCPU := strings.Contains(key, "coretemp") ||
			strings.Contains(key, "cpu") ||
			strings.Contains(key, "package") ||
			strings.Contains(key, "k10temp") ||
			strings.Contains(key, "tccd")
		if isCPU && t.Temperature > 0 {
			v := t.Temperature
			return &v
		}
	}

	// Fall back to the first non-zero reading of any kind.
	for _, t := range temps {
		if t.Temperature > 0 {
			v := t.Temperature
			return &v
		}
	}

	return nil
}
