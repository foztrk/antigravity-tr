const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Dosya için .bak yedeği alır (eğer daha önce alınmamışsa).
 */
function ensureBackup(filePath) {
  const bakPath = filePath + '.bak';
  if (!fs.existsSync(bakPath)) {
    fs.copyFileSync(filePath, bakPath);
    return { created: true, path: bakPath };
  }
  return { created: false, path: bakPath };
}

/**
 * Dosyayı .bak yedeğinden geri yükler.
 */
function restoreFile(filePath) {
  const bakPath = filePath + '.bak';
  if (fs.existsSync(bakPath)) {
    fs.copyFileSync(bakPath, filePath);
    return { restored: true, path: filePath };
  }
  return { restored: false, reason: 'Yedek dosyası bulunamadı (.bak)' };
}

/**
 * VS Code standart SHA256 base64 checksum formatını hesaplar.
 */
function computeChecksum(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('base64').replace(/=+$/, '');
}

/**
 * product.json dosyasındaki checksums alanını günceller.
 * Bu sayede VS Code 'yüklemeniz bozuk gibi görünüyor' uyarısı vermez.
 */
function updateProductChecksums(paths) {
  if (!paths.ide || !paths.ide.productFile || !fs.existsSync(paths.ide.productFile)) {
    return { success: false, reason: 'product.json bulunamadı.' };
  }

  ensureBackup(paths.ide.productFile);

  const prod = JSON.parse(fs.readFileSync(paths.ide.productFile, 'utf8'));
  if (!prod.checksums) {
    return { success: true, message: 'checksums alanı bulunamadı.' };
  }

  const baseOut = path.join(paths.ide.appPath, 'resources', 'app', 'out');
  let updatedCount = 0;

  for (const relPath of Object.keys(prod.checksums)) {
    const fullPath = path.join(baseOut, relPath);
    if (fs.existsSync(fullPath)) {
      const actualChecksum = computeChecksum(fullPath);
      if (actualChecksum && prod.checksums[relPath] !== actualChecksum) {
        prod.checksums[relPath] = actualChecksum;
        updatedCount++;
      }
    }
  }

  if (updatedCount > 0) {
    fs.writeFileSync(paths.ide.productFile, JSON.stringify(prod, null, '\t') + '\n', 'utf8');
    return { success: true, updated: true, count: updatedCount };
  }

  return { success: true, updated: false, count: 0 };
}

/**
 * Hedef bundle dosyasına kural listesini uygular.
 */
function patchFile(filePath, rules) {
  if (!fs.existsSync(filePath)) {
    return { success: false, reason: `Dosya bulunamadı: ${filePath}` };
  }

  // 1. Orijinal yedeği al
  const backupResult = ensureBackup(filePath);

  // 2. Dosya içeriğini oku (temiz yedekten başla)
  const bakPath = filePath + '.bak';
  let content = fs.existsSync(bakPath) ? fs.readFileSync(bakPath, 'utf8') : fs.readFileSync(filePath, 'utf8');
  let matchCount = 0;

  for (const rule of rules) {
    const { search, replace } = rule;
    if (content.includes(search)) {
      // Güvenli global değiştirme
      const parts = content.split(search);
      const occurrences = parts.length - 1;
      matchCount += occurrences;
      content = parts.join(replace);
    }
  }

  // 3. Değişiklik varsa dosyaya yaz
  if (matchCount > 0) {
    fs.writeFileSync(filePath, content, 'utf8');
    return {
      success: true,
      modified: true,
      matches: matchCount,
      backupCreated: backupResult.created
    };
  }

  return {
    success: true,
    modified: false,
    matches: 0,
    backupCreated: backupResult.created,
    message: 'Yamalanacak dize bulunamadı veya dosya zaten yamalı.'
  };
}

/**
 * nls.messages.json dosyasını hem nls.keys.json + main.i18n.json ile hem de özel kurallarla güvenli biçimde günceller.
 */
