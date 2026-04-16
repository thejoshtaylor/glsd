package session

import (
	"context"
	"testing"
	"time"

	protocol "github.com/thejoshtaylor/glsd/node/protocol-go"
)

// nullRelay is used by tests that don't care about relay frames.
type nullRelay struct{}

func (nullRelay) Send(msg any) error { return nil }

func TestManagerSpawnAndGet(t *testing.T) {
	binPath := buildFakeClaude(t)
	m := NewManager(t.TempDir(), binPath, nullRelay{})

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	a, err := m.Spawn(ctx, Options{
		SessionID: "s-1",
		ChannelID: "c",
		CWD:       t.TempDir(),
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}
	if a == nil {
		t.Fatal("actor should not be nil")
	}

	got := m.Get("s-1")
	if got != a {
		t.Errorf("expected same actor instance")
	}

	// Second Spawn returns existing actor
	a2, _ := m.Spawn(ctx, Options{SessionID: "s-1", CWD: t.TempDir()})
	if a2 != a {
		t.Errorf("expected idempotent spawn")
	}

	m.StopAll()
	if m.Get("s-1") != nil {
		t.Errorf("expected actor cleared after StopAll")
	}
}

func TestActorCleanupOnExit(t *testing.T) {
	binPath := buildFakeClaude(t)
	relay := newFakeRelay()
	m := NewManager(t.TempDir(), binPath, relay)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	a, err := m.Spawn(ctx, Options{
		SessionID: "s-cleanup",
		ChannelID: "c",
		CWD:       t.TempDir(),
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	// Send a task so fake-claude runs and produces output
	_ = a.SendTask(protocol.Task{
		TaskID:    "t1",
		SessionID: "s-cleanup",
		ChannelID: "c",
		Prompt:    "hello",
	})

	// Wait for TaskComplete (fake-claude processed the task)
	if !relay.waitForTaskComplete(t, 10*time.Second) {
		t.Fatal("timed out waiting for TaskComplete")
	}

	// Stop the actor to close stdin, causing fake-claude to exit cleanly.
	// This triggers actor.Run to return, which in turn triggers cleanup.
	_ = a.Stop()

	// Give the goroutine a moment to run the cleanup path after Run returns
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if m.Get("s-cleanup") == nil {
			return // Success: actor was cleaned up
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("actor still in manager after Run exited cleanly")
}

func TestActorCleanupOnError(t *testing.T) {
	binPath := buildFakeClaude(t)
	relay := newFakeRelay()
	m := NewManager(t.TempDir(), binPath, relay)

	// Use a context that we cancel to force an error exit from Run
	ctx, cancel := context.WithCancel(context.Background())

	_, err := m.Spawn(ctx, Options{
		SessionID: "s-err",
		ChannelID: "c",
		CWD:       t.TempDir(),
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	// Cancel context to force Run to exit
	cancel()

	// Wait for cleanup
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if m.Get("s-err") == nil {
			return // Success: actor was cleaned up
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("actor still in manager after context cancel")
}

func TestLastSequencesSnapshot(t *testing.T) {
	binPath := buildFakeClaude(t)
	m := NewManager(t.TempDir(), binPath, nullRelay{})

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, _ = m.Spawn(ctx, Options{SessionID: "a", CWD: t.TempDir()})
	_, _ = m.Spawn(ctx, Options{SessionID: "b", CWD: t.TempDir()})

	snap := m.LastSequences()
	if _, ok := snap["a"]; !ok {
		t.Errorf("missing a in snapshot")
	}
	if _, ok := snap["b"]; !ok {
		t.Errorf("missing b in snapshot")
	}
	m.StopAll()
}
