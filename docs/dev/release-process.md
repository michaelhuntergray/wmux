<!-- Moved verbatim from CLAUDE.md (MIC-34). -->

## Release Process (CRITICAL)

wmux is distributed as a **portable zip** (not NSIS installer) because without code-signing, Windows SmartScreen flags installers more aggressively than zip extractions.

### Step-by-step

```bash
# 1. Build everything
npm run build:main        # Compile TS → dist/main/, dist/preload/, dist/cli/
npx vite build            # Build renderer → dist/renderer/

# 2. Verify compiled code
# Check that fixes are in the compiled output. Grep EVERY renderer chunk, not
# just the desktop entry (assets/index-*.js): since the phone console became a
# second entry (#254), code both entries import (React, xterm, src/shared/*)
# lives in a shared chunk, so a marker in a shared module is not in index-*.js.
grep -l 'your_fix_marker' dist/renderer/assets/*.js || echo MISSING
grep -c 'your_fix_string' dist/main/index.js

# 3. Create ASAR staging
# IMPORTANT: always run from the project root (use absolute paths or cd back
# after any `cd .asar-staging`). If cwd drifts into .asar-staging during this
# section, subsequent `mkdir build-out` lands INSIDE the staging dir and the
# next asar pack will recursively include its own previous output → 188M asar.
rm -rf .asar-staging build-out
mkdir -p .asar-staging build-out
cp -r dist .asar-staging/dist          # explicit dest path — trailing-slash form is flaky on Git Bash
cp package.json .asar-staging/package.json
( cd .asar-staging && npm install --omit=dev --ignore-scripts )   # subshell — cwd doesn't leak
rm -rf .asar-staging/node_modules/node-pty/build   # force prebuilds load path: conpty.dll (useConptyDll) resolves relative to the LOADED conpty.node, and only prebuilds/win32-x64/ has the conpty/ dir next to it

# 4. Pack ASAR (with native module unpacking)
# Use --unpack-dir (path-based), NOT --unpack "**/*.node" — the glob form
# silently fails on Git Bash for Windows (shell eats the pattern, asar produces
# the asar but creates no .unpacked dir, no error). Output to build-out/ so we
# never touch the live resources/app.asar while wmux may be running.
npx asar pack .asar-staging build-out/app.asar --unpack-dir "node_modules/node-pty/prebuilds"

# 5. Verify native modules are unpacked
ls build-out/app.asar.unpacked/node_modules/node-pty/prebuilds/win32-x64/
# Must contain: conpty.node, conpty_console_list.node, pty.node
# Sanity: compare against the PREVIOUS release's app.asar, not a fixed number —
# it was ~24M at 0.7.x and ~34M at 2.4.0, so a stale constant here reads as a
# packaging failure on a healthy build. What actually matters: natives unpacked
# moved out; 180M+ means staging got polluted (see step 3 warning).

# 5b. Verify the PRs/fixes you intended to ship are actually inside the ASAR.
# extract-file's stdout piping is unreliable on Windows — extract to /tmp instead.
rm -rf /tmp/asar-verify && mkdir -p /tmp/asar-verify
( cd /tmp/asar-verify && npx --prefix "$(pwd)" asar extract "$(pwd)/build-out/app.asar" . )
grep -l 'your_fix_marker' /tmp/asar-verify/dist/renderer/assets/*.js || echo MISSING   # every chunk, see step 2
grep -c 'your_fix_string' /tmp/asar-verify/dist/main/index.js

# 6. Create release staging
# Easiest base: the previous release zip. Avoids needing a separate
# wmux_v_extracted/ dir and avoids picking up stray files from the project root.
rm -rf ../wmux-release-staging
mkdir -p ../wmux-release-staging
( cd ../wmux-release-staging && unzip -q ../wmux/wmux-<PREV_VERSION>-win-x64.zip )

# 7. Copy ASAR + resources into release staging
cp build-out/app.asar ../wmux-release-staging/resources/app.asar
rm -rf ../wmux-release-staging/resources/app.asar.unpacked
cp -r build-out/app.asar.unpacked ../wmux-release-staging/resources/app.asar.unpacked
cp resources/icon.png ../wmux-release-staging/resources/
rm -rf ../wmux-release-staging/resources/themes && cp -r resources/themes ../wmux-release-staging/resources/themes
rm -rf ../wmux-release-staging/resources/sounds && cp -r resources/sounds ../wmux-release-staging/resources/sounds
mkdir -p ../wmux-release-staging/resources/cli && cp dist/cli/wmux.js ../wmux-release-staging/resources/cli/wmux.js
cp dist/cli/wmux-hook.js ../wmux-release-staging/resources/cli/wmux-hook.js   # Claude hooks exec this via bare node — MUST ship outside the asar (missing until 0.29.1 → sidebar stuck on "Running", issue #81)
cp dist/cli/transport-deadline.js ../wmux-release-staging/resources/cli/transport-deadline.js   # required by BOTH files above; omitting it is MODULE_NOT_FOUND on the first line, not a degraded feature
cp dist/cli/wsl-network.js ../wmux-release-staging/resources/cli/wsl-network.js                 # required by wmux.js (bridge bind selection)
for f in wmux-codex codex-relay codex-session-tracker; do cp dist/cli/$f.js ../wmux-release-staging/resources/cli/$f.js; done   # Codex session restore (#261)
rm -rf ../wmux-release-staging/resources/cli/node_modules && mkdir -p ../wmux-release-staging/resources/cli/node_modules && cp -r node_modules/ws ../wmux-release-staging/resources/cli/node_modules/ws   # codex-relay.js imports ws; the CLI resolves packages from cli/node_modules, never the asar
rm -rf ../wmux-release-staging/resources/shell-integration && mkdir -p ../wmux-release-staging/resources/shell-integration
cp -r src/shell-integration/* ../wmux-release-staging/resources/shell-integration/
rm -rf ../wmux-release-staging/resources/wmux-orchestrator && cp -r resources/wmux-orchestrator ../wmux-release-staging/resources/wmux-orchestrator
rm -rf ../wmux-release-staging/resources/opencode-plugin && cp -r resources/opencode-plugin ../wmux-release-staging/resources/opencode-plugin   # missing from every zip until 0.47.0 → OpenCode integration silently absent in installs (issue #149)
rm -rf ../wmux-release-staging/resources/pi-extension && cp -r resources/pi-extension ../wmux-release-staging/resources/pi-extension               # same failure mode as #149/#81: dev falls back to a repo-relative path, an install has nothing (issue #231)
rm -rf ../wmux-release-staging/resources/omp-extension && cp -r resources/omp-extension ../wmux-release-staging/resources/omp-extension            # omp status bridge (PR #298), same failure mode
rm -rf ../wmux-release-staging/resources/cli-bin && cp -r src/cli-bin ../wmux-release-staging/resources/cli-bin
rm -rf ../wmux-release-staging/resources/cli-bin-ps && cp -r src/cli-bin-ps ../wmux-release-staging/resources/cli-bin-ps   # the PowerShell shim (issue #154); without it PowerShell falls back to wmux.cmd and loses argument quoting
rm -rf ../wmux-release-staging/resources/codex-bin ../wmux-release-staging/resources/codex-bin-ps && cp -r src/codex-bin ../wmux-release-staging/resources/codex-bin && cp -r src/codex-bin-ps ../wmux-release-staging/resources/codex-bin-ps   # Codex restore PATH shims (#261); a miss only disables the feature, the launcher checks for them

# 8. Embed icon + metadata in exe (rcedit)
# CRITICAL: rcedit exports `{ rcedit }` (named export). `const rcedit =
# require('rcedit')` followed by `rcedit(...)` throws "rcedit is not a function".
# Always destructure: `const { rcedit } = require('rcedit')`.
node -e "
  const { rcedit } = require('rcedit');
  rcedit('../wmux-release-staging/wmux.exe', {
    icon: 'resources/icons/icon.ico',
    'version-string': {
      ProductName: 'wmux',
      FileDescription: 'wmux',
      CompanyName: 'wmux',
      InternalName: 'wmux',
      OriginalFilename: 'wmux.exe',
      LegalCopyright: 'Copyright (c) 2026 wmux'
    },
    'file-version': '0.7.20',
    'product-version': '0.7.20'
  }).then(() => console.log('rcedit done'), e => { console.error(e); process.exit(1); });
