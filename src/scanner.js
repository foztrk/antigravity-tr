const fs = require('node:fs');
const path = require('node:path');
const { getPaths } = require('./config');

const UI_KEYS = 'label|title|placeholder|tooltip|heading|header|subtitle|emptyMessage|buttonLabel|primaryButtonLabel|secondaryButtonLabel|confirmLabel|cancelLabel|okLabel|message|detail|children|description|ariaLabel|aria-label|loading|completed|done|active|action|created|deleted|edited|loadingAction|completedAction';
const acorn = require('acorn');
const UI_KEY_SET = new Set(UI_KEYS.split('|'));
const COMPARABLE_KEYS = new Set(['label', 'title', 'loading', 'completed', 'done', 'active', 'action', 'created', 'deleted', 'edited', 'loadingAction', 'completedAction']);
const PROPERTY_PREFIX = new Set(['{', ',']);
const PROPERTY_SUFFIX = new Set([',', '}', 'eof']);

function scanBundle(source) {
  const protectedPairs = new Set();
  const candidates = [];
  const tokenizer = acorn.tokenizer(source, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
  function readToken() {
    const token = tokenizer.getToken();
    return { kind: token.type.label, value: token.value, start: token.start, end: token.end };
  }

  function readTemplate(first) {
    let text = '';
    const expressions = [];
    for (;;) {
      const quasi = readToken();
      if (quasi.kind !== 'template' && quasi.kind !== 'invalidTemplate') throw new Error('Beklenmeyen şablon öğesi.');
      text += quasi.value ?? source.slice(quasi.start, quasi.end);
      const delimiter = readToken();
      if (delimiter.kind === '`') return { ...first, kind: 'templateLiteral', value: text, expressions, end: delimiter.end };
      if (delimiter.kind !== '${') throw new Error('Beklenmeyen şablon ayracı.');
      const closing = scanTokens(true);
      const expression = source.slice(delimiter.start, closing.end);
      expressions.push(expression);
      text += expression;
    }
  }

  function scanTokens(inInterpolation) {
    const recent = [];
    let braceDepth = 0;
    for (;;) {
      let token = readToken();
      if (token.kind === '`') token = readTemplate(token);
      recent.push(token);
      if (recent.length > 8) recent.shift();

      const [beforeKey, key, colon, literal, after] = recent.slice(-5);
      if (after && PROPERTY_SUFFIX.has(after.kind) && colon.kind === ':' &&
          (literal.kind === 'string' || literal.kind === 'templateLiteral')) {
        const [prefix, open, computedKey, close] = recent.slice(-7, -3);
        const computed = !!prefix && PROPERTY_PREFIX.has(prefix.kind) && open.kind === '[' &&
          (computedKey.kind === 'name' || computedKey.kind === 'num') && close.kind === ']';
        const simple = PROPERTY_PREFIX.has(beforeKey.kind) && UI_KEY_SET.has(key.value) &&
          (key.kind === 'name' || key.kind === 'string');
        if (simple || computed) {
          candidates.push({ property: simple ? key.value : '[' + computedKey.value + ']',
            computed: !simple, text: literal.value, start: literal.start, end: literal.end,
            quote: source[literal.start], expressions: literal.expressions || [], complete: true });
        }
      }

      const isOperator = item => item?.kind === '==/!=/===/!==' && (item.value === '===' || item.value === '!==');
      const isComparable = item => COMPARABLE_KEYS.has(item?.value);
      const isAccess = item => item?.kind === '.' || item?.kind === '?.';
      const record = item => {
        if (item?.kind === 'string' || (item?.kind === 'templateLiteral' && !item.expressions.length)) protectedPairs.add(item.value);
      };
      const [a, b, c, d, e, f] = recent.length < 6 ? Array(6 - recent.length).fill(null).concat(recent) : recent.slice(-6);
      if (isAccess(c) && isComparable(d) && isOperator(e)) record(f);
      if (b?.kind === '[' && d?.kind === ']' && isComparable(c) && isOperator(e)) record(f);
      if (isOperator(c) && isAccess(e) && isComparable(f)) record(b);
      if (isOperator(b) && d?.kind === '[' && isComparable(e) && f?.kind === ']') record(a);
      if (token.kind === '{') braceDepth++;
      if (token.kind === '}') {
        if (inInterpolation && braceDepth === 0) return token;
        braceDepth--;
      }
      if (token.kind === 'eof') {
        if (inInterpolation) throw new Error('Şablon ifadesi kapanmadı.');
        return token;
      }
    }
  }

  scanTokens(false);
  return { candidates: candidates.sort((left, right) => left.start - right.start), protectedPairs };
}

function encodeLiteral(value, quote) {
  const json = JSON.stringify(value).slice(1, -1);
  if (quote === '"') return quote + json + quote;
  const escaped = quote === '`'
    ? json.replaceAll('`', '\\`').replaceAll('${', '\\${')
    : json.replaceAll("'", "\\'");
  return quote + escaped + quote;
}

function sameNumberedPlaceholders(source, translation) {
  const signature = value => JSON.stringify((value.match(/\{\d+\}/g) || []).sort());
  return signature(source) === signature(translation);
}

function renderTranslation(text, translation, quote, expressions) {
  if (!sameNumberedPlaceholders(text, translation)) return null;
  if (!expressions.length) return encodeLiteral(translation, quote);

  // Keep expressions byte-for-byte, in their original evaluation order.
  // Static pieces are escaped independently before they are put back in the template.
  let position = 0;
  let result = quote;
  for (const expression of expressions) {
    const index = translation.indexOf(expression, position);
    if (index < 0) return null;
    const part = translation.slice(position, index);
    if (part.includes('${')) return null;
    result += encodeLiteral(part, quote).slice(1, -1) + expression;
    position = index + expression.length;
  }
  const end = translation.slice(position);
  return end.includes('${') ? null : result + encodeLiteral(end, quote).slice(1);
}

function translateUiProperties(source, dictionary, protectedPairs = new Set()) {
  const scan = scanBundle(source);
  const chunks = [];
  let position = 0;
  for (const { text, start, end, quote, computed, complete, expressions } of scan.candidates) {
    if (start < position || !complete || computed || protectedPairs.has(text) || scan.protectedPairs.has(text)) continue;
    if (!Object.hasOwn(dictionary, text) || typeof dictionary[text] !== 'string' || dictionary[text] === text) continue;
    const replacement = renderTranslation(text, dictionary[text], quote, expressions);
    if (replacement === null) continue;
    chunks.push(source.slice(position, start), replacement);
    position = end;
  }
  return chunks.length ? chunks.join('') + source.slice(position) : source;
}
function readDirectory(directory) {
  return fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }) : [];
}

