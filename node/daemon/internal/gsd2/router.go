// Package gsd2 implements the gsd2Query command dispatch table.
// New commands are added here as cases in the Dispatch switch.
package gsd2

import (
	"encoding/json"
	"fmt"

	protocol "github.com/gsd-build/protocol-go"
)

// Dispatch routes a gsd2Query to the appropriate handler and returns the result.
// All commands log at DEBUG level; unknown commands log the command name and reason.
func Dispatch(msg *protocol.Gsd2Query, daemonVersion string) *protocol.Gsd2QueryResult {
	base := &protocol.Gsd2QueryResult{
		Type:      protocol.MsgTypeGsd2QueryResult,
		RequestID: msg.RequestID,
		ChannelID: msg.ChannelID,
	}
	switch msg.Command {
	case "health":
		fmt.Printf("[DEBUG] gsd2Query dispatch: command=%q\n", msg.Command)
		return handleHealth(base, daemonVersion)
	default:
		fmt.Printf("[DEBUG] gsd2Query dispatch: command=%q reason=\"unknown command\"\n", msg.Command)
		base.OK = false
		base.Error = fmt.Sprintf("unknown command: %q", msg.Command)
		return base
	}
}

func handleHealth(base *protocol.Gsd2QueryResult, daemonVersion string) *protocol.Gsd2QueryResult {
	data, _ := json.Marshal(map[string]string{
		"status":        "online",
		"daemonVersion": daemonVersion,
	})
	base.OK = true
	base.Data = data
	return base
}