function patchNlsFile(filePath, nlsRules, options = {}) {
  if (!fs.existsSync(filePath)) {
    return { success: false, reason: `Dosya bulunamadı: ${filePath}` };
  }

  const backupResult = ensureBackup(filePath);
  const bakPath = filePath + '.bak';
  const msgs = JSON.parse(fs.existsSync(bakPath) ? fs.readFileSync(bakPath, 'utf8') : fs.readFileSync(filePath, 'utf8'));
  const origMsgs = msgs.slice();
  let matchCount = 0;

  let flatKeys = null;
  if (options.nlsKeysFile && fs.existsSync(options.nlsKeysFile)) {
    try {
      const rawKeys = JSON.parse(fs.readFileSync(options.nlsKeysFile, 'utf8'));
      flatKeys = [];
      for (const [mod, kList] of rawKeys) {
        for (const k of kList) {
          flatKeys.push({ mod, key: k });
        }
      }
    } catch (e) {}
  }

  if (flatKeys && flatKeys.length === msgs.length && options.mainI18nFile && fs.existsSync(options.mainI18nFile)) {
    try {
      const i18nData = JSON.parse(fs.readFileSync(options.mainI18nFile, 'utf8'));
      const contents = i18nData?.contents || {};
      for (let i = 0; i < flatKeys.length; i++) {
        const { mod, key } = flatKeys[i];
        const trVal = contents[mod]?.[key];
        if (typeof trVal === 'string' && trVal.length > 0 && msgs[i] !== trVal) {
          msgs[i] = trVal;
          matchCount++;
        }
      }
    } catch (e) {}
  }

  const keyToIndices = new Map();
  if (flatKeys && flatKeys.length === msgs.length) {
    for (let i = 0; i < flatKeys.length; i++) {
      const mk = `${flatKeys[i].mod}#${flatKeys[i].key}`;
      if (!keyToIndices.has(mk)) keyToIndices.set(mk, []);
      keyToIndices.get(mk).push(i);
    }
  }

  let enSourceMsgs = origMsgs;
  if (options.enNlsFile && fs.existsSync(options.enNlsFile)) {
    try {
      const enBak = options.enNlsFile + '.bak';
      const srcPath = fs.existsSync(enBak) ? enBak : options.enNlsFile;
      const parsed = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
      if (Array.isArray(parsed) && parsed.length === msgs.length) {
        enSourceMsgs = parsed;
      }
    } catch (e) {}
  }

  for (const rule of nlsRules) {
    const { index, mod, key, search, replace } = rule;
    let applied = false;

    if (mod && key && keyToIndices.size > 0) {
      const indices = keyToIndices.get(`${mod}#${key}`);
      if (indices && indices.length > 0) {
        for (const idx of indices) {
          if (!search || enSourceMsgs[idx] === search || origMsgs[idx] === search || indices.length === 1) {
            if (msgs[idx] !== replace) {
              msgs[idx] = replace;
              matchCount++;
            }
            applied = true;
          }
        }
      }
    }

    if (!applied && search) {
      if (typeof index === 'number' && index >= 0 && index < msgs.length && (enSourceMsgs[index] === search || origMsgs[index] === search)) {
        if (msgs[index] !== replace) {
          msgs[index] = replace;
          matchCount++;
        }
        applied = true;
      } else {
        for (let i = 0; i < msgs.length; i++) {
          if (enSourceMsgs[i] === search || origMsgs[i] === search) {
            if (msgs[i] !== replace) {
              msgs[i] = replace;
              matchCount++;
            }
            applied = true;
          }
        }
      }
    }

    if (!applied && !mod && !search && typeof index === 'number' && index >= 0 && index < msgs.length) {
      if (msgs[index] !== replace) {
        msgs[index] = replace;
        matchCount++;
      }
    }
  }

  if (matchCount > 0) {
    fs.writeFileSync(filePath, JSON.stringify(msgs), 'utf8');
    return {
      success: true,
      modified: true,
      matches: matchCount,
      backupCreated: backupResult.created
    };
  }

  return {
    success: true,
    modified: false,
    matches: 0,
    backupCreated: backupResult.created,
    message: 'nls.messages zaten güncel.'
  };
}

/**
 * Kullanıcı profilindeki önbelleğe alınmış dil paketi (CLP) dosyalarını bulur.
 */
