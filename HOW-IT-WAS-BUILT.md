# How it was built (Linux fork)

## 1. Merge upstream into the fork
Decided by the user (ticket); Claude executed. Upstream v2.59.1 was merged, not rebased, so no pushed history was rewritten. Linux pieces were kept: the Unix socket, shell candidates, the AppImage CLI dir and the electron-builder target. Taking upstream's `agent-instructions.ts` wholesale dropped the AppImage CLI logic; a unit test caught it and it was restored.
**Status:** verified (merged PR, `agent-instructions` test passes).

## 2. Native module and token path
node-pty has no Linux prebuild, so packaging needs `electron-rebuild -w node-pty`. The CLI looked for its token under `APPDATA`; it now uses `XDG_CONFIG_HOME` or `~/.config` on Linux. Claude proposed both; codex approved.
**Status:** verified (AppImage starts, `wmux ping` answers `pong`).

## 3. Panes died on launch
Upstream forced `wsl.exe` for POSIX cwds and fell back to `C:\` when spawning. Both are now gated to Windows hosts, and `workspaceFallbackCwd` keeps POSIX cwds on Linux. Codex rejected the first version because `workspaceFallbackCwd` still discarded POSIX cwds; that was fixed and approved.
**Status:** verified (42 tests pass; three tmux workspaces run on lab).

## 5. Merge upstream v2.64.3 and script the update
The user asked for the newest upstream and for every later release to be ported. Claude merged upstream v2.64.3 (two conflicts: an import list in `pipe-bridge.ts`, two test blocks in `agent-instructions.test.ts`; both sides kept), rebuilt node-pty, built the AppImage and installed it over the old one, keeping a backup. The steps are now `tools/wmux/linux/update-wmux.sh` in the harness repo. Rejected: rebasing (rewrites pushed history).
**Status:** verified for the build and the unit suite (no new failing test file against the pre-merge base; the one new failure was node-pty not yet rebuilt). Assumed for runtime: the new AppImage has not been started yet, because the running instance hosts live panes. It is settled by `wmux ping` after the next restart.

## Open questions
- 21 tests (markdown-image, pi-resume, terminal-file-link) fail on Linux, on pristine upstream too. Cause not investigated.
- The `Windows` user-agent check assumes the renderer's user agent reports the host OS. Not tested on Windows.
