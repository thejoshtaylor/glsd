// Package loop contains the main daemon event loop: connect to relay,
// dispatch incoming messages to the session manager, run periodic heartbeats.
package loop

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/thejoshtaylor/glsd/node/daemon/internal/config"
	"github.com/thejoshtaylor/glsd/node/daemon/internal/fs"
	"github.com/thejoshtaylor/glsd/node/daemon/internal/gsd2"
	"github.com/thejoshtaylor/glsd/node/daemon/internal/handoff"
	"github.com/thejoshtaylor/glsd/node/daemon/internal/relay"
	"github.com/thejoshtaylor/glsd/node/daemon/internal/session"
	"github.com/thejoshtaylor/glsd/node/daemon/internal/wal"
	protocol "github.com/thejoshtaylor/glsd/node/protocol-go"
)

// Daemon is the running daemon state.
type Daemon struct {
	cfg     *config.Config
	version string
	manager *session.Manager
	client  *relay.Client
	walDir  string
	sender  session.RelaySender // For testability; set to client in constructor
}

// buildRelayURL constructs the WebSocket URL with machineId + token query params.
// Both must be URL-escaped because tokens may contain "/" or "+" characters.
// Preserves any existing query params already present on cfg.RelayURL.
func buildRelayURL(cfg *config.Config) string {
	u, err := url.Parse(cfg.RelayURL)
	if err != nil {
		// cfg.RelayURL is validated at load time; if parsing fails here,
		// fall back to raw concat so callers get a visible failure rather
		// than a silent wrong URL.
		return cfg.RelayURL + "?machineId=" + url.QueryEscape(cfg.MachineID) + "&token=" + url.QueryEscape(cfg.AuthToken)
	}
	q := u.Query()
	q.Set("machineId", cfg.MachineID)
	q.Set("token", cfg.AuthToken)
	u.RawQuery = q.Encode()
	return u.String()
}

// New constructs a Daemon that spawns the real `claude` CLI on PATH.
func New(cfg *config.Config, version string) (*Daemon, error) {
	return NewWithBinaryPath(cfg, version, "claude")
}

// NewWithBinaryPath constructs a Daemon that spawns the given binary instead
// of the default `claude`. Used by integration tests to inject fake-claude.
func NewWithBinaryPath(cfg *config.Config, version, binaryPath string) (*Daemon, error) {
	home, err := configHomeDir()
	if err != nil {
		return nil, err
	}
	walDir := filepath.Join(home, "wal")

	client := relay.NewClient(relay.Config{
		URL:           buildRelayURL(cfg),
		AuthToken:     cfg.AuthToken,
		MachineID:     cfg.MachineID,
		DaemonVersion: version,
		OS:            runtime.GOOS,
		Arch:          runtime.GOARCH,
	})

	manager := session.NewManager(walDir, binaryPath, client)

	return &Daemon{
		cfg:     cfg,
		version: version,
		manager: manager,
		client:  client,
		walDir:  walDir,
		sender:  client,
	}, nil
}

// Shutdown terminates all active Claude sessions immediately.
// Called from the signal handler in cmd/start.go before context cancellation.
func (d *Daemon) Shutdown() {
	d.manager.StopAll()
}

// Run connects to the relay and blocks until ctx is canceled.
// Automatically reconnects with exponential backoff on connection failures.
func (d *Daemon) Run(ctx context.Context) error {
	d.client.SetHandler(d.handleMessage)
	defer d.manager.StopAll() // Safety net: clean up on any exit path

	backoff := 1 * time.Second
	const maxBackoff = 60 * time.Second

	for {
		connStart := time.Now()
		err := d.runOnce(ctx)
		if err == nil || ctx.Err() != nil {
			return err
		}

		// Reset backoff if the connection was alive for a while (healthy session).
		if time.Since(connStart) > 2*time.Minute {
			backoff = 1 * time.Second
		}

		fmt.Printf("relay connection lost: %v\n", err)
		fmt.Printf("reconnecting in %s...\n", backoff)

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
		}

		backoff = backoff * 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

// runOnce performs a single connect → run cycle.
func (d *Daemon) runOnce(ctx context.Context) error {
	lastSeqs, err := wal.ScanDirectory(d.walDir)
	if err != nil {
		return fmt.Errorf("scan wal directory: %w", err)
	}

	welcome, err := d.client.Connect(ctx, lastSeqs)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}

	fmt.Println("Connected.")

	// Replay un-acked WAL entries and prune acked ones (D-03, D-04)
	if err := d.handleWelcomeReplay(welcome); err != nil {
		// Log but do not fail the connection -- best-effort replay
		fmt.Printf("welcome replay error: %v\n", err)
	}

	// Scope heartbeat to this connection; cancel when Run returns.
	connCtx, connCancel := context.WithCancel(ctx)
	go d.runHeartbeat(connCtx)

	err = d.client.Run(ctx)
	connCancel()
	return err
}

