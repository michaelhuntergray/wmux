/**
 * Where the `wmux` CLI entry points live on this install.
 *
 * Split out of pty-manager.ts because two very different callers need the same
 * answer and must not disagree about it: the PTY spawner, which prepends these
 * directories to PATH so bare `wmux` resolves inside a pane, and the agent
 * context writers, which have to tell a session that is NOT inside a pane where
 * to find the CLI (issue #158).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Stable home of the AppImage's CLI copy (holds wmux.js and a `wmux` link to it). */
export function getAppImageCliDir(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.HOME || os.homedir();
  return path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'wmux', 'cli');
}

/**
 * Linux AppImage only: copy the bundled CLI out of the per-launch /tmp/.mount_*
 * dir to ~/.local/share/wmux/cli and link ~/.local/bin/wmux to it, so the path
 * the agent block names (getCliBinDirForInstructions) exists after the mount is
 * gone. Re-run every launch so an updated AppImage refreshes the copy. A real
 * file at the link path is the user's and is left alone. Returns the link path,
 * or undefined when nothing was done.
 */
export function ensureAppImageCliLink(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  resourcesPath: string = process.resourcesPath,
): string | undefined {
  if (platform !== 'linux' || !env.APPIMAGE || !resourcesPath) return undefined;
  const home = env.HOME || os.homedir();
  const src = path.join(resourcesPath, 'cli');
  if (!fs.existsSync(path.join(src, 'wmux.js'))) return undefined;
  const dest = getAppImageCliDir(env);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  const cli = path.join(dest, 'wmux.js');
  fs.chmodSync(cli, 0o755);
  // `<dir>/wmux` is what the agent block calls, so the copy dir works without the PATH link.
  fs.symlinkSync('wmux.js', path.join(dest, 'wmux'));
  const bin = path.join(home, '.local', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const link = path.join(bin, 'wmux');
  let existing: fs.Stats | undefined;
  try { existing = fs.lstatSync(link); } catch { /* absent */ }
  if (existing && !existing.isSymbolicLink()) return undefined;
  if (existing) fs.unlinkSync(link);
  fs.symlinkSync(cli, link);
  return link;
}

/**
 * Dir holding the `wmux`/`wmux.cmd` shims (each runs `node $WMUX_CLI`).
 *
 * Prepended to PATH in every spawned shell so bare `wmux` resolves in
 * NON-interactive shells too (Claude Code's Bash tool, orchestrator hook
 * scripts) — the interactive `wmux` shell function only exists in the pane's
 * own interactive shell. The dir has no wmux.exe, so there is no PATHEXT
 * collision with the GUI.
 */
export function getCliBinPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron') as typeof import('electron');
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'cli-bin');
    }
  } catch {
    // Not running in Electron
  }
  return path.join(__dirname, '../../src/cli-bin');
}
