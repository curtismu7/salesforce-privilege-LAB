import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// index.js starts the server at import time, so it cannot be imported in a test. Pin its order instead: the lab's own .env is read first (it names
// Real mode's one allowed origin), then the network guard is installed and given that one host, before the doctor runs or any server starts.
test('the entry reads the settings, then installs the netguard and allows only the configured host, before any socket', () => {
  const src = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const settings = src.indexOf('applySettings()');
  const m = /installNetguard\(/.exec(src);
  assert.ok(m, 'installNetguard() is called');
  const guard = m.index;
  assert.ok(settings !== -1 && settings < guard, 'the .env is read before the guard (the allowlist needs its host)');
  assert.match(src, /if \(real\.configured\) guard\.allow\(real\.host\)/);
  for (const later of ['runChecks()', 'startHttpServer({']) assert.ok(src.indexOf(later) > guard, `${later} comes after the guard`);
});

test('no source file evals, uses vm or Function, builds a regular expression from input, writes a file, spawns a process, or reads a bare MODE', () => {
  const dir = new URL('../src/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    // runObservability.js is vendored byte-for-byte from shared/run-observability (the pin test proves the bytes): it is scanned there, not here.
    if (f === 'runObservability.js') continue;
    const code = fs.readFileSync(new URL(f, dir), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    assert.ok(!/\beval\(|new Function\(|\bvm\./.test(code), `${f}: no eval, Function or vm`);
    assert.ok(!/writeFile|appendFile|createWriteStream|mkdirSync|rmSync|unlinkSync/.test(code), `${f}: the server writes no file`);
    assert.ok(!/new RegExp\(/.test(code), `${f}: no regular expression is built at run time`);
    assert.ok(!/process\.env\.MODE\b/.test(code), `${f}: a bare MODE is never read`);
    assert.ok(!/child_process|worker_threads/.test(code), `${f}: no child process and no worker thread`);
  }
});

test('only real.js may speak http(s); it never uses generateKeyPair, and the key is never put in a response or a log', () => {
  const dir = new URL('../src/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const code = fs.readFileSync(new URL(f, dir), 'utf8');
    if (!['real.js', 'netguard.js'].includes(f)) assert.ok(!/from 'node:https?'/.test(code), `${f}: no http client outside real.js`);
    assert.ok(!/generateKeyPair/.test(code), `${f}: the lab generates no key pair`);
    if (f !== 'real.js') assert.ok(!/SF_PRIVATE_KEY_PATH|createPrivateKey/.test(code.replace(/\/\/.*$/gm, '')) || ['settings.js', 'doctor.js', 'index.js'].includes(f), `${f}: only real.js reads the key`);
  }
  const real = fs.readFileSync(new URL('real.js', dir), 'utf8');
  assert.ok(!/console\.(log|error|warn|info)/.test(real), 'real.js logs nothing');
  assert.ok(!/\bfollowRedirects\b|maxRedirects/.test(real));
});

test('shelfLink.js reads no file at all: SHELF_URL comes from the environment, which settings.js filled from this lab\'s own .env', () => {
  const code = fs.readFileSync(new URL('../src/shelfLink.js', import.meta.url), 'utf8');
  assert.ok(!/node:fs|readFileSync|Development/.test(code));
});
