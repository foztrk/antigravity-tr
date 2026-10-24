const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { transformDesktopSources } = require('../src/desktop_patcher');

function fixture() {
  return new Map([
    ['dist/preload.js', '"use strict";'],
    ['dist/menu.js', '"use strict"; const electron_1 = {}; const menu = {}; electron_1.Menu.setApplicationMenu(menu);'],
    ['dist/tray.js', 'const label = "No agents running";'],
    ['dist/loadingOverlay.js', 'const label = "Loading Antigravity";'],
    ['dist/provisionSplash.js', 'const label = "Setting up WSL:";']
  ]);
}

test('customization budget translates split React text nodes and copy tooltip', async () => {
  const dom = new JSDOM('<body><div id="budget"></div><button title="Copy Path">Copy Path</button></body>', { runScripts: 'outside-only' });
  try {
    const budget = dom.window.document.getElementById('budget');
    for (const value of ['1.148', ' / ', '20.000', ' tokens (', '5.7', '%)']) budget.append(dom.window.document.createTextNode(value));
    dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));
    await new Promise(resolve => dom.window.setTimeout(resolve, 20));
    assert.equal(budget.textContent, '1.148 / 20.000 token (5.7%)');
    assert.equal(dom.window.document.querySelector('button').title, 'Yolu Kopyala');
  } finally { dom.window.close(); }
});

test('repeated installation produces identical valid JavaScript and exactly one translator', () => {
  const first = transformDesktopSources(fixture());
  const second = transformDesktopSources(first);
  assert.deepEqual(second, first);
  assert.equal((first.get('dist/preload.js').match(/const dictionary =/g) || []).length, 1);
  assert.equal((first.get('dist/menu.js').match(/function menuToTemplate/g) || []).length, 1);
});

test('DOM translation settles, follows added UI and attribute changes, preserves code and message content', { timeout: 5000 }, async () => {
  const dom = new JSDOM('<body><button>Save</button><span>Antigravity</span><pre><span>Save</span></pre><div class="markdown">Save</div><textarea>Save</textarea><input value="Save"></body>', { runScripts: 'outside-only' });
  try {
    dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));
    await new Promise(resolve => dom.window.setTimeout(resolve, 20));
    const doc = dom.window.document;
    assert.equal(doc.querySelector('button').textContent, 'Kaydet');
    assert.equal(doc.querySelector('pre').textContent, 'Save');
    assert.equal(doc.querySelector('.markdown').textContent, 'Save');
    assert.equal(doc.querySelector('textarea').value, 'Save');
    assert.equal(doc.querySelector('input').value, 'Save');
    const button = doc.createElement('button'); button.textContent = 'Cancel'; doc.body.append(button);
    doc.querySelector('input').setAttribute('aria-label', 'Save');
    await new Promise(resolve => dom.window.setTimeout(resolve, 20));
    assert.equal(button.textContent, 'İptal');
    assert.equal(doc.querySelector('input').getAttribute('aria-label'), 'Kaydet');
    let mutations = 0;
    const observer = new dom.window.MutationObserver(ms => { mutations += ms.length; });
    observer.observe(doc.body, { characterData: true, subtree: true, attributes: true });
    await new Promise(resolve => dom.window.setTimeout(resolve, 30));
    assert.equal(mutations, 0);
    observer.disconnect();
  } finally { dom.window.close(); }
});

test('custom menu items and select labels translate without changing option values', async () => {
  const dom = new JSDOM('<body><div role="menu"><span>Zoom In</span><span>Zoom Out</span><span>Reset Zoom</span><span>Minimize</span><span>Maximize</span></div><select><option value="always">Always</option><option value="never">Never</option></select></body>', { runScripts: 'outside-only' });
  try {
    dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));
    await new Promise(resolve => dom.window.setTimeout(resolve, 20));
    assert.deepEqual([...dom.window.document.querySelectorAll('[role="menu"] span')].map(n => n.textContent), ['Yakınlaştır', 'Uzaklaştır', 'Yakınlaştırmayı Sıfırla', 'Simge Durumuna Küçült', 'Ekranı Kapla']);
    assert.deepEqual([...dom.window.document.querySelectorAll('option')].map(n => [n.value, n.textContent]), [['always', 'Her Zaman'], ['never', 'Asla']]);
  } finally { dom.window.close(); }
});

