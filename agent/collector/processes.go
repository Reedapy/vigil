// Top-process collection.
//
// CPU% is computed as an instantaneous rate: we remember each PID's cumulative
// CPU time between ticks and divide the delta by the elapsed wall-clock time.
// The first tick has no baseline, so CPU% is 0 until the second sample.
package collector

import (
	"context"
	"sort"
	"time"

	"github.com/shirou/gopsutil/v3/process"
)

// ProcInfo is a single process's resource usage.
type ProcInfo struct {
	PID        int32   `json:"pid"`
	Name       string  `json:"name"`
	CPUPercent float64 `json:"cpu_percent"`
	MemPercent float64 `json:"mem_percent"`
	MemBytes   uint64  `json:"mem_bytes"`
}

// Cross-tick state for instantaneous CPU% (single collection goroutine → no lock).
var (
	prevProcCPU  = map[int32]float64{}
	prevProcTime time.Time
)

// collectTopProcesses returns the topN processes ranked by CPU%, then memory.
func collectTopProcesses(ctx context.Context, topN int) []ProcInfo {
	procs, err := process.ProcessesWithContext(ctx)
	if err != nil {
		return nil
	}

	now := time.Now()
	elapsed := 0.0
	if !prevProcTime.IsZero() {
		elapsed = now.Sub(prevProcTime).Seconds()
	}

	newCPU := make(map[int32]float64, len(procs))
	infos := make([]ProcInfo, 0, len(procs))

	for _, p := range procs {
		times, err := p.TimesWithContext(ctx)
		if err != nil {
			continue // process vanished or access denied
		}
		totalCPU := times.User + times.System
		newCPU[p.Pid] = totalCPU

		var cpuPct float64
		if elapsed > 0 {
			if prev, ok := prevProcCPU[p.Pid]; ok {
				if delta := totalCPU - prev; delta > 0 {
					cpuPct = delta / elapsed * 100
				}
			}
		}

		name, _ := p.NameWithContext(ctx)
		memPct, _ := p.MemoryPercentWithContext(ctx)
		var rss uint64
		if mi, err := p.MemoryInfoWithContext(ctx); err == nil && mi != nil {
			rss = mi.RSS
		}

		infos = append(infos, ProcInfo{
			PID:        p.Pid,
			Name:       name,
			CPUPercent: cpuPct,
			MemPercent: float64(memPct),
			MemBytes:   rss,
		})
	}

	prevProcCPU = newCPU
	prevProcTime = now

	sort.Slice(infos, func(i, j int) bool {
		if infos[i].CPUPercent != infos[j].CPUPercent {
			return infos[i].CPUPercent > infos[j].CPUPercent
		}
		return infos[i].MemBytes > infos[j].MemBytes
	})

	if len(infos) > topN {
		infos = infos[:topN]
	}
	return infos
}
