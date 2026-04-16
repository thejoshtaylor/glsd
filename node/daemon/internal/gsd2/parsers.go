package gsd2

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	protocol "github.com/thejoshtaylor/glsd/node/protocol-go"
)

// handleHealth reads STATE.md and returns status + daemon version + active milestone/slice/phase.
// Missing STATE.md is not an error — those fields are omitted.
func handleHealth(base *protocol.Gsd2QueryResult, daemonVersion, gsdDir string) *protocol.Gsd2QueryResult {
	result := map[string]string{
		"status":        "online",
		"daemonVersion": daemonVersion,
	}

	statePath := filepath.Join(gsdDir, "STATE.md")
	if content, err := os.ReadFile(statePath); err == nil {
		reMilestone := regexp.MustCompile(`\*\*Active Milestone:\*\* (.+)`)
		reSlice := regexp.MustCompile(`\*\*Active Slice:\*\* (.+)`)
		rePhase := regexp.MustCompile(`\*\*Phase:\*\* (.+)`)

		if m := reMilestone.FindSubmatch(content); m != nil {
			result["activeMilestone"] = strings.TrimSpace(string(m[1]))
		}
		if m := reSlice.FindSubmatch(content); m != nil {
			result["activeSlice"] = strings.TrimSpace(string(m[1]))
		}
		if m := rePhase.FindSubmatch(content); m != nil {
			result["phase"] = strings.TrimSpace(string(m[1]))
		}
	}

	data, _ := json.Marshal(result)
	base.OK = true
	base.Data = data
	return base
}

// handleDeriveState reads STATE.md and returns all **Field:** Value pairs as a map.
// Missing file returns ok:true with empty map.
func handleDeriveState(base *protocol.Gsd2QueryResult, gsdDir string) *protocol.Gsd2QueryResult {
	fields := map[string]string{}

	statePath := filepath.Join(gsdDir, "STATE.md")
	if content, err := os.ReadFile(statePath); err == nil {
		re := regexp.MustCompile(`\*\*([^:]+):\*\* (.+)`)
		for _, m := range re.FindAllSubmatch(content, -1) {
			key := strings.TrimSpace(string(m[1]))
			val := strings.TrimSpace(string(m[2]))
			fields[key] = val
		}
	}

	data, _ := json.Marshal(fields)
	base.OK = true
	base.Data = data
	return base
}

// milestoneEntry is the shape of entries in state-manifest.json and the fallback scan result.
type milestoneEntry struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Status string `json:"status"`
}

// handleListMilestones reads state-manifest.json; falls back to scanning milestones/ subdirs.
func handleListMilestones(base *protocol.Gsd2QueryResult, gsdDir string) *protocol.Gsd2QueryResult {
	var milestones []milestoneEntry

	manifestPath := filepath.Join(gsdDir, "state-manifest.json")
	if raw, err := os.ReadFile(manifestPath); err == nil {
		var manifest struct {
			Version    int              `json:"version"`
			Milestones []milestoneEntry `json:"milestones"`
		}
		if json.Unmarshal(raw, &manifest) == nil {
			milestones = manifest.Milestones
		}
	} else {
		milestonesDir := filepath.Join(gsdDir, "milestones")
		if entries, err := os.ReadDir(milestonesDir); err == nil {
			for _, e := range entries {
				if e.IsDir() {
					milestones = append(milestones, milestoneEntry{
						ID:     e.Name(),
						Title:  "",
						Status: "unknown",
					})
				}
			}
		}
	}

	if milestones == nil {
		milestones = []milestoneEntry{}
	}

	data, _ := json.Marshal(milestones)
	base.OK = true
	base.Data = data
	return base
}

// sliceEntry represents one row from a ROADMAP.md table.
type sliceEntry struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Risk    string `json:"risk"`
	Depends string `json:"depends"`
	Done    bool   `json:"done"`
}

// getMilestoneParams are the params expected by get-milestone.
type getMilestoneParams struct {
	ProjectPath string `json:"projectPath"`
	MilestoneID string `json:"milestoneId"`
}

// handleGetMilestone reads a ROADMAP.md and parses the slice table.
func handleGetMilestone(base *protocol.Gsd2QueryResult, msg *protocol.Gsd2Query, gsdDir string) *protocol.Gsd2QueryResult {
	var params getMilestoneParams
	if msg.Params != nil {
		_ = json.Unmarshal(msg.Params, &params)
	}

	var slices []sliceEntry

	if params.MilestoneID != "" {
		roadmapPath := filepath.Join(gsdDir, "milestones", params.MilestoneID, params.MilestoneID+"-ROADMAP.md")
		if raw, err := os.ReadFile(roadmapPath); err == nil {
			for _, line := range strings.Split(string(raw), "\n") {
				line = strings.TrimSpace(line)
				if !strings.HasPrefix(line, "|") {
					continue
				}
				cells := strings.Split(line, "|")
				// After split by "|", first and last elements are empty (leading/trailing |)
				// so meaningful cells start at index 1
				var cols []string
				for _, c := range cells {
					cols = append(cols, strings.TrimSpace(c))
				}
				// cols[0] is empty, cols[1..N-1] are the real columns, cols[N] is empty
				if len(cols) < 3 {
					continue
				}
				// Skip header row (first cell == "ID") and separator rows (contain ---)
				col1 := cols[1]
				if col1 == "ID" || strings.Contains(col1, "---") {
					continue
				}
				// cols: [empty, id, title, risk, depends, done, after?, empty]
				if len(cols) < 7 {
					continue
				}
				done := cols[5] == "✅"
				slices = append(slices, sliceEntry{
					ID:      cols[1],
					Title:   cols[2],
					Risk:    cols[3],
					Depends: cols[4],
					Done:    done,
				})
			}
		}
	}

	if slices == nil {
		slices = []sliceEntry{}
	}

	result := map[string]interface{}{
		"milestoneId": params.MilestoneID,
		"slices":      slices,
	}
	data, _ := json.Marshal(result)
	base.OK = true
	base.Data = data
	return base
}

