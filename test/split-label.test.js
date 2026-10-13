const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { transformDesktopSources } = require('../src/desktop_patcher');
test('split UI labels translate while plugin identifiers and code stay intact', async () => {
  const dom = new JSDOM('<body><span></span><b>Science</b><code>No projects found</code></body>', { runScripts: 'outside-only' });
  try {
    const doc = dom.window.document;
    const label = doc.querySelector('span');
    label.append(doc.createTextNode('No projects '), doc.createTextNode('found'));
    dom.window.eval(transformDesktopSources(new Map([['dist/preload.js', '"use strict";']])).get('dist/preload.js'));
    await new Promise(resolve => dom.window.setTimeout(resolve, 20));
    assert.equal(label.textContent, 'Proje Bulunamadı');
    assert.equal(doc.querySelector('b').textContent, 'Science');
    assert.equal(doc.querySelector('code').textContent, 'No projects found');
  } finally { dom.window.close(); }
});
