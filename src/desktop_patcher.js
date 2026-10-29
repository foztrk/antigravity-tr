/** Antigravity Desktop Turkish patch. Existing dictionaries are preserved. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { translateDynamic } = require('./desktop_dynamic');
const { rewriteArchive, restoreArchive } = require('./desktop_archive');

function transformDesktopSources(input) {
  const sources = new Map(input);
  const fileName = name => 'dist/' + name;
  const updaterPath = fileName('updater.js');
  if (sources.has(updaterPath)) {
    sources.set(updaterPath, sources.get(updaterPath)
      .replace(/'Check for Updates'/g, "'Güncellemeleri Denetle'")
      .replace(/'No updates available'/g, "'Yeni güncelleme yok'"));
  }
  const notificationPath = fileName('ipcHandlers.js');
  if (sources.has(notificationPath)) {
    sources.set(notificationPath, sources.get(notificationPath)
      .replace('title: options.title,', "title: options.title === 'Action requires your attention' ? 'İşlem için müdahaleniz gerekiyor' : options.title,")
      .replace('body: options.body,', "body: options.body === 'The agent is waiting for your input.' ? 'Ajan sizden giriş bekliyor.' : options.body,"));
  }
  // 3. loadingOverlay.js Yamalama
  const loadingPath = fileName('loadingOverlay.js');
  if (sources.has(loadingPath)) {
    let c = sources.get(loadingPath);
    c = c.replace('Loading Antigravity', 'Antigravity Yükleniyor...');
    sources.set(loadingPath, c);
  }

  // 4. provisionSplash.js Yamalama
  const splashPath = fileName('provisionSplash.js');
  if (sources.has(splashPath)) {
    let c = sources.get(splashPath);
    c = c.replace('Setting up WSL:', 'WSL Yapılandırılıyor:');
    sources.set(splashPath, c);
  }

  // 5. tray.js ve main.js Yamalama
  const trayPath = fileName('tray.js');
  if (sources.has(trayPath)) {
    let c = sources.get(trayPath);
    c = c.replace('No agents running', 'Çalışan ajan yok').replace('Quit', 'Çıkış');
    c = c.replace(
      "(count > 0 ? `${count}` : 'No') +\n                    ' agent' +\n                    (count === 1 ? '' : 's') +\n                    ' running'",
      "(count > 0 ? `${count} ajan çalışıyor` : 'Çalışan ajan yok')"
    );
    sources.set(trayPath, c);
  }

  const mainPath = fileName('main.js');
  if (sources.has(mainPath)) {
    let c = sources.get(mainPath);
    c = c.replace("'No agents running'", "'Çalışan ajan yok'")
         .replace(/'Quit'/g, "'Çıkış'")
         .replace(/'New Window'/g, "'Yeni Pencere'")
         .replace('`Open ${electron_1.app.getName()}`', '`Antigravity’yi Aç`');
    sources.set(mainPath, c);
  }

  // 6. menu.js Yamalama
  const menuPath = fileName('menu.js');
  if (sources.has(menuPath)) {
    let c = sources.get(menuPath);
    if (c.trimStart().startsWith('function menuToTemplate(menu)')) {
      const originalStart = c.indexOf('"use strict";');
      if (originalStart < 0 || !c.slice(0, originalStart).includes('function rebuildLocalizedMenu(menu)')) {
        throw new Error('Eski menü yamasının sınırları doğrulanamadı.');
      }
      c = c.slice(originalStart);
    }

    c = c.replace(/'New Window'/g, "'Yeni Pencere'")
         .replace(/'Connect to WSL'/g, "'WSL\\'ye Bağlan'")
         .replace(/'Reopen Locally'/g, "'Yerel Olarak Yeniden Aç'")
         .replace(/'Docs'/g, "'Belgeler'")
         .replace(/'Check for Updates'/g, "'Güncellemeleri Denetle'");

    const rebuildCode = `
function menuToTemplate(menu) {
  if (!menu || !menu.items) return [];
  const menuMap = {
    'File': 'Dosya', 'Edit': 'Düzenle', 'View': 'Görünüm', 'Window': 'Pencere', 'Help': 'Yardım',
    'Undo': 'Geri Al', 'Redo': 'Yinele', 'Cut': 'Kes', 'Copy': 'Kopyala', 'Paste': 'Yapıştır',
    'Select All': 'Tümünü Seç', 'Reload': 'Yeniden Yükle', 'Force Reload': 'Zorla Yeniden Yükle',
    'Toggle Full Screen': 'Tam Ekranı Aç/Kapat', 'Actual Size': 'Gerçek Boyut',
    'Zoom In': 'Yakınlaştır', 'Zoom Out': 'Uzaklaştır', 'Minimize': 'Simge Durumuna Küçült',
    'Zoom': 'Büyüt', 'Close': 'Kapat',
    'New Conversation': 'Yeni Konuşma', 'Create Project': 'Proje Oluştur',
    'Command Palette': 'Komut Paleti', 'New Window': 'Yeni Pencere',
    'Quit': 'Çıkış', 'Docs': 'Belgeler', 'Check for Updates': 'Güncellemeleri Denetle',
    'Connect to WSL': "WSL'ye Bağlan", 'Reopen Locally': 'Yerel Olarak Yeniden Aç',
    'Split': 'Böl', 'Archive': 'Arşivle', 'Rename': 'Yeniden Adlandır',
    'Remote Control': 'Uzaktan Kontrol', 'Terminal': 'Terminal'
  };

  return menu.items.map(item => {
    const label = menuMap[item.label] || item.label;
    const opts = {
      label: label,
      type: item.type,
      role: item.role,
      accelerator: item.accelerator,
      click: item.click,
      enabled: item.enabled,
      visible: item.visible,
      checked: item.checked,
      id: item.id
    };
    if (item.submenu) {
      opts.submenu = menuToTemplate(item.submenu);
    }
    return opts;
  });
}

function rebuildLocalizedMenu(menu) {
  if (!menu) return menu;
  try {
    const template = menuToTemplate(menu);
    return electron_1.Menu.buildFromTemplate(template);
  } catch (e) {
    return menu;
  }
}
`;

    c = rebuildCode + '\n' + c;

    c = c.replace(
      'const submenuItem = appMenu.items.find((item) => item.label === submenuLabel);',
      "const submenuItem = appMenu.items.find((item) => item.label === submenuLabel || item.label === ({'File':'Dosya','Help':'Yardım','View':'Görünüm','Window':'Pencere','Edit':'Düzenle'}[submenuLabel] || submenuLabel));"
    );

    c = c.replace(
      /electron_1\.Menu\.setApplicationMenu\(menu\);/g,
      'electron_1.Menu.setApplicationMenu(rebuildLocalizedMenu(menu));'
    );

    sources.set(menuPath, c);
  }

  const ipcPath = fileName('ipcHandlers.js');
  if (sources.has(ipcPath)) {
    let content = sources.get(ipcPath);
    content = content.replace(/\n    \/\/ ANTIGRAVITY_TR_NATIVE_CONTEXT\n    const labels = [^\n]+;\n    items = items\.map\(item => \([^\n]*?\}\)\);/, '');
    if (!content.includes('// ANTIGRAVITY_TR_NATIVE_CONTEXT')) {
      const anchor = 'function buildContextMenuTemplate(items, onSelect) {';
      if (!content.includes(anchor)) throw new Error('Yerel sağ tık menüsü yapısı doğrulanamadı.');
      const labels = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'desktop_full_dictionary.json'), 'utf8'));
      content = content.replace(anchor, anchor + '\n    // ANTIGRAVITY_TR_NATIVE_CONTEXT\n    const labels = ' + JSON.stringify(labels) + ';\n    items = items.map(item => ({ ...item, label: Object.prototype.hasOwnProperty.call(labels, item.label) ? labels[item.label] : item.label }));');
    }
    sources.set(ipcPath, content);
  }

  // 7. preload.js Yamalama
  const preloadPath = fileName('preload.js');
  if (sources.has(preloadPath)) {
    const dictFile = path.join(__dirname, '..', 'scripts', 'desktop_full_dictionary.json');
    let dictionary = {};
    if (fs.existsSync(dictFile)) {
      dictionary = JSON.parse(fs.readFileSync(dictFile, 'utf8'));
    }

    Object.assign(dictionary, {
      "File": "Dosya",
      "View": "Görünüm",
      "Window": "Pencere",
      "Help": "Yardım",
      "Open IDE": "IDE'yi Aç",
      "Open Antigravity IDE": "Antigravity IDE'yi Aç",
      "Create Project": "Proje Oluştur",
      "Command Palette": "Komut Paleti",
      "Rename": "Yeniden Adlandır",
      "Unpin": "Sabitlemeyi Kaldır",
      "Archive": "Arşivle",
      "Remote Control": "Uzaktan Kontrol",
      "Split": "Böl",
      "Terminal": "Terminal",
      "Model": "Model",
      "Fast": "Hızlı",
      "Medium": "Orta",
      "Low": "Düşük",
      "High": "Yüksek",
      "View Usage": "Kullanımı Görüntüle",
      "View plans": "Planları Görüntüle",
      "This account is ineligible for higher rate limits through a Google AI plan at this time.": "Bu hesap şu anda bir Google AI planı aracılığıyla daha yüksek istek limitleri için uygun değildir."
    });

    let preloadContent = sources.get(preloadPath);

    const translatorScript = `
// ═══════════════════════════════════════════════════════════════════
// ANTIGRAVITY DESKTOP TÜRKÇE CANLI ARAYÜZ ÇEVİRMENİ (V2)
// ═══════════════════════════════════════════════════════════════════
(function() {
  const dictionary = ${JSON.stringify(dictionary, null, 2)};
  const translateDynamic = ${translateDynamic.toString()};

  function translateTextNode(node) {
    if (!node || node.nodeType !== 3) return;
    const parent = node.parentElement;
    if (!parent) return;
    const tag = parent.tagName ? parent.tagName.toLowerCase() : '';
    if (tag === 'script' || tag === 'style' || tag === 'pre' || tag === 'code') return;
    if (parent.isContentEditable) return;
    if (parent.closest && parent.closest('script,style,pre,code,textarea,input,.monaco-editor,[data-antigravity-tr-ignore]')) return;
    if (parent.closest && parent.closest('.markdown,[data-message-author-role]') && !parent.closest('[role=tooltip]')) return;

    const val = node.nodeValue;
    if (!val) return;
    const trimmed = val.trim();
    if (!trimmed) return;
    if (parent.matches('span[data-screenshot-volatile="true"].min-w-4') && parent.closest('.select-none.cursor-pointer')) {
      const timestamp = /^(\\d+)(mo|d|h|m|s)$/.exec(trimmed);
      if (timestamp) {
        node.nodeValue = val.replace(trimmed, timestamp[1] + ' ' + ({mo:'ay',d:'gün',h:'sa',m:'dk',s:'sn'}[timestamp[2]]));
        return;
      }
    }

    const normalized = trimmed.replace(/\\s+/g, ' ');
    const translated = Object.prototype.hasOwnProperty.call(dictionary, trimmed) ? dictionary[trimmed] :
      Object.prototype.hasOwnProperty.call(dictionary, normalized) ? dictionary[normalized] : translateDynamic(normalized);
    if (translated === trimmed) {
      // React splits sentences around inline links and dynamic scope names.
      let first = node;
      while (first.previousSibling && first.previousSibling.nodeType === 3) first = first.previousSibling;
      const parts = [];
      for (let part = first; part && part.nodeType === 3; part = part.nextSibling) parts.push(part);
      if (parts.length > 1) {
        const raw = parts.map(part => part.nodeValue).join('');
        const combined = raw.trim().replace(/\\s+/g, ' ');
        const combinedTranslation = Object.prototype.hasOwnProperty.call(dictionary, combined) ? dictionary[combined] : translateDynamic(combined);
        if (combinedTranslation !== combined) {
          first.nodeValue = raw.replace(raw.trim(), combinedTranslation);
          for (let i = 1; i < parts.length; i++) parts[i].nodeValue = '';
          return;
        }
      }
    }
    if (['Enter Queues after the turn', 'Alt+Enter Sends immediately', 'Alt+Enter On empty prompt, sends next in queue', 'Queues after the turn', 'Sends immediately', 'On empty prompt, sends next in queue'].includes(trimmed)) {
      parent.style.whiteSpace = 'normal';
      parent.style.overflowWrap = 'anywhere';
      parent.style.minWidth = '0';
    }
    if (translated !== trimmed) {
      node.nodeValue = val.replace(trimmed, translated);
    }
  }

  function translateAttributes(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.placeholder && Object.prototype.hasOwnProperty.call(dictionary, el.placeholder.trim()) && dictionary[el.placeholder.trim()] !== el.placeholder) {
      el.placeholder = dictionary[el.placeholder.trim()];
    }
    if (el.title && Object.prototype.hasOwnProperty.call(dictionary, el.title.trim()) && dictionary[el.title.trim()] !== el.title) {
      el.title = dictionary[el.title.trim()];
    } else if (el.title && /^\\d+ questions?$/.test(el.title.trim())) {
      el.title = translateDynamic(el.title.trim());
    }
    const aria = el.getAttribute('aria-label');
    if (aria && Object.prototype.hasOwnProperty.call(dictionary, aria.trim()) && dictionary[aria.trim()] !== aria) {
      el.setAttribute('aria-label', dictionary[aria.trim()]);
    }
  }

  function translateTree(root) {
    if (!root) return;
    // The consent sentence can be split across inline elements before its policy links.
    if (root.querySelectorAll) {
      const candidates = Array.from(root.querySelectorAll('label,div,p,span')).reverse();
      for (const el of candidates) {
        if (el.closest('.markdown,[data-message-author-role],[data-antigravity-tr-ignore]')) continue;
        const link = el.querySelector('a');
        if (!link || !/^Yes, I agree to help improve Antigravity/.test(el.textContent.trim())) continue;
        const range = document.createRange();
        range.selectNodeContents(el);
        range.setEndBefore(link);
        const prefix = range.toString().replace(/\\s+/g, ' ').trim();
        if (!prefix.includes('Interactions data, subject to the')) continue;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const beforeLink = [];
        let part;
        while ((part = walker.nextNode())) {
          if (link.contains(part)) break;
          if (!part.parentElement.closest('button,input,a')) beforeLink.push(part);
        }
        if (beforeLink.length) {
          beforeLink[0].nodeValue = 'Evet, Google Antigravity Hizmet Şartları ve Google Gizlilik Politikası kapsamında Google’ın etkileşim verilerimi toplamasına ve kullanmasına izin vererek Antigravity’nin geliştirilmesine katkıda bulunmayı kabul ediyorum. İlgili koşullar: ';
          for (let i = 1; i < beforeLink.length; i++) beforeLink[i].nodeValue = '';
        }
      }
    }
    if (root.nodeType === 3) {
      translateTextNode(root);
      return;
    }
    if (root.nodeType === 1) {
      translateAttributes(root);
    }

    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
      let n;
      while ((n = walker.nextNode())) {
        translateTextNode(n);
      }
    } catch (e) {}

    if (root.querySelectorAll) {
      try {
        const els = root.querySelectorAll('[placeholder],[title],[aria-label]');
        for (let i = 0; i < els.length; i++) {
          translateAttributes(els[i]);
        }
      } catch (e) {}
    }
  }

  function initTranslator() {
    if (document.body) {
      translateTree(document.body);
    }

    const options = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] };
    const observedRoot = document.documentElement || document.body;
    if (!observedRoot) return;
    const observer = new MutationObserver((mutations) => {
      observer.disconnect();
      try {
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type === 'childList') {
          for (let j = 0; j < m.addedNodes.length; j++) {
            translateTree(m.addedNodes[j]);
          }
        } else if (m.type === 'characterData') {
          translateTextNode(m.target);
        } else if (m.type === 'attributes') {
          translateAttributes(m.target);
        }
      }
      } finally { observer.observe(observedRoot, options); }
    });
    observer.observe(observedRoot, options);
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTranslator);
  } else {
    initTranslator();
  }
})();
`;

    const marker = 'ANTIGRAVITY DESKTOP TÜRKÇE CANLI ARAYÜZ ÇEVİRMENİ';
    const markerIndex = preloadContent.indexOf(marker);
    if (markerIndex >= 0) {
      const start = preloadContent.lastIndexOf('// ═', markerIndex);
      const end = preloadContent.indexOf('\n})();', markerIndex);
      if (start < 0 || end < 0 || preloadContent.slice(end + 6).trim()) {
        throw new Error('Eski çeviri katmanının sınırları doğrulanamadı.');
      }
      preloadContent = preloadContent.slice(0, start).trimEnd();
    }

    preloadContent = preloadContent.trimEnd() + '\n' + translatorScript;
    sources.set(preloadPath, preloadContent);
  }

  for (const [name, source] of sources) new vm.Script(source, { filename: name });
  return sources;
}

async function patchDesktopApp(paths) {
  try {
    const asar = await import('@electron/asar');
    const archive = path.join(paths.desktop.appPath, 'resources', 'app.asar');
    asar.uncacheAll();
    const version = JSON.parse(asar.extractFile(archive, 'package.json').toString()).version;
    if (!['2.17.0', '2.18.1', '2.19.1', '2.21.1', '2.22.0', '2.23.0', '2.23.1', '2.24.0', '2.25.0', '2.26.0', '2.27.0', '2.28.0'].includes(version)) throw new Error(`Desktop ${version} henüz doğrulanmadı; desteklenen sürümler: 2.17.0, 2.18.1, 2.19.1, 2.21.1, 2.22.0, 2.23.0, 2.23.1, 2.24.0, 2.25.0, 2.26.0, 2.27.0, 2.28.0.`);
    const names = ['loadingOverlay.js', 'provisionSplash.js', 'tray.js', 'menu.js', 'preload.js', 'main.js', 'ipcHandlers.js', 'updater.js'];
    const sources = new Map();
    for (const name of names) {
      const key = 'dist/' + name;
      sources.set(key, asar.extractFile(archive, path.normalize(key)).toString('utf8'));
    }
    const next = transformDesktopSources(sources);
    const changes = new Map([...next].filter(([name, value]) => value !== sources.get(name)).map(([name, value]) => [name, Buffer.from(value)]));
    if (!changes.size) return { success: true, changedFiles: [], message: 'Yama zaten güncel.' };
    return await rewriteArchive(archive, changes);
  } catch (error) {
    return { success: false, reason: error.message };
  }
}

async function restoreDesktopApp(paths, selectedBackup) {
  const archive = path.join(paths.desktop.appPath, 'resources', 'app.asar');
  const backup = selectedBackup || (fs.existsSync(archive + '.bak') ? archive + '.bak' :
    fs.readdirSync(path.dirname(archive)).filter(n => /^app\.asar\.backup-\d+-[a-f0-9]+$/.test(n)).sort().map(n => path.join(path.dirname(archive), n))[0]);
  if (!backup) return { restored: false, reason: 'Yedek bulunamadı.' };
  try { return await restoreArchive(archive, path.resolve(backup)); }
  catch (error) { return { restored: false, reason: error.message }; }
}

module.exports = { patchDesktopApp, restoreDesktopApp, transformDesktopSources };
