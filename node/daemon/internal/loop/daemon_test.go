package loop

import (
	"encoding/json"
	"net/url"
	"path/filepath"
	"sync"
	"testing"

	"github.com/gsd-build/daemon/internal/config"
	"github.com/gsd-build/daemon/internal/session"
	"github.com/gsd-build/daemon/internal/wal"
	protocol "github.com/gsd-build/protocol-go"
)

// captureRelay records all messages sent through it for test assertions.
type captureRelay struct {
	mu    sync.Mutex
	sends []json.RawMessage
}

func (r *captureRelay) Send(msg any) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if raw, ok := msg.(json.RawMessage); ok {
		r.sends = append(r.sends, raw)
	}
	return nil
}

func TestWelcomeReplay(t *testing.T) {
	walDir := t.TempDir()
	sessionID := "sess-replay"
	walPath := filepath.Join(walDir, sessionID+".jsonl")

	// Write 10 entries to WAL
	w, err := wal.Open(walPath)
	if err != nil {
		t.Fatal(err)
	}
	for i := int64(1); i <= 10; i++ {
		data, _ := json.Marshal(map[string]any{"seq": i, "event": "test"})
		if err := w.Append(i, data); err != nil {
			t.Fatalf("append %d: %v", i, err)
		}
	}
	w.Close()

	relay := &captureRelay{}
	d := &Daemon{
		walDir:  walDir,
		manager: session.NewManager(walDir, "fake", relay),
		sender:  relay,
	}

	welcome := &protocol.Welcome{
		Type:                    protocol.MsgTypeWelcome,
		AckedSequencesBySession: map[string]int64{sessionID: 5},
	}

	if err := d.handleWelcomeReplay(welcome); err != nil {
		t.Fatalf("handleWelcomeReplay: %v", err)
	}

	// Should have sent entries 6-10 (5 entries with seq > 5)
	relay.mu.Lock()
	sentCount := len(relay.sends)
	relay.mu.Unlock()
	if sentCount != 5 {
		t.Fatalf("expected 5 replayed entries, got %d", sentCount)
	}

	// Verify WAL was pruned: only entries > 5 remain
	w2, err := wal.Open(walPath)
	if err != nil {
		t.Fatal(err)
	}
	defer w2.Close()
	entries, _ := w2.ReadFrom(0)
	if len(entries) != 5 {
		t.Fatalf("expected 5 remaining WAL entries after prune, got %d", len(entries))
	}
	if entries[0].Seq != 6 {
		t.Errorf("expected first remaining seq=6, got %d", entries[0].Seq)
	}
}

func TestWelcomeReplayNoWAL(t *testing.T) {
	walDir := t.TempDir()
	relay := &captureRelay{}
	d := &Daemon{
		walDir:  walDir,
		manager: session.NewManager(walDir, "fake", relay),
		sender:  relay,
	}

	// Welcome references a session with no WAL file
	welcome := &protocol.Welcome{
		Type:                    protocol.MsgTypeWelcome,
		AckedSequencesBySession: map[string]int64{"nonexistent": 10},
	}

	// Should not error
	if err := d.handleWelcomeReplay(welcome); err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	relay.mu.Lock()
	sentCount := len(relay.sends)
	relay.mu.Unlock()
	if sentCount != 0 {
		t.Fatalf("expected 0 sends for missing WAL, got %d", sentCount)
	}
}

func TestWelcomeReplayNilWelcome(t *testing.T) {
	d := &Daemon{walDir: t.TempDir()}
	if err := d.handleWelcomeReplay(nil); err != nil {
		t.Fatalf("nil welcome should not error: %v", err)
	}
}

func TestRelayURLIncludesMachineIDAndToken(t *testing.T) {
	cfg := &config.Config{
		MachineID: "machine-uuid-123",
		AuthToken: "token-with-special/chars+",
		RelayURL:  "wss://relay.example.com/ws/daemon",
	}

	got := buildRelayURL(cfg)

	parsed, err := url.Parse(got)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	q := parsed.Query()
	if q.Get("machineId") != "machine-uuid-123" {
		t.Errorf("missing or wrong machineId: %q", q.Get("machineId"))
	}
	if q.Get("token") != "token-with-special/chars+" {
		t.Errorf("missing or wrong token: %q", q.Get("token"))
	}
	if parsed.Host != "relay.example.com" {
		t.Errorf("unexpected host: %q", parsed.Host)
	}
	if parsed.Path != "/ws/daemon" {
		t.Errorf("unexpected path: %q", parsed.Path)
	}
}

func TestRelayURLPreservesExistingQuery(t *testing.T) {
	cfg := &config.Config{
		MachineID: "machine-uuid-123",
		AuthToken: "token-with-special/chars+",
		RelayURL:  "wss://relay.example.com/ws/daemon?version=2",
	}

	got := buildRelayURL(cfg)

	parsed, err := url.Parse(got)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	q := parsed.Query()
	if q.Get("machineId") != "machine-uuid-123" {
		t.Errorf("missing or wrong machineId: %q", q.Get("machineId"))
	}
	if q.Get("token") != "token-with-special/chars+" {
		t.Errorf("missing or wrong token: %q", q.Get("token"))
	}
	if q.Get("version") != "2" {
		t.Errorf("existing query param lost; version: %q", q.Get("version"))
	}
	if parsed.Host != "relay.example.com" {
		t.Errorf("unexpected host: %q", parsed.Host)
	}
	if parsed.Path != "/ws/daemon" {
		t.Errorf("unexpected path: %q", parsed.Path)
	}
}