test('reported settings screens translate initial and asynchronously added labels', async () => {
  const labels = ['New', 'Search tasks...', 'No scheduled tasks configured.', 'Five Hour Limit Remaining', 'Inherit Global', 'Full machine', 'Windows Subsystem for Linux', 'Connect', 'Version', 'App version', 'Automatic Check for Updates', 'Upgrade', 'Model Credits', 'Enable AI Credit Overages', 'Back', 'File Permissions', 'File Reads', 'File Writes', 'Allow', 'Deny'];
  const dom = new JSDOM('<body><div role="dialog"></div></body>', { runScripts: 'outside-only' });
  try {
    dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));
    await new Promise(resolve => dom.window.setTimeout(resolve, 10));
    const container = dom.window.document.querySelector('[role="dialog"]');
    for (const text of labels) { const node = dom.window.document.createElement('span'); node.textContent = text; container.append(node); }
    const quota = dom.window.document.createElement('span'); quota.textContent = 'Resets in 16h 24m'; container.append(quota);
    await new Promise(resolve => dom.window.setTimeout(resolve, 20));
    labels.forEach((text, index) => assert.notEqual(container.children[index].textContent, text, text));
    assert.equal(quota.textContent, '16 saat 24 dakika sonra yenilenir');
    quota.textContent = 'Resets in 16h 23m';
    await new Promise(resolve => dom.window.setTimeout(resolve, 20));
    assert.equal(quota.textContent, '16 saat 23 dakika sonra yenilenir');
  } finally { dom.window.close(); }
});
test('sidebar status and shortcut tooltip fit while message text stays intact', async () => {
  const dom = new JSDOM('<body><div class="markdown">Copy<div role="tooltip">Copy</div></div><div id="shortcut" style="white-space:nowrap">Alt+Enter On empty prompt, sends next in queue</div><span id="updated">Updated 3 Eki, 14:09</span><span>Archived Only</span></body>', {runScripts:'outside-only'});
  try {
    dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));
    await new Promise(resolve => dom.window.setTimeout(resolve,20));
    const doc=dom.window.document;
    assert.equal(doc.querySelector('.markdown').firstChild.nodeValue,'Copy');
    assert.equal(doc.querySelector('[role="tooltip"]').textContent,'Kopyala');
    assert.equal(doc.querySelector('#shortcut').style.whiteSpace,'normal');
    assert.equal(doc.querySelector('#shortcut').style.overflowWrap,'anywhere');
    assert.equal(doc.querySelector('#shortcut').textContent,'Alt+Enter: Alan boşsa sıradaki iletiyi gönderir');
    assert.equal(doc.querySelector('#updated').textContent,'Güncellendi: 3 Eki, 14:09');
  } finally {dom.window.close();}
});
test('native context menu translates nested labels and preserves actions and IDs', () => {
  const vm=require('node:vm');
  const input=fixture();
  input.set('dist/ipcHandlers.js', 'function buildContextMenuTemplate(items, onSelect) { return items.map(item => ({id:item.id,label:item.label,submenu:item.submenu?buildContextMenuTemplate(item.submenu,onSelect):undefined,click:()=>onSelect(item.id)})); }');
  const output=transformDesktopSources(input);
  assert.deepEqual(transformDesktopSources(output),output);
  const context={};vm.createContext(context);vm.runInContext(output.get('dist/ipcHandlers.js'),context);
  let selected;
  const result=context.buildContextMenuTemplate([{id:'rename',label:'Rename'},{id:'read',label:'Mark Unread'},{id:'copy',label:'Copy',submenu:[{id:'unknown',label:'Custom project title'},{id:'name',label:'Conversation Name'},{id:'cid',label:'Conversation ID'},{id:'project',label:'Project Name'},{id:'right',label:'Split Right'},{id:'down',label:'Split Down'}]},{id:'split',label:'Split'},{id:'archive',label:'Archive'},{id:'delete',label:'Delete'}],id=>selected=id);
  assert.deepEqual(Array.from(result,x=>x.label),['Yeniden Adlandır','Okunmadı Olarak İşaretle','Kopyala','Böl','Arşivle','Sil']);
  assert.deepEqual(Array.from(result[2].submenu,x=>x.label),['Custom project title','Konuşma Adı','Konuşma Kimliği','Proje Adı','Sağa Böl','Aşağı Böl']);result[0].click();assert.equal(selected,'rename');
});
test('consent split across inline elements translates without changing checkbox or policy link', async () => {
  const dom = new JSDOM('<body><label><input type="checkbox" checked><span>Yes, I agree to help improve Antigravity by allowing Google to collect and use my </span><span>Interactions data, subject to the Google Antigravity </span><a href="https://example.test/terms">Terms of Service</a></label></body>', {runScripts:'outside-only'});
  try {
    dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));
    await new Promise(resolve=>dom.window.setTimeout(resolve,20));
    assert.ok(!dom.window.document.querySelector('label').textContent.includes('Interactions data'));
    assert.ok(dom.window.document.querySelector('label').textContent.includes('etkileşim verilerimi'));
    assert.equal(dom.window.document.querySelector('input').checked,true);
    assert.equal(dom.window.document.querySelector('a').href,'https://example.test/terms');
  } finally {dom.window.close();}
});
test('new marketplace and automation UI preserves product names, form values and button behavior', async () => {
  const catalog=require('./marketplace-oct8.json');
  const dom=new JSDOM('<body><input placeholder="Search automations..." value="My automation"><button id="add">Add Automation</button><h2>New Automation</h2><span>Installed</span><span>Worktree</span></body>',{runScripts:'outside-only'});
  try {
    const doc=dom.window.document;
    for(const item of catalog){const card=doc.createElement('div');const title=doc.createElement('h3');title.textContent=item.name;const description=doc.createElement('p');description.textContent=item.description;card.append(title,description);doc.body.append(card);}
    let clicked=false;doc.querySelector('#add').onclick=()=>clicked=true;
    dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));
    await new Promise(r=>dom.window.setTimeout(r,20));
    assert.equal(doc.querySelector('input').value,'My automation');assert.equal(doc.querySelector('input').placeholder,'Otomasyonlarda ara...');
    assert.equal(doc.querySelector('#add').textContent,'Otomasyon Ekle');doc.querySelector('#add').click();assert.equal(clicked,true);
    [...doc.querySelectorAll('h3')].forEach((el,i)=>assert.equal(el.textContent,catalog[i].name));
    [...doc.querySelectorAll('p')].forEach((el,i)=>assert.notEqual(el.textContent,catalog[i].description,catalog[i].name));
  }finally{dom.window.close();}
});