function findClpNlsFiles(configPath) {
  if (!configPath) return [];
  const clpDir = path.join(configPath, 'clp');
  if (!fs.existsSync(clpDir)) return [];
  const results = [];
  function walk(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.isFile() && e.name === 'nls.messages.json') {
          results.push(full);
        }
      }
    } catch (err) {}
  }
  walk(clpDir);
  return results;
}

/**
 * Tüm Antigravity bundle dosyalarını yamalar ve checksums doğrulamalarını günceller.
 */
function applyAllPatches(paths, dictionary) {
  const results = [];

  // 1. jetskiAgent yaması
  if (paths.ide && paths.ide.jetskiFile && dictionary.rules.jetskiAgent) {
    const res = patchFile(paths.ide.jetskiFile, dictionary.rules.jetskiAgent);
    results.push({ target: 'jetskiAgent (Sohbet & AI Arayüzü)', file: paths.ide.jetskiFile, ...res });
  }

  // 2. workbench yaması
  if (paths.ide && paths.ide.workbenchFile && dictionary.rules.workbench) {
    const res = patchFile(paths.ide.workbenchFile, dictionary.rules.workbench);
    results.push({ target: 'workbench (Editör Arayüzü)', file: paths.ide.workbenchFile, ...res });
  }

  // 2b. main.js (Electron ana işlem ve ortak bileşenler) yaması
  if (paths.ide && paths.ide.mainFile && (dictionary.rules.main || dictionary.rules.jetskiAgent || dictionary.rules.workbench)) {
    const mainRules = [
      ...(dictionary.rules.main || []),
      ...(dictionary.rules.jetskiAgent || []),
      ...(dictionary.rules.workbench || [])
    ];
    const res = patchFile(paths.ide.mainFile, mainRules);
    patchMainWebFrameTranslator(paths.ide.mainFile);
    results.push({ target: 'main (Ana İşlem & Güncelleme Arayüzü)', file: paths.ide.mainFile, ...res });
  }

  const mainI18nFile = paths.ide?.extensionsDir
    ? path.join(paths.ide.extensionsDir, 'ms-ceintl.vscode-language-pack-tr-1.106.0-universal', 'translations', 'main.i18n.json')
    : null;
  const nlsOptions = {
    nlsKeysFile: paths.ide?.nlsKeysFile,
    mainI18nFile,
    enNlsFile: paths.ide?.nlsFile
  };

  // 3. nls.messages.json yaması (Hızlı Aç vb.)
  if (paths.ide && paths.ide.nlsFile && dictionary.rules.nlsMessages) {
    const res = patchNlsFile(paths.ide.nlsFile, dictionary.rules.nlsMessages, nlsOptions);
    results.push({ target: 'nls.messages (Quick Open vb.)', file: paths.ide.nlsFile, ...res });
  }

  // 3b. Cached Language Pack (CLP) nls.messages yaması (Çalışma Zamanı Menüleri)
  if (dictionary.rules.nlsMessages) {
    const clpFiles = [
      ...findClpNlsFiles(paths.ide?.userConfigPath),
      ...findClpNlsFiles(paths.desktop?.userConfigPath)
    ];
    for (const cf of clpFiles) {
      const res = patchNlsFile(cf, dictionary.rules.nlsMessages, nlsOptions);
      results.push({ target: `nls önbelleği (${path.basename(path.dirname(cf))})`, file: cf, ...res });
    }
  }

  // 4. product.json checksums güncellemesi (Bozuk Yükleme Uyarısını Önler)
  const checksumRes = updateProductChecksums(paths);
  results.push({ target: 'product.json Checksums Doğrulaması', ...checksumRes });

  return results;
}

function buildGuardedDesktopTranslator() {
  try {
    const { transformDesktopSources } = require('./desktop_patcher');
    const raw = transformDesktopSources(new Map([['dist/preload.js', '']])).get('dist/preload.js');
    return `(function(){if(window.__antigravityTrLoaded)return;window.__antigravityTrLoaded=true;\n${raw}\n})();`;
  } catch (e) {
    return '';
  }
}

