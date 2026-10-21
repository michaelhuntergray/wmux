<!-- Moved verbatim from CLAUDE.md (MIC-34). -->

## CLI Reference

```bash
# System
wmux ping | identify | capabilities
wmux new-window | list-windows | focus-window <id>

# Workspaces
wmux new-workspace [--title T] [--shell S] [--cwd D] [--panes N] [--layout L]
                                       # --shell accepts args: --shell "ssh user@host"
                                       # --panes 1-8, --layout grid|columns|rows|left|down|single
                                       # Both default to the [workspace] setting (#212). This
                                       # command opened ONE pane before 2.8.0 while the sidebar
                                       # `+` opened three; they now agree, and `--panes 1` pins
                                       # the old CLI shape for a script that depended on it.
wmux close-workspace | select-workspace | rename-workspace | list-workspaces
wmux current-workspace [--surface <id>]                # alias: whoami — the caller's OWN
                                       # workspace {id,title,cwd,shell,surfaceId}.
                                       # Explicit error on an unknown surface, rather than the
                                       # focused workspace `list-workspaces` reports as active
wmux ssh [ssh options] <user@host> [--title T]         # remote terminal in a new workspace (issue #78)

# Workspace manifests (#284) — wmux.workspace.json / .wmux/workspace.json, docs/workspace-manifest.md
wmux workspace open [path] [--dry-run] [--new] [--json]   # path resolved against the CALLER's cwd. The reply
                                       # waits on a NATIVE trust dialog; there is deliberately no --trust
                                       # (a pane's agent holds the pipe token). --new = second copy
wmux workspace validate [path] [--json]
wmux workspace save [--to <dir|file.json>] [--name N] [--workspace <id>] [--force] [--stdout]
                                       # main RETURNS the manifest (workspace.export); the CLI writes it
wmux workspace list                    # manifests trusted on this machine

# Remote wmux management (issue #78): drive another machine's wmux over an SSH tunnel
wmux bridge [--port P] [--host H]     # on the remote: expose its pipe on TCP (default 127.0.0.1:9787)
wmux token                            # on the remote: print its auth token
wmux --remote host[:port] --token T <any command>   # on the client (through `ssh -L port:127.0.0.1:port`)
                                      # env equivalents: WMUX_REMOTE, WMUX_REMOTE_TOKEN

# Remote Console (#254): the phone browser UI — unrelated to --remote/bridge above
wmux remote status [--json]           # read-only: on/off, where it listens, device counts.
                                      # There is deliberately no CLI verb to enable, pair or
                                      # revoke — those are Settings → Remote clicks (I2)

# Markdown surfaces
wmux markdown <file> | markdown set <id> --content <text> [--title T] | --file <path>
wmux markdown get <id>                                 # read a surface's buffer back out

# Surfaces (tabs within a pane)
wmux new-surface [--type terminal|browser|markdown|prompts]
                                       # `prompts` is the prompt outline as a PANE
                                       # (#207): it lists whichever terminal last had
                                       # focus, so it needs no --surface, and its 🔓
                                       # button pins it to one when following focus is
                                       # the wrong behaviour (two terminals, watching
                                       # one while typing in the other)
wmux close-surface | focus-surface | rename-surface | list-surfaces

# Panes
wmux split [--down] [--type T] | close-pane | focus-pane | zoom-pane | list-panes | tree
                                       # --type takes the same set as new-surface, so
                                       # `wmux split --type prompts` puts the outline
                                       # beside the terminal in one command

# Layouts (what the orchestrator uses to place its agents)
wmux layout grid --count N [--type T] [--anchor-surface S] [--anchor-pane P] [--workspace W]
                                       # Rebuilds the WHOLE workspace as an anchor plus an
                                       # N-cell grid; every other pane is absorbed into the
                                       # anchor as tabs. Anchor defaults to $WMUX_SURFACE_ID.
wmux layout agents --count N [--type T] [--coordinator-ratio R] [--anchor-surface S]
                   [--anchor-pane P] [--workspace W]
                                       # Splits ONLY the anchor's pane into [anchor | N-cell
                                       # worker grid]; other panes are untouched. --count is
                                       # 1-16 CELLS, R is the anchor's share of the width
                                       # (default 0.4, clamped to 0.2-0.8), and the column
                                       # count follows the pane's measured aspect ratio.
                                       # Replies {newPaneIds, newPanes:[{paneId,surfaceId}],
                                       # anchorPaneId, cols, rows}. A bad count or ratio is
                                       # -32602 from main, before any window is asked. The
                                       # anchor is --anchor-pane, else --anchor-surface, else
                                       # $WMUX_SURFACE_ID, and never "the first pane": an
                                       # unresolvable anchor is an error, not a guess. An
                                       # explicit --anchor-pane that is not in the tree is a
                                       # miss and does not fall through to the surface, so
                                       # the CLI sends the caller's surface only when no
                                       # anchor flag was given.

# Terminal I/O
wmux send <text> | send-key <key> [--ctrl] [--shift] [--alt]
wmux read-screen [--lines N] [--surface <id>] | trigger-flash
wmux prompts [--surface <id>] [--limit N] [--json]     # the prompt log (issue #207)
                                       # What this pane has been asked, oldest first:
                                       # "#<seq>  <hh:mm>  <summary>". Surface defaults
                                       # to $WMUX_SURFACE_ID, so an agent inside a pane
                                       # needs no id; with no --surface at all it reports
                                       # every tracked pane. --json adds the full text,
                                       # the source (agent|shell) and the buffer line —
                                       # where `null` means the prompt has scrolled out
                                       # of history and is no longer jumpable.

# Browser — the same verbs on either engine, so agents need no re-education
wmux browser open <url> | snapshot | click eN | type eN <text>
wmux browser fill eN <value> | get-text | screenshot | eval <js>
wmux browser wait <ref> [ms] | back | forward | reload
wmux browser <verb> [--surface <id>]   # whose browser to drive; defaults to
                                       # $WMUX_SURFACE_ID inside a pane
wmux browser engine [web|agent] [--surface <id>]
                                       # print, or switch, which engine backs this
                                       # browser surface. `web` (the default, and
                                       # what every browser surface was before) is
                                       # the Electron <webview>, driven over CDP;
                                       # `agent` is vercel-labs/agent-browser — a
                                       # real Chrome the CLI drives, shown in the
                                       # pane through its own dashboard, deep-linked
                                       # to that surface's session. Every verb above
                                       # routes to whichever engine the surface is
                                       # on, which is why the global CLAUDE.md wmux
                                       # writes never has to mention any of this.
# ENGINE DIVERGENCE — the only one, so it is written down rather than discovered:
# `wmux browser wait <ref> [ms]` sends a ref AND a timeout. In `web` mode both reach
# cdpBridge.wait(ref, timeout) and the ms is honoured. agent-browser's `wait
# <selector>` has no per-call timeout flag at all — only the global
# AGENT_BROWSER_DEFAULT_TIMEOUT (25 s) — so in `agent` mode the caller's ms is
# DROPPED and the ref wins. Unrepresentable in argv, not fixable in the verb table;
# see the KNOWN ENGINE DIVERGENCE note in src/main/agent-browser-verbs.ts. Every
# other verb behaves identically on both engines. Since 2.10.3 (#228) it is at
# least SAID rather than silent: the agent-mode reply carries a `warning` field
# naming the dropped ms, and the same sentence goes to main's log. It rides on the
# REPLY and not only on `console.warn` because the caller is another process whose
# whole view of the command is the JSON it prints — a console-only warning was
# visible under `npm run dev` and in no packaged build. It is attached only in this
# already-divergent case, so everywhere the engines agree they still answer
# byte-identically.

