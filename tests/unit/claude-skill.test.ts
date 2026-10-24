import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureClaudeContext, removeClaudeContext } from '../../src/main/claude-context';
import { getCliBinDirForInstructions, getInstructionsPath, renderInstructions } from '../../src/main/agent-instructions';

describe('Claude pointer and global wmux skill (MIC-762)', () => {
  let home: string;
  let saved: { HOME?: string; USERPROFILE?: string };
  const claudeMd = () => path.join(home, '.claude', 'CLAUDE.md');
  const skillMd = () => path.join(home, '.claude', 'skills', 'wmux', 'SKILL.md');

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'wmux-claude-skill-'));
    saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    expect(os.homedir()).toBe(home);
  });

  afterEach(() => {
    for (const key of ['HOME', 'USERPROFILE'] as const) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    vi.restoreAllMocks();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('writes a three-line pointer with the rendered absolute probe and a skill from the full block', () => {
    ensureClaudeContext();
    const pointer = fs.readFileSync(claudeMd(), 'utf-8');
    const between = pointer.split('<!-- wmux:start')[1].split('<!-- wmux:end -->')[0];
    expect(between.split('\n').filter((line) => line.trim()).length - 1).toBeLessThanOrEqual(3);
    expect(pointer).toContain(`"${getCliBinDirForInstructions()}/wmux" ping`);
    expect(pointer).toMatch(/pong[^]*skill[^]*browsing[^]*markdown[^]*asking[^]*background/i);
    const skill = fs.readFileSync(skillMd(), 'utf-8');
    expect(skill).toMatch(/^---\nname: wmux\ndescription: Use when `wmux ping` answers pong[^\n]*\n---\n/);
    expect(skill).toContain('<!-- AUTO-MANAGED BY wmux. Edits are overwritten on launch. -->');
    for (const section of ['## Browser', '## Markdown', 'report-agent', 'report-subagent']) expect(skill).toContain(section);
    expect(skill).not.toContain('<!-- wmux:start');
    expect(skill).not.toContain('<!-- wmux:end -->');
    const full = renderInstructions(fs.readFileSync(getInstructionsPath(), 'utf-8'));
    const expectedBody = full.split(/\r?\n/).filter((line) => !line.startsWith('<!-- wmux:start') && line !== '<!-- wmux:end -->').join('\n').trim();
    expect(skill.slice(skill.indexOf('<!-- AUTO-MANAGED BY wmux. Edits are overwritten on launch. -->') + '<!-- AUTO-MANAGED BY wmux. Edits are overwritten on launch. -->'.length).trim()).toBe(expectedBody);
  });

  it('replaces the old managed block and keeps user text; a second launch rewrites neither file', () => {
    fs.mkdirSync(path.dirname(claudeMd()), { recursive: true });
    const old = renderInstructions(fs.readFileSync(getInstructionsPath(), 'utf-8'));
    fs.writeFileSync(claudeMd(), `# Mine\n\n${old}\nMy tail\n`);
    ensureClaudeContext();
    const first = fs.readFileSync(claudeMd(), 'utf-8');
    const skill = fs.readFileSync(skillMd(), 'utf-8');
    const mdTime = fs.statSync(claudeMd()).mtimeMs;
    const skillTime = fs.statSync(skillMd()).mtimeMs;
    expect(first).toContain('# Mine\n\n');
    expect(first).toContain('My tail\n');
    expect(first).not.toContain('## Browser');
    ensureClaudeContext();
    expect(fs.readFileSync(claudeMd(), 'utf-8')).toBe(first);
    expect(fs.readFileSync(skillMd(), 'utf-8')).toBe(skill);
    expect(fs.statSync(claudeMd()).mtimeMs).toBe(mdTime);
    expect(fs.statSync(skillMd()).mtimeMs).toBe(skillTime);
  });

  it('preserves a user-owned skill on ensure and remove', () => {
    fs.mkdirSync(path.dirname(skillMd()), { recursive: true });
    fs.writeFileSync(skillMd(), 'my wmux skill\n');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ensureClaudeContext();
    expect(fs.readFileSync(skillMd(), 'utf-8')).toBe('my wmux skill\n');
    expect(warn).toHaveBeenCalled();
    removeClaudeContext();
    expect(fs.readFileSync(skillMd(), 'utf-8')).toBe('my wmux skill\n');
  });

  it('removes an authored skill and its empty folder even without CLAUDE.md', () => {
    ensureClaudeContext();
    fs.unlinkSync(claudeMd());
    removeClaudeContext();
    expect(fs.existsSync(skillMd())).toBe(false);
    expect(fs.existsSync(path.dirname(skillMd()))).toBe(false);
  });

  it('keeps an authored skill folder when another file is present', () => {
    ensureClaudeContext();
    const other = path.join(path.dirname(skillMd()), 'notes.txt');
    fs.writeFileSync(other, 'mine');
    removeClaudeContext();
    expect(fs.existsSync(skillMd())).toBe(false);
    expect(fs.readFileSync(other, 'utf-8')).toBe('mine');
  });

  it('renders the AppImage stable CLI path into the pointer', () => {
    const dir = path.join(home, '.local', 'share', 'wmux', 'cli');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'wmux'), '');
    const raw = fs.readFileSync(path.join(__dirname, '..', '..', 'resources', 'claude-pointer.md'), 'utf-8');
    const appImageDir = getCliBinDirForInstructions('linux', { APPIMAGE: '/tmp/wmux.AppImage', HOME: home });
    expect(appImageDir).toBe(dir);
    expect(renderInstructions(raw, appImageDir)).toContain(`"${dir}/wmux" ping`);
  });
});
