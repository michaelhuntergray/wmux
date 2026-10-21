<!-- Moved verbatim from CLAUDE.md (MIC-34). -->

## Key Design Decisions

### No MCP — CLI Only
Do NOT build MCP servers. Use the wmux CLI (`wmux <command>`) via Bash instead.
The CLI talks to the named pipe, which is simpler and more reliable.
For new Claude Code integrations, add CLI commands in `src/cli/wmux.ts`.

### Branded ID Types
`WorkspaceId`, `PaneId`, `SurfaceId`, `WindowId` — branded string types in `src/shared/types.ts`.
Pattern: `surf-{uuid}`, `pane-{uuid}`, `ws-{uuid}`, `win-{uuid}`.

### Keep-Alive Tabs
Terminal tabs in a pane are ALL rendered simultaneously (hidden with `visibility: hidden`).
When switching tabs, only CSS changes — the xterm instance stays alive, no PTY reconnection needed.
The `surfaceId` is passed to `pty.create()` so PTY ID = Surface ID (enables reliable re-attachment).

### Split Tree
Pane layouts use an immutable binary tree (`SplitNode`). Each leaf = one pane with N surfaces (tabs).
Mutations go through `splitNode()`, `removeLeaf()`, `findLeaf()`, `getAllPaneIds()` in `split-utils.ts`.

### Prompt Boundaries — One Producer, Four Views (issue #207)

Highlighting a prompt, pinning it, anchoring the view at the start of an answer and
listing prompts as jump marks are four consumers of ONE fact: where a user prompt
starts. So there is one producer (`utils/prompt-log.ts`) and four independent,
individually-toggleable views — not four detectors.

Two sources feed it, **ranked and never merged**, the shape `ssh-detect.ts` uses:

| Source | Carries | Where |
|--------|---------|-------|
| `agent` | The prompt TEXT, verbatim | Claude Code's `UserPromptSubmit` hook → `wmux-hook.js` → pipe → `App.tsx`; since #304 also the OpenCode plugin's v2 prompt-admission hook → `wmux hook --prompt` → the same `App.tsx` handler; and the CLI-side (TUI) half's `session.inbox.enqueued` (remote/shared servers, #310) → the same CLI path |
| `shell` | A boundary, no text | OSC 133 (FinalTerm) from the shell integration → the xterm parser |