func (d *Daemon) runHeartbeat(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			_ = d.client.Send(&protocol.Heartbeat{
				Type:          protocol.MsgTypeHeartbeat,
				MachineID:     d.cfg.MachineID,
				DaemonVersion: d.version,
				Status:        "online",
				Timestamp:     time.Now().UTC().Format(time.RFC3339Nano),
			})
		}
	}
}

func (d *Daemon) handleMessage(env *protocol.Envelope) error {
	switch msg := env.Payload.(type) {
	case *protocol.Task:
		return d.handleTask(msg)
	case *protocol.Stop:
		return d.handleStop(msg)
	case *protocol.BrowseDir:
		return d.handleBrowse(msg)
	case *protocol.ReadFile:
		return d.handleRead(msg)
	case *protocol.PermissionResponse:
		return d.handlePermissionResponse(msg)
	case *protocol.QuestionResponse:
		return d.handleQuestionResponse(msg)
	case *protocol.Ack:
		return d.handleAck(msg)
	case *protocol.ReplayRequest:
		return d.handleReplay(msg)
	case *protocol.Gsd2Query:
		return d.handleGsd2Query(msg)
	case *protocol.GitClone:
		return d.handleGitClone(msg)
	case *protocol.GitPull:
		return d.handleGitPull(msg)
	case *protocol.GitPush:
		return d.handleGitPush(msg)
	case *protocol.RunBash:
		return d.handleRunBash(msg)
	case *protocol.ScaffoldProject:
		return d.handleScaffoldProject(msg)
	default:
		// Ignore other types
		return nil
	}
}

func (d *Daemon) handleTask(msg *protocol.Task) error {
	ctx := context.Background()
	actor := d.manager.Get(msg.SessionID)
	if actor == nil {
		var err error
		actor, err = d.manager.Spawn(ctx, session.Options{
			SessionID:      msg.SessionID,
			ChannelID:      msg.ChannelID,
			CWD:            msg.CWD,
			Model:          msg.Model,
			Effort:         msg.Effort,
			PermissionMode: msg.PermissionMode,
			SystemPrompt:   msg.PersonaSystemPrompt,
			ResumeSession:  msg.ClaudeSessionID,
		})
		if err != nil {
			return d.client.Send(&protocol.TaskError{
				Type:      protocol.MsgTypeTaskError,
				TaskID:    msg.TaskID,
				SessionID: msg.SessionID,
				ChannelID: msg.ChannelID,
				Error:     err.Error(),
			})
		}
	}
	return actor.SendTask(*msg)
}

func (d *Daemon) handleStop(msg *protocol.Stop) error {
	actor := d.manager.Get(msg.SessionID)
	if actor != nil {
		return actor.Stop()
	}
	return nil
}

func (d *Daemon) handleBrowse(msg *protocol.BrowseDir) error {
	entries, err := fs.BrowseDir(msg.Path)
	result := &protocol.BrowseDirResult{
		Type:      protocol.MsgTypeBrowseDirResult,
		RequestID: msg.RequestID,
		ChannelID: msg.ChannelID,
		OK:        err == nil,
		Entries:   entries,
	}
	if err != nil {
		result.Error = err.Error()
	}
	return d.client.Send(result)
}

func (d *Daemon) handleRead(msg *protocol.ReadFile) error {
	content, truncated, err := fs.ReadFile(msg.Path, msg.MaxBytes)
	result := &protocol.ReadFileResult{
		Type:      protocol.MsgTypeReadFileResult,
		RequestID: msg.RequestID,
		ChannelID: msg.ChannelID,
		OK:        err == nil,
		Content:   content,
		Truncated: truncated,
	}
	if err != nil {
		result.Error = err.Error()
	}
	return d.client.Send(result)
}