test('notification labels translate exactly and preserve other notification options',()=>{
 const vm=require('node:vm');const input=fixture();input.set('dist/ipcHandlers.js','function buildContextMenuTemplate(items, onSelect) { return items.map(item => ({id:item.id,label:item.label})); } function notify(options){ return {title: options.title, body: options.body, silent: options.silent,};}');
 const output=transformDesktopSources(input);assert.deepEqual(transformDesktopSources(output),output);const context={};vm.createContext(context);vm.runInContext(output.get('dist/ipcHandlers.js'),context);
 const n=context.notify({title:'Action requires your attention',body:'The agent is waiting for your input.',silent:true});assert.equal(n.title,'İşlem için müdahaleniz gerekiyor');assert.equal(n.body,'Ajan sizden giriş bekliyor.');assert.equal(n.silent,true);
 const custom=context.notify({title:'My task',body:'User content',silent:false});assert.equal(custom.title,'My task');assert.equal(custom.body,'User content');
});
test('URL approval translates labels while preserving URL and permission values',async()=>{
 const labels=['Yes, allow this time','Yes, and always allow in this conversation','Yes, and always allow when not in a project','Yes, and always allow','No (tell the agent what to do instead)'];
 const dom=new JSDOM('<body><h2>Allow reading this URL?</h2><code>evren.ssyz.org.tr</code>'+labels.map((s,i)=>`<label><input type="radio" name="permission" value="${i}" ${i===0?'checked':''}>${s}</label>`).join('')+'<button>Skip</button></body>',{runScripts:'outside-only'});
 try{dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));await new Promise(r=>dom.window.setTimeout(r,20));const d=dom.window.document;assert.equal(d.querySelector('h2').textContent,'Bu URL’nin okunmasına izin verilsin mi?');assert.equal(d.querySelector('code').textContent,'evren.ssyz.org.tr');assert.equal(d.querySelector('input:checked').value,'0');assert.deepEqual([...d.querySelectorAll('input')].map(x=>x.value),['0','1','2','3','4']);assert.equal(d.querySelector('button').textContent,'Atla');for(const label of d.querySelectorAll('label'))assert.ok(!label.textContent.startsWith('Yes')&&!label.textContent.startsWith('No'));}finally{dom.window.close();}
});


test('question modal translates shared labels and recommended prefix without changing answers',async()=>{
 const dom=new JSDOM('<body><h2>Hangi konuyu seçiyorsunuz?</h2><label><input type="radio" name="q" value="first" checked>(Recommended) Evet, sayfayı oku ve özetle</label><label><input type="radio" name="q" value="no">Hayır, okuma</label><label>Other (write your answer)<textarea>My own answer</textarea></label><button title="Skip (esc), Skip All (Ctrl+esc)">Skip</button><button title="Cancel questionnaire and stop the agent (Ctrl+D)">Submit</button><div class="markdown">(Recommended) Original message</div></body>',{runScripts:'outside-only'});
 try{dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));await new Promise(r=>dom.window.setTimeout(r,20));const d=dom.window.document;assert.equal(d.querySelector('h2').textContent,'Hangi konuyu seçiyorsunuz?');assert.equal(d.querySelector('label').textContent,'(Önerilen) Evet Sayfayı Oku ve Özetle');assert.equal(d.querySelectorAll('label')[1].textContent,'Hayır, Okuma');assert.ok(d.querySelectorAll('label')[2].textContent.startsWith('Diğer (Yanıtınızı Yazın)'));assert.equal(d.querySelector('textarea').value,'My own answer');assert.equal(d.querySelector('input:checked').value,'first');assert.equal(d.querySelector('.markdown').textContent,'(Recommended) Original message');assert.equal(d.querySelectorAll('button')[0].title,'Atla (Esc), Tümünü Atla (Ctrl+Esc)');assert.equal(d.querySelectorAll('button')[1].title,'Soruları İptal Et ve Ajanı Durdur (Ctrl+D)');}finally{dom.window.close();}
});

test('question status counts and unanswered UI translate without changing message content',async()=>{
 const dom=new JSDOM('<body><span>Asked 1 question</span><span>Asked 3 questions</span><span>Asking 2 questions</span><span>No answer provided</span><span>just now</span><div class="markdown">No answer provided</div></body>',{runScripts:'outside-only'});
 try{dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));await new Promise(r=>dom.window.setTimeout(r,20));assert.deepEqual([...dom.window.document.querySelectorAll('span')].map(x=>x.textContent),['1 Soru Soruldu','3 Soru Soruldu','2 Soru Soruluyor','Yanıt Verilmedi','Az Önce']);assert.equal(dom.window.document.querySelector('.markdown').textContent,'No answer provided');}finally{dom.window.close();}
});

test('split question status and native count tooltip translate without replacing controls',async()=>{
 const dom=new JSDOM('<body><button id="split" title="1 question"></button><button id="nested">Asked <span>2 questions</span><svg></svg></button></body>',{runScripts:'outside-only'});
 try{const d=dom.window.document;for(const t of ['Asked ','1',' question'])d.querySelector('#split').append(d.createTextNode(t));dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));await new Promise(r=>dom.window.setTimeout(r,20));assert.equal(d.querySelector('#split').title,'1 Soru');assert.ok(!d.querySelector('#split').textContent.includes('Asked'));assert.ok(!d.querySelector('#nested').textContent.includes('questions'));assert.ok(d.querySelector('#nested svg'));}finally{dom.window.close();}
});

