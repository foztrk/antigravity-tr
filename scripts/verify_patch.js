const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { getPaths } = require('../src/config');
const dictionary = require('../locales/tr.json');
const desktopDictionary = require('./desktop_full_dictionary.json');

function placeholders(text, code = false) {
  const pattern = code ? /\$\{[\w$]+(?:\.[\w$]+)*\}|\{\d+\}/g : /\$\{[^{}]+\}|\{\d+\}/g;
  return JSON.stringify((text.match(pattern) || []).sort());
}

function verifyPlaceholders(paths, errors) {
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const original = read(paths.ide.nlsFile + '.bak');
  const installed = read(paths.ide.nlsFile);
  if (original.length !== installed.length) errors.push('IDE NLS array length changed');
  const check = (source, target, location, code) => {
    if (typeof source !== 'string' || typeof target !== 'string' ||
        placeholders(source, code) !== placeholders(target, code)) errors.push(location);
  };
  original.forEach((source, index) => check(source, installed[index], 'IDE NLS index ' + index));
  for (const [scope, rules] of Object.entries(dictionary.rules)) {
    rules.forEach(({ search, replace }, index) => {
      // JS fragments may translate or simplify a conditional inside a template expression.
      check(search, replace, scope + '[' + index + ']', scope !== 'nlsMessages');
    });
  }
  for (const [label, entries] of [['locales/tr.json', dictionary.translations || {}], ['desktop dictionary', desktopDictionary]]) {
    for (const [source, target] of Object.entries(entries)) check(source, target, label + ': ' + source);
  }
  return original.length;
}

function verifyChecksums(paths, errors) {
  const product = JSON.parse(fs.readFileSync(paths.ide.productFile, 'utf8'));
  const checksums = Object.entries(product.checksums || {});
  if (!checksums.length) errors.push('product.json checksums missing');
  const out = path.resolve(path.dirname(paths.ide.productFile), 'out');
  for (const [relative, expected] of checksums) {
    const file = path.resolve(out, relative);
    if (!file.startsWith(out + path.sep) || !fs.existsSync(file)) {
      errors.push(relative + ': checksum target missing or outside out');
      continue;
    }
    const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('base64').replace(/=+$/, '');
    if (actual !== expected) errors.push(relative + ': checksum mismatch');
  }
  return checksums.length;
}

function* changedExtensionScripts(root) {
  if (!fs.existsSync(root)) return;
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, item.name);
    if (item.isDirectory()) yield* changedExtensionScripts(file);
    if (item.isFile() && /\.[cm]?js\.bak$/.test(item.name)) {
      const live = file.slice(0, -4);
      if (fs.existsSync(live) && !fs.readFileSync(file).equals(fs.readFileSync(live))) yield live;
    }
  }
}

async function verifySyntax(paths, errors) {
  const builtIn = path.join(path.dirname(paths.ide.productFile), 'extensions');
  const files = new Set([paths.ide.mainFile, paths.ide.jetskiFile, paths.ide.workbenchFile,
    ...changedExtensionScripts(builtIn), ...changedExtensionScripts(paths.ide.extensionsDir)]);
  const check = (name, args, input) => {
    const result = spawnSync(process.execPath, ['--check', ...args], { input, encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) {
      const detail = result.stderr?.split(/\r?\n/).find(line => /(?:Error:|Cannot find)/.test(line));
      errors.push(name + ': ' + (result.error?.message || detail || 'node --check failed'));
    }
  };
  for (const file of files) check(file, [file]);

  const asar = await import('@electron/asar');
  const archive = path.join(paths.desktop.appPath, 'resources', 'app.asar');
  const archiveDirectory = path.dirname(archive);
  const version = file => JSON.parse(asar.extractFile(file, 'package.json')).version;
  const currentVersion = version(archive);
  const original = fs.readdirSync(archiveDirectory)
    .filter(name => name === 'app.asar.bak' || /^app\.asar\.backup-\d+-[a-f0-9]+$/.test(name))
    .sort()
    .map(name => path.join(archiveDirectory, name))
    .find(file => {
      try { return version(file) === currentVersion; } catch { return false; }
    });
  if (!original) {
    errors.push('Desktop backup matching installed version missing');
    return files.size;
  }
  let checked = files.size;
  for (const entry of asar.listPackage(archive)) {
    if (!/\.[cm]?js$/.test(entry)) continue;
    const name = entry.replace(/^[/\\]/, '').replaceAll('\\', '/');
    const metadata = asar.statFile(archive, path.normalize(name));
    let previous;
    try { previous = asar.statFile(original, path.normalize(name)); } catch {}
    if (previous?.integrity?.hash && previous.integrity.hash === metadata.integrity?.hash) continue;
    const source = asar.extractFile(archive, path.normalize(name));
    if (!metadata.unpacked && previous &&
        source.equals(asar.extractFile(original, path.normalize(name)))) continue;
    check('Desktop ' + name, ['-'], source);
    checked++;
  }
  return checked;
}

async function main() {
  const paths = getPaths();
  const placeholders = [];
  const syntax = [];
  const checksums = [];
  const nlsEntries = verifyPlaceholders(paths, placeholders);
  const checksumEntries = verifyChecksums(paths, checksums);
  const scripts = await verifySyntax(paths, syntax);
  console.log(JSON.stringify({ nlsEntries, checksumEntries, scripts, placeholders, syntax, checksums }, null, 2));
  if (placeholders.length || syntax.length || checksums.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
