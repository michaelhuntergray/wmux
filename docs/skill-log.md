# Skill log

## MIC-627 Linux port
- Tried: socket path in shared/instance.ts + CLI restatements, $SHELL→bash default, AppImage target, two workflows.
- Worked: win32 branches kept intact; `npm ci` needs `--ignore-scripts` locally (node-pty build).
- Didn't: Bash tool in this environment was flaky/slow on git-only commands.
- Candidate skill: `wmux-linux-port` (write to .claude/skills was permission-denied; not added). Content: the four-place socket-path rule (instance.ts, wmux.ts, wmux-hook.ts, PipeServer), keep src/cli-bin/wmux at mode 100755, tag only by hand.

## MIC-762 Claude pointer and global skill
- Tried: test the public ensure/remove filesystem behavior in a temporary HOME before changing the writer.
- Worked: keep the full resource as the skill source, render both resources with the same CLI path resolver, and compare contents before rewriting.
- Corrected: the full resource uses CRLF, so strip marker lines after splitting on either line ending.
- Candidate skill: none; this was a one-off resource split.
