import { createDetectorServer } from './server.mjs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';

const server = createDetectorServer({ onShutdown: () => { console.log('IPv6 Detector stopped.'); process.exitCode = 0; } });
server.on('error', error => {
  console.error(`IPv6 Detector could not start: ${error.message}`);
  process.exitCode = 1;
  if (process.stdin.isTTY) { console.log('Press Enter to close.'); process.stdin.resume(); process.stdin.once('data', () => process.exit(1)); }
});
server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}`;
  process.title = 'IPv6 Detector';
  console.log(`IPv6 Detector Portable\n${url}\n\nKeep this window open while using the dashboard.\nTo quit, click Shut down app in the dashboard, or press Ctrl+C here.\n`);
  if (!process.argv.includes('--no-browser')) {
    execFile(join(process.env.SystemRoot || 'C:\\Windows', 'explorer.exe'), [url], { windowsHide: true }, error => {
      if (error) console.log(`If the browser did not open, open this address manually: ${url}`);
    });
  }
});
