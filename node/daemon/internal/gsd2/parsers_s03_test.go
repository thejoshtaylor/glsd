package gsd2

import (
	"encoding/json"
	"testing"

	protocol "github.com/gsd-build/protocol-go"
)

// TestHandleGetSlice covers the get-slice parser.
func TestHandleGetSlice(t *testing.T) {
	t.Run("happy_path", func(t *testing.T) {
		dir := t.TempDir()
		copyTestdata(t, "milestones/M001-test/slices/S01/S01-PLAN.md", dir)
		base := &protocol.Gsd2QueryResult{}
		msg := &protocol.Gsd2Query{Params: json.RawMessage(`{"milestoneId":"M001-test","sliceId":"S01"}`)}
		result := handleGetSlice(base, msg, dir)
		if !result.OK {
			t.Fatal("expected ok:true")
		}
		var data map[string]interface{}
		if err := json.Unmarshal(result.Data, &data); err != nil {
			t.Fatalf("unmarshal data: %v", err)
		}
		content, _ := data["content"].(string)
		if content == "" {
			t.Error("expected non-empty content")
		}
		if data["id"] != "S01" {
			t.Errorf("id = %v, want S01", data["id"])
		}
	})
	t.Run("missing_file", func(t *testing.T) {
		dir := t.TempDir()
		base := &protocol.Gsd2QueryResult{}
		msg := &protocol.Gsd2Query{Params: json.RawMessage(`{"milestoneId":"M001-test","sliceId":"S01"}`)}
		result := handleGetSlice(base, msg, dir)
		if !result.OK {
			t.Fatal("expected ok:true on missing file")
		}
	})
}

// TestHandleGetKnowledge covers the get-knowledge parser.
func TestHandleGetKnowledge(t *testing.T) {
	t.Run("happy_path", func(t *testing.T) {
		dir := t.TempDir()
		copyTestdata(t, "KNOWLEDGE.md", dir)
		result := handleGetKnowledge(newBase(), dir)
		if !result.OK {
			t.Fatal("expected ok:true")
		}
		var data map[string]interface{}
		if err := json.Unmarshal(result.Data, &data); err != nil {
			t.Fatalf("unmarshal data: %v", err)
		}
		content, _ := data["content"].(string)
		if content == "" {
			t.Error("expected non-empty content field")
		}
	})
	t.Run("missing_file", func(t *testing.T) {
		dir := t.TempDir()
		result := handleGetKnowledge(newBase(), dir)
		if !result.OK {
			t.Fatal("expected ok:true on missing file")
		}
		var data map[string]interface{}
		if err := json.Unmarshal(result.Data, &data); err != nil {
			t.Fatalf("unmarshal data: %v", err)
		}
		content, _ := data["content"].(string)
		if content != "" {
			t.Error("expected empty content when file missing")
		}
	})
}

// TestHandleGetReportsIndex covers the get-reports-index parser.
func TestHandleGetReportsIndex(t *testing.T) {
	t.Run("happy_path", func(t *testing.T) {
		dir := t.TempDir()
		copyTestdata(t, "reports-index.json", dir)
		result := handleGetReportsIndex(newBase(), dir)
		if !result.OK {
			t.Fatal("expected ok:true")
		}
		var data reportsIndexData
		if err := json.Unmarshal(result.Data, &data); err != nil {
			t.Fatalf("unmarshal data: %v", err)
		}
		if data.Version != 1 {
			t.Errorf("version = %d, want 1", data.Version)
		}
	})
	t.Run("missing_file", func(t *testing.T) {
		dir := t.TempDir()
		result := handleGetReportsIndex(newBase(), dir)
		if !result.OK {
			t.Fatal("expected ok:true on missing file")
		}
	})
}

// TestHandleGetVisualizerData covers the get-visualizer-data parser.
// visualizer.json is never present in testdata — both paths verify ok:true with empty arrays.
func TestHandleGetVisualizerData(t *testing.T) {
	t.Run("happy_path", func(t *testing.T) {
		dir := t.TempDir()
		result := handleGetVisualizerData(newBase(), dir)
		if !result.OK {
			t.Fatal("expected ok:true")
		}
		var data visualizerData
		if err := json.Unmarshal(result.Data, &data); err != nil {
			t.Fatalf("unmarshal data: %v", err)
		}
		if data.Milestones == nil {
			t.Error("expected non-nil milestones array")
		}
	})
	t.Run("missing_file", func(t *testing.T) {
		dir := t.TempDir()
		result := handleGetVisualizerData(newBase(), dir)
		if !result.OK {
			t.Fatal("expected ok:true on missing file")
		}
	})
}

