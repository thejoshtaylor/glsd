package gsd2

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	protocol "github.com/gsd-build/protocol-go"
)

// autoLockFile mirrors the structure of .gsd/auto.lock.
type autoLockFile struct {
	Pid       int    `json:"pid"`
	StartedAt string `json:"startedAt"`
	UnitType  string `json:"unitType"`
	UnitId    string `json:"unitId"`
}

// repoMetaFile mirrors the structure of .gsd/repo-meta.json.
type repoMetaFile struct {
	GitRoot   string `json:"gitRoot"`
	RemoteUrl string `json:"remoteUrl"`
}

// reportsIndexData mirrors the structure of .gsd/reports-index.json.
type reportsIndexData struct {
	Version     int                `json:"version"`
	ProjectName string             `json:"project_name"`
	ProjectPath string             `json:"project_path"`
	GsdVersion  string             `json:"gsd_version"`
	Entries     []json.RawMessage  `json:"entries"`
}

// visualizerData mirrors the structure of .gsd/visualizer.json.
type visualizerData struct {
	Milestones      []json.RawMessage `json:"milestones"`
	Tree            []json.RawMessage `json:"tree"`
	CostByMilestone []json.RawMessage `json:"cost_by_milestone"`
	CostByModel     []json.RawMessage `json:"cost_by_model"`
	Timeline        []json.RawMessage `json:"timeline"`
}

// getSliceParams are the params expected by get-slice.
type getSliceParams struct {
	MilestoneID string `json:"milestoneId"`
	SliceID     string `json:"sliceId"`
}

// getWorktreeDiffParams are the params expected by get-worktree-diff.
type getWorktreeDiffParams struct {
	WorktreeName string `json:"worktreeName"`
}

// handleGetSlice reads a slice PLAN.md and returns its raw content.
func handleGetSlice(base *protocol.Gsd2QueryResult, msg *protocol.Gsd2Query, gsdDir string) *protocol.Gsd2QueryResult {
	var params getSliceParams
	if msg.Params != nil {
		_ = json.Unmarshal(msg.Params, &params)
	}

	content := ""
	if params.MilestoneID != "" && params.SliceID != "" {
		planPath := filepath.Join(gsdDir, "milestones", params.MilestoneID, "slices", params.SliceID, params.SliceID+"-PLAN.md")
		if raw, err := os.ReadFile(planPath); err == nil {
			content = string(raw)
		}
	}

	result := map[string]interface{}{
		"id":           params.SliceID,
		"title":        "",
		"content":      content,
		"done":         false,
		"risk":         nil,
		"dependencies": []interface{}{},
		"tasks":        []interface{}{},
	}
	data, _ := json.Marshal(result)
	base.OK = true
	base.Data = data
	return base
}

// handleGetKnowledge reads KNOWLEDGE.md and returns its content.
func handleGetKnowledge(base *protocol.Gsd2QueryResult, gsdDir string) *protocol.Gsd2QueryResult {
	knowledgePath := filepath.Join(gsdDir, "KNOWLEDGE.md")
	content := ""
	lastModified := ""
	filePath := ""

	if raw, err := os.ReadFile(knowledgePath); err == nil {
		content = string(raw)
		filePath = knowledgePath
		if info, err := os.Stat(knowledgePath); err == nil {
			lastModified = info.ModTime().UTC().Format(time.RFC3339)
		}
	}

	result := map[string]interface{}{
		"entries":       []interface{}{},
		"file_path":     filePath,
		"last_modified": lastModified,
		"content":       content,
	}
	data, _ := json.Marshal(result)
	base.OK = true
	base.Data = data
	return base
}

// handleGetReportsIndex reads reports-index.json and returns its parsed content.
func handleGetReportsIndex(base *protocol.Gsd2QueryResult, gsdDir string) *protocol.Gsd2QueryResult {
	indexPath := filepath.Join(gsdDir, "reports-index.json")
	var rd reportsIndexData
	rd.Entries = []json.RawMessage{}

	if raw, err := os.ReadFile(indexPath); err == nil {
		_ = json.Unmarshal(raw, &rd)
		if rd.Entries == nil {
			rd.Entries = []json.RawMessage{}
		}
	}

	data, _ := json.Marshal(rd)
	base.OK = true
	base.Data = data
	return base
}