func (d *Daemon) handleAck(msg *protocol.Ack) error {
	actor := d.manager.Get(msg.SessionID)
	if actor != nil {
		return actor.PruneWAL(msg.SequenceNumber)
	}
	return nil
}

func (d *Daemon) handleReplay(msg *protocol.ReplayRequest) error {
	// Read the WAL for this session and resend all entries with seq > fromSequence
	walPath := filepath.Join(d.walDir, msg.SessionID+".jsonl")
	log, err := wal.Open(walPath)
	if err != nil {
		return fmt.Errorf("open wal: %w", err)
	}
	defer log.Close()

	entries, err := log.ReadFrom(msg.FromSequence)
	if err != nil {
		return fmt.Errorf("read wal: %w", err)
	}

	for _, e := range entries {
		// Each entry is a serialized Stream frame; send it back as-is
		if err := d.client.Send(json.RawMessage(e.Data)); err != nil {
			return err
		}
	}
	return nil
}

func (d *Daemon) handlePermissionResponse(msg *protocol.PermissionResponse) error {
	actor := d.manager.Get(msg.SessionID)
	if actor == nil {
		return fmt.Errorf("no actor for session %s", msg.SessionID)
	}
	return actor.HandlePermissionResponse(msg)
}

func (d *Daemon) handleQuestionResponse(msg *protocol.QuestionResponse) error {
	actor := d.manager.Get(msg.SessionID)
	if actor == nil {
		return fmt.Errorf("no actor for session %s", msg.SessionID)
	}
	return actor.HandleQuestionResponse(msg)
}

// resolveGsdDir extracts projectPath from the query params JSON and returns
// the path to its .gsd/ subdirectory. Falls back to cwd/.gsd if unset or invalid.
func resolveGsdDir(params json.RawMessage) string {
	if len(params) > 0 {
		var p struct {
			ProjectPath string `json:"projectPath"`
		}
		if err := json.Unmarshal(params, &p); err == nil && p.ProjectPath != "" {
			return filepath.Join(p.ProjectPath, ".gsd")
		}
	}
	cwd, _ := os.Getwd()
	return filepath.Join(cwd, ".gsd")
}

func (d *Daemon) handleGitClone(msg *protocol.GitClone) error {
	ctx := context.Background()
	g := handoff.NewGitOps("") // Clone uses targetPath, not RepoDir
	err := g.Clone(ctx, msg.RepoURL, msg.TargetPath)
	result := &protocol.GitCloneResult{
		Type:      protocol.MsgTypeGitCloneResult,
		RequestID: msg.RequestID,
		ChannelID: msg.ChannelID,
		OK:        err == nil,
	}
	if err != nil {
		result.Error = err.Error()
	}
	return d.client.Send(result)
}

func (d *Daemon) handleGitPull(msg *protocol.GitPull) error {
	ctx := context.Background()
	g := handoff.NewGitOps(msg.Path)
	err := g.Pull(ctx, msg.Branch)
	result := &protocol.GitPullResult{
		Type:      protocol.MsgTypeGitPullResult,
		RequestID: msg.RequestID,
		ChannelID: msg.ChannelID,
		OK:        err == nil,
	}
	if err != nil {
		result.Error = err.Error()
	}
	return d.client.Send(result)
}

func (d *Daemon) handleGitPush(msg *protocol.GitPush) error {
	ctx := context.Background()
	g := handoff.NewGitOps(msg.Path)
	err := g.Push(ctx, msg.Branch)
	exitCode := 0
	if err != nil {
		exitCode = 1
	}
	slog.Info("gitPush handler", "path", msg.Path, "branch", msg.Branch, "exit_code", exitCode)
	result := &protocol.GitPushResult{
		Type:      protocol.MsgTypeGitPushResult,
		RequestID: msg.RequestID,
		ChannelID: msg.ChannelID,
		OK:        err == nil,
	}
	if err != nil {
		result.Error = err.Error()
	}
	return d.client.Send(result)
}

const runBashTimeout = 30 * time.Second
const runBashMaxOutput = 64 * 1024

