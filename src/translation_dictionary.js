const fs = require('node:fs');
const path = require('node:path');

function samePlaceholders(source, target) {
  const placeholders = text => (text.match(/\$\{[^{}]+\}|\{\d+\}/g) || []).sort();
  return JSON.stringify(placeholders(source)) === JSON.stringify(placeholders(target));
}

function loadSharedTranslations() {
  const locale = JSON.parse(fs.readFileSync(path.join(__dirname, '../locales/tr.json'), 'utf8'));
  return locale.translations || {};
}

module.exports = { loadSharedTranslations, samePlaceholders };