test('task status fragments translate and preserve task names and command text',async()=>{
 const dom=new JSDOM('<body><span>1 task running</span><span>3 tasks running</span><div><span>Checked task</span> <b>llama.cpp CUDA paketleri indiriliyor</b></div><div><span>Killed task</span> <b>llama.cpp CUDA paketleri indiriliyor</b></div><span>Çoklu bağlantı hızı ölçülüyor finished</span><code>python download_engine.py</code><div class="markdown">My task finished</div></body>',{runScripts:'outside-only'});
 try{dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));await new Promise(r=>dom.window.setTimeout(r,20));const d=dom.window.document;assert.deepEqual([...d.querySelectorAll('span')].map(x=>x.textContent),['1 Görev Çalışıyor','3 Görev Çalışıyor','Görev Kontrol Edildi:','Görev Sonlandırıldı:','Çoklu bağlantı hızı ölçülüyor Tamamlandı']);for(const b of d.querySelectorAll('b'))assert.equal(b.textContent,'llama.cpp CUDA paketleri indiriliyor');assert.equal(d.querySelector('code').textContent,'python download_engine.py');assert.equal(d.querySelector('.markdown').textContent,'My task finished');}finally{dom.window.close();}
});

test('file panels translate menus, comments, elapsed time and diff labels while preserving code and paths',async()=>{
 const values=['Overview','Copy Content','Search','Show in File Explorer','Leave a comment','Add Comment','View Diff','Comment (Ctrl+Alt+M)','Add inline comment','(all agent edits)','Subagents','Files Changed','Artifacts','Uploads','Background Tasks','Cancel All Tasks','Terminals','Skills Used','Open File','New Terminal','See all (97)','+155 more lines','Worked for 17m','Worked for 1h 8m','2m ago','find_vars2.cjs (all agent edits)'];
 const expected=['Genel Bakış','İçeriği Kopyala','Ara','Dosya Gezgini’nde Göster','Yorum Yazın','Yorum Ekle','Farkı Görüntüle','Yorum Ekle (Ctrl+Alt+M)','Satıra Yorum Ekle','(Tüm Ajan Düzenlemeleri)','Alt Ajanlar','Değiştirilen Dosyalar','Çıktılar','Yüklenen Dosyalar','Arka Plan Görevleri','Tüm Görevleri İptal Et','Terminaller','Kullanılan Beceriler','Dosya Aç','Yeni Terminal','Tümünü Gör (97)','+155 Satır Daha','17 dakika çalıştı','1 saat 8 dakika çalıştı','2 Dakika Önce','find_vars2.cjs (Tüm Ajan Düzenlemeleri)'];
 const dom=new JSDOM('<body>'+values.map(t=>'<span>'+t+'</span>').join('')+'<textarea placeholder="Leave a comment">My comment</textarea><code>Copy Content</code><div class="markdown">Worked for 17m</div></body>',{runScripts:'outside-only'});
 try{dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));await new Promise(r=>dom.window.setTimeout(r,20));const d=dom.window.document;assert.deepEqual([...d.querySelectorAll('span')].map(x=>x.textContent),expected);assert.equal(d.querySelector('textarea').placeholder,'Yorum Yazın');assert.equal(d.querySelector('textarea').value,'My comment');assert.equal(d.querySelector('code').textContent,'Copy Content');assert.equal(d.querySelector('.markdown').textContent,'Worked for 17m');}finally{dom.window.close();}
});

test('review toolbar and find controls translate while retaining query, code and handlers',async()=>{
 const pairs=[['For Turn','Bu Tur İçin'],['Agent Edits','Ajan Düzenlemeleri'],['View Split Diff','Farkları Yan Yana Görüntüle'],['Hide Whitespace Changes','Boşluk Değişikliklerini Gizle'],['Collapse All','Tümünü Daralt'],['No Results','Sonuç Yok']];
 const dom=new JSDOM('<body>'+pairs.map(([text])=>'<button>'+text+'</button>').join('')+'<input placeholder="Find" value="my query"><button id="case" title="Match Case (Aa)">Aa</button><code>Find</code></body>',{runScripts:'outside-only'});
 try{const d=dom.window.document;let clicked=false;d.querySelector('button').onclick=()=>clicked=true;dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));await new Promise(r=>dom.window.setTimeout(r,20));pairs.forEach(([,expected],i)=>assert.equal(d.querySelectorAll('button')[i].textContent,expected));assert.equal(d.querySelector('input').placeholder,'Bul');assert.equal(d.querySelector('input').value,'my query');assert.equal(d.querySelector('#case').title,'Büyük/Küçük Harf Eşleştir (Aa)');assert.equal(d.querySelector('code').textContent,'Find');d.querySelector('button').click();assert.equal(clicked,true);}finally{dom.window.close();}
});