There is deliberately **no heuristic third source**. wmux stopped guessing agent state
from screen scraping in 0.39.0 (#128) and this does not reintroduce it: with neither
source present the log stays empty and every view is inert. That is the honest outcome —
a mis-detected boundary pins the wrong text and anchors the view to the wrong line, and
the user has no way to tell it happened.

Four things about this are easy to get wrong and expensive to rediscover:

- **`layer: 'bottom'` does NOT put a decoration under the glyphs, and cannot.** xterm
  gives its decoration container `z-index: 6` while the renderer's canvas is `z-index: 2`,
  so a decoration's DOM element always paints OVER the text; `layer` orders decorations
  against each other and nothing else. 2.4.0 tinted the prompt rows with a CSS
  `::before` on that element, which therefore had to sit at `opacity: .12` or it washed
  out the text it was pointing at — and at 12% over a terminal background every hue
  collapses to the same near-neutral grey. The colour picker in Settings → Prompts
  worked perfectly and looked completely broken; users reported it as "the rail is
  always grey whatever colour I pick". The tint is now the decoration's
  `backgroundColor`, which both renderers composite into the CELL background before
  drawing glyphs — the layer the CSS was only pretending to be on. Two consequences:
  the alpha must be **pre-blended in JS** against `terminal.options.theme.background`
  (xterm IGNORES the alpha channel there — `#ff2d5540` and `#ff2d55` paint identically),
  and the rail stays in CSS as the one element carrying the user's colour at full
  saturation. If you are ever tempted to style a decoration's background in CSS again,
  this is why it does not work.
- **The prompt text is read out of the BUFFER for a shell**, never sent over the pipe.
  Main already refuses to broadcast `report_command` to a renderer because a command
  line is where a credential reliably shows up (`index.ts`, the `report_command`
  hard-stop). The renderer is already displaying those bytes, so lifting them from the
  buffer adds no new crossing. Only the agent source sends text, and only because an
  agent TUI repaints over its own input box — nothing that reads the screen afterwards
  can recover it.
- **Markers do not survive a split-tree restructure.** A remount replays the buffer as
  serialized TEXT (`snapshotSurfaceBuffer`), which carries no markers. Those prompts stay
  in the outline with `line: null` and a disabled jump, rather than scrolling the user
  somewhere arbitrary.
- **The anchor's pending-line count is NOT in the store.** It changes on every PTY chunk;
  a store write there re-renders every subscriber at PTY speed, which is the shape of
  #141. It lives in a module map like `surfaceMouseModes`, and the pill subscribes to a
  throttled DOM event.
- **A marker binds a highlight to a LINE, which is only the same as binding it to
  CONTENT for a shell** (#230, 2.10.5). A command row in scrollback is never rewritten;
  an agent TUI repaints its input box and status row over the same lines several times a
  second, and the submit-time cursor — the only line wmux has when `UserPromptSubmit`
  arrives — sits inside that region. `refineMark` gets out of it by finding the echoed
  row, but it MISSES on a prompt under `MIN_NEEDLE` or one the TUI reflowed, and the
  band then tinted `✳ Germinating… (1m 15s)`. So the tint is a claim about text, checked
  before registering AND in `onRender` — which fires when a row is laid out and only
  then, so scrollback costs nothing and a timer would be #141. A failed check drops the
  tint and the rail, keeps the ruler tick, and an *uncheckable* prompt falls back to what
  its SOURCE can promise (`confirmed`: true for OSC 133, false for an agent's guess). The
  match is stored as an OFFSET from the marker so the re-check is one row; termination is
  structural, not a retry count — the degraded re-apply registers no `onRender`.
  `refreshHighlights` also runs on resize, and not because the marks die: xterm 6 reflows
  markers with their content (verified — narrowing 80→40 moved `marker.line` 20→40 still
  pointing at the same text). It is the decoration that goes stale, since its `width` was
  `terminal.cols` at registration time.

Defaults: `highlight` and `anchor` ON, `pin` OFF (it costs vertical space), `outline`
available but closed, and `anchorScope: 'agent'` — anchoring applies to AGENT answers
only. That last one is the load-bearing default: a shell following its own output is
not the problem #207 describes, it is what every terminal has done for forty years, and
silently holding `npm run build` back from streaming reads as a freeze rather than as a
feature. `'all'` opts shell command lines in.

Governed by `promptDefaultRev` — changing any of them later needs a rev bump plus a
`PROMPT_PROMOTIONS` entry, or it reaches nobody (prefs persist as whole blocks). Adding
a NEW field is free (`{...DEFAULTS, ...stored}` fills it in); only changing an existing
default needs the rev.

**The outline has two presentations, and `outlineMode` picks which one the command
opens.** `'overlay'` is the docked panel from 2.4.0 — it floats over the terminal it
lists, which is right for a glance and wrong for anything you keep open, because it
covers the output it is describing. `'pane'` opens a `prompts` SURFACE instead, which
lives in the split tree and so splits, resizes and persists like any other pane.
`'overlay'` stays the default: a preference that silently changes what an existing key
does is a bug report. Both are always reachable — the tab bar's `+` menu and
`wmux new-surface --type prompts` make a pane regardless of the setting, and
`outlineSide` is greyed out under `'pane'` because the split tree already decides that.
Neither is a second implementation: both read the same per-surface prompt log and jump
through the same marks.

**Anchoring is armed before it is engaged, and the distinction is the whole design.**
A prompt is submitted at the BOTTOM of the buffer, so its line is `>= ydisp`.
`scrollToLine` on such a line takes xterm's "already at the bottom" branch: it sets
`isUserScrolling = false`, clamps, and does not move. The next write then scrolls, and
`BufferService` does `if (!isUserScrolling) ydisp = ybase` before firing `onScroll` — so
a naive listener sees `viewportY === baseY`, reads it as "the user caught up", and
releases. Every time, on the first line of output. The first implementation did exactly
that and the feature held nothing; the tests missed it because the fake terminal let
`scrollToLine` move the viewport anywhere. So: **armed** = recorded but the prompt is
still on the last screen and nothing is hidden; **engaged** = the buffer has grown past
it and the viewport is genuinely held. The release-on-bottom rule applies only while
engaged. `tests/unit/prompt-anchor.test.ts` models xterm's real clamp and its
fill-the-screen-then-grow-baseY behaviour, and pins this.

The anchor holds a **resolver**, not a line number: an absolute buffer line stops meaning
the same row once the scrollback fills and lines are trimmed off the top. The prompt's
xterm marker tracks that; a snapshot does not. A resolver answering null (the marker
died) is the anchor's cue to let go rather than hold a row that no longer exists.

---