function patchMainWebFrameTranslator(mainFilePath) {
  if (!mainFilePath || !fs.existsSync(mainFilePath)) return false;
  try {
    ensureBackup(mainFilePath);
    let content = fs.readFileSync(mainFilePath, 'utf8');
    if (content.includes('__agyMainTrScript')) return true;
    const trScript = buildGuardedDesktopTranslator();
    if (!trScript) return false;
    const importAnchor = 'import{app as FD,protocol as ROa,session as $P,systemPreferences as SOa}from"electron";';
    const hookAnchor = 'FD.on("web-contents-created",(r,i)=>{';
    if (!content.includes(importAnchor) || !content.includes(hookAnchor)) return false;
    content = content.replace(
      importAnchor,
      'import{app as FD,protocol as ROa,session as $P,systemPreferences as SOa,webFrameMain as _agWfm}from"electron";const __agyMainTrScript=' + JSON.stringify(trScript) + ';'
    );
    content = content.replace(
      hookAnchor,
      hookAnchor + 'try{const _inj=f=>{try{if(f&&typeof f.url==="string"&&/^https?:\\/\\/(127\\.0\\.0\\.1|localhost):\\d+\\b/.test(f.url))f.executeJavaScript(__agyMainTrScript).catch(()=>{})}catch{}};i.on("did-frame-finish-load",(_e,_m,p,k)=>{try{_inj(_agWfm.fromId(p,k))}catch{}});i.on("dom-ready",()=>{try{for(const f of i.mainFrame?.framesInSubtree||[])_inj(f)}catch{}})}catch{};'
    );
    fs.writeFileSync(mainFilePath, content, 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Tüm Antigravity bundle dosyalarını ve product.json dosyasını geri yükler.
 */
function restoreAllPatches(paths) {
  const results = [];

  if (paths.ide && paths.ide.jetskiFile) {
    const res = restoreFile(paths.ide.jetskiFile);
    results.push({ target: 'jetskiAgent', file: paths.ide.jetskiFile, ...res });
  }

  if (paths.ide && paths.ide.workbenchFile) {
    const res = restoreFile(paths.ide.workbenchFile);
    results.push({ target: 'workbench', file: paths.ide.workbenchFile, ...res });
  }

  if (paths.ide && paths.ide.mainFile) {
    const res = restoreFile(paths.ide.mainFile);
    results.push({ target: 'main', file: paths.ide.mainFile, ...res });
  }

  if (paths.ide && paths.ide.nlsFile) {
    const res = restoreFile(paths.ide.nlsFile);
    results.push({ target: 'nls.messages', file: paths.ide.nlsFile, ...res });
  }

  if (paths.ide && paths.ide.appPath) {
    const extRelFiles = [
      path.join('resources', 'app', 'extensions', 'agy', 'package.json'),
      path.join('resources', 'app', 'extensions', 'agy', 'vscode', 'extension.js'),
      path.join('resources', 'app', 'extensions', 'agy', 'dist', 'extension.js'),
      path.join('resources', 'app', 'extensions', 'agy', 'loading_bridge.js'),
      path.join('resources', 'app', 'extensions', 'antigravity', 'package.json'),
      path.join('resources', 'app', 'extensions', 'antigravity', 'dist', 'extension.js')
    ];
    for (const rel of extRelFiles) {
      const f = path.join(paths.ide.appPath, rel);
      if (fs.existsSync(f + '.bak')) {
        restoreFile(f);
      }
    }
  }

  const clpFiles = [
    ...findClpNlsFiles(paths.ide?.userConfigPath),
    ...findClpNlsFiles(paths.desktop?.userConfigPath)
  ];
  for (const cf of clpFiles) {
    const res = restoreFile(cf);
    results.push({ target: `nls önbelleği (${path.basename(path.dirname(cf))})`, file: cf, ...res });
  }

  if (paths.ide && paths.ide.productFile) {
    const res = restoreFile(paths.ide.productFile);
    results.push({ target: 'product.json', file: paths.ide.productFile, ...res });
  }

  return results;
}

module.exports = {
  ensureBackup,
  patchFile,
  patchNlsFile,
  restoreFile,
  computeChecksum,
  updateProductChecksums,
  applyAllPatches,
  restoreAllPatches,
  buildGuardedDesktopTranslator
};
