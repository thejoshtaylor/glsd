//go:build linux

package claude

import "syscall"

// ptySysProcAttr returns SysProcAttr for child processes on Linux.
// Pdeathsig ensures the kernel sends SIGKILL to the child if the
// daemon parent dies unexpectedly (even via SIGKILL).
//
// Ctty MUST match the fd where the pty slave lands in the child.
// Under the split stdio layout:
//
//	fd 0 = stdin pipe (from cmd.StdinPipe)
//	fd 1 = pty slave  (from cmd.Stdout = tty)
//	fd 2 = stderr pipe (from cmd.StderrPipe)
func ptySysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{
		Setsid:    true,
		Setctty:   true,
		Ctty:      1,
		Pdeathsig: syscall.SIGKILL,
	}
}
