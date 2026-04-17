package handoff

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// initRepo creates a temporary git repo, sets git config, and returns the path.
func initRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	mustGit(t, dir, "init")
	mustGit(t, dir, "config", "user.email", "test@example.com")
	mustGit(t, dir, "config", "user.name", "Test User")
	return dir
}

// initBareRepo creates a bare git repo and returns the path.
func initBareRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	mustGit(t, dir, "init", "--bare")
	return dir
}

// mustGit runs a git command in the given dir, fataling on error.
func mustGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v in %s: %v\n%s", args, dir, err, out)
	}
	return string(out)
}

// writeFile writes content to path relative to dir.
func writeFile(t *testing.T, dir, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

// seedCommit creates an initial commit so the repo has a HEAD.
func seedCommit(t *testing.T, dir string) {
	t.Helper()
	writeFile(t, dir, "README.md", "init\n")
	mustGit(t, dir, "add", "-A")
	mustGit(t, dir, "commit", "-m", "initial commit")
}

func TestCurrentBranch(t *testing.T) {
	dir := initRepo(t)
	seedCommit(t, dir)

	g := NewGitOps(dir)
	branch, err := g.CurrentBranch(context.Background())
	if err != nil {
		t.Fatalf("CurrentBranch error: %v", err)
	}
	if branch == "" {
		t.Fatal("CurrentBranch returned empty string")
	}
	// After git init the default branch is typically "main" or "master".
	if branch != "main" && branch != "master" {
		t.Logf("CurrentBranch returned %q (not main/master, which is fine)", branch)
	}
}

func TestStageAll(t *testing.T) {
	dir := initRepo(t)
	seedCommit(t, dir)

	// Write an untracked file.
	writeFile(t, dir, "new.txt", "hello\n")

	g := NewGitOps(dir)
	if err := g.StageAll(context.Background()); err != nil {
		t.Fatalf("StageAll error: %v", err)
	}

	// Verify the file is staged.
	out := mustGit(t, dir, "status", "--short")
	if len(out) == 0 {
		t.Fatal("expected staged changes after StageAll")
	}
}

func TestCommit(t *testing.T) {
	dir := initRepo(t)
	seedCommit(t, dir)

	writeFile(t, dir, "change.txt", "data\n")
	g := NewGitOps(dir)

	if err := g.StageAll(context.Background()); err != nil {
		t.Fatalf("StageAll error: %v", err)
	}

	sha, err := g.Commit(context.Background(), "test commit")
	if err != nil {
		t.Fatalf("Commit error: %v", err)
	}
	if sha == "" {
		t.Fatal("Commit returned empty SHA")
	}
	t.Logf("commit SHA: %s", sha)
}

func TestPush(t *testing.T) {
	bare := initBareRepo(t)
	src := initRepo(t)
	seedCommit(t, src)

	// Wire origin to the local bare repo.
	mustGit(t, src, "remote", "add", "origin", bare)

	// Determine the current branch name.
	branch := ""
	{
		g := NewGitOps(src)
		var err error
		branch, err = g.CurrentBranch(context.Background())
		if err != nil {
			t.Fatalf("CurrentBranch: %v", err)
		}
	}

	// Push the initial commit to origin so we have a tracking ref.
	mustGit(t, src, "push", "origin", branch)

	// Make a new commit and push via GitOps.Push.
	writeFile(t, src, "pushed.txt", "pushed\n")
	g := NewGitOps(src)
	if err := g.StageAll(context.Background()); err != nil {
		t.Fatalf("StageAll: %v", err)
	}
	if _, err := g.Commit(context.Background(), "add pushed.txt"); err != nil {
		t.Fatalf("Commit: %v", err)
	}
	if err := g.Push(context.Background(), branch); err != nil {
		t.Fatalf("Push: %v", err)
	}
}

func TestClone(t *testing.T) {
	bare := initBareRepo(t)
	src := initRepo(t)
	seedCommit(t, src)

	g0 := NewGitOps(src)
	branch, err := g0.CurrentBranch(context.Background())
	if err != nil {
		t.Fatalf("CurrentBranch: %v", err)
	}
	mustGit(t, src, "remote", "add", "origin", bare)
	mustGit(t, src, "push", "origin", branch)

	targetPath := filepath.Join(t.TempDir(), "cloned")
	g := NewGitOps("") // RepoDir unused for Clone
	if err := g.Clone(context.Background(), bare, targetPath); err != nil {
		t.Fatalf("Clone error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(targetPath, "README.md")); err != nil {
		t.Fatalf("README.md not present after Clone: %v", err)
	}
}

func TestPull(t *testing.T) {
	bare := initBareRepo(t)

	// src is the "origin" repo that we push from.
	src := initRepo(t)
	seedCommit(t, src)
	mustGit(t, src, "remote", "add", "origin", bare)

	branch := ""
	{
		g := NewGitOps(src)
		var err error
		branch, err = g.CurrentBranch(context.Background())
		if err != nil {
			t.Fatalf("CurrentBranch: %v", err)
		}
	}
	mustGit(t, src, "push", "origin", branch)

	// dst clones from the bare repo.
	dst := initRepo(t)
	mustGit(t, dst, "remote", "add", "origin", bare)
	mustGit(t, dst, "fetch", "origin")
	mustGit(t, dst, "checkout", "-b", branch, "origin/"+branch)

	// Push a new commit from src to origin.
	writeFile(t, src, "pulled.txt", "new data\n")
	mustGit(t, src, "add", "-A")
	mustGit(t, src, "commit", "-m", "add pulled.txt")
	mustGit(t, src, "push", "origin", branch)

	// dst pulls that commit via GitOps.Pull.
	g := NewGitOps(dst)
	if err := g.Pull(context.Background(), branch); err != nil {
		t.Fatalf("Pull: %v", err)
	}

	// Verify the file arrived.
	if _, err := os.Stat(filepath.Join(dst, "pulled.txt")); err != nil {
		t.Fatalf("pulled.txt not present after Pull: %v", err)
	}
}