test('find bar option tooltips translate together without changing search settings',async()=>{
 const pairs=[['Match Whole Word (ab)','Tam Sözcük Eşleştir (ab)'],['Use Regular Expression (.*)','Düzenli İfade Kullan (.*)'],['Close (Escape)','Kapat (Escape)'],['Previous Match (Shift+Enter)','Önceki Eşleşme (Shift+Enter)'],['Next Match (Enter)','Sonraki Eşleşme (Enter)']];
 const dom=new JSDOM('<body><input value="a.*b">'+pairs.map(([text])=>'<button title="'+text+'" aria-label="'+text+'" aria-pressed="false">icon</button>').join('')+'</body>',{runScripts:'outside-only'});
 try{dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));await new Promise(r=>dom.window.setTimeout(r,20));const d=dom.window.document;pairs.forEach(([,expected],i)=>{const b=d.querySelectorAll('button')[i];assert.equal(b.title,expected);assert.equal(b.getAttribute('aria-label'),expected);assert.equal(b.getAttribute('aria-pressed'),'false');});assert.equal(d.querySelector('input').value,'a.*b');}finally{dom.window.close();}
});

test('split negative URL approval preserves radio selection and URL',async()=>{
 const dom=new JSDOM('<body><label><input type="radio" value="deny"><span>No</span> <span>(tell the agent what to do instead)</span></label><code>memories.ai</code><div class="markdown">No</div></body>',{runScripts:'outside-only'});
 try{dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));await new Promise(r=>dom.window.setTimeout(r,20));const d=dom.window.document;assert.equal(d.querySelector('label').textContent,'Hayır (Bunun Yerine Ne Yapılacağını Belirtin)');assert.equal(d.querySelector('input').value,'deny');assert.equal(d.querySelector('input').checked,false);assert.equal(d.querySelector('code').textContent,'memories.ai');assert.equal(d.querySelector('.markdown').textContent,'No');}finally{dom.window.close();}
});

test('Gemini model recommendation tooltip tolerates wrapped text without changing model name',async()=>{
 const english='Use Gemini 3.8 Flash! As a newer model, it delivers more intelligence at 2x the speed for 70% less cost than Gemini 3.1 Pro.';
 const dom=new JSDOM('<body><span>Gemini 3.1 Pro</span><div role="tooltip">'+english.replace('As a newer','As a\nnewer')+'</div><button title="'+english+'">Model</button></body>',{runScripts:'outside-only'});
 try{dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));await new Promise(r=>dom.window.setTimeout(r,20));const d=dom.window.document;assert.equal(d.querySelector('span').textContent,'Gemini 3.1 Pro');assert.ok(d.querySelector('[role=tooltip]').textContent.startsWith('Gemini 3.8 Flash’ı Kullanın!'));assert.ok(d.querySelector('button').title.includes('%70'));assert.ok(d.querySelector('[role=tooltip]').textContent.includes('2 kat'));}finally{dom.window.close();}
});

test('2.23 settings and history labels translate without changing permissions or plugin identifiers',async()=>{
 const pairs=[['Folder','Klasör'],['Search Conversations Ctrl+K','Konuşmalarda Ara Ctrl+K'],['Every command requires approval.','Her komut için onay gerekir.'],['Ask before sensitive operations.','Hassas işlemlerden önce onay iste.'],['Run all commands without restrictions.','Tüm komutları kısıtlama olmadan çalıştır.'],['Use Global Settings','Genel Ayarları Kullan'],['This page is going away soon','Bu Sayfa Yakında Kaldırılacak'],['Sort By','Sıralama Ölçütü'],['Mark All as Read','Tümünü Okundu Olarak İşaretle'],['Create','Oluştur'],['No description available.','Açıklama Yok.'],['Skills & Rules','Beceriler ve Kurallar'],['Custom Agents','Özel Ajanlar'],['No custom agents yet.','Henüz Özel Ajan Yok.'],['MCP Servers','MCP Sunucuları'],['Fix with Agent','Ajanla Düzelt']];
 const dom=new JSDOM('<body>'+pairs.map(([s])=>'<button>'+s+'</button>').join('')+'<input type="radio" value="turbo" checked><b>googlecloudtools.datacloud_tools</b><code>connect ENOENT</code><div class="markdown">Folder</div></body>',{runScripts:'outside-only'});
 try{dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));await new Promise(r=>dom.window.setTimeout(r,20));const d=dom.window.document;pairs.forEach(([,expected],i)=>assert.equal(d.querySelectorAll('button')[i].textContent,expected));assert.equal(d.querySelector('input').value,'turbo');assert.equal(d.querySelector('input').checked,true);assert.equal(d.querySelector('b').textContent,'googlecloudtools.datacloud_tools');assert.equal(d.querySelector('code').textContent,'connect ENOENT');assert.equal(d.querySelector('.markdown').textContent,'Folder');}finally{dom.window.close();}
});

