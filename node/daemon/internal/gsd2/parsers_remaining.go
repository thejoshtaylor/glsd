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

// captureEntry is one parsed capture from CAPTURES.md.
type captureEntry struct {
	ID       string `json:"id"`
	Text     string `json:"text"`
	Captured string `json:"captured"`
	Status   string `json:"status"`
}

// handleGetCaptures reads CAPTURES.md and parses H3 sections (### CAP-) with bold fields.
// Missing file returns {ok:true, entries:[], pending_count:0, actionable_count:0}.
func handleGetCaptures(base *protocol.Gsd2QueryResult, gsdDir string) *protocol.Gsd2QueryResult {
	entries := []captureEntry{}
	pendingCount := 0
	actionableCount := 0

	capturesPath := filepath.Join(gsdDir, "CAPTURES.md")
	if raw, err := os.ReadFile(capturesPath); err == nil {
		reSection := regexp.MustCompile(`^### (CAP-\S+)`)
		reField := regexp.MustCompile(`^\*\*([^:]+):\*\*\s*(.+)`)

		var current *captureEntry
		for _, line := range strings.Split(string(raw), "\n") {
			if m := reSection.FindStringSubmatch(line); m != nil {
				if current != nil {
					entries = append(entries, *current)
				}
				current = &captureEntry{ID: m[1]}
				continue
			}
			if current != nil {
				if m := reField.FindStringSubmatch(line); m != nil {
					key := strings.TrimSpace(m[1])
					val := strings.TrimSpace(m[2])
					switch key {
					case "Text":
						current.Text = val
					case "Captured":
						current.Captured = val
					case "Status":
						current.Status = val
					}
				}
			}
		}
		if current != nil {
			entries = append(entries, *current)
		}

		for _, e := range entries {
			if e.Status == "pending" {
				pendingCount++
				actionableCount++
			}
		}
	}

	result := map[string]interface{}{
		"entries":          entries,
		"pending_count":    pendingCount,
		"actionable_count": actionableCount,
	}
	data, _ := json.Marshal(result)
	base.OK = true
	base.Data = data
	return base
}

// handleGetInspect reads DECISIONS.md and REQUIREMENTS.md and counts pipe-table data rows.
// Returns counts and whether each file exists.
func handleGetInspect(base *protocol.Gsd2QueryResult, gsdDir string) *protocol.Gsd2QueryResult {
	decisionsPath := filepath.Join(gsdDir, "DECISIONS.md")
	requirementsPath := filepath.Join(gsdDir, "REQUIREMENTS.md")

	decisionCount, decisionsExists := countTableRows(decisionsPath)
	requirementCount, requirementsExists := countTableRows(requirementsPath)

	result := map[string]interface{}{
		"schema_version":          "1",
		"decision_count":          decisionCount,
		"requirement_count":       requirementCount,
		"decisions_file_exists":   decisionsExists,
		"requirements_file_exists": requirementsExists,
		"recent_decisions":        []interface{}{},
		"recent_requirements":     []interface{}{},
	}
	data, _ := json.Marshal(result)
	base.OK = true
	base.Data = data
	return base
}

// countTableRows counts pipe-table data rows (lines starting with "| " that are
// not the header row or separator rows containing "---").
func countTableRows(path string) (int, bool) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return 0, false
	}
	count := 0
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "|") {
			continue
		}
		// Skip separator rows
		if strings.Contains(line, "---") {
			continue
		}
		// Parse cells to check for header row
		cells := strings.Split(line, "|")
		var cols []string
		for _, c := range cells {
			cols = append(cols, strings.TrimSpace(c))
		}
		// cols[0] is empty (leading |), cols[1] is first real column
		if len(cols) < 2 {
			continue
		}
		first := cols[1]
		// Skip header rows (common first-column header names)
		if first == "ID" || first == "Decision" || first == "Class" || first == "Key" || first == "Name" {
			continue
		}
		count++
	}
	return count, true
}

// handleGetSteerContent reads OVERRIDES.md and returns its content.
// Missing file returns {content:'', exists:false} — never ok:false.
func handleGetSteerContent(base *protocol.Gsd2QueryResult, gsdDir string) *protocol.Gsd2QueryResult {
	overridesPath := filepath.Join(gsdDir, "OVERRIDES.md")
	content := ""
	exists := false

	if raw, err := os.ReadFile(overridesPath); err == nil {
		content = string(raw)
		exists = true
	}

	result := map[string]interface{}{
		"content": content,
		"exists":  exists,
	}
	data, _ := json.Marshal(result)
	base.OK = true
	base.Data = data
	return base
}

// doctorReportEntry mirrors one line in doctor-history.jsonl.
type doctorReportEntry struct {
	OK           bool     `json:"ok"`
	Issues       []string `json:"issues"`
	FixesApplied []string `json:"fixes_applied"`
	Summary      string   `json:"summary"`
}

// handleGetDoctorReport reads doctor-history.jsonl and returns the last valid entry.
// Missing file returns an empty ok:true report.
func handleGetDoctorReport(base *protocol.Gsd2QueryResult, gsdDir string) *protocol.Gsd2QueryResult {
	empty := doctorReportEntry{
		OK:           true,
		Issues:       []string{},
		FixesApplied: []string{},
		Summary:      "",
	}

	historyPath := filepath.Join(gsdDir, "doctor-history.jsonl")
	f, err := os.Open(historyPath)
	if err != nil {
		data, _ := json.Marshal(empty)
		base.OK = true
		base.Data = data
		return base
	}
	defer f.Close()

	var last *doctorReportEntry
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var entry doctorReportEntry
		if json.Unmarshal([]byte(line), &entry) == nil {
			if entry.Issues == nil {
				entry.Issues = []string{}
			}
			if entry.FixesApplied == nil {
				entry.FixesApplied = []string{}
			}
			e := entry
			last = &e
		}
	}

	if last == nil {
		last = &empty
	}

	data, _ := json.Marshal(last)
	base.OK = true
	base.Data = data
	return base
}

// handleGetPreferences reads preferences.json and returns it as merged project preferences.
// Missing file returns {merged:{}, scopes:[], global_raw:{}, project_raw:{}}.
func handleGetPreferences(base *protocol.Gsd2QueryResult, gsdDir string) *protocol.Gsd2QueryResult {
	emptyResult := map[string]interface{}{
		"merged":      map[string]interface{}{},
		"scopes":      []interface{}{},
		"global_raw":  map[string]interface{}{},
		"project_raw": map[string]interface{}{},
	}

	prefsPath := filepath.Join(gsdDir, "preferences.json")
	raw, err := os.ReadFile(prefsPath)
	if err != nil {
		data, _ := json.Marshal(emptyResult)
		base.OK = true
		base.Data = data
		return base
	}

	var projectRaw map[string]interface{}
	if json.Unmarshal(raw, &projectRaw) != nil {
		data, _ := json.Marshal(emptyResult)
		base.OK = true
		base.Data = data
		return base
	}

	result := map[string]interface{}{
		"merged":      projectRaw,
		"scopes":      []string{"project"},
		"global_raw":  map[string]interface{}{},
		"project_raw": projectRaw,
	}
	data, _ := json.Marshal(result)
	base.OK = true
	base.Data = data
	return base
}