function* walkJs(directory) {
  for (const item of readDirectory(directory)) {
    const name = path.join(directory, item.name);
    if (item.isDirectory()) yield* walkJs(name);
    else if (item.isFile() && /\.[cm]?js$/i.test(item.name)) yield name;
  }
}

async function scanUiInventory(paths = getPaths()) {
  const entries = [];
  const protectedPairs = new Set();
  const files = new Set();
  function addBundle(file, source) {
    const scan = scanBundle(source);
    files.add(file);
    for (const value of scan.protectedPairs) protectedPairs.add(value);
    for (const candidate of scan.candidates) entries.push({ file, ...candidate });
  }
  function addJson(file, value, keys = []) {
    files.add(file);
    function visit(value, key) {
      if (typeof value === 'string') entries.push({ file, property: key, text: value });
      else if (value && typeof value === 'object') {
        for (const [childKey, child] of Object.entries(value)) {
          if (file === paths.ide.nlsFile || child && typeof child === 'object' || new RegExp('^(?:' + UI_KEYS + '|displayName)$').test(childKey)) {
            visit(child, keys[childKey] || childKey);
          }
        }
      }
    }
    visit(value, '');
  }
  const installedExtensions = path.join(path.dirname(paths.ide.productFile), 'extensions');
  const ideFiles = new Set([paths.ide.workbenchFile, paths.ide.jetskiFile, paths.ide.mainFile]);
  for (const directory of new Set([installedExtensions, paths.ide.extensionsDir, paths.desktop.extensionsDir].filter(Boolean))) {
    for (const item of readDirectory(directory).filter(entry => entry.isDirectory())) {
      const root = path.join(directory, item.name);
      ideFiles.add(path.join(root, 'package.json'));
      for (const name of walkJs(path.join(root, 'dist'))) ideFiles.add(name);
    }
  }
  for (const file of ideFiles) {
    if (!file || !fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.json')) addJson(file, JSON.parse(source));
    else addBundle(file, source);
  }
  if (fs.existsSync(paths.ide.nlsFile)) {
    const keys = fs.existsSync(paths.ide.nlsKeysFile)
      ? JSON.parse(fs.readFileSync(paths.ide.nlsKeysFile, 'utf8')).flatMap(([moduleName, names]) => names.map(name => moduleName + '#' + name))
      : [];
    addJson(paths.ide.nlsFile, JSON.parse(fs.readFileSync(paths.ide.nlsFile, 'utf8')), keys);
  }
  const archive = path.join(paths.desktop.appPath, 'resources', 'app.asar');
  if (fs.existsSync(archive)) {
    const asar = await import('@electron/asar');
    asar.uncacheAll();
    for (const entry of asar.listPackage(archive)) {
      const name = entry.replace(/^[/\\]/, '').replaceAll('\\', '/');
      const archivePath = path.normalize(name);
      if (/\.[cm]?js$/i.test(name) && !asar.statFile(archive, archivePath).files) addBundle(archive + ':' + name, asar.extractFile(archive, archivePath).toString('utf8'));
    }
  }
  return { entries, files: [...files], protectedPairs };
}

async function scanUiStrings(paths) {
  const { entries } = await scanUiInventory(paths);
  return [...new Set(entries.map(({ text }) => text).filter(text => text.trim()))].sort();
}

module.exports = { scanBundle, scanUiInventory, scanUiStrings, translateUiProperties };
