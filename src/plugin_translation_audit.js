const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const dictionary = require('../scripts/desktop_full_dictionary.json');
const inventory = require('../scripts/desktop_plugin_inventory.json');

// Compare reviewed source snapshots. Never rewrite agent instructions or guess YAML.
function auditPluginTranslations(root = path.join(os.homedir(), '.gemini', 'config', 'plugins')) {
  const issues = [];
  let checked = 0;
  const hash = data => createHash('sha256').update(data).digest('hex');
  const check = (file, field, source) => {
    if (typeof source !== 'string' || !source.trim()) return;
    checked++;
    const key = source.trim().replace(/\s+/g, ' ');
    if (!Object.hasOwn(dictionary, source.trim()) && !Object.hasOwn(dictionary, key)) {
      issues.push({ file, field, reason: 'missing-translation', source });
    }
  };
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(absolute); continue; }
      if (!entry.isFile()) continue;
      const file = path.relative(root, absolute).split(path.sep).join('/');
      try {
        if (entry.name === 'plugin.json') {
          const manifest = JSON.parse(fs.readFileSync(absolute, 'utf8').replace(/^\uFEFF/, ''));
          check(file, 'description', manifest.description);
          for (const [i, prompt] of (manifest.suggestedPrompts || []).entries()) check(file, 'suggestedPrompts.' + i, prompt);
        } else if (entry.name === 'SKILL.md') {
          const raw = fs.readFileSync(absolute, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
          const header = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(raw);
          const known = inventory.skills[file];
          if (!header || !known || hash('\n' + header[1] + '\n') !== known.hash) {
            issues.push({ file, field: 'frontmatter', reason: 'new-or-changed-source' });
          } else check(file, 'description', known.source);
        } else if (entry.name === 'README.md' && file.split('/').length === 2) {
          const known = inventory.readmes[file];
          if (!known || hash(fs.readFileSync(absolute)) !== known.hash) {
            issues.push({ file, field: 'readme', reason: 'unreviewed-or-changed-readme' });
          }
        }
      } catch (error) {
        issues.push({ file, reason: 'unreadable-source', error: error.message });
      }
    }
  }
  try { if (fs.existsSync(root)) walk(root); }
  catch (error) { issues.push({ file: '.', reason: 'unreadable-source', error: error.message }); }
  return { root, checked, issues };
}

module.exports = { auditPluginTranslations };
