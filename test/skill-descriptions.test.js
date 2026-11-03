const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { transformDesktopSources } = require('../src/desktop_patcher');
const { translateDynamic } = require('../src/desktop_dynamic');
const descriptions = [...require('./skill-descriptions.json'), ...require('./marketplace-descriptions.json')];

test('all inventoried skill descriptions translate, including multiline and collapsed whitespace', async () => {
  const dom = new JSDOM('<body><section></section><code></code><textarea></textarea></body>', { runScripts: 'outside-only' });
  try {
    const doc = dom.window.document;
    for (const row of descriptions) {
      for (const source of [row.source, row.source.replace(/\s+/g, ' ')]) {
        const p = doc.createElement('p');
        p.textContent = source;
        doc.querySelector('section').append(p);
      }
    }
    doc.querySelector('code').textContent = descriptions[0].source;
    doc.querySelector('textarea').value = descriptions[0].source;
    dom.window.eval(transformDesktopSources(new Map([['dist/preload.js', '"use strict";']])).get('dist/preload.js'));
    await new Promise(resolve => dom.window.setTimeout(resolve, 20));
    const paragraphs = [...doc.querySelectorAll('p')];
    descriptions.forEach((row, i) => {
      assert.equal(paragraphs[i * 2].textContent, row.translation, row.name);
      assert.equal(paragraphs[i * 2 + 1].textContent, row.translation, row.name);
    });
    assert.equal(doc.querySelector('code').textContent, descriptions[0].source);
    assert.equal(doc.querySelector('textarea').value, descriptions[0].source);
    const dynamic = doc.createElement('div');
    dynamic.innerHTML = '<span>Available AI Credits: 125</span><button>See Activity</button><p>Prompt for approval before running browser scripts.</p><select><option value="allow">Allow</option></select>';
    doc.body.append(dynamic);
    await new Promise(resolve => dom.window.setTimeout(resolve, 20));
    assert.equal(dynamic.querySelector('span').textContent, 'Kullanılabilir AI Kredisi: 125');
    assert.equal(dynamic.querySelector('button').textContent, 'Hareketleri Görüntüle');
    assert.equal(dynamic.querySelector('p').textContent, 'Tarayıcı betiklerini çalıştırmadan önce onay ister.');
    assert.equal(dynamic.querySelector('option').textContent, 'İzin Ver');
    assert.equal(dynamic.querySelector('select').value, 'allow');
  } finally { dom.window.close(); }
});

test('credit amounts remain dynamic and unrelated text remains unchanged', () => {
  for (const amount of ['0', '1,250', '12.5']) {
    assert.equal(translateDynamic('Available AI Credits: ' + amount), 'Kullanılabilir AI Kredisi: ' + amount);
  }
  assert.equal(translateDynamic('tokens)'), 'token)');
  assert.equal(translateDynamic('My tokens'), 'My tokens');
});