test('reported twelve screens cover search, archive fragments, source filters and MCP controls',async()=>{
 const pairs=[['Search for conversations...','Konuşmalarda Ara...'],['Commands','Komutlar'],['Files','Dosyalar'],['Create a Plugin with the Agent','Ajanla Eklenti Oluştur'],['No projects found','Proje Bulunamadı'],['Hayır projects found','Proje Bulunamadı'],['See 6 more','6 Tane Daha Göster'],['+ See 19 more','+ 19 Tane Daha Göster'],['Source','Kaynak'],['Built In','Yerleşik'],['Copy Config File Path','Dosya Yolunu Kopyala'],['Add MCP Server','MCP Sunucusu Ekle'],['Restart','Yeniden Başlat'],['Custom Order','Özel Sıralama']];
 const dom=new JSDOM('<body>'+pairs.map(([t])=>'<button title="'+t+'">'+t+'</button>').join('')+'<p><span>View archived in the sidebar (</span><svg></svg><span> menu).</span></p><input placeholder="Search for conversations..." value="my search"><code>Restart</code></body>',{runScripts:'outside-only'});
 try{dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));await new Promise(r=>dom.window.setTimeout(r,20));const d=dom.window.document;pairs.forEach(([,expected],i)=>assert.equal(d.querySelectorAll('button')[i].textContent,expected));assert.ok(!d.querySelector('p').textContent.includes('View archived'));assert.ok(!d.querySelector('p').textContent.includes('menu'));assert.ok(d.querySelector('p svg'));assert.equal(d.querySelector('input').value,'my search');assert.equal(d.querySelector('input').placeholder,'Konuşmalarda Ara...');assert.equal(d.querySelector('code').textContent,'Restart');}finally{dom.window.close();}
});

test('MCP enabled tool counts remain dynamic and config path tooltip stays short',async()=>{
 const dom=new JSDOM('<body><span>4 tools enabled</span><span>11 tools enabled</span><span>1 tool enabled</span><button title="Copy Config File Path">icon</button><b>data-agent-kit</b></body>',{runScripts:'outside-only'});
 try{dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));await new Promise(r=>dom.window.setTimeout(r,20));const d=dom.window.document;assert.deepEqual([...d.querySelectorAll('span')].map(x=>x.textContent),['4 Araç Etkin','11 Araç Etkin','1 Araç Etkin']);assert.equal(d.querySelector('button').title,'Dosya Yolunu Kopyala');assert.equal(d.querySelector('b').textContent,'data-agent-kit');}finally{dom.window.close();}
});

test('overview section customization and model availability translate without toggling sections',async()=>{
 const pairs=[['Unavailable','Kullanılamıyor'],['Implementation Plan','Uygulama Planı'],['Modified Files','Değiştirilen Dosyalar'],['Customize Sections','Bölümleri Özelleştir'],['Goals','Hedefler'],['Documents','Belgeler'],['Links','Bağlantılar'],['No plugins available','Kullanılabilir Eklenti Yok']];
 const dom=new JSDOM('<body>'+pairs.map(([t])=>'<button aria-checked="true" title="'+t+'">'+t+'</button>').join('')+'<span>Gemini 4 Argon</span><div role="tooltip">Gemini 4 Argon is currently available\nto Ultra plan subscribers.</div><code>Documents</code><div class="markdown">Implementation Plan</div></body>',{runScripts:'outside-only'});
 try{dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));await new Promise(r=>dom.window.setTimeout(r,20));const d=dom.window.document;pairs.forEach(([,expected],i)=>{const b=d.querySelectorAll('button')[i];assert.equal(b.textContent,expected);assert.equal(b.title,expected);assert.equal(b.getAttribute('aria-checked'),'true');});assert.equal(d.querySelector('span').textContent,'Gemini 4 Argon');assert.equal(d.querySelector('[role=tooltip]').textContent,'Gemini 4 Argon şu anda Ultra planı abonelerinin kullanımına açıktır.');assert.equal(d.querySelector('code').textContent,'Documents');assert.equal(d.querySelector('.markdown').textContent,'Implementation Plan');}finally{dom.window.close();}
});

test('feedback categories translate descriptions and placeholders without changing report or log consent',async()=>{
 const labels=require('./feedback-labels.json');const dom=new JSDOM('<body>'+Object.keys(labels).map(s=>'<p>'+s+'</p>').join('')+'<textarea placeholder="Enter your feedback here...">My English report</textarea><input type="checkbox" id="logs"><label>Send feedback as example@example.test</label><a href="https://support.google.com/legal">Legal Help</a></body>',{runScripts:'outside-only'});
 try{dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));await new Promise(r=>dom.window.setTimeout(r,20));const d=dom.window.document;Object.values(labels).forEach((t,i)=>assert.equal(d.querySelectorAll('p')[i].textContent,t));assert.equal(d.querySelector('textarea').value,'My English report');assert.equal(d.querySelector('textarea').placeholder,'Geri Bildiriminizi Buraya Yazın...');assert.equal(d.querySelector('#logs').checked,false);assert.equal(d.querySelector('label').textContent,'example@example.test Hesabıyla Geri Bildirim Gönder');assert.equal(d.querySelector('a').href,'https://support.google.com/legal');}finally{dom.window.close();}
});

test('queued message labels and artifact headings translate without sending queued content',async()=>{
 const pairs=[['Sends after agent finishes working','Ajan İşini Bitirdikten Sonra Gönderilir'],['Empty message','Boş İleti'],['Send Now','Şimdi Gönder'],['Walkthrough','Uygulama Özeti'],['Task','Görev']];
 const dom=new JSDOM('<body>'+pairs.map(([t])=>'<button title="'+t+'">'+t+'</button>').join('')+'<textarea>My queued message</textarea><code>Task</code><div class="markdown">Walkthrough</div></body>',{runScripts:'outside-only'});
 try{const d=dom.window.document;let sent=0;for(const b of d.querySelectorAll('button'))b.onclick=()=>sent++;dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));await new Promise(r=>dom.window.setTimeout(r,20));pairs.forEach(([,expected],i)=>{const b=d.querySelectorAll('button')[i];assert.equal(b.textContent,expected);assert.equal(b.title,expected);});assert.equal(sent,0);assert.equal(d.querySelector('textarea').value,'My queued message');assert.equal(d.querySelector('code').textContent,'Task');assert.equal(d.querySelector('.markdown').textContent,'Walkthrough');}finally{dom.window.close();}
});

