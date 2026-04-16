// Package gsd2 implements the daemon-side dispatch router for gsd2Query messages.
// New commands are added by extending the switch in Dispatch.
package gsd2

import (
	"fmt"

	protocol "github.com/gsd-build/protocol-go"
)

// Dispatch routes a Gsd2Query to the appropriate handler and returns a result.
// Unknown commands return ok=false with a descriptive error.
// gsdDir is the resolved path to the project's .gsd/ directory on the daemon filesystem.
func Dispatch(msg *protocol.Gsd2Query, daemonVersion, gsdDir string) *protocol.Gsd2QueryResult {
	base := &protocol.Gsd2QueryResult{
		Type:      protocol.MsgTypeGsd2QueryResult,
		RequestID: msg.RequestID,
		ChannelID: msg.ChannelID,
	}
	fmt.Printf("[DEBUG] gsd2Query dispatch: command=%q\n", msg.Command)
	switch msg.Command {
	case "health":
		return handleHealth(base, daemonVersion, gsdDir)
	case "derive-state":
		return handleDeriveState(base, gsdDir)
	case "list-milestones":
		return handleListMilestones(base, gsdDir)
	case "get-milestone":
		return handleGetMilestone(base, msg, gsdDir)
	case "list-sessions":
		return handleListSessions(base, gsdDir)
	case "get-skill-health":
		return handleGetSkillHealth(base, gsdDir)
	case "get-forensics-report":
		return handleGetForensicsReport(base, gsdDir)
	case "get-slice":
		return handleGetSlice(base, msg, gsdDir)
	case "get-knowledge":
		return handleGetKnowledge(base, gsdDir)
	case "get-reports-index":
		return handleGetReportsIndex(base, gsdDir)
	case "get-visualizer-data":
		return handleGetVisualizerData(base, gsdDir)
	case "get-undo-info":
		return handleGetUndoInfo(base, gsdDir)
	case "get-recovery-info":
		return handleGetRecoveryInfo(base, gsdDir)
	case "get-history":
		return handleGetHistory(base, gsdDir)
	case "get-hooks":
		return handleGetHooks(base, gsdDir)
	case "list-worktrees":
		return handleListWorktrees(base, gsdDir)
	case "get-worktree-diff":
		return handleGetWorktreeDiff(base, msg, gsdDir)
	case "get-git-summary":
		return handleGetGitSummary(base, gsdDir)
	case "get-captures":
		return handleGetCaptures(base, gsdDir)
	case "get-inspect":
		return handleGetInspect(base, gsdDir)
	case "get-steer-content":
		return handleGetSteerContent(base, gsdDir)
	case "get-doctor-report":
		return handleGetDoctorReport(base, gsdDir)
	case "get-preferences":
		return handleGetPreferences(base, gsdDir)
	case "set-steer-content":
		return handleSetSteerContent(base, msg, gsdDir)
	case "save-preferences":
		return handleSavePreferences(base, msg, gsdDir)
	case "resolve-capture":
		return handleResolveCapture(base, msg, gsdDir)
	case "remove-worktree":
		return handleRemoveWorktree(base, msg, gsdDir)
	default:
		base.OK = false
		base.Error = fmt.Sprintf("unknown command: %q", msg.Command)
		return base
	}
}
