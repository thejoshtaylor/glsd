package gsd2

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"sort"
	"testing"

	protocol "github.com/gsd-build/protocol-go"
)

// copyTestdata copies testdata/<src> into <destDir>/<src>, creating parent dirs as needed.
func copyTestdata(t *testing.T, src, destDir string) {
	t.Helper()
	srcPath := filepath.Join("testdata", src)
	dstPath := filepath.Join(destDir, src)

	if err := os.MkdirAll(filepath.Dir(dstPath), 0o755); err != nil {
		t.Fatalf("copyTestdata: mkdir %s: %v", filepath.Dir(dstPath), err)
	}

	in, err := os.Open(srcPath)
	if err != nil {
		t.Fatalf("copyTestdata: open %s: %v", srcPath, err)
	}
	defer in.Close()

	out, err := os.Create(dstPath)
	if err != nil {
		t.Fatalf("copyTestdata: create %s: %v", dstPath, err)
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		t.Fatalf("copyTestdata: copy %s → %s: %v", srcPath, dstPath, err)
	}
}

// newBase returns a fresh Gsd2QueryResult base for testing.
func newBase() *protocol.Gsd2QueryResult {
	return &protocol.Gsd2QueryResult{}
}

// TestHandleHealth covers the health parser.
func TestHandleHealth(t *testing.T) {
	tests := []struct {
		name           string
		setup          func(dir string)
		wantOK         bool
		wantMilestone  string
		wantPhase      string
	}{
		{
			name: "happy_path",
			setup: func(dir string) {
				copyTestdata(t, "STATE.md", dir)
			},
			wantOK:        true,
			wantMilestone: "M001-test: Test Milestone",
			wantPhase:     "planning",
		},
		{
			name:   "missing_file",
			setup:  func(dir string) {},
			wantOK: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			tc.setup(dir)

			result := handleHealth(newBase(), "v0.0.0-test", dir)

			if result.OK != tc.wantOK {
				t.Errorf("OK = %v, want %v", result.OK, tc.wantOK)
			}

			var data map[string]string
			if err := json.Unmarshal(result.Data, &data); err != nil {
				t.Fatalf("unmarshal data: %v", err)
			}

			if data["status"] != "online" {
				t.Errorf("status = %q, want %q", data["status"], "online")
			}
			if tc.wantMilestone != "" && data["activeMilestone"] != tc.wantMilestone {
				t.Errorf("activeMilestone = %q, want %q", data["activeMilestone"], tc.wantMilestone)
			}
			if tc.wantPhase != "" && data["phase"] != tc.wantPhase {
				t.Errorf("phase = %q, want %q", data["phase"], tc.wantPhase)
			}
			if tc.name == "missing_file" {
				if _, ok := data["activeMilestone"]; ok {
					t.Error("activeMilestone should be absent when STATE.md is missing")
				}
			}
		})
	}
}

// TestHandleDeriveState covers the derive-state parser.
func TestHandleDeriveState(t *testing.T) {
	tests := []struct {
		name          string
		setup         func(dir string)
		wantOK        bool
		wantKey       string
		wantVal       string
		wantEmptyData bool
	}{
		{
			name: "happy_path",
			setup: func(dir string) {
				copyTestdata(t, "STATE.md", dir)
			},
			wantOK:  true,
			wantKey: "Active Milestone",
			wantVal: "M001-test: Test Milestone",
		},
		{
			name:          "missing_file",
			setup:         func(dir string) {},
			wantOK:        true,
			wantEmptyData: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			tc.setup(dir)

			result := handleDeriveState(newBase(), dir)

			if result.OK != tc.wantOK {
				t.Errorf("OK = %v, want %v", result.OK, tc.wantOK)
			}

			var data map[string]string
			if err := json.Unmarshal(result.Data, &data); err != nil {
				t.Fatalf("unmarshal data: %v", err)
			}

			if tc.wantEmptyData && len(data) != 0 {
				t.Errorf("expected empty map, got %v", data)
			}
			if tc.wantKey != "" {
				if val, ok := data[tc.wantKey]; !ok {
					t.Errorf("key %q missing from data", tc.wantKey)
				} else if val != tc.wantVal {
					t.Errorf("data[%q] = %q, want %q", tc.wantKey, val, tc.wantVal)
				}
			}
		})
	}
}

