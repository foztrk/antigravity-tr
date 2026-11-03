const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { auditPluginTranslations } = require('../src/plugin_translation_audit');

test('plugin audit detects new prompts, changed skill sources and unreviewed README without writing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agtr-plugin-audit-'));
  try {
    const dir = path.join(root, 'new-plugin');
    fs.mkdirSync(dir);
    const files = {
      'plugin.json': JSON.stringify({ description: 'Trigger', suggestedPrompts: ['A completely new plugin prompt'] }),
      'SKILL.md': '---\nname: new\ndescription: Trigger\n---\nDo not change instructions.\n',
      'README.md': '# New documentation\n'
    };
    for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), value);
    const report = auditPluginTranslations(root);
    assert.equal(report.checked, 2);
    assert.deepEqual(report.issues.map(issue => issue.reason).sort(), ['missing-translation', 'new-or-changed-source', 'unreviewed-or-changed-readme']);
    assert.equal(report.issues.find(issue => issue.reason === 'missing-translation').field, 'suggestedPrompts.0');
    for (const [name, value] of Object.entries(files)) assert.equal(fs.readFileSync(path.join(dir, name), 'utf8'), value);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
