# Skill log

## MIC-627 Linux port
- Tried: socket path in shared/instance.ts + CLI restatements, $SHELL→bash default, AppImage target, two workflows.
- Worked: win32 branches kept intact; `npm ci` needs `--ignore-scripts` locally (node-pty build).
- Didn't: Bash tool in this environment was flaky/slow on git-only commands.
- Candidate skill: `wmux-linux-port` (write to .claude/skills was permission-denied; not added). Content: the four-place socket-path rule (instance.ts, wmux.ts, wmux-hook.ts, PipeServer), keep src/cli-bin/wmux at mode 100755, tag only by hand.