// TestHandleListMilestones covers the list-milestones parser.
func TestHandleListMilestones(t *testing.T) {
	tests := []struct {
		name        string
		setup       func(dir string)
		wantOK      bool
		wantLen     int
		wantFirstID string
	}{
		{
			name: "happy_path",
			setup: func(dir string) {
				copyTestdata(t, "state-manifest.json", dir)
			},
			wantOK:      true,
			wantLen:     1,
			wantFirstID: "M001-test",
		},
		{
			name:    "missing_file",
			setup:   func(dir string) {},
			wantOK:  true,
			wantLen: 0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			tc.setup(dir)

			result := handleListMilestones(newBase(), dir)

			if result.OK != tc.wantOK {
				t.Errorf("OK = %v, want %v", result.OK, tc.wantOK)
			}

			var milestones []milestoneEntry
			if err := json.Unmarshal(result.Data, &milestones); err != nil {
				t.Fatalf("unmarshal data: %v", err)
			}

			if len(milestones) != tc.wantLen {
				t.Errorf("len(milestones) = %d, want %d", len(milestones), tc.wantLen)
			}
			if tc.wantFirstID != "" && len(milestones) > 0 {
				if milestones[0].ID != tc.wantFirstID {
					t.Errorf("milestones[0].ID = %q, want %q", milestones[0].ID, tc.wantFirstID)
				}
			}
		})
	}
}

// TestHandleGetMilestone covers the get-milestone parser.
func TestHandleGetMilestone(t *testing.T) {
	makeMsg := func(milestoneID string) *protocol.Gsd2Query {
		params, _ := json.Marshal(map[string]string{
			"projectPath": "/ignored",
			"milestoneId": milestoneID,
		})
		return &protocol.Gsd2Query{
			Params: json.RawMessage(params),
		}
	}

	tests := []struct {
		name        string
		setup       func(dir string)
		msg         *protocol.Gsd2Query
		wantOK      bool
		wantSlices  int
		wantS01Done bool
		wantS02Done bool
	}{
		{
			name: "happy_path",
			setup: func(dir string) {
				copyTestdata(t, "milestones/M001-test/M001-test-ROADMAP.md", dir)
			},
			msg:         makeMsg("M001-test"),
			wantOK:      true,
			wantSlices:  2,
			wantS01Done: true,
			wantS02Done: false,
		},
		{
			name:       "missing_file",
			setup:      func(dir string) {},
			msg:        makeMsg("M001-test"),
			wantOK:     true,
			wantSlices: 0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			tc.setup(dir)

			result := handleGetMilestone(newBase(), tc.msg, dir)

			if result.OK != tc.wantOK {
				t.Errorf("OK = %v, want %v", result.OK, tc.wantOK)
			}

			var data struct {
				MilestoneID string       `json:"milestoneId"`
				Slices      []sliceEntry `json:"slices"`
			}
			if err := json.Unmarshal(result.Data, &data); err != nil {
				t.Fatalf("unmarshal data: %v", err)
			}

			if len(data.Slices) != tc.wantSlices {
				t.Errorf("len(slices) = %d, want %d", len(data.Slices), tc.wantSlices)
			}
			if tc.wantSlices >= 2 {
				// Find S01 and S02 by ID
				sliceByID := map[string]sliceEntry{}
				for _, s := range data.Slices {
					sliceByID[s.ID] = s
				}
				if s, ok := sliceByID["S01"]; ok {
					if s.Done != tc.wantS01Done {
						t.Errorf("S01.Done = %v, want %v", s.Done, tc.wantS01Done)
					}
				} else {
					t.Error("S01 not found in slices")
				}
				if s, ok := sliceByID["S02"]; ok {
					if s.Done != tc.wantS02Done {
						t.Errorf("S02.Done = %v, want %v", s.Done, tc.wantS02Done)
					}
				} else {
					t.Error("S02 not found in slices")
				}
			}
		})
	}
}