// TestHandleGetUndoInfo covers the get-undo-info parser.
func TestHandleGetUndoInfo(t *testing.T) {
	t.Run("happy_path", func(t *testing.T) {
		dir := t.TempDir()
		copyTestdata(t, "auto.lock", dir)
		copyTestdata(t, "metrics.json", dir)
		result := handleGetUndoInfo(newBase(), dir)
		if !result.OK {
			t.Fatal("expected ok:true")
		}
		var data map[string]interface{}
		if err := json.Unmarshal(result.Data, &data); err != nil {
			t.Fatalf("unmarshal data: %v", err)
		}
		if data["file_exists"] != true {
			t.Errorf("file_exists = %v, want true", data["file_exists"])
		}
	})
	t.Run("missing_file", func(t *testing.T) {
		dir := t.TempDir()
		result := handleGetUndoInfo(newBase(), dir)
		if !result.OK {
			t.Fatal("expected ok:true on missing file")
		}
		var data map[string]interface{}
		if err := json.Unmarshal(result.Data, &data); err != nil {
			t.Fatalf("unmarshal data: %v", err)
		}
		if data["file_exists"] != false {
			t.Errorf("file_exists = %v, want false", data["file_exists"])
		}
	})
}

// TestHandleGetRecoveryInfo covers the get-recovery-info parser.
func TestHandleGetRecoveryInfo(t *testing.T) {
	t.Run("happy_path", func(t *testing.T) {
		dir := t.TempDir()
		copyTestdata(t, "auto.lock", dir)
		result := handleGetRecoveryInfo(newBase(), dir)
		if !result.OK {
			t.Fatal("expected ok:true")
		}
		var data map[string]interface{}
		if err := json.Unmarshal(result.Data, &data); err != nil {
			t.Fatalf("unmarshal data: %v", err)
		}
		if data["lock_exists"] != true {
			t.Errorf("lock_exists = %v, want true", data["lock_exists"])
		}
		if data["is_process_alive"] != false {
			t.Errorf("is_process_alive = %v, want false (pid 99999 is dead)", data["is_process_alive"])
		}
		if data["suggested_action"] != "stale-lock" {
			t.Errorf("suggested_action = %v, want stale-lock", data["suggested_action"])
		}
	})
	t.Run("missing_file", func(t *testing.T) {
		dir := t.TempDir()
		result := handleGetRecoveryInfo(newBase(), dir)
		if !result.OK {
			t.Fatal("expected ok:true on missing file")
		}
		var data map[string]interface{}
		if err := json.Unmarshal(result.Data, &data); err != nil {
			t.Fatalf("unmarshal data: %v", err)
		}
		if data["lock_exists"] != false {
			t.Errorf("lock_exists = %v, want false", data["lock_exists"])
		}
	})
}

// TestHandleGetHistory covers the get-history parser.
func TestHandleGetHistory(t *testing.T) {
	t.Run("happy_path", func(t *testing.T) {
		dir := t.TempDir()
		copyTestdata(t, "metrics.json", dir)
		result := handleGetHistory(newBase(), dir)
		if !result.OK {
			t.Fatal("expected ok:true")
		}
		var data struct {
			Units []historyUnit `json:"units"`
		}
		if err := json.Unmarshal(result.Data, &data); err != nil {
			t.Fatalf("unmarshal data: %v", err)
		}
		if len(data.Units) == 0 {
			t.Error("expected non-empty units")
		}
	})
	t.Run("missing_file", func(t *testing.T) {
		dir := t.TempDir()
		result := handleGetHistory(newBase(), dir)
		if !result.OK {
			t.Fatal("expected ok:true on missing file")
		}
		var data struct {
			Units []historyUnit `json:"units"`
		}
		if err := json.Unmarshal(result.Data, &data); err != nil {
			t.Fatalf("unmarshal data: %v", err)
		}
		if len(data.Units) != 0 {
			t.Errorf("expected empty units, got %d", len(data.Units))
		}
	})
}

// TestHandleGetHooks covers the get-hooks parser.
func TestHandleGetHooks(t *testing.T) {
	t.Run("happy_path", func(t *testing.T) {
		dir := t.TempDir()
		copyTestdata(t, "PREFERENCES.md", dir)
		result := handleGetHooks(newBase(), dir)
		if !result.OK {
			t.Fatal("expected ok:true")
		}
		var data struct {
			Hooks             []hookEntry `json:"hooks"`
			PreferencesExists bool        `json:"preferences_exists"`
		}
		if err := json.Unmarshal(result.Data, &data); err != nil {
			t.Fatalf("unmarshal data: %v", err)
		}
		if !data.PreferencesExists {
			t.Error("expected preferences_exists=true")
		}
		if len(data.Hooks) != 2 {
			t.Errorf("len(hooks) = %d, want 2", len(data.Hooks))
		}
	})
	t.Run("missing_file", func(t *testing.T) {
		dir := t.TempDir()
		result := handleGetHooks(newBase(), dir)
		if !result.OK {
			t.Fatal("expected ok:true on missing file")
		}
		var data struct {
			Hooks             []hookEntry `json:"hooks"`
			PreferencesExists bool        `json:"preferences_exists"`
		}
		if err := json.Unmarshal(result.Data, &data); err != nil {
			t.Fatalf("unmarshal data: %v", err)
		}
		if data.PreferencesExists {
			t.Error("expected preferences_exists=false")
		}
	})
}

