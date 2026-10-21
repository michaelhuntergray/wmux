# wmux — Development Guide

Electron-based Windows terminal multiplexer for AI agents. TypeScript, React 19, Zustand, xterm.js, node-pty.

**Owner**: amirlehmam (GitHub) — speaks French, prefers fast pragmatic solutions, tests live.
**Repo**: github.com/amirlehmam/wmux | **Site**: wmux.org (Netlify, static from `site/`)
**Version**: 2.33.0

---

## Build & Dev

```bash
npm run dev            # Vite (port 5199) + Electron hot-reload
npm run build:main     # tsc main/preload/cli only (fast iteration)
npm run build:renderer # Vite production build: BOTH entries (desktop index.html + remote/index.html), writes dist/renderer/remote-manifest.json (the console server refuses to serve without it)
npm run build          # Full: tsc + vite + electron-builder
npm test               # Vitest unit tests
npm run test:watch     # Vitest watch mode
npm run lint           # ESLint src/
```

### Known Build Gotcha

Project lives in `OneDrive - Pulsa` (path with spaces). This breaks:
- `npm link` / `node-gyp` (can't build node-pty)
- `electron-builder` winCodeSign (symlink errors)

**Workaround**: Don't use `electron-builder` for the final package. Use ASAR-based manual packaging (see `docs/dev/release-process.md`).

---

## Detail docs (read the one you need)

The detail that used to live here is in `docs/dev/`, moved verbatim:

| File | Covers |
|---|---|
| `docs/dev/architecture.md` | Source layout, main process, renderer, preload API (`window.wmux`) |
| `docs/dev/design-decisions.md` | No MCP, branded IDs, keep-alive tabs, split tree, prompt boundaries (#207) |
| `docs/dev/release-process.md` | **CRITICAL** manual ASAR release steps, checklist, important notes |
| `docs/dev/pipe-handlers-and-plugin.md` | Named pipe V2 handlers, wmux-orchestrator plugin |
| `docs/dev/cli-reference.md` | Every `wmux` CLI command, including browser engine divergence |
| `docs/dev/ipc-and-shell-integration.md` | IPC channels, shell integration |
| `docs/dev/website-and-testing.md` | wmux.org deploy, test file list |

Before touching a release, read `docs/dev/release-process.md` in full. Before changing the prompt-boundary code, read `docs/dev/design-decisions.md`.

---

## Conventions

- **State**: Zustand slices in `src/renderer/store/`, composed in `index.ts`
- **IPC**: Channels defined in `src/shared/types.ts`, never use magic strings
- **CSS**: `src/renderer/styles/`, class prefix per component (`.pane-wrapper__*`, `.surface-tab__*`)
- **Immutable trees**: Split tree mutations always produce new objects via `patchLeaf()`
- **PTY IDs = Surface IDs**: Always pass `surfaceId` when creating PTYs for reliable re-attachment
- **No MCP**: All Claude Code integration via CLI commands (add commands in `src/cli/wmux.ts`)
- **French comms**: User communicates in French, code/docs in English