// handleGetVisualizerData reads visualizer.json and returns its content.
func handleGetVisualizerData(base *protocol.Gsd2QueryResult, gsdDir string) *protocol.Gsd2QueryResult {
	vizPath := filepath.Join(gsdDir, "visualizer.json")
	var vd visualizerData
	vd.Milestones = []json.RawMessage{}
	vd.Tree = []json.RawMessage{}
	vd.CostByMilestone = []json.RawMessage{}
	vd.CostByModel = []json.RawMessage{}
	vd.Timeline = []json.RawMessage{}

	if raw, err := os.ReadFile(vizPath); err == nil {
		_ = json.Unmarshal(raw, &vd)
		if vd.Milestones == nil {
			vd.Milestones = []json.RawMessage{}
		}
		if vd.Tree == nil {
			vd.Tree = []json.RawMessage{}
		}
		if vd.CostByMilestone == nil {
			vd.CostByMilestone = []json.RawMessage{}
		}
		if vd.CostByModel == nil {
			vd.CostByModel = []json.RawMessage{}
		}
		if vd.Timeline == nil {
			vd.Timeline = []json.RawMessage{}
		}
	}

	data, _ := json.Marshal(vd)
	base.OK = true
	base.Data = data
	return base
}

// handleGetUndoInfo reads auto.lock and metrics.json to return undo context.
func handleGetUndoInfo(base *protocol.Gsd2QueryResult, gsdDir string) *protocol.Gsd2QueryResult {
	lockPath := filepath.Join(gsdDir, "auto.lock")
	var al autoLockFile
	fileExists := false

	if raw, err := os.ReadFile(lockPath); err == nil {
		fileExists = true
		_ = json.Unmarshal(raw, &al)
	}

	completedCount := 0
	metricsPath := filepath.Join(gsdDir, "metrics.json")
	if raw, err := os.ReadFile(metricsPath); err == nil {
		var mf metricsFile
		if json.Unmarshal(raw, &mf) == nil {
			completedCount = len(mf.Units)
		}
	}

	result := map[string]interface{}{
		"last_unit_type":        al.UnitType,
		"last_unit_id":          al.UnitId,
		"last_unit_cost":        0,
		"completed_units_count": completedCount,
		"file_exists":           fileExists,
	}
	data, _ := json.Marshal(result)
	base.OK = true
	base.Data = data
	return base
}

// handleGetRecoveryInfo reads auto.lock and checks process liveness.
func handleGetRecoveryInfo(base *protocol.Gsd2QueryResult, gsdDir string) *protocol.Gsd2QueryResult {
	lockPath := filepath.Join(gsdDir, "auto.lock")
	var al autoLockFile
	lockExists := false

	if raw, err := os.ReadFile(lockPath); err == nil {
		lockExists = true
		_ = json.Unmarshal(raw, &al)
	}

	isAlive := false
	if lockExists && al.Pid > 0 {
		err := syscall.Kill(al.Pid, 0)
		isAlive = err == nil || err == syscall.EPERM
	}

	suggestedAction := "none"
	if lockExists {
		if isAlive {
			suggestedAction = "running"
		} else {
			suggestedAction = "stale-lock"
		}
	}

	result := map[string]interface{}{
		"lock_exists":       lockExists,
		"pid":               al.Pid,
		"started_at":        al.StartedAt,
		"unit_type":         al.UnitType,
		"unit_id":           al.UnitId,
		"unit_started_at":   "",
		"is_process_alive":  isAlive,
		"suggested_action":  suggestedAction,
		"session_file":      "",
	}
	data, _ := json.Marshal(result)
	base.OK = true
	base.Data = data
	return base
}

