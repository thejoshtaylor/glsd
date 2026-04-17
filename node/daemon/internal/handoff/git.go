package handoff

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// GitOps wraps os/exec git calls for the handoff coordinator.
// All methods log command, exit code, and stderr via slog so failures are diagnosable.
type GitOps struct {
	RepoDir string // absolute path to the git repo root
}

// NewGitOps creates a GitOps for the given repo directory.
func NewGitOps(repoDir string) *GitOps {
	return &GitOps{RepoDir: repoDir}
}

// run executes a git subcommand and returns combined stdout. On failure it
// returns an error that includes the subcommand name and captured stderr.
func (g *GitOps) run(ctx context.Context, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = g.RepoDir

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	exitCode := 0
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}

	slog.Info("git subprocess",
		"cmd", "git",
		"args", args,
		"exit_code", exitCode,
		"stderr", strings.TrimSpace(stderr.String()),
	)

	if err != nil {
		return "", fmt.Errorf("git %s: exit %d: %s", strings.Join(args, " "), exitCode, strings.TrimSpace(stderr.String()))
	}
	return strings.TrimSpace(stdout.String()), nil
}

// StageAll runs `git add -A` to stage all working-tree changes.
func (g *GitOps) StageAll(ctx context.Context) error {
	_, err := g.run(ctx, "add", "-A")
	return err
}

// Commit runs `git commit -m <message>` and returns the abbreviated commit SHA on success.
func (g *GitOps) Commit(ctx context.Context, message string) (sha string, err error) {
	if _, err = g.run(ctx, "commit", "-m", message); err != nil {
		return "", err
	}
	// Retrieve the SHA of the commit just made.
	sha, err = g.run(ctx, "rev-parse", "--short", "HEAD")
	return sha, err
}

// Push runs `git push --force-with-lease origin <branch>` to push the handoff branch.
// Uses --force-with-lease rather than --force to avoid clobbering concurrent pushes.
func (g *GitOps) Push(ctx context.Context, branch string) error {
	_, err := g.run(ctx, "push", "--force-with-lease", "origin", branch)
	return err
}

// Pull runs `git pull --rebase origin <branch>` to apply remote changes.
func (g *GitOps) Pull(ctx context.Context, branch string) error {
	_, err := g.run(ctx, "pull", "--rebase", "origin", branch)
	return err
}

// Clone clones repoURL into targetPath. The parent directory is created if it
// does not exist. cmd.Dir is set to the parent (not targetPath, which does not
// exist yet).
func (g *GitOps) Clone(ctx context.Context, repoURL, targetPath string) error {
	parent := filepath.Dir(targetPath)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return fmt.Errorf("mkdir parent: %w", err)
	}
	cloneOps := NewGitOps(parent)
	_, err := cloneOps.run(ctx, "clone", repoURL, targetPath)
	return err
}

// CurrentBranch returns the name of the current git branch.
func (g *GitOps) CurrentBranch(ctx context.Context) (string, error) {
	return g.run(ctx, "rev-parse", "--abbrev-ref", "HEAD")
}