// sessionEntry is one unit from metrics.json mapped to a session summary.
type sessionEntry struct {
	ID          string  `json:"id"`
	Type        string  `json:"type"`
	Model       string  `json:"model"`
	StartedAt   int64   `json:"startedAt"`
	FinishedAt  int64   `json:"finishedAt"`
	Cost        float64 `json:"cost"`
	ToolCalls   int     `json:"toolCalls"`
}

// metricsFile mirrors the structure of metrics.json.
type metricsFile struct {
	Version int `json:"version"`
	Units   []struct {
		Type        string   `json:"Type"`
		ID          string   `json:"ID"`
		Model       string   `json:"Model"`
		StartedAt   int64    `json:"StartedAt"`
		FinishedAt  int64    `json:"FinishedAt"`
		Cost        float64  `json:"Cost"`
		ToolCalls   int      `json:"ToolCalls"`
		Skills      []string `json:"Skills"`
	} `json:"Units"`
}

// handleListSessions reads metrics.json and returns a list of sessions.
func handleListSessions(base *protocol.Gsd2QueryResult, gsdDir string) *protocol.Gsd2QueryResult {
	sessions := []sessionEntry{}

	metricsPath := filepath.Join(gsdDir, "metrics.json")
	if raw, err := os.ReadFile(metricsPath); err == nil {
		var mf metricsFile
		if json.Unmarshal(raw, &mf) == nil {
			for _, u := range mf.Units {
				sessions = append(sessions, sessionEntry{
					ID:         u.ID,
					Type:       u.Type,
					Model:      u.Model,
					StartedAt:  u.StartedAt,
					FinishedAt: u.FinishedAt,
					Cost:       u.Cost,
					ToolCalls:  u.ToolCalls,
				})
			}
		}
	}

	result := map[string]interface{}{"sessions": sessions}
	data, _ := json.Marshal(result)
	base.OK = true
	base.Data = data
	return base
}

// skillHealthEntry summarises usage and cost for one skill name.
type skillHealthEntry struct {
	Name     string  `json:"name"`
	UseCount int     `json:"useCount"`
	AvgCost  float64 `json:"avgCost"`
}

// handleGetSkillHealth aggregates skill usage from metrics.json.
func handleGetSkillHealth(base *protocol.Gsd2QueryResult, gsdDir string) *protocol.Gsd2QueryResult {
	type accum struct {
		count     int
		totalCost float64
	}
	bySkill := map[string]*accum{}

	metricsPath := filepath.Join(gsdDir, "metrics.json")
	if raw, err := os.ReadFile(metricsPath); err == nil {
		var mf metricsFile
		if json.Unmarshal(raw, &mf) == nil {
			for _, u := range mf.Units {
				for _, skill := range u.Skills {
					if skill == "" {
						continue
					}
					if _, ok := bySkill[skill]; !ok {
						bySkill[skill] = &accum{}
					}
					bySkill[skill].count++
					bySkill[skill].totalCost += u.Cost
				}
			}
		}
	}

	skills := []skillHealthEntry{}
	for name, a := range bySkill {
		avgCost := 0.0
		if a.count > 0 {
			avgCost = a.totalCost / float64(a.count)
		}
		skills = append(skills, skillHealthEntry{
			Name:     name,
			UseCount: a.count,
			AvgCost:  avgCost,
		})
	}

	result := map[string]interface{}{
		"skills":           skills,
		"stale_skills":     []interface{}{},
		"declining_skills": []interface{}{},
	}
	data, _ := json.Marshal(result)
	base.OK = true
	base.Data = data
	return base
}

// forensicsEvent is one entry from event-log.jsonl remapped for the response.
type forensicsEvent struct {
	Trigger   string `json:"trigger"`
	Ts        string `json:"ts"`
	Actor     string `json:"actor"`
	SessionID string `json:"session_id"`
}

// handleGetForensicsReport reads event-log.jsonl and returns remapped events.
func handleGetForensicsReport(base *protocol.Gsd2QueryResult, gsdDir string) *protocol.Gsd2QueryResult {
	events := []forensicsEvent{}

	logPath := filepath.Join(gsdDir, "event-log.jsonl")
	if f, err := os.Open(logPath); err == nil {
		defer f.Close()
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			var raw struct {
				V         int    `json:"v"`
				Cmd       string `json:"cmd"`
				Ts        string `json:"ts"`
				Actor     string `json:"actor"`
				Hash      string `json:"hash"`
				SessionID string `json:"session_id"`
			}
			if json.Unmarshal([]byte(line), &raw) == nil {
				events = append(events, forensicsEvent{
					Trigger:   raw.Cmd,
					Ts:        raw.Ts,
					Actor:     raw.Actor,
					SessionID: raw.SessionID,
				})
			}
		}
	}

	result := map[string]interface{}{"events": events}
	data, _ := json.Marshal(result)
	base.OK = true
	base.Data = data
	return base
}
