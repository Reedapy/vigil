// GPU metrics collection via nvidia-smi.
//
// nvidia-smi ships with the NVIDIA driver on both Windows and Linux, so shelling
// out to it is the most portable way to read GPU utilisation, VRAM, and
// temperature without cgo/NVML bindings. When nvidia-smi is absent (no NVIDIA
// GPU, or an AMD/Intel-only machine) every field is left nil and the agent
// simply reports no GPU data — the same graceful-degradation pattern used for
// load average on Windows.
package collector

import (
	"context"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
)

// nvidia-smi is resolved once per process. On Windows it lives in System32,
// which isn't always on PATH, so a bare LookPath can fail even when a GPU is
// present — we fall back to well-known install locations.
var (
	nvidiaSmiOnce sync.Once
	nvidiaSmiBin  string
)

func nvidiaSmiPath() string {
	nvidiaSmiOnce.Do(func() { nvidiaSmiBin = resolveNvidiaSmi() })
	return nvidiaSmiBin
}

func resolveNvidiaSmi() string {
	if p := os.Getenv("VIGIL_NVIDIA_SMI"); p != "" {
		return p // explicit override
	}
	if p, err := exec.LookPath("nvidia-smi"); err == nil {
		return p // found on PATH
	}

	var candidates []string
	if runtime.GOOS == "windows" {
		candidates = []string{
			`C:\Windows\System32\nvidia-smi.exe`,
			`C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe`,
		}
	} else {
		candidates = []string{
			"/usr/bin/nvidia-smi",
			"/usr/local/bin/nvidia-smi",
			"/opt/nvidia/bin/nvidia-smi",
		}
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return "" // no NVIDIA GPU / driver
}

// gpuStats holds a single GPU's readings. A nil pointer means "not available".
type gpuStats struct {
	UtilPercent *float64
	MemUsed     *uint64 // bytes
	MemTotal    *uint64 // bytes
	MemPercent  *float64
	TempC       *float64
	PowerWatts  *float64
	FanPercent  *float64
}

// collectGPU queries nvidia-smi for the first GPU (index 0). Any failure
// (missing binary, no GPU, unexpected output) yields an empty gpuStats.
func collectGPU(ctx context.Context) gpuStats {
	bin := nvidiaSmiPath()
	if bin == "" {
		return gpuStats{} // nvidia-smi unavailable — no NVIDIA GPU
	}

	cmd := exec.CommandContext(ctx, bin,
		"--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,fan.speed",
		"--format=csv,noheader,nounits")

	out, err := cmd.Output()
	if err != nil {
		return gpuStats{} // driver present but query failed
	}

	// First non-empty line = GPU 0.
	// Fields: util%, memUsedMiB, memTotalMiB, tempC, powerW, fan%
	line := strings.TrimSpace(string(out))
	if i := strings.IndexByte(line, '\n'); i >= 0 {
		line = strings.TrimSpace(line[:i])
	}
	fields := strings.Split(line, ",")
	if len(fields) < 4 {
		return gpuStats{}
	}

	var s gpuStats

	// parseField pulls fields[i] as a float, tolerating "[N/A]" (→ nil).
	parseField := func(i int) *float64 {
		if i >= len(fields) {
			return nil
		}
		v, err := strconv.ParseFloat(strings.TrimSpace(fields[i]), 64)
		if err != nil {
			return nil
		}
		return &v
	}

	s.UtilPercent = parseField(0)

	usedMiB, errU := strconv.ParseUint(strings.TrimSpace(fields[1]), 10, 64)
	totalMiB, errT := strconv.ParseUint(strings.TrimSpace(fields[2]), 10, 64)
	if errU == nil && errT == nil {
		used := usedMiB * 1024 * 1024
		total := totalMiB * 1024 * 1024
		s.MemUsed = &used
		s.MemTotal = &total
		if totalMiB > 0 {
			pct := float64(usedMiB) / float64(totalMiB) * 100
			s.MemPercent = &pct
		}
	}

	s.TempC = parseField(3)
	s.PowerWatts = parseField(4)
	s.FanPercent = parseField(5)

	return s
}
