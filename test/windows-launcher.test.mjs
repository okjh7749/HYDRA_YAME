import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const launcherUrl = new URL('../실행.bat', import.meta.url);

test('Windows launcher validates Node, starts the server and opens the lobby', async () => {
  const launcher = await readFile(launcherUrl, 'utf8');

  assert.match(launcher, /cd \/d "%~dp0"/);
  assert.match(launcher, /where node >nul 2>&1/);
  assert.match(launcher, /if not exist "src\\dev-server\.mjs"/);
  assert.match(
    launcher,
    /start "Hydra Territory Server" \/D "%~dp0" cmd \/k "node src\\dev-server\.mjs"/,
  );
  assert.match(launcher, /start "" "http:\/\/127\.0\.0\.1:8080"/);
});