test('quota upgrade sentence keeps date separate and translates application version menu',async()=>{
 const original="Your plan's baseline quota will refresh on 23.10.2026 11:19:10. You can upgrade to a Google AI Ultra plan to receive higher rate limits.";
 const dom=new JSDOM('<body><p>'+original+'</p><a>See plans.</a><span>Gemini 4 Argon Weekly Limit</span><button>Version 2.23.1</button><button>Check for Updates</button></body>',{runScripts:'outside-only'});
 try{dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));await new Promise(r=>dom.window.setTimeout(r,20));const d=dom.window.document;assert.equal(d.querySelector('p').textContent,'Planınızın temel kotası 23.10.2026 11:19:10 tarihinde yenilenecek. Daha yüksek kullanım limitleri için Google AI Ultra planına geçebilirsiniz.');assert.equal(d.querySelector('a').textContent,'Planları Görüntüle.');assert.equal(d.querySelector('span').textContent,'Gemini 4 Argon Haftalık Limiti');assert.equal(d.querySelectorAll('button')[0].textContent,'Sürüm 2.23.1');assert.equal(d.querySelectorAll('button')[1].textContent,'Güncellemeleri Denetle');}finally{dom.window.close();}
});

 test('tool statuses follow live updates while commands and messages remain unchanged', async () => {
  const dom = new JSDOM('<body><span id="status">Running command</span><pre>Running command</pre><div class="markdown">Searching</div><div data-message-author-role="user">Generating image</div><input value="Searching"></body>', {runScripts:'outside-only'});
  try {
    dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));
    await new Promise(r=>dom.window.setTimeout(r,20));
    const d=dom.window.document;
    assert.equal(d.querySelector('#status').textContent,'Komut çalıştırılıyor');
    assert.equal(d.querySelector('pre').textContent,'Running command');
    assert.equal(d.querySelector('.markdown').textContent,'Searching');
    assert.equal(d.querySelector('[data-message-author-role]').textContent,'Generating image');
    assert.equal(d.querySelector('input').value,'Searching');
    d.querySelector('#status').textContent='Searching the web for "Antigravity 2.24.0"';
    await new Promise(r=>dom.window.setTimeout(r,20));
    assert.equal(d.querySelector('#status').textContent,'Web’de aranıyor: "Antigravity 2.24.0"');
  } finally {dom.window.close();}
});

test('completed activity summaries translate whole and split labels without changing generated titles', async () => {
  const dom = new JSDOM('<body><span id="summary"></span><span id="commands">Ran commands</span><span id="title">tool-action-labels.js içeriğinin okunması</span><div class="markdown">Explored files, ran commands</div><pre>Ran commands</pre></body>', {runScripts:'outside-only'});
  try {
    const d=dom.window.document;
    for(const text of ['Explored files', ', ', 'ran commands']) d.querySelector('#summary').append(d.createTextNode(text));
    dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));
    await new Promise(r=>dom.window.setTimeout(r,20));
    assert.equal(d.querySelector('#summary').textContent,'Dosyalar İncelendi, Komutlar Çalıştırıldı');
    assert.equal(d.querySelector('#commands').textContent,'Komutlar Çalıştırıldı');
    assert.equal(d.querySelector('#title').textContent,'tool-action-labels.js içeriğinin okunması');
    assert.equal(d.querySelector('.markdown').textContent,'Explored files, ran commands');
    assert.equal(d.querySelector('pre').textContent,'Ran commands');
  } finally {dom.window.close();}
});

test('notification settings labels translate without changing toggle and volume values', async () => {
 const labels=require('./notification-labels.json');
 const dom=new JSDOM('<body><section></section><input type="checkbox" checked><input type="range" min="0" max="100" value="100"><textarea></textarea></body>',{runScripts:'outside-only'});
 try {
  const d=dom.window.document;
  for(const label of Object.keys(labels)){const p=d.createElement('p');p.textContent=label;d.querySelector('section').append(p);}
  d.querySelector('textarea').value='Manage your notification preferences.';
  dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));
  await new Promise(r=>dom.window.setTimeout(r,20));
  assert.deepEqual([...d.querySelectorAll('p')].map(p=>p.textContent),Object.values(labels));
  assert.equal(d.querySelector('[type="checkbox"]').checked,true);
  assert.equal(d.querySelector('[type="range"]').value,'100');
  assert.equal(d.querySelector('textarea').value,'Manage your notification preferences.');
 }finally{dom.window.close();}
});

