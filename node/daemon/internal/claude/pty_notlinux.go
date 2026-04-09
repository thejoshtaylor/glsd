//go:build !windows && !linux

package claude

import "syscall"

// ptySysProcAttr returns SysProcAttr for child processes on non-Linux
// Unix platforms (macOS, FreeBSD). Pdeathsig is not available on these
// platforms; orphan prevention relies on the signal handler in cmd/start.go.
//
// Ctty MUST match the fd where the pty slave lands in the child.
// Under the split stdio layout:
//
//	fd 0 = stdin pipe (from cmd.StdinPipe)
//	fd 1 = pty slave  (from cmd.Stdout = tty)
//	fd 2 = stderr pipe (from cmd.StderrPipe)
func ptySysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{
		Setsid:  true,
		Setctty: true,
		Ctty:    1,
	}
}
