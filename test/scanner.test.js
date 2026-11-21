const test = require('node:test');
const assert = require('node:assert/strict');
const { scanBundle, translateUiProperties } = require('../src/scanner');

test('scans UI keys, computed keys and template expressions without matching comments or strings', () => {
  const bundle = [
    'const example = \'{title: "Example"}\';',
    '// {title: "Comment"}',
    'const ui = { label: "Run", \'aria-label\': \'Retry\', [key]: "Panel",',
    '  loadingAction: `Checking ${format({description: "Temp"})}`, subtitle: `Welcome` };',
  ].join('\n');
  const found = scanBundle(bundle).candidates;
  assert.deepEqual(found.map(({ text }) => text), [
    'Run', 'Retry', 'Panel', 'Checking ${format({description: "Temp"})}', 'Temp', 'Welcome',
  ]);
  assert.equal(found[2].computed, true);
  assert.equal(bundle.slice(found[1].start, found[1].end), "\'Retry\'");
});

test('preserves compared labels and states alongside unproven computed keys', () => {
  const bundle = [
    'ui.label === "On";',
    '"Power" !== ui["title"];',
    'ui["action"] === "Create";',
    'ui.loading === "Waiting";',
    'const labels = { label: "On", title: "Power", action: "Create", loading: "Waiting",',
    '  [key]: "Unknown", header: "Go" };',
  ].join('\n');
  assert.deepEqual([...scanBundle(bundle).protectedPairs], ['On', 'Power', 'Create', 'Waiting']);
  const dictionary = Object.fromEntries(['On', 'Power', 'Create', 'Waiting', 'Unknown', 'Go'].map(value => [value, 'tr ' + value]));
  assert.equal(translateUiProperties(bundle, dictionary), bundle.replace('header: "Go"', 'header: "tr Go"'));
});

test('preserves numbered placeholders and original template expressions', () => {
  const bundle = 'const labels = { title: `Hello ${user.name} ({0})`, message: "Value {0}" };';
  assert.equal(translateUiProperties(bundle, {
    'Hello ${user.name} ({0})': 'Merhaba ${user.name} ({0})',
    'Value {0}': 'Değer {1}',
  }), bundle.replace('Hello', 'Merhaba'));
  assert.equal(translateUiProperties(bundle, {
    'Hello ${user.name} ({0})': 'Merhaba ${other.name} ({0})',
  }), bundle);
});