test('updated marketplace descriptions translate while product names stay unchanged', async () => {
 const labels=['Core tools and knowledge required to develop for Android.','Google Cloud guidance for coding agents: first-project onboarding, authentication and credential selection, and safety-critical validation for gcloud CLI commands. Includes the Google Developer Knowledge MCP server for grounded, up-to-date Google Cloud documentation.'];
 const dom=new JSDOM('<body><h3>Android CLI</h3><h3>Google Cloud Developer</h3><section></section></body>',{runScripts:'outside-only'});
 try{const d=dom.window.document;for(const text of labels){const p=d.createElement('p');p.textContent=text;d.querySelector('section').append(p);}
 dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));
 await new Promise(r=>dom.window.setTimeout(r,20));
 assert.equal(d.querySelector('p').textContent,'Android geliştirmek için gereken temel araçlar ve bilgiler.');
 assert.match(d.querySelectorAll('p')[1].textContent,/^Kodlama ajanları için Google Cloud rehberi:/);
 assert.deepEqual([...d.querySelectorAll('h3')].map(n=>n.textContent),['Android CLI','Google Cloud Developer']);
 }finally{dom.window.close();}
});

test('attachment error labels translate while attached media and typed content stay intact', async () => {
 const dom=new JSDOM('<body><div role="alert"><strong>Invalid Media</strong><p>Maximum number of attachments reached</p><button aria-label="Close">×</button></div><img src="attachment.png"><textarea>Invalid Media</textarea></body>',{runScripts:'outside-only'});
 try{const d=dom.window.document;
 dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));
 await new Promise(r=>dom.window.setTimeout(r,20));
 assert.equal(d.querySelector('strong').textContent,'Geçersiz Medya');
 assert.equal(d.querySelector('p').textContent,'En fazla ek sayısına ulaşıldı');
 assert.equal(d.querySelector('img').getAttribute('src'),'attachment.png');
 assert.equal(d.querySelector('textarea').value,'Invalid Media');
 assert.equal(d.querySelector('button').textContent,'×');
 }finally{dom.window.close();}
});

test('conversation permission labels and linked fragments translate without changing permissions', async () => {
 const labels={"Permission Settings":"İzin Ayarları","Permission Preset":"İzin Ön Ayarı","Give Feedback":"Geri Bildirimde Bulun","Auto (Preview)":"Otomatik (Önizleme)","Automatically decide if commands run.":"Komutların çalıştırılıp çalıştırılmayacağına otomatik karar verir.","Inherits your Global Permissions when working in these conversations.":"Bu konuşmalarda çalışırken genel izinlerinizi kullanır.","when working in these conversations.":"bu konuşmalarda çalışırken de geçerlidir.","No MCP servers yet. Use Add to browse the store.":"Henüz MCP sunucusu yok. Mağazaya göz atmak için Ekle düğmesini kullanın.","Also includes Global Permissions when working in these conversations. Learn more.":"Bu konuşmalarda çalışırken Genel İzinler de geçerlidir. Daha fazla bilgi edinin."};
 const dom=new JSDOM('<body><section></section><p id="linked">Also includes <a href="/permissions">Global Permissions</a> when working in these conversations. <a href="/help">Learn more.</a></p><select><option value="turbo" selected>Turbo</option><option value="auto">Auto (Preview)</option></select><div data-message-author-role="user">Give Feedback</div></body>',{runScripts:'outside-only'});
 try{const d=dom.window.document;for(const text of Object.keys(labels)){const p=d.createElement('p');p.textContent=text;d.querySelector('section').append(p);}
 dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));
 await new Promise(r=>dom.window.setTimeout(r,20));
 assert.deepEqual([...d.querySelectorAll('section p')].map(n=>n.textContent),Object.values(labels));
 assert.doesNotMatch(d.querySelector('#linked').textContent,/when working|Also includes|Global Permissions/);
 assert.equal(d.querySelector('#linked a').getAttribute('href'),'/permissions');
 assert.equal(d.querySelector('select').value,'turbo');
 assert.equal(d.querySelector('[data-message-author-role]').textContent,'Give Feedback');
 }finally{dom.window.close();}
});

test('permission suffix translates with punctuation in a separate React node', async () => {
 const dom=new JSDOM('<body><p>Also includes <a href="/permissions">Global Permissions</a><span id="suffix"></span> <a href="/help">Learn more.</a></p></body>',{runScripts:'outside-only'});
 try{const d=dom.window.document;for(const text of [' when working in these conversations','.'])d.querySelector('#suffix').append(d.createTextNode(text));
 dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));
 await new Promise(r=>dom.window.setTimeout(r,20));
 assert.equal(d.querySelector('#suffix').textContent,' bu konuşmalarda çalışırken de geçerlidir.');
 assert.equal(d.querySelector('a').getAttribute('href'),'/permissions');
 }finally{dom.window.close();}
});

test('permission sentence split into adjacent React nodes around inline links translates', async () => {
 const dom=new JSDOM('<body><p id="row">Also includes <span id="link">Global Permissions</span></p></body>',{runScripts:'outside-only'});
 try{const d=dom.window.document,row=d.querySelector('#row');for(const text of [' ','when working ','in these conversations','. '])row.append(d.createTextNode(text));const a=d.createElement('a');a.href='/permissions';a.textContent='Learn more';row.append(a);
 dom.window.eval(transformDesktopSources(fixture()).get('dist/preload.js'));
 await new Promise(r=>dom.window.setTimeout(r,20));
 assert.doesNotMatch(row.textContent,/when working|in these conversations/);
 assert.match(row.textContent,/bu konuşmalarda çalışırken de geçerlidir/);
 assert.equal(d.querySelector('a').getAttribute('href'),'/permissions');
 assert.equal(d.querySelector('#link').textContent,'Genel İzinler');
 }finally{dom.window.close();}
});