"
# NOTE: rcedit CANNOT modify a running exe. The staging copy is fine; never
# point rcedit at the wmux.exe living in the project root if it's running.

# 9. Create zip
powershell -NoProfile -Command "Compress-Archive -Path '..\wmux-release-staging\*' -DestinationPath '..\wmux-<VERSION>-win-x64.zip' -CompressionLevel Optimal"

# 9b. latest.yml — DO NOT generate one pointing at the zip for a manual
# release. Installed clients use NsisUpdater: a zip in latest.yml downloads
# but never installs (endless update loop, issue #96). latest.yml must point
# at an NSIS setup.exe, which only the CI build produces — so for a full
# release, prefer tagging and letting CI ship setup.exe + zip + latest.yml.
# A manual zip-only release simply ships WITHOUT latest.yml (the updater
# handles its absence gracefully since 0.28; the notify-only checker still
# surfaces the new version). Legacy snippet kept for reference:
node -e "
  const crypto = require('crypto'); const fs = require('fs');
  const version = '<VERSION>';
  const zip = '../wmux-' + version + '-win-x64.zip';
  const data = fs.readFileSync(zip);
  const sha512 = crypto.createHash('sha512').update(data).digest('base64');
  const yaml = ['version: ' + version, 'files:', '  - url: wmux-' + version + '-win-x64.zip',
    '    sha512: ' + sha512, '    size: ' + data.length, 'path: wmux-' + version + '-win-x64.zip',
    'sha512: ' + sha512, 'releaseDate: ' + JSON.stringify(new Date().toISOString()), ''].join('\n');
  fs.writeFileSync('../latest.yml', yaml);
  console.log('latest.yml written:', data.length, 'bytes,', sha512.slice(0, 16) + '...');
