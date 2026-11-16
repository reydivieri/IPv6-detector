import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build this release on Windows x64.');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 26 || (major === 26 && minor < 9)) throw new Error('Building requires Node.js 26.9 or newer (SEA virtual filesystem support).');
const licensedVersion = (await readFile(join(root, 'packaging', 'NODE-VERSION.txt'), 'utf8')).trim();
if (process.versions.node !== licensedVersion) throw new Error(`Use Node.js ${licensedVersion} for this release, or update NODE-VERSION.txt and the matching official NODE-LICENSE.txt before building.`);
const output = join(root, 'release', 'IPv6-Detector-Windows-x64');
await mkdir(output, { recursive: true });
await mkdir(join(root, 'build'), { recursive: true });
const files = ['server.mjs', 'lib/diagnostics.mjs', 'lib/paths.mjs', 'scripts/collect.ps1', 'public/index.html', 'public/style.css', 'public/app.js', 'public/i18n.js', 'public/network-graph.js'];
const config = {
  main: join(root, 'portable.mjs'), mainFormat: 'module',
  output: join(output, 'IPv6-Detector.exe'),
  disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false, useVfs: true,
  execArgvExtension: 'none', assets: Object.fromEntries(files.map(file => [file, join(root, file)]))
};
const configFile = join(root, 'build', 'sea-config.json');
await writeFile(configFile, JSON.stringify(config, null, 2));
execFileSync(process.execPath, ['--build-sea', configFile], { cwd: root, stdio: 'inherit', windowsHide: true });
await copyFile(join(root, 'packaging', 'PORTABLE-README.txt'), join(output, 'README.txt'));
await copyFile(join(root, 'packaging', 'NODE-LICENSE.txt'), join(output, 'NODE-LICENSE.txt'));
const bytes = await readFile(config.output);
await writeFile(join(output, 'SHA256SUMS.txt'), `${createHash('sha256').update(bytes).digest('hex')}  IPv6-Detector.exe\n`);
await writeFile(join(output, 'BUILD-INFO.json'), JSON.stringify({ application: 'IPv6 Detector', version: JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version, node: process.versions.node, platform: process.platform, architecture: process.arch, builtAt: new Date().toISOString(), signed: false }, null, 2));
console.log(`Portable release created: ${output}`);
execFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
  '-NoLogo', '-NoProfile', '-NonInteractive', '-File', join(root, 'scripts', 'package-release.ps1'),
  '-ReleaseDirectory', output, '-ArchivePath', join(root, 'release', 'IPv6-Detector-Windows-x64.zip')
], { cwd: root, stdio: 'inherit', windowsHide: true });