// historyUnit is one entry in the get-history response.
type historyUnit struct {
	ID        string  `json:"id"`
	Type      string  `json:"type"`
	Model     string  `json:"model"`
	StartedAt int64   `json:"started_at"`
	Cost      float64 `json:"cost"`
}

// handleGetHistory reads metrics.json and returns aggregated history.
func handleGetHistory(base *protocol.Gsd2QueryResult, gsdDir string) *protocol.Gsd2QueryResult {
	units := []historyUnit{}
	byPhase := map[string]int{}
	bySlice := map[string]int{}
	byModel := map[string]int{}

	metricsPath := filepath.Join(gsdDir, "metrics.json")
	if raw, err := os.ReadFile(metricsPath); err == nil {
		var mf metricsFile
		if json.Unmarshal(raw, &mf) == nil {
			for _, u := range mf.Units {
				units = append(units, historyUnit{
					ID:        u.ID,
					Type:      u.Type,
					Model:     u.Model,
					StartedAt: u.StartedAt,
					Cost:      0,
				})
				byPhase[u.Type]++
				bySlice[u.ID]++
				byModel[u.Model]++
			}
		}
	}

	type kvInt struct {
		Key   string `json:"key"`
		Count int    `json:"count"`
	}
	toKVList := func(m map[string]int) []kvInt {
		out := []kvInt{}
		for k, v := range m {
			out = append(out, kvInt{Key: k, Count: v})
		}
		return out
	}

	type phaseEntry struct {
		Phase string `json:"phase"`
		Count int    `json:"count"`
	}
	phaseList := []phaseEntry{}
	for k, v := range byPhase {
		phaseList = append(phaseList, phaseEntry{Phase: k, Count: v})
	}

	type sliceCountEntry struct {
		SliceID string `json:"slice_id"`
		Count   int    `json:"count"`
	}
	sliceList := []sliceCountEntry{}
	for k, v := range bySlice {
		sliceList = append(sliceList, sliceCountEntry{SliceID: k, Count: v})
	}

	modelKV := toKVList(byModel)
	type modelEntry struct {
		Model string `json:"model"`
		Count int    `json:"count"`
	}
	modelList := []modelEntry{}
	for _, kv := range modelKV {
		modelList = append(modelList, modelEntry{Model: kv.Key, Count: kv.Count})
	}

	result := map[string]interface{}{
		"units": units,
		"totals": map[string]interface{}{
			"count": len(units),
			"cost":  0,
		},
		"by_phase": phaseList,
		"by_slice": sliceList,
		"by_model": modelList,
	}
	data, _ := json.Marshal(result)
	base.OK = true
	base.Data = data
	return base
}

// hookEntry is one parsed hook from PREFERENCES.md.
type hookEntry struct {
	Name      string   `json:"name"`
	HookType  string   `json:"hook_type"`
	Triggers  []string `json:"triggers"`
	Action    string   `json:"action"`
	Artifact  string   `json:"artifact"`
	MaxCycles int      `json:"max_cycles"`
}

