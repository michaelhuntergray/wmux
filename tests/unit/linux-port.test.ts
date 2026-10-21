import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { PipeServer, clearStaleSocket, isUnixSocketPath } from '../../src/main/pipe-server';
import { defaultShellCandidates } from '../../src/main/pty-manager';

// MIC-627: Linux behaviour of the socket and shell selection. The socket tests
// need a real Unix socket, so they run only off Windows (CI's Linux job).
const unix = process.platform !== 'win32';

describe('default shell candidates', () => {
  it('prefers bash, then $SHELL, off Windows', () => {
    expect(defaultShellCandidates('linux', { SHELL: '/usr/bin/fish' })).toEqual(['bash', '/usr/bin/fish']);
  });
  it('drops an unset or duplicate $SHELL', () => {
    expect(defaultShellCandidates('linux', {})).toEqual(['bash']);
    expect(defaultShellCandidates('linux', { SHELL: 'bash' })).toEqual(['bash']);
  });
  it('keeps the Windows order', () => {
    expect(defaultShellCandidates('win32', { SHELL: '/bin/zsh' })).toEqual(['pwsh.exe', 'powershell.exe', 'cmd.exe']);
  });
});

describe('isUnixSocketPath', () => {
  it('is true only for absolute paths off Windows', () => {
    expect(isUnixSocketPath('/run/user/1000/wmux.sock', 'linux')).toBe(true);
    expect(isUnixSocketPath('\\\\.\\pipe\\wmux', 'win32')).toBe(false);
    expect(isUnixSocketPath('/x', 'win32')).toBe(false);
  });
});

describe.runIf(unix)('Unix socket startup', () => {
  let dir: string;
  let server: PipeServer | undefined;
  let other: net.Server | undefined;

  afterEach(() => {
    server?.stop();
    other?.close();
    server = other = undefined;
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  const tmpSock = () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wmux-sock-'));
    return path.join(dir, 'wmux.sock');
  };

  const ping = (p: string) => new Promise<string>((resolve, reject) => {
    const c = net.connect({ path: p }, () => c.write('ping\n'));
    c.on('data', (d) => { c.end(); resolve(d.toString().trim()); });
    c.on('error', reject);
  });

  it('unlinks a stale socket file nobody answers on', async () => {
    const sock = tmpSock();
    fs.writeFileSync(sock, '');
    await clearStaleSocket(sock);
    expect(fs.existsSync(sock)).toBe(false);
  });

  it('leaves a live socket alone', async () => {
    const sock = tmpSock();
    other = net.createServer();
    await new Promise<void>((r) => other!.listen(sock, r));
    await clearStaleSocket(sock);
    expect(fs.existsSync(sock)).toBe(true);
  });

  it('starts over a stale socket file and answers ping with mode 600', async () => {
    const sock = tmpSock();
    fs.writeFileSync(sock, '');
    server = new PipeServer(sock);
    server.start();
    await new Promise((r) => setTimeout(r, 300));
    expect(await ping(sock)).toBe('pong');
    expect(fs.statSync(sock).mode & 0o777).toBe(0o600);
  });
});
