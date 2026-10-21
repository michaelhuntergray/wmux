<!-- Moved verbatim from CLAUDE.md (MIC-34). -->

## Named Pipe V2 Handlers

The pipe server in `index.ts` handles V2 JSON-RPC methods. Most delegate to the renderer via `executeJavaScript('window.__wmux_*(...)')`. The renderer's `pipe-bridge.ts` exposes Zustand store operations as these globals.

**Fully implemented V2 methods:**
- `system.identify`, `system.capabilities`, `system.tree`
- `workspace.create`, `workspace.close`, `workspace.select`, `workspace.rename`, `workspace.list`, `workspace.current`
- `pane.split`, `pane.close`, `pane.focus`, `pane.zoom`, `pane.list`
- `layout.grid`, `layout.agents` — both bridged by `v2-bridge.ts`. `layout.agents` (#255) splits ONLY the anchor's pane into `[anchor | worker grid]` (`buildAgentLayout` in `split-utils.ts`, anchor and size resolved by `store/agent-layout-target.ts`), where `layout.grid` rebuilds the whole workspace. It is the one bridge spec with a `validate`: a bad `count` (1-16) or a non-finite `coordinatorRatio` is -32602 from main before any window is looked up, because a renderer that received `count: null` would have to guess. The CLI side (`layoutAgentsParams`) goes through `parseFlagArgs` like `layout grid`
- `surface.create`, `surface.close`, `surface.focus`, `surface.rename`, `surface.list`
- `surface.send_text`, `surface.send_key`, `surface.read_text`, `surface.trigger_flash`
- `surface.list_prompts` — the prompt log (#207). Diverges from `surface.read_text` on the multi-window lookup, deliberately: `read_text` can tell "this window does not own that terminal" from "the screen is blank" and so takes the first window that answers without an error, but a prompt log cannot — an unowned surface and a surface with nothing recorded both answer `[]`. So the targeted form takes the first NON-EMPTY answer, and the untargeted form MERGES across windows rather than reading the first reply, since "every tracked surface" is a fact about the app and each window keeps its own store
- `markdown.set_content`, `markdown.load_file`, `markdown.get_content`
- `notification.list`, `notification.clear`
- `sidebar.set_status`, `sidebar.set_progress`, `sidebar.log`, `sidebar.get_state`
- `browser.*` — routed per surface by its engine: `web` → the CDP bridge, `agent` → the agent-browser CLI. `engineForSurface` asks the RENDERER (the split tree lives in the Zustand store, main has no copy) and asks EVERY window, first affirmative wins — the surface may be in window 2, the #143 "window ≠ workspace" mistake. A renderer that has never heard of `__wmux_getBrowserEngine`, or a rejected `executeJavaScript`, answers `web`: this runs on the hot path of every browser command, where it previously did no renderer IPC at all. The engine is re-checked on **every** outcome of target resolution, not only when there was no wcId — a surface toggled web→agent keeps a valid CDP registration (nothing detaches on a toggle), so the null-branch-only shortcut drives CDP against agent-browser's own dashboard SPA and silently corrupts the pane the user is watching
- `browser.get_engine`, `browser.set_engine` — matched BEFORE the generic `browser.*` passthrough, or they fall into the verb switch and come back as `Unknown: browser.get_engine` (-32601). `set_engine` validates `web`/`agent` and refuses a surface that is not a browser surface
- `agent.spawn`, `agent.spawn_batch`, `agent.status`, `agent.list`, `agent.kill`
- `pane.report_agent`, `pane.report_agent_session`, `pane.report_metadata`, `pane.release_agent`, `pane.agent_state`
- `pane.answer_agent` — the back-channel (issue #128). The only non-`report_*` method: it WRITES into a pane's PTY. Guarded — refuses unless the pane is currently `blocked`, and only ever sends a payload the agent itself declared
- `hook.event`, `diff.refresh`
- `agent.subagent` — `wmux report-subagent` (#272): a declared subagent line under the caller's pane, upserted by id in `claude-observer.ts`. Display only — it never touches the declared blocked/working state. Claude Code subagents arrive the same way with no CLI call: `wmux-hook.js` forwards the payload's `agent_id`/`agent_type` (present only inside a subagent, and on the `SubagentStart` hook wmux now registers), and `applyHookLifecycle` tracks them by id. A declared subagent is ended ONLY by its own stop or `SessionEnd`, never by the parent's `Stop` — a background subagent outlives the turn that launched it, which is the whole bug. Ghost guard: a running declared line silent for `DECLARED_SUBAGENT_TTL_MS` (10 min) is not drawn
- `remote.status` — the Remote Console's ONLY pipe method (#254, I2), read-only: `{enabled, running, bind, port, publicUrl, deviceCount, connectedCount, lastError}`. Matched as the FIRST statement of `routeSpecialV2`, by exact name, and deliberately NOT in `PUBLIC_V2_METHODS`, so it needs the pipe token. Pairing, enabling, rebinding and revoking have no pipe method at all, on purpose — `tests/unit/remote-console-wiring.test.ts` pins that `index.ts` names exactly one `remote.` method

---

## wmux-orchestrator Plugin

**DEPRECATED in 2.12.0 (issue #239). wmux no longer installs this, and removes it if a previous version did.**

It never loaded: `ensurePluginRegistered()` wrote Claude Code's `installed_plugins.json` at the top level as an object, while that file is v2 (`{version:2, plugins:{"<plugin>@<marketplace>":[…]}}`) and its cache is `cache/<marketplace>/<plugin>/<version>`, not wmux's `cache/<plugin>/<version>`. Claude Code listed nothing, loaded no skill or command, and wrote `.orphaned_at` through the copied tree — while `enabledPlugins` said `true` and wmux logged an install. The supported repair is a local marketplace; it was not worth doing, because Claude Code now runs parallel agents natively.

The source still ships in `resources/wmux-orchestrator/` — `scripts/launch-agent.js` is the shared agent-command registry that `omp-context`/`pi-context` tests read, and the plugin remains installable standalone from `github.com/amirlehmam/wmux-orchestrator`. Unaffected by the deprecation: the sidebar orchestration panel (`orchestration-watcher.ts` reads a run's `state.json` and does not care who wrote it), `wmux agent spawn`, and the OpenCode plugin, which installs correctly and is what the `orchestrator` consent feature still controls.

**What it does:** Decomposes complex dev tasks into parallel Claude Code agents coordinated through dependency-aware waves with automated review. With wmux: each agent in its own visible terminal pane. Without wmux: falls back to native subagents.

**Plugin structure:**
```
resources/wmux-orchestrator/
  .claude-plugin/plugin.json    Manifest (name, version, author)
  skills/orchestrate/SKILL.md   Core: codebase analysis, wave planning, agent spawning. Invoked as
                                /wmux-orchestrator:orchestrate <task>; there is deliberately no command
                                of the same name (a command and a skill sharing it loop into each other)
  skills/reviewer/SKILL.md      Post-orchestration review and auto-fix
  skills/wmux-detect/SKILL.md   Detects wmux availability for degraded mode
  agents/wmux-worker.md         Worker template with file zone enforcement
  hooks/hooks.json              PostToolUse, SubagentStop, Stop, SessionStart
  scripts/json-tool.js          Node.js JSON helper (replaces jq)
  scripts/orchestration-state.sh  State file management library
  scripts/spawn-agents.sh       Creates panes (`layout agents`) + launches Claude Code agents
  scripts/reap-wave.sh          Kills a wave's agents and closes their tabs; also run by the Stop hook,
                                which reaps only a `complete` run whose recorded coordinator is the
                                hook's OWN pane (it fires in every session, workers included). Never
                                closes the caller's or the coordinator's surface; a failed close is
                                left unstamped so it is retried. failed/aborted runs: cleanup.sh only
  scripts/on-agent-stop.sh      Wave transition driver (core orchestration)
  scripts/check-status.sh       Markdown dashboard generator
  scripts/*.sh                  Other utilities (cleanup, collect-results, etc.)
```

**Key design:** Skills handle intelligence (prompts), hooks handle reactivity (events), scripts handle wmux operations (CLI). State shared via JSON file in TMPDIR. No daemon.

---