// handleGetHooks parses PREFERENCES.md YAML frontmatter for hooks.
func handleGetHooks(base *protocol.Gsd2QueryResult, gsdDir string) *protocol.Gsd2QueryResult {
	hooks := []hookEntry{}
	prefsExists := false

	prefsPath := filepath.Join(gsdDir, "PREFERENCES.md")
	if f, err := os.Open(prefsPath); err == nil {
		defer f.Close()
		prefsExists = true

		scanner := bufio.NewScanner(f)
		inFrontmatter := false
		frontmatterDone := false
		dashCount := 0
		currentHookType := ""

		for scanner.Scan() {
			line := scanner.Text()

			if !frontmatterDone {
				if strings.TrimSpace(line) == "---" {
					dashCount++
					if dashCount == 1 {
						inFrontmatter = true
						continue
					} else if dashCount == 2 {
						frontmatterDone = true
						break
					}
				}
				if !inFrontmatter {
					continue
				}

				trimmed := strings.TrimSpace(line)
				if trimmed == "post_unit_hooks:" {
					currentHookType = "post_unit"
					continue
				}
				if trimmed == "pre_dispatch_hooks:" {
					currentHookType = "pre_dispatch"
					continue
				}
				// Detect section change (non-indented key)
				if len(line) > 0 && line[0] != ' ' && line[0] != '\t' && strings.HasSuffix(trimmed, ":") {
					if trimmed != "post_unit_hooks:" && trimmed != "pre_dispatch_hooks:" {
						currentHookType = ""
					}
				}
				if currentHookType != "" && strings.HasPrefix(line, "  - name:") {
					name := strings.TrimSpace(strings.TrimPrefix(trimmed, "- name:"))
					hooks = append(hooks, hookEntry{
						Name:      name,
						HookType:  currentHookType,
						Triggers:  []string{},
						Action:    "",
						Artifact:  "",
						MaxCycles: 0,
					})
				}
			}
		}
	}

	result := map[string]interface{}{
		"hooks":              hooks,
		"preferences_exists": prefsExists,
	}
	data, _ := json.Marshal(result)
	base.OK = true
	base.Data = data
	return base
}

// worktreeEntry is one entry in the list-worktrees response.
type worktreeEntry struct {
	Name          string `json:"name"`
	Branch        string `json:"branch"`
	Path          string `json:"path"`
	Exists        bool   `json:"exists"`
	AddedCount    int    `json:"added_count"`
	ModifiedCount int    `json:"modified_count"`
	RemovedCount  int    `json:"removed_count"`
}

// handleListWorktrees scans the worktrees/ directory.
func handleListWorktrees(base *protocol.Gsd2QueryResult, gsdDir string) *protocol.Gsd2QueryResult {
	worktrees := []worktreeEntry{}

	worktreesDir := filepath.Join(gsdDir, "worktrees")
	if entries, err := os.ReadDir(worktreesDir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				worktrees = append(worktrees, worktreeEntry{
					Name:          e.Name(),
					Branch:        "",
					Path:          filepath.Join(gsdDir, "worktrees", e.Name()),
					Exists:        true,
					AddedCount:    0,
					ModifiedCount: 0,
					RemovedCount:  0,
				})
			}
		}
	}

	data, _ := json.Marshal(worktrees)
	base.OK = true
	base.Data = data
	return base
}

// handleGetWorktreeDiff always returns an empty diff (diff.json never exists in practice).
func handleGetWorktreeDiff(base *protocol.Gsd2QueryResult, msg *protocol.Gsd2Query, gsdDir string) *protocol.Gsd2QueryResult {
	result := map[string]interface{}{
		"added":          []interface{}{},
		"modified":       []interface{}{},
		"removed":        []interface{}{},
		"added_count":    0,
		"modified_count": 0,
		"removed_count":  0,
	}
	data, _ := json.Marshal(result)
	base.OK = true
	base.Data = data
	return base
}

// handleGetGitSummary reads repo-meta.json and returns a git summary.
func handleGetGitSummary(base *protocol.Gsd2QueryResult, gsdDir string) *protocol.Gsd2QueryResult {
	repoMetaPath := filepath.Join(gsdDir, "repo-meta.json")
	var rm repoMetaFile
	hasGit := false

	if raw, err := os.ReadFile(repoMetaPath); err == nil {
		if json.Unmarshal(raw, &rm) == nil && rm.GitRoot != "" {
			if _, err := os.Stat(rm.GitRoot); err == nil {
				hasGit = true
			}
		}
	}

	result := map[string]interface{}{
		"branch":          "",
		"is_dirty":        false,
		"staged_count":    0,
		"unstaged_count":  0,
		"untracked_count": 0,
		"recent_commits":  []interface{}{},
		"ahead":           0,
		"behind":          0,
		"has_git":         hasGit,
		"remote_url":      rm.RemoteUrl,
	}
	data, _ := json.Marshal(result)
	base.OK = true
	base.Data = data
	return base
}
