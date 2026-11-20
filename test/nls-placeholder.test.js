const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { patchNlsFile } = require('../src/patcher');

test('patchNlsFile skips mismatched placeholders from language pack and applies safe explicit rules', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-nls-test-'));
  try {
    const nlsFile = path.join(tmpRoot, 'nls.messages.json');
    const keysFile = path.join(tmpRoot, 'nls.keys.json');
    const i18nFile = path.join(tmpRoot, 'main.i18n.json');

    fs.writeFileSync(nlsFile, JSON.stringify(['{0} month ago', 'Copy', 'File', 'Inspect {0}', 'Select {0} or {0}']), 'utf8');
    fs.writeFileSync(keysFile, JSON.stringify([['modA', ['ago', 'copy', 'file', 'inspect', 'select']]]), 'utf8');
    fs.writeFileSync(i18nFile, JSON.stringify({
      contents: {
        modA: {
          ago: '0 ay önce',
          copy: 'Kopyala veya Taşı ({0} düğmesine basın)',
          file: 'Dosya'
        }
      }
    }), 'utf8');

    patchNlsFile(nlsFile, [
      { search: '{0} month ago', replace: '{0} ay önce' },
      { search: 'Copy', replace: 'Kopyala' }
    ], {
      nlsKeysFile: keysFile,
      mainI18nFile: i18nFile,
      enNlsFile: nlsFile,
      sharedTranslations: {
        'Inspect {0}': '{0} öğesini incele',
        'Select {0} or {0}': '{0} öğesini seç'
      }
    });

    const out = JSON.parse(fs.readFileSync(nlsFile, 'utf8'));
    assert.deepEqual(out, ['{0} ay önce', 'Kopyala', 'Dosya', '{0} öğesini incele', 'Select {0} or {0}']);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