# Declared agent state (issue #128) — blocked / working / idle, no screen scraping.
# Surface defaults to $WMUX_SURFACE_ID, so an agent inside a pane needs no id.
wmux report-agent --blocked "permission: Bash"   # parked on a human
wmux report-agent --blocked "Run it?" --choices '[{"id":"y","label":"Yes","key":"1"}]'
wmux answer-agent --surface <id> --choice y      # reply to ANOTHER pane, from yours
wmux report-agent --unblocked                    # the human answered
wmux report-agent --run-start | --run-end        # refcount, so nested subagents nest
wmux report-agent --run-depth N [--seq N]        # absolute depth; --seq drops replays
wmux report-metadata [--model M] [--tokens T] [--context-pct N] [--ttl ms]
wmux report-session <id> | release-agent
wmux report-subagent <id> [--name N] [--detail D] [--done]   # a line under your pane (#272); same id = update+heartbeat
wmux agent-state [--surface <id>]                # no --surface → all panes + blocked list

# Agents
wmux agent spawn [--cmd C] [--label L] [--cwd D] [--pane P] [--replace-tab]
wmux agent spawn-batch --json '[...]' [--strategy distribute|stack|split] [--workspace W]
                                       # --pane on `spawn` is FULLY specifying since
                                       # 2.13.0 (#242): the workspace is derived from
                                       # the pane that owns it, never from whichever
                                       # one is focused, and naming both when they
                                       # disagree is -32602 rather than a record that
                                       # pairs a pane with a workspace not containing
                                       # it. `spawn-batch` grew --workspace at the same
                                       # time — main honoured a workspace it had no way
                                       # to be told about, and its panes came off the
                                       # ACTIVE workspace regardless.
wmux agent status <id> | list | kill <id>

# Notifications & Sidebar
wmux notify <text> | list-notifications | clear-notifications
wmux set-status <key> <value> | set-progress <val> [--label L]
wmux log <level> <message> | sidebar-state

# Hooks
wmux hook --event <type> --tool <name> [--agent <id>] [--prompt <text>]
wmux opencode-tui [--remove]   # CLI-side (TUI) OpenCode v2 half, in THIS environment (#310)

# Crash reports (issue #174) — needs no running wmux, which is the point
wmux crash-report [--events N] [--log-lines N]
# Event Log fingerprint (Application Error 1000 + Windows Error Reporting 1001,
# joined on report id) plus the tail of %APPDATA%\wmux\logs\main.log. Read from
# the events' positional Properties, never the rendered message: the message is
# LOCALISED (a French Windows says "Nom du module défaillant") and matching the
# exe by substring attributed a sibling project's crash to wmux. Never reads
# properties [10]/[11] — those are full paths, and the path carries the
# Windows username. See docs/crash-reports.md.
```

---