// TestHandleListWorktrees covers the list-worktrees parser.
func TestHandleListWorktrees(t *testing.T) {
	t.Run("happy_path", func(t *testing.T) {
		dir := t.TempDir()
		copyTestdata(t, "worktrees/wt-test/.gitkeep", dir)
		result := handleListWorktrees(newBase(), dir)
		if !result.OK {
			t.Fatal("expected ok:true")
		}
		var worktrees []worktreeEntry
		if err := json.Unmarshal(result.Data, &worktrees); err != nil {
			t.Fatalf("unmarshal data: %v", err)
		}
		if len(worktrees) != 1 {
			t.Fatalf("len(worktrees) = %d, want 1", len(worktrees))
		}
		if worktrees[0].Name != "wt-test" {
			t.Errorf("worktrees[0].Name = %q, want wt-test", worktrees[0].Name)
		}
	})
	t.Run("missing_dir", func(t *testing.T) {
		dir := t.TempDir()
		result := handleListWorktrees(newBase(), dir)
		if !result.OK {
			t.Fatal("expected ok:true on missing dir")
		}
		var worktrees []worktreeEntry
		if err := json.Unmarshal(result.Data, &worktrees); err != nil {
			t.Fatalf("unmarshal data: %v", err)
		}
		if len(worktrees) != 0 {
			t.Errorf("expected empty worktrees, got %d", len(worktrees))
		}
	})
}

// TestHandleGetWorktreeDiff covers the get-worktree-diff parser.
// This handler always returns an empty diff regardless of input.
func TestHandleGetWorktreeDiff(t *testing.T) {
	t.Run("always_empty", func(t *testing.T) {
		dir := t.TempDir()
		base := &protocol.Gsd2QueryResult{}
		msg := &protocol.Gsd2Query{Params: json.RawMessage(`{"worktreeName":"wt-test"}`)}
		result := handleGetWorktreeDiff(base, msg, dir)
		if !result.OK {
			t.Fatal("expected ok:true")
		}
		var data map[string]interface{}
		if err := json.Unmarshal(result.Data, &data); err != nil {
			t.Fatalf("unmarshal data: %v", err)
		}
		addedCount, _ := data["added_count"].(float64)
		if addedCount != 0 {
			t.Errorf("added_count = %v, want 0", addedCount)
		}
	})
	t.Run("missing_file", func(t *testing.T) {
		dir := t.TempDir()
		base := &protocol.Gsd2QueryResult{}
		msg := &protocol.Gsd2Query{Params: json.RawMessage(`{"worktreeName":"nonexistent"}`)}
		result := handleGetWorktreeDiff(base, msg, dir)
		if !result.OK {
			t.Fatal("expected ok:true")
		}
	})
}

// TestHandleGetGitSummary covers the get-git-summary parser.
func TestHandleGetGitSummary(t *testing.T) {
	t.Run("happy_path", func(t *testing.T) {
		dir := t.TempDir()
		copyTestdata(t, "repo-meta.json", dir)
		result := handleGetGitSummary(newBase(), dir)
		if !result.OK {
			t.Fatal("expected ok:true")
		}
		var data map[string]interface{}
		if err := json.Unmarshal(result.Data, &data); err != nil {
			t.Fatalf("unmarshal data: %v", err)
		}
		// gitRoot is /tmp which exists on all Unix systems
		if data["has_git"] != true {
			t.Errorf("has_git = %v, want true (gitRoot=/tmp always exists)", data["has_git"])
		}
	})
	t.Run("missing_file", func(t *testing.T) {
		dir := t.TempDir()
		result := handleGetGitSummary(newBase(), dir)
		if !result.OK {
			t.Fatal("expected ok:true on missing file")
		}
		var data map[string]interface{}
		if err := json.Unmarshal(result.Data, &data); err != nil {
			t.Fatalf("unmarshal data: %v", err)
		}
		if data["has_git"] != false {
			t.Errorf("has_git = %v, want false", data["has_git"])
		}
	})
}