func (d *Daemon) handleRunBash(msg *protocol.RunBash) error {
	ctx, cancel := context.WithTimeout(context.Background(), runBashTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "sh", "-c", msg.Command)
	if msg.CWD != "" {
		cmd.Dir = msg.CWD
	}

	raw, err := cmd.CombinedOutput()

	exitCode := 0
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}
	slog.Info("runBash handler", "command", msg.Command, "exit_code", exitCode)

	output := string(raw)
	truncated := false
	if len(output) > runBashMaxOutput {
		output = output[:runBashMaxOutput]
		truncated = true
	}

	result := &protocol.RunBashResult{
		Type:      protocol.MsgTypeRunBashResult,
		RequestID: msg.RequestID,
		ChannelID: msg.ChannelID,
		OK:        err == nil,
		Output:    output,
		Truncated: truncated,
	}
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			result.Error = "command timed out after 30s"
		} else {
			// Strip the "exit status N" prefix and include captured output context
			result.Error = strings.TrimSpace(err.Error())
		}
	}
	return d.client.Send(result)
}

const scaffoldTimeout = 30 * time.Second

func (d *Daemon) handleScaffoldProject(msg *protocol.ScaffoldProject) error {
	ctx, cancel := context.WithTimeout(context.Background(), scaffoldTimeout)
	defer cancel()

	result := &protocol.ScaffoldProjectResult{
		Type:      protocol.MsgTypeScaffoldProjectResult,
		RequestID: msg.RequestID,
		ChannelID: msg.ChannelID,
	}

	targetPath := filepath.Join(msg.ParentPath, msg.ProjectName)
	if err := os.MkdirAll(targetPath, 0755); err != nil {
		result.Error = fmt.Sprintf("mkdir failed: %s", err)
		slog.Info("scaffoldProject handler", "target", targetPath, "ok", false, "error", result.Error)
		return d.client.Send(result)
	}

	filesCreated := []string{}

	if msg.GitInit {
		cmd := exec.CommandContext(ctx, "git", "init", targetPath)
		if out, err := cmd.CombinedOutput(); err != nil {
			result.Error = fmt.Sprintf("git init failed: %s: %s", err, strings.TrimSpace(string(out)))
			slog.Info("scaffoldProject handler", "target", targetPath, "ok", false, "error", result.Error)
			return d.client.Send(result)
		}
	}

	if msg.GsdPlanningTemplate != "" {
		gsdDir := filepath.Join(targetPath, ".gsd")
		if err := os.MkdirAll(gsdDir, 0755); err == nil {
			filesCreated = append(filesCreated, gsdDir)
		}
	}

	result.OK = true
	result.ProjectPath = targetPath
	result.FilesCreated = filesCreated
	slog.Info("scaffoldProject handler", "target", targetPath, "ok", true)
	return d.client.Send(result)
}

func (d *Daemon) handleGsd2Query(msg *protocol.Gsd2Query) error {
	gsdDir := resolveGsdDir(msg.Params)
	result := gsd2.Dispatch(msg, d.version, gsdDir)
	return d.client.Send(result)
}

// handleWelcomeReplay replays un-acked WAL entries to the relay and prunes
// acked entries for each session in the welcome message. Per D-05, this does
// NOT re-spawn session actors -- replay is WAL-to-relay only.
func (d *Daemon) handleWelcomeReplay(welcome *protocol.Welcome) error {
	if welcome == nil || len(welcome.AckedSequencesBySession) == 0 {
		return nil
	}

	for sessionID, ackedSeq := range welcome.AckedSequencesBySession {
		// Check if there is an active actor for this session (Pitfall 3:
		// do not open a second WAL handle for the same file).
		if actor := d.manager.Get(sessionID); actor != nil {
			// Active actor owns the WAL handle -- prune through it.
			_ = actor.PruneWAL(ackedSeq)
			continue
		}

		// No active actor -- safe to open a new WAL handle for replay.
		walPath := filepath.Join(d.walDir, sessionID+".jsonl")
		log, err := wal.Open(walPath)
		if err != nil {
			// WAL file may not exist (session was fully pruned or never
			// ran on this node). Skip gracefully.
			continue
		}

		entries, err := log.ReadFrom(ackedSeq)
		if err != nil {
			_ = log.Close()
			continue
		}

		// Send un-acked entries to relay (D-03)
		for _, e := range entries {
			if sendErr := d.sender.Send(json.RawMessage(e.Data)); sendErr != nil {
				// Best-effort: if relay send fails, we'll retry on next reconnect
				break
			}
		}

		// Prune acked entries (D-04)
		_ = log.PruneUpTo(ackedSeq)
		_ = log.Close()
	}
	return nil
}

func configHomeDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("user home: %w", err)
	}
	return filepath.Join(home, ".glsd"), nil
}
