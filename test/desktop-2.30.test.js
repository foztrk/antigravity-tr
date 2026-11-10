const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { transformDesktopSources } = require('../src/desktop_patcher');
const { translateDynamic } = require('../src/desktop_dynamic');

test('2.30 greetings and voice choices preserve names and reject unknown action templates', () => {
  for (const [source, translated] of [['Hi Faruk.', 'Merhaba Faruk.'], ['Hello, Ayşe.', 'Merhaba Ayşe.'], ['Welcome back, Faruk.', 'Tekrar hoş geldiniz, Faruk.'], ['Good to see you, Faruk.', 'Sizi görmek güzel, Faruk.']]) assert.equal(translateDynamic(source), translated);
  for (const name of ['Fola', 'Arlo', 'Cleo', 'Finn', 'Gero', 'Lora', 'Neno', 'Olin', 'Tari']) assert.equal(translateDynamic('Use ' + name), name + ' Sesini Kullan');
  assert.equal(translateDynamic('Use my code'), 'Use my code');
  assert.equal(translateDynamic('Hello, Faruk. More text'), 'Hello, Faruk. More text');
});

test('2.30 voice picker, retirement tooltip and layout labels preserve controls and user content', async () => {
  const sources = ['Interface Layout', 'Knowledge Work', 'Software Engineering', 'Simplified interface for research, writing, and everyday tasks.', 'Full interface for coding, developer tools, and managing agents.', 'Voice', 'Not set', 'The voice used in Voice mode. Powered by Gemini Live.', "How loud Antigravity's voice is.", "Choose Antigravity's Voice", 'Clear and friendly', 'Confident and clear', 'Warm and engaging', 'Warm and approachable', 'Deep and velvety', 'Light and precise'];
  const dom = new JSDOM('<body><section></section><button data-testid="voice-picker-use"></button><button title="Start Voice mode" aria-label="Start Voice mode"></button><div role="tooltip"></div><input type="range" value="75"><div data-markdown-root>Hello, Faruk.</div><pre>Use Fola</pre></body>', { runScripts: 'outside-only' });
  try {
    const doc = dom.window.document;
    for (const source of sources) { const p = doc.createElement('p'); p.textContent = source; doc.querySelector('section').append(p); }
    for (const part of ['Use ', 'Fola']) doc.querySelector('[data-testid=voice-picker-use]').append(doc.createTextNode(part));
    const retirement = 'GPT-OSS will be removed from Antigravity on November 18, 2026.';
    doc.querySelector('[role=tooltip]').textContent = retirement;
    dom.window.eval(transformDesktopSources(new Map([['dist/preload.js', '"use strict";']])).get('dist/preload.js'));
    await new Promise(resolve => dom.window.setTimeout(resolve, 30));
    for (const source of sources) assert.ok(![...doc.querySelectorAll('section p')].some(p => p.textContent === source), source);
    assert.equal(doc.querySelector('[data-testid=voice-picker-use]').textContent, 'Fola Sesini Kullan');
    assert.equal(doc.querySelector('button[title]').title, 'Ses Modunu Başlat');
    assert.equal(doc.querySelector('button[aria-label]').getAttribute('aria-label'), 'Ses Modunu Başlat');
    assert.equal(doc.querySelector('[role=tooltip]').textContent, 'GPT-OSS, 18 Kasım 2026 tarihinde Antigravity’den kaldırılacak.');
    assert.equal(doc.querySelector('input').value, '75');
    assert.equal(doc.querySelector('[data-markdown-root]').textContent, 'Hello, Faruk.');
    assert.equal(doc.querySelector('pre').textContent, 'Use Fola');
    const useButton = doc.querySelector('[data-testid=voice-picker-use]');
    useButton.lastChild.nodeValue = 'Arlo';
    await new Promise(resolve => dom.window.setTimeout(resolve, 30));
    assert.equal(useButton.textContent, 'Arlo Sesini Kullan');
    useButton.lastChild.nodeValue = 'Fola';
    await new Promise(resolve => dom.window.setTimeout(resolve, 30));
    assert.equal(useButton.textContent, 'Fola Sesini Kullan');
  } finally { dom.window.close(); }
});
