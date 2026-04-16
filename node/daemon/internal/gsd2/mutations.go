package gsd2

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	protocol "github.com/gsd-build/protocol-go"
)

// handleSetSteerContent writes Content to OVERRIDES.md atomically.
// On I/O failure: ok=false with error string.
func handleSetSteerContent(base *protocol.Gsd2QueryResult, msg *protocol.Gsd2Query, gsdDir string) *protocol.Gsd2QueryResult {
	var params struct {
		ProjectPath string `json:"projectPath"`
		Content     string `json:"content"`
	}
	if msg.Params != nil {
		if err := json.Unmarshal(msg.Params, &params); err != nil {
			base.OK = false
			base.Error = err.Error()
			return base
		}
	}

	dest := filepath.Join(gsdDir, "OVERRIDES.md")
	if err := atomicWriteFile(dest, []byte(params.Content)); err != nil {
		base.OK = false
		base.Error = err.Error()
		return base
	}

	base.OK = true
	base.Data = json.RawMessage("null")
	return base
}

// handleSavePreferences writes Payload as JSON to preferences.json atomically.
// On I/O failure: ok=false with error string.
func handleSavePreferences(base *protocol.Gsd2QueryResult, msg *protocol.Gsd2Query, gsdDir string) *protocol.Gsd2QueryResult {
	var params struct {
		ProjectPath string                 `json:"projectPath"`
		Scope       string                 `json:"scope"`
		Payload     map[string]interface{} `json:"payload"`
	}
	if msg.Params != nil {
		if err := json.Unmarshal(msg.Params, &params); err != nil {
			base.OK = false
			base.Error = err.Error()
			return base
		}
	}

	data, err := json.Marshal(params.Payload)
	if err != nil {
		base.OK = false
		base.Error = err.Error()
		return base
	}

	dest := filepath.Join(gsdDir, "preferences.json")
	if err := atomicWriteFile(dest, data); err != nil {
		base.OK = false
		base.Error = err.Error()
		return base
	}

	base.OK = true
	base.Data = json.RawMessage("null")
	return base
}

// handleResolveCapture finds the capture section in CAPTURES.md and marks it resolved.
// Returns ok=false if the capture is not found or on I/O error.
func handleResolveCapture(base *protocol.Gsd2QueryResult, msg *protocol.Gsd2Query, gsdDir string) *protocol.Gsd2QueryResult {
	var params struct {
		ProjectPath    string `json:"projectPath"`
		CaptureID      string `json:"captureId"`
		Classification string `json:"classification"`
		Resolution     string `json:"resolution"`
		Rationale      string `json:"rationale"`
	}
	if msg.Params != nil {
		if err := json.Unmarshal(msg.Params, &params); err != nil {
			base.OK = false
			base.Error = err.Error()
			return base
		}
	}

	capturesPath := filepath.Join(gsdDir, "CAPTURES.md")
	raw, err := os.ReadFile(capturesPath)
	if err != nil {
		base.OK = false
		base.Error = err.Error()
		return base
	}

	sectionHeader := "### " + params.CaptureID
	content := string(raw)
	if !strings.Contains(content, sectionHeader) {
		base.OK = false
		base.Error = "capture not found: " + params.CaptureID
		return base
	}

	// Process line by line: find section, update Status, append resolution fields after it.
	lines := strings.Split(content, "\n")
	var out []string
	inSection := false
	statusUpdated := false
	resolvedAppended := false

	for i, line := range lines {
		if strings.TrimSpace(line) == strings.TrimSpace(sectionHeader) {
			inSection = true
			statusUpdated = false
			resolvedAppended = false
			out = append(out, line)
			continue
		}

		// Detect start of a new section (another ###) to close the current one.
		if inSection && strings.HasPrefix(line, "### ") && strings.TrimSpace(line) != strings.TrimSpace(sectionHeader) {
			// Before closing, append resolution fields if not yet done.
			if !resolvedAppended {
				out = append(out, resolutionLines(params.Classification, params.Resolution, params.Rationale)...)
				resolvedAppended = true
			}
			inSection = false
		}

		if inSection {
			// Update **Status:** line.
			if !statusUpdated && strings.HasPrefix(strings.TrimSpace(line), "**Status:**") {
				out = append(out, "**Status:** resolved")
				statusUpdated = true
				continue
			}
			// Append resolution fields after the last field line before next blank/section.
			// We do this when we hit the end of this section's content.
			// Detect end of section: blank line after fields have been written.
			if !resolvedAppended && statusUpdated && strings.TrimSpace(line) == "" {
				// Check if next non-blank line is a new ### or EOF.
				nextIsSection := false
				for j := i + 1; j < len(lines); j++ {
					trimmed := strings.TrimSpace(lines[j])
					if trimmed == "" {
						continue
					}
					if strings.HasPrefix(trimmed, "### ") {
						nextIsSection = true
					}
					break
				}
				_ = nextIsSection
				out = append(out, resolutionLines(params.Classification, params.Resolution, params.Rationale)...)
				resolvedAppended = true
			}
		}

		out = append(out, line)
	}

	// If section was last in file and resolution not yet appended.
	if inSection && !resolvedAppended {
		out = append(out, resolutionLines(params.Classification, params.Resolution, params.Rationale)...)
	}

	updated := strings.Join(out, "\n")
	if err := os.WriteFile(capturesPath, []byte(updated), 0o644); err != nil {
		base.OK = false
		base.Error = err.Error()
		return base
	}

	result := map[string]interface{}{
		"ok":         true,
		"capture_id": params.CaptureID,
	}
	data, _ := json.Marshal(result)
	base.OK = true
	base.Data = data
	return base
}

// resolutionLines returns the lines to append when resolving a capture.
func resolutionLines(classification, resolution, rationale string) []string {
	ts := time.Now().UTC().Format(time.RFC3339)
	return []string{
		fmt.Sprintf("**Classification:** %s", classification),
		fmt.Sprintf("**Resolution:** %s", resolution),
		fmt.Sprintf("**Rationale:** %s", rationale),
		fmt.Sprintf("**Resolved:** %s", ts),
	}
}

// handleRemoveWorktree removes a worktree directory by name.
// Rejects names that contain path separators or are empty (path traversal prevention).
// On success: ok=true, data=null.
func handleRemoveWorktree(base *protocol.Gsd2QueryResult, msg *protocol.Gsd2Query, gsdDir string) *protocol.Gsd2QueryResult {
	var params struct {
		ProjectID    string `json:"projectId"`
		WorktreeName string `json:"worktreeName"`
	}
	if msg.Params != nil {
		if err := json.Unmarshal(msg.Params, &params); err != nil {
			base.OK = false
			base.Error = err.Error()
			return base
		}
	}

	// Safety: reject empty name or any name that contains a path separator.
	if params.WorktreeName == "" || filepath.Base(params.WorktreeName) != params.WorktreeName {
		base.OK = false
		base.Error = "invalid worktree name"
		return base
	}

	target := filepath.Join(gsdDir, "worktrees", params.WorktreeName)
	if err := os.RemoveAll(target); err != nil {
		base.OK = false
		base.Error = err.Error()
		return base
	}

	base.OK = true
	base.Data = json.RawMessage("null")
	return base
}

// atomicWriteFile writes data to dest by writing a temp file in the same directory
// then renaming it into place, ensuring an atomic replace.
func atomicWriteFile(dest string, data []byte) error {
	dir := filepath.Dir(dest)
	tmp, err := os.CreateTemp(dir, ".tmp-")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	return os.Rename(tmpName, dest)
}