// TestHandleListSessions covers the list-sessions parser.
func TestHandleListSessions(t *testing.T) {
	tests := []struct {
		name       string
		setup      func(dir string)
		wantOK     bool
		wantLen    int
		wantFirstID string
	}{
		{
			name: "happy_path",
			setup: func(dir string) {
				copyTestdata(t, "metrics.json", dir)
			},
			wantOK:      true,
			wantLen:     1,
			wantFirstID: "M001-test/S01",
		},
		{
			name:    "missing_file",
			setup:   func(dir string) {},
			wantOK:  true,
			wantLen: 0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			tc.setup(dir)

			result := handleListSessions(newBase(), dir)

			if result.OK != tc.wantOK {
				t.Errorf("OK = %v, want %v", result.OK, tc.wantOK)
			}

			var data struct {
				Sessions []sessionEntry `json:"sessions"`
			}
			if err := json.Unmarshal(result.Data, &data); err != nil {
				t.Fatalf("unmarshal data: %v", err)
			}

			if len(data.Sessions) != tc.wantLen {
				t.Errorf("len(sessions) = %d, want %d", len(data.Sessions), tc.wantLen)
			}
			if tc.wantFirstID != "" && len(data.Sessions) > 0 {
				if data.Sessions[0].ID != tc.wantFirstID {
					t.Errorf("sessions[0].ID = %q, want %q", data.Sessions[0].ID, tc.wantFirstID)
				}
			}
		})
	}
}

// TestHandleGetSkillHealth covers the get-skill-health parser.
func TestHandleGetSkillHealth(t *testing.T) {
	tests := []struct {
		name       string
		setup      func(dir string)
		wantOK     bool
		wantSkills int
		wantNames  []string
	}{
		{
			name: "happy_path",
			setup: func(dir string) {
				copyTestdata(t, "metrics.json", dir)
			},
			wantOK:     true,
			wantSkills: 2,
			wantNames:  []string{"frontend-design", "lint"},
		},
		{
			name:       "missing_file",
			setup:      func(dir string) {},
			wantOK:     true,
			wantSkills: 0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			tc.setup(dir)

			result := handleGetSkillHealth(newBase(), dir)

			if result.OK != tc.wantOK {
				t.Errorf("OK = %v, want %v", result.OK, tc.wantOK)
			}

			var data struct {
				Skills []skillHealthEntry `json:"skills"`
			}
			if err := json.Unmarshal(result.Data, &data); err != nil {
				t.Fatalf("unmarshal data: %v", err)
			}

			if len(data.Skills) != tc.wantSkills {
				t.Errorf("len(skills) = %d, want %d", len(data.Skills), tc.wantSkills)
			}

			if len(tc.wantNames) > 0 {
				gotNames := make([]string, len(data.Skills))
				for i, s := range data.Skills {
					gotNames[i] = s.Name
					if s.UseCount != 1 {
						t.Errorf("skill %q useCount = %d, want 1", s.Name, s.UseCount)
					}
				}
				sort.Strings(gotNames)
				wantSorted := make([]string, len(tc.wantNames))
				copy(wantSorted, tc.wantNames)
				sort.Strings(wantSorted)
				for i, name := range wantSorted {
					if i >= len(gotNames) || gotNames[i] != name {
						t.Errorf("skill names mismatch: got %v, want %v", gotNames, wantSorted)
						break
					}
				}
			}
		})
	}
}

// TestHandleGetForensicsReport covers the get-forensics-report parser.
func TestHandleGetForensicsReport(t *testing.T) {
	tests := []struct {
		name            string
		setup           func(dir string)
		wantOK          bool
		wantEvents      int
		wantFirstTrigger string
	}{
		{
			name: "happy_path",
			setup: func(dir string) {
				copyTestdata(t, "event-log.jsonl", dir)
			},
			wantOK:           true,
			wantEvents:       2,
			wantFirstTrigger: "plan-milestone",
		},
		{
			name:       "missing_file",
			setup:      func(dir string) {},
			wantOK:     true,
			wantEvents: 0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			tc.setup(dir)

			result := handleGetForensicsReport(newBase(), dir)

			if result.OK != tc.wantOK {
				t.Errorf("OK = %v, want %v", result.OK, tc.wantOK)
			}

			var data struct {
				Events []forensicsEvent `json:"events"`
			}
			if err := json.Unmarshal(result.Data, &data); err != nil {
				t.Fatalf("unmarshal data: %v", err)
			}

			if len(data.Events) != tc.wantEvents {
				t.Errorf("len(events) = %d, want %d", len(data.Events), tc.wantEvents)
			}
			if tc.wantFirstTrigger != "" && len(data.Events) > 0 {
				if data.Events[0].Trigger != tc.wantFirstTrigger {
					t.Errorf("events[0].Trigger = %q, want %q", data.Events[0].Trigger, tc.wantFirstTrigger)
				}
			}
		})
	}
}
