const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { patchAntigravityExtension } = require('../src/installer');

test('patchAntigravityExtension scopes stop wrapper to the enclosing server start block', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-proxy-test-'));
  try {
    const vscodeDir = path.join(tmpRoot, 'resources', 'app', 'extensions', 'agy', 'vscode');
    fs.mkdirSync(vscodeDir, { recursive: true });
    const extFile = path.join(vscodeDir, 'extension.js');
    const sample = [
      'async function otherMethod(){b(await c(this.stop()));}',
      ' '.repeat(4000),
      'async function startServer(){B(await E(this.stop()));this.serverUrl=ca;this.port=pd;this.lastStartupError=void 0;this.startHeartbeat(ca,ya);}',
      'k.exportSymbol("activate",activate);'
    ].join('');
    fs.writeFileSync(extFile, sample, 'utf8');

    patchAntigravityExtension({ ide: { appPath: tmpRoot } });

    const patched = fs.readFileSync(extFile, 'utf8');
    assert.match(patched, /ca=B\(await E\(__agyTrEnsureProxy\(this,pd,ca\)\)\);this\.serverUrl=ca;/);
    assert.doesNotMatch(patched, /b\(await c\(__agyTrEnsureProxy/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
