const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { transformDesktopSources } = require('../src/desktop_patcher');
const { translateDynamic } = require('../src/desktop_dynamic');

test('2.29 split empty states and connector counts translate before standalone words', async () => {
  const dom = new JSDOM('<body><p id="empty"></p><div id="connectors"></div><div id="count"></div><div id="tools"></div><button>No</button><article data-markdown-root>No automations yet</article><code>Fill</code><input value="~/Downloads"><select><option value="4">Fill</option></select></body>', { runScripts: 'outside-only' });
  try {
    const doc = dom.window.document;
    for (const [id, parts] of Object.entries({ empty: ['No ', 'automations', ' yet'], connectors: ['4', ' on for this conversation'], count: ['4', ' on'], tools: ['32', ' tools'] })) {
      for (const text of parts) doc.getElementById(id).append(doc.createTextNode(text));
    }
    const labels = ['Connectors', 'Browse Connectors', 'Featured', 'Change…', 'Browsing History', 'Clear visited URLs and autocomplete suggestions from the built-in browser.', 'Clear', 'Voice mode', 'Microphone', 'Input device for voice mode and dictation.', 'Accessibility', 'Optimize the interface and terminal output for screen readers.', 'Settings for conversations outside of projects.', 'Mcp Tools'];
    for (const text of labels) { const p = doc.createElement('p'); p.textContent = text; doc.body.append(p); }
    dom.window.eval(transformDesktopSources(new Map([['dist/preload.js', '"use strict";']])).get('dist/preload.js'));
    await new Promise(resolve => dom.window.setTimeout(resolve, 30));
    assert.equal(doc.getElementById('empty').textContent, 'Henüz otomasyon yok');
    assert.equal(doc.getElementById('connectors').textContent, 'Bu konuşmada 4 etkin');
    assert.equal(doc.getElementById('count').textContent, '4 etkin');
    assert.equal(doc.getElementById('tools').textContent, '32 araç');
    assert.equal(doc.querySelector('button').textContent, 'Hayır');
    assert.equal(doc.querySelector('article').textContent, 'No automations yet');
    assert.equal(doc.querySelector('code').textContent, 'Fill');
    assert.equal(doc.querySelector('input').value, '~/Downloads');
    assert.equal(doc.querySelector('select').value, '4');
    assert.equal(doc.querySelector('option').textContent, 'Alanı Doldur');
    for (const source of labels) assert.ok(![...doc.querySelectorAll('p')].some(p => p.textContent === source), source);
  } finally { dom.window.close(); }
});

test('personalized home greeting preserves the name and ignores unrelated sentences', () => {
  assert.equal(translateDynamic('Hi Faruk, what can we get done today?'), 'Merhaba Faruk, bugün neler yapalım?');
  assert.equal(translateDynamic('Hi Ayşe Öztürk, what can we get done today?'), 'Merhaba Ayşe Öztürk, bugün neler yapalım?');
  assert.equal(translateDynamic('Hi Faruk, inspect my code'), 'Hi Faruk, inspect my code');
});