"

# 10. Tag, push, publish (zip AND latest.yml — both assets are required)
git add package.json package-lock.json && git commit -m "chore(release): bump to <VERSION>"
git push origin master
git tag -a v<VERSION> -m "wmux <VERSION>" && git push origin v<VERSION>
gh release create v<VERSION> ../wmux-<VERSION>-win-x64.zip ../latest.yml --repo amirlehmam/wmux --title "v<VERSION>" --notes "..."

# 11. (Optional) Hot-swap into the locally running wmux for immediate testing
cp build-out/app.asar resources/app.asar
rm -rf resources/app.asar.unpacked && cp -r build-out/app.asar.unpacked resources/app.asar.unpacked
# Then restart wmux to pick up changes

# 12. Cleanup
rm -rf .asar-staging build-out /tmp/asar-verify ../wmux-release-staging
```

### Release Checklist

- [ ] `npm run build:main` succeeds
- [ ] `npx vite build` succeeds
- [ ] Compiled code verified (grep for key changes in dist/)
- [ ] ASAR packed with `--unpack-dir node_modules/node-pty/prebuilds` (NOT `--unpack` glob)
- [ ] ASAR size within ~10% of the previous release's app.asar (34M at 2.4.0; the old "~24M" constant is stale). A sudden 2x+ ⇒ unpack didn't take. 180M+ ⇒ staging polluted.
- [ ] node-pty native modules present in `app.asar.unpacked/node_modules/node-pty/prebuilds/win32-x64/`
- [ ] PR-specific markers grep-confirmed inside the packed ASAR (extracted to /tmp)
- [ ] Remote Console (#254) inside the extracted ASAR — every miss here is SILENT at runtime (the facade logs and returns null, the server answers 503):
  `ls /tmp/asar-verify/dist/renderer/remote-manifest.json /tmp/asar-verify/dist/renderer/remote/index.html`,
  `grep -c "frame-ancestors 'none'" /tmp/asar-verify/dist/main/remote-console/guards.js` (the CSP string),
  `ls /tmp/asar-verify/dist/main/remote-console/runtime.js` (the facade `require`s it lazily)
- [ ] wmux-orchestrator plugin copied to release staging
- [ ] cli-bin + cli-bin-ps copied to release staging (issue #154), and codex-bin + codex-bin-ps (#261)
- [ ] opencode-plugin, pi-extension and omp-extension copied to release staging (issues #149, #231, PR #298) — `npm test` now derives this from `process.resourcesPath` usage in `src/main/`, so a new runtime resource that isn't in `extraResources` fails the release build
- [ ] `resources/cli/` holds all eight files — `wmux.js`, `wmux-hook.js`, `transport-deadline.js`, `wsl-network.js`, `wmux-codex.js`, `codex-relay.js`, `codex-session-tracker.js`, `opencode-tui-install.js` — plus `node_modules/ws` (#261; `npm test` derives the package list from the CLI's bare imports too). The CLI is packaged file-by-file, so a shared module has to be listed on its own; `npm test` derives this from the relative imports in `src/cli/`
- [ ] rcedit applied (icon + version metadata) — `{ rcedit }` destructured
- [ ] `latest.yml` generated (sha512 + size of the final zip) and uploaded as a release asset — electron-updater 404s without it (issue #68)
- [ ] Zip created and uploaded to GitHub release
- [ ] Mark of the Web: remind user to right-click > Unblock after download

### Important Notes

- **rcedit can't modify a running exe** — always work on a copy
- **rcedit named export**: `const { rcedit } = require('rcedit')`. Non-destructured `const rcedit = require('rcedit')` throws "rcedit is not a function" (different from older docs).
- **asar `--unpack` glob silently fails on Git Bash for Windows**: pattern like `"**/*.node"` gets shell-eaten and asar emits no `.unpacked/` dir, no error. Use `--unpack-dir node_modules/node-pty/prebuilds` (path-based) instead.
- **Bash cwd drift can recursively pollute staging**: if you `cd .asar-staging` and forget to come back, the next `mkdir build-out && asar pack` creates `.asar-staging/build-out/app.asar`, and a re-pack will swallow its own output into the new asar (188M). Always use subshells `( cd dir && cmd )` or absolute paths.
- **Don't pack ASAR directly to `resources/app.asar`** if wmux may be running — pack to `build-out/` and copy at step 7.
- **MOTW (Mark of the Web)**: Downloaded zips get `Zone.Identifier` NTFS stream. Fix: `powershell "Get-ChildItem -Recurse | Unblock-File"`
- **Windows taskbar pinning** uses PE `FileDescription` for the shortcut name — ensure rcedit sets it to "wmux"
- **AppUserModelId** is set to `com.wmux.app` in `src/main/index.ts` for proper taskbar grouping

---

