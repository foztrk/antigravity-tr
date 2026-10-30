const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getPaths } = require('./config');
const { applyAllPatches, restoreAllPatches, ensureBackup, buildGuardedDesktopTranslator } = require('./patcher');
const { patchAllExtensions } = require('./extension_descriptions');
const { patchDesktopApp, restoreDesktopApp } = require('./desktop_patcher');

/**
 * GEMINI.md kuralını ekler veya günceller.
 */
function setupGeminiRule(paths) {
  const ruleTemplatePath = path.join(__dirname, '..', 'rules', 'GEMINI.md');
  if (!fs.existsSync(ruleTemplatePath)) {
    return { success: false, reason: 'Kural şablon dosyası bulunamadı.' };
  }

  const newRuleContent = fs.readFileSync(ruleTemplatePath, 'utf8').trim();
  const targetFile = paths.geminiRuleFile;

  if (!fs.existsSync(paths.geminiDir)) {
    fs.mkdirSync(paths.geminiDir, { recursive: true });
  }

  let existing = '';
  if (fs.existsSync(targetFile)) {
    existing = fs.readFileSync(targetFile, 'utf8');
  }

  const startTag = '<!-- antigravity-tr:start -->';
  const endTag = '<!-- antigravity-tr:end -->';

  let updated = '';
  if (existing.includes(startTag) && existing.includes(endTag)) {
    const regex = new RegExp(`${startTag}[\\s\\S]*?${endTag}`, 'g');
    updated = existing.replace(regex, newRuleContent);
  } else {
    updated = existing ? `${existing.trim()}\n\n${newRuleContent}\n` : `${newRuleContent}\n`;
  }

  fs.writeFileSync(targetFile, updated, 'utf8');
  return { success: true, path: targetFile };
}

/**
 * GEMINI.md dosyasından Türkçe kuralını kaldırır.
 */
function removeGeminiRule(paths) {
  const targetFile = paths.geminiRuleFile;
  if (!fs.existsSync(targetFile)) return { success: true };

  let content = fs.readFileSync(targetFile, 'utf8');
  const startTag = '<!-- antigravity-tr:start -->';
  const endTag = '<!-- antigravity-tr:end -->';

  if (content.includes(startTag) && content.includes(endTag)) {
    const regex = new RegExp(`${startTag}[\\s\\S]*?${endTag}`, 'g');
    content = content.replace(regex, '').trim();
    fs.writeFileSync(targetFile, content + '\n', 'utf8');
    return { success: true, removed: true };
  }

  return { success: true, removed: false };
}

/**
 * argv.json dosyasına "locale": "tr" ekler.
 */
function setArgvLocale(argvPath, locale = 'tr') {
  if (!fs.existsSync(argvPath)) {
    const dir = path.dirname(argvPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(argvPath, `{\n\t"locale": "${locale}"\n}\n`, 'utf8');
    return { success: true, created: true };
  }

  let content = fs.readFileSync(argvPath, 'utf8');
  if (content.includes('"locale"')) {
    content = content.replace(/"locale":\s*"[^"]*"/, `"locale": "${locale}"`);
  } else {
    content = content.replace(/\{/, `{\n\t"locale": "${locale}",`);
  }
  fs.writeFileSync(argvPath, content, 'utf8');
  return { success: true, modified: true };
}

/**
 * locale.json dosyasını yazar.
 */
function setLocaleJson(localePath, locale = 'tr') {
  const dir = path.dirname(localePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(localePath, JSON.stringify({ locale }, null, 2), 'utf8');
  return { success: true };
}

/**
 * Dil paketinde eksik olan Google ve yeni VS Code dizelerini (quickOpen, helpActions, auxiliaryactivitybar) ekler.
 */
function enrichLanguagePackFile(mainJsonPath) {
  if (!fs.existsSync(mainJsonPath)) return;
  try {
    try { fs.chmodSync(mainJsonPath, 0o666); } catch (e) {}
    const data = JSON.parse(fs.readFileSync(mainJsonPath, 'utf8'));

    // 1. Başlık çubuğu quickOpen
    if (!data.contents['vs/workbench/browser/parts/titlebar/titlebarPart']) {
      data.contents['vs/workbench/browser/parts/titlebar/titlebarPart'] = {};
    }
    data.contents['vs/workbench/browser/parts/titlebar/titlebarPart'].quickOpen = 'Hızlı Aç';

    // 2. Yardım menüsü (Provide Feedback, Download Diagnostics)
    if (!data.contents['vs/workbench/browser/actions/helpActions']) {
      data.contents['vs/workbench/browser/actions/helpActions'] = {};
    }
    const help = data.contents['vs/workbench/browser/actions/helpActions'];
    help.miProvideFeedback = '&&Geri Bildirimde Bulun';
    help.provideFeedback = 'Geri Bildirimde Bulun';
    help.downloadDiagnostics = 'Tanılama Bilgilerini İndir';

    // 3. İkincil Etkinlik Çubuğu (Secondary Activity Bar Position & Menus)
    if (!data.contents['vs/workbench/browser/parts/auxiliaryactivitybar/auxiliaryactivitybarPart']) {
      data.contents['vs/workbench/browser/parts/auxiliaryactivitybar/auxiliaryactivitybarPart'] = {};
    }
    const aux = data.contents['vs/workbench/browser/parts/auxiliaryactivitybar/auxiliaryactivitybarPart'];
    aux.hideMenu = 'Menüyü Gizle';
    aux['auxiliary activity bar position'] = 'İkincil Etkinlik Çubuğu Pozisyonu';
    aux.miDefaultAuxiliaryActivityBar = '&&Varsayılan';
    aux.default = 'Varsayılan';
    aux.miTopAuxiliaryActivityBar = '&&Üst';
    aux.top = 'Üst';
    aux.miBottomAuxiliaryActivityBar = '&&Alt';
    aux.bottom = 'Alt';
    aux.miHideAuxiliaryActivityBar = '&&Gizli';
    aux.hide = 'Gizli';
    aux.positionAuxiliaryActivituBar = 'İkincil Etkinlik Çubuğu Pozisyonu';
    aux.positionAuxiliaryActivityBarDefault = 'İkincil Etkinlik Çubuğunu Yan Tarafa Taşı';
    aux.positionAuxiliaryActivityBarTop = 'İkincil Etkinlik Çubuğunu En Üste Taşı';
    aux.positionAuxiliaryActivityBarBottom = 'İkincil Etkinlik Çubuğunu Alta Taşı';
    // 4. Birincil Kenar Çubuğu (Primary Side Bar Menus)
    if (!data.contents['vs/workbench/browser/parts/sidebar/sidebarPart']) {
      data.contents['vs/workbench/browser/parts/sidebar/sidebarPart'] = {};
    }
    const sb = data.contents['vs/workbench/browser/parts/sidebar/sidebarPart'];
    sb.showSideBar = 'Birincil Kenar Çubuğunu Göster';
    sb.hideSideBar = 'Birincil Kenar Çubuğunu Gizle';
    sb.sideBar = 'Birincil Kenar Çubuğu';
    sb.miSidebar = '&&Birincil Kenar Çubuğu';
    sb.toggleSideBar = 'Birincil Kenar Çubuğunu Aç/Kapat';
    sb.moveSideBarRight = 'Birincil Kenar Çubuğunu Sağa Taşı';
    sb.moveSideBarLeft = 'Birincil Kenar Çubuğunu Sola Taşı';
    sb.miMoveSideBarRight = '&&Birincil Kenar Çubuğunu Sağa Taşı';
    sb.miMoveSideBarLeft = '&&Birincil Kenar Çubuğunu Sola Taşı';
    sb.toggleSideBarPosition = 'Birincil Kenar Çubuğu Pozisyonunu Değiştir';

    // 5. Ağaç Görünümleri (TreeView - Veri sağlayıcı yok uyarısı vb.)
    if (!data.contents['vs/workbench/browser/parts/views/treeView']) {
      data.contents['vs/workbench/browser/parts/views/treeView'] = {};
    }
    const tv = data.contents['vs/workbench/browser/parts/views/treeView'];
    tv['no-dataprovider'] = 'Görünüm verilerini sağlayabilecek kayıtlı bir veri sağlayıcı yok.';
    tv['command-error'] = '{1} komutu çalıştırılırken hata oluştu: {0}. Bunun nedeni büyük olasılıkla {1} komutunu sağlayan uzantıdır.';

    // 6. tr.json içindeki tüm mod+key NLS kurallarını dil paketine işle
    const dictPath = path.join(__dirname, '..', 'locales', 'tr.json');
    if (fs.existsSync(dictPath)) {
      const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
      const nlsRules = dict.rules?.nlsMessages || [];
      for (const r of nlsRules) {
        if (r.mod && r.key && r.replace) {
          if (!data.contents[r.mod]) data.contents[r.mod] = {};
          data.contents[r.mod][r.key] = r.replace;
        }
      }
    }

    fs.writeFileSync(mainJsonPath, JSON.stringify(data), 'utf8');
  } catch (e) {}
}

/**
 * Resmi VS Code Türkçe dil paketini Antigravity IDE ve Masaüstü uygulamasına bağlar/zenginleştirir.
 */
function ensureLanguagePack(paths) {
  const cli = paths.ide.cliCmd;
  if (fs.existsSync(cli)) {
    try {
      execSync(`"${cli}" --install-extension ms-ceintl.vscode-language-pack-tr`, {
        stdio: 'ignore'
      });
    } catch (e) {
      // Eklenti zaten yüklü veya manuel bağlantı kullanılacak
    }
  }

  if (paths.ide && paths.ide.extensionsDir) {
    const mainJsonPath = path.join(paths.ide.extensionsDir, 'ms-ceintl.vscode-language-pack-tr-1.106.0-universal', 'translations', 'main.i18n.json');
    enrichLanguagePackFile(mainJsonPath);
  }

  if (paths.desktop && paths.desktop.extensionsDir) {
    const mainJsonPath = path.join(paths.desktop.extensionsDir, 'ms-ceintl.vscode-language-pack-tr-1.106.0-universal', 'translations', 'main.i18n.json');
    enrichLanguagePackFile(mainJsonPath);
  }

  return { installed: true };
}

/**
 * Masaüstü ve IDE arasında dil paketi ve languagepacks.json senkronizasyonunu sağlar.
 */
function syncLanguagePacks(paths) {
  const ideLp = paths.ide.languagePacksFile;
  const desktopLp = paths.desktop.languagePacksFile;

  if (fs.existsSync(ideLp) && fs.existsSync(path.dirname(desktopLp))) {
    try {
      const content = fs.readFileSync(ideLp, 'utf8').replaceAll('.antigravity-ide', '.antigravity');
      fs.writeFileSync(desktopLp, content, 'utf8');
    } catch (e) {}
  }
}

/**
 * Electron derleme ve bytecode önbelleğini temizler.
 * Böylece yamalanan dosyalar doğrudan diskten taze derlenir.
 */
function clearElectronCache(paths) {
  const targets = [
    path.join(paths.ide.userConfigPath, 'Code Cache'),
    path.join(paths.ide.userConfigPath, 'CachedData'),
    path.join(paths.ide.userConfigPath, 'CachedConfigurations'),
    path.join(paths.ide.userConfigPath, 'CachedProfilesData')
  ];

  let clearedCount = 0;
  for (const t of targets) {
    if (fs.existsSync(t)) {
      try {
        fs.rmSync(t, { recursive: true, force: true });
        clearedCount++;
      } catch (e) {}
    }
  }
  return clearedCount;
}

/**
 * Antigravity ana eklentisindeki (extensions/antigravity ve extensions/agy) arayüzleri yamalar.
 */
function patchAntigravityExtension(paths) {
  if (!paths.ide || !paths.ide.appPath) return;
  const extsDir = path.join(paths.ide.appPath, 'resources', 'app', 'extensions');

  // 1. extensions/antigravity/dist/extension.js
  const extFile = path.join(extsDir, 'antigravity', 'dist', 'extension.js');
  if (fs.existsSync(extFile)) {
    try {
      ensureBackup(extFile);
      try { fs.chmodSync(extFile, 0o666); } catch (e) {}
      let c = fs.readFileSync(`${extFile}.bak`, 'utf8');
      if (c.includes('"Antigravity - Settings"')) {
        c = c.replaceAll('"Antigravity - Settings"', '"Antigravity - Ayarlar"');
      }
      fs.writeFileSync(extFile, c, 'utf8');
    } catch (e) {}
  }

  // 2. extensions/agy/package.json
  const agyPkgFile = path.join(extsDir, 'agy', 'package.json');
  if (fs.existsSync(agyPkgFile)) {
    try {
      ensureBackup(agyPkgFile);
      try { fs.chmodSync(agyPkgFile, 0o666); } catch (e) {}
      let pkg = fs.readFileSync(`${agyPkgFile}.bak`, 'utf8');
      const pkgReps = [
        ['"Bring Google\'s agent-first development platform into Visual Studio Code."', '"Google\'ın ajan öncelikli geliştirme platformunu Visual Studio Code\'a taşıyın."'],
        ['"displayName":"Antigravity Artifact Viewer"', '"displayName":"Antigravity Yapıt Görüntüleyici"'],
        ['"displayName":"Antigravity Settings Viewer"', '"displayName":"Antigravity Ayarlar Görüntüleyici"'],
        ['"title":"Show Third Party Notices"', '"title":"Üçüncü Taraf Bildirimlerini Göster"'],
        ['"title":"Open Changelog"', '"title":"Değişiklik Günlüğünü Aç"'],
        ['"title":"Reset Conversation State"', '"title":"Sohbet Durumunu Sıfırla"'],
        ['"title":"Add Selection to Chat"', '"title":"Seçimi Sohbete Ekle"'],
        ['"title":"Add Terminal Selection or Output to Chat"', '"title":"Terminal Seçimini veya Çıktısını Sohbete Ekle"'],
        ['"title":"Focus Antigravity Panel"', '"title":"Antigravity Paneline Odaklan"'],
        ['"title":"Accept All Changes"', '"title":"Tüm Değişiklikleri Kabul Et"'],
        ['"title":"Reject All Changes"', '"title":"Tüm Değişiklikleri Reddet"'],
        ['"title":"Accept Focused Change"', '"title":"Odaklanılan Değişikliği Kabul Et"'],
        ['"title":"Reject Focused Change"', '"title":"Odaklanılan Değişikliği Reddet"'],
        ['"title":"Toggle Inline Diff"', '"title":"Satır İçi Fark Görünümünü Aç/Kapat"'],
        ['"title":"Open Antigravity Settings"', '"title":"Antigravity Ayarlarını Aç"'],
        ['"title":"Manage Data Sharing & Telemetry"', '"title":"Veri Paylaşımı ve Telemetriyi Yönet"'],
        ['"title":"Provide Feedback"', '"title":"Geri Bildirimde Bulun"'],
        ['"title":"Add Comment to Chat"', '"title":"Sohbete Yorum Ekle"'],
        ['"title":"Edit Comment"', '"title":"Yorumu Düzenle"'],
        ['"title":"Delete Comment"', '"title":"Yorumu Sil"'],
        ['"title":"Save Comment"', '"title":"Yorumu Kaydet"'],
        ['"title":"Cancel Edit"', '"title":"Düzenlemeyi İptal Et"'],
        ['"title":"Comment for Antigravity"', '"title":"Antigravity için Yorum Yap"'],
        ['"title":"Accept Completion"', '"title":"Tamamlamayı Kabul Et"'],
        ['"title":"Escape Completion"', '"title":"Tamamlamadan Çık"'],
        ['"title":"Generate Commit Message"', '"title":"Commit İletisi Oluştur"'],
        ['"Port for the Antigravity background server (`agy --hub`). Leave at 0 (recommended) to allocate an ephemeral port automatically. Each VS Code window spawns its own `agy` server, so prefer setting a fixed port in Workspace Settings rather than User Settings; if the configured port is already in use by another window or process, Antigravity automatically falls back to an available ephemeral port."', '"Antigravity arka plan sunucusu (`agy --hub`) için bağlantı noktası. Geçici bir bağlantı noktasını otomatik olarak ayırmak için 0 (önerilen) değerinde bırakın. Her VS Code penceresi kendi `agy` sunucusunu başlatır; bu nedenle sabit bir bağlantı noktasını Kullanıcı Ayarları yerine Çalışma Alanı Ayarlarında belirlemeyi tercih edin. Yapılandırılan bağlantı noktası başka bir pencere veya işlem tarafından kullanılıyorsa Antigravity otomatik olarak kullanılabilir bir geçici bağlantı noktasına geçer."'],
        ['"Timeout in milliseconds to wait for the Antigravity backend language server to start up and pass health checks."', '"Antigravity arka uç dil sunucusunun başlaması ve sağlık kontrollerini geçmesi için beklenecek milisaniye cinsinden zaman aşımı."'],
        ['"Interval in milliseconds between post-startup /healthz liveness probes (minimum 1000; 4x slower when the Antigravity view is hidden or unfocused). After 3 consecutive missed probes the backend is restarted automatically. Set to 0 to disable heartbeat probing."', '"Başlangıç sonrası /healthz canlılık yoklamaları arasındaki milisaniye cinsinden aralık (en az 1000; Antigravity görünümü gizli veya odak dışı olduğunda 4 kat daha yavaş). Ardışık 3 başarısız yoklamadan sonra arka uç otomatik olarak yeniden başlatılır. Canlılık yoklamasını devre dışı bırakmak için 0 olarak ayarlayın."'],
        ['"Telemetry is now controlled by the **Enable Telemetry** switch in Antigravity Settings → Account ([open](command:antigravity.openTelemetrySettings)). This setting no longer has any effect beyond keeping extension usage metrics off if set to `false`."', '"Telemetri artık Antigravity Ayarları → Hesap ([aç](command:antigravity.openTelemetrySettings)) altındaki **Telemetriyi Etkinleştir** anahtarıyla kontrol edilmektedir. Bu ayarın `false` olarak ayarlanması durumunda uzantı kullanım ölçümlerini kapalı tutmak dışında artık bir etkisi yoktur."'],
        ['"Enable inline diff decorations and CodeLenses. When disabled, falls back to opening changes in a side-by-side diff tab."', '"Satır içi fark süslemelerini ve CodeLens\'leri etkinleştirin. Devre dışı bırakıldığında değişiklikler yan yana fark sekmesinde açılır."'],
        ['"Auto-accept pending edits in background files when sending a new chat message. When off, nothing pending is accepted on your behalf: a review stays open across turns and later edits to the file add to it, and you are notified when reviews from earlier turns are still open."', '"Yeni bir sohbet iletisi gönderirken arka plandaki dosyalarda bekleyen düzenlemeleri otomatik olarak kabul edin. Kapalı olduğunda bekleyen hiçbir değişiklik sizin adınıza kabul edilmez: inceleme turlar arasında açık kalır, dosyada yapılan sonraki düzenlemeler buna eklenir ve önceki turlardan kalan incelemeler açık olduğunda size bildirim gönderilir."'],
        ['"Automatically open files in the editor when the agent proposes edits."', '"Ajan düzenleme önerdiğinde dosyaları düzenleyicide otomatik olarak açın."'],
        ['"Enable leaving comments for the agent in editors and Git diff views (via the gutter \'+\' button, editor context menu, or keybinding)."', '"Düzenleyicilerde ve Git fark görünümlerinde (satır başı \'+\' düğmesi, düzenleyici bağlam menüsü veya klavye kısayolu aracılığıyla) ajan için yorum bırakmayı etkinleştirin."'],
        ['"Hide business account sign-in."', '"İş hesabı ile oturum açma seçeneğini gizleyin."'],
        ['"Default the agent sidebar to no grouping until a grouping is picked."', '"Bir gruplama seçilene kadar ajan kenar çubuğunu varsayılan olarak gruplamasız gösterin."'],
        ['"Show the sign-in heading without \\"Welcome to\\"."', '"Oturum açma başlığını \\"Hoş Geldiniz\\" olmadan gösterin."'],
        ['"Base URL for CLI downloads (used for testing and internal overrides)."', '"CLI indirmeleri için temel URL (test ve dahili geçersiz kılmalar için kullanılır)."'],
        ['"Additional command line arguments passed to the language server."', '"Dil sunucusuna iletilen ek komut satırı bağımsız değişkenleri."'],
        ['"The release channel for this extension build"', '"Bu uzantı derlemesi için yayın kanalı"'],
        ['"Explicit URL for the Antigravity backend language server (e.g. http://127.0.0.1:4242). Overrides automatic port allocation."', '"Antigravity arka uç dil sunucusu için açık URL (ör. http://127.0.0.1:4242). Otomatik bağlantı noktası ayırmayı geçersiz kılar."']
      ];
      for (const [en, tr] of pkgReps) {
        pkg = pkg.replaceAll(en, tr);
      }
      fs.writeFileSync(agyPkgFile, pkg, 'utf8');
    } catch (e) {}
  }

  // 3. extensions/agy/dist/extension.js
  const agyDistFile = path.join(extsDir, 'agy', 'dist', 'extension.js');
  if (fs.existsSync(agyDistFile)) {
    try {
      ensureBackup(agyDistFile);
      try { fs.chmodSync(agyDistFile, 0o666); } catch (e) {}
      let d = fs.readFileSync(`${agyDistFile}.bak`, 'utf8');
      const distReps = [
        ['"Tab to Jump"', '"Atlamak için Tab"'],
        ['title:"Accept Completion"', 'title:"Tamamlamayı Kabul Et"'],
        ['"It looks like you do not have a git repository opened."', '"Açık bir git deponuz yok gibi görünüyor."'],
        ['`Error generating commit message: ${V}`', '`Commit iletisi oluşturulurken hata oluştu: ${V}`']
      ];
      for (const [en, tr] of distReps) {
        d = d.replaceAll(en, tr);
      }
      fs.writeFileSync(agyDistFile, d, 'utf8');
    } catch (e) {}
  }

  // 4. extensions/agy/vscode/extension.js (UI dizeleri + yerel agy --hub çeviri vekil sunucusu)
  const agyVscodeFile = path.join(extsDir, 'agy', 'vscode', 'extension.js');
  if (fs.existsSync(agyVscodeFile)) {
    try {
      ensureBackup(agyVscodeFile);
      try { fs.chmodSync(agyVscodeFile, 0o666); } catch (e) {}
      let v = fs.readFileSync(`${agyVscodeFile}.bak`, 'utf8');
      const vscodeReps = [
        // Durum çubuğu
        ['b.name="Antigravity Settings";b.text="Antigravity - Settings";b.tooltip="Open Antigravity Settings"', 'b.name="Antigravity Ayarları";b.text="Antigravity - Ayarlar";b.tooltip="Antigravity Ayarlarını Aç"'],
        // Yükleme ve bağlantı ekranları
        ['<div class="product-subtitle">for VS Code</div>', '<div class="product-subtitle">VS Code için</div>'],
        ['tv("Loading Antigravity...")', 'tv("Antigravity Yükleniyor...")'],
        ['tv("Checking your setup...")', 'tv("Kurulumunuz kontrol ediliyor...")'],
        ["'Still reconnecting to Antigravity...'", "'Hâlâ Antigravity ile yeniden bağlantı kuruluyor...'"],
        ["'Reconnecting to Antigravity...'", "'Antigravity ile yeniden bağlantı kuruluyor...'"],
        ["'Still connecting to Antigravity...'", "'Hâlâ Antigravity ile bağlantı kuruluyor...'"],
        ["'Connecting to Antigravity...'", "'Antigravity ile bağlantı kuruluyor...'"],
        ["'Reconnecting to Antigravity (attempt ' + attempt + ' of ' + max + ')...'", "'Antigravity ile yeniden bağlantı kuruluyor (deneme ' + attempt + ' / ' + max + ')...'"],
        ['<div class="error-title">Couldn\\\'t load this view</div>', '<div class="error-title">Bu görünüm yüklenemedi</div>'],
        ['<div class="error-message">An unexpected error occurred while loading this view. Please reload or report an issue.</div>', '<div class="error-message">Bu görünüm yüklenirken beklenmeyen bir hata oluştu. Lütfen yeniden yükleyin veya sorun bildirin.</div>'],
        ['>Try again</button>', '>Yeniden dene</button>'],
        ['>Report issue</button>', '>Sorun bildir</button>'],
        ['>Sign in to Antigravity</div>', '>Antigravity\'de oturum açın</div>'],
        ['>Sign in to start using Antigravity.</div>', '>Antigravity\'yi kullanmaya başlamak için oturum açın.</div>'],
        ['>Log In</button>', '>Oturum Aç</button>'],
        ['>Submit</button>', '>Gönder</button>'],
        ['>Update</button>', '>Güncelle</button>'],
        ['b.notifyMessage("Setting up Antigravity server...")', 'b.notifyMessage("Antigravity sunucusu hazırlanıyor...")'],
        ['b.notifyMessage("Checking Antigravity setup...")', 'b.notifyMessage("Antigravity kurulumu kontrol ediliyor...")'],
        ['b.notifyMessage("Waiting for terminal authorization...")', 'b.notifyMessage("Terminal yetkilendirmesi bekleniyor...")'],
        ['{title:"Sign in to Antigravity",subtitle:"Sign in with your Google account to start using Antigravity in this Cloud Developer Environment.",buttonLabel:"Log In"}', '{title:"Antigravity\'de oturum açın",subtitle:"Bu Bulut Geliştirici Ortamında Antigravity\'yi kullanmaya başlamak için Google hesabınızla oturum açın.",buttonLabel:"Oturum Aç"}'],
        // CodeLens ve satır içi fark (Inline Diff)
        ['title:"$(check) Accept",tooltip:"Accept this suggestion block"', 'title:"$(check) Kabul Et",tooltip:"Bu öneri bloğunu kabul et"'],
        ['title:"$(chrome-close) Reject",tooltip:"Reject this suggestion block"', 'title:"$(chrome-close) Reddet",tooltip:"Bu öneri bloğunu reddet"'],
        ['title:`\\u2212${d} ${d===1?"line":"lines"} deleted`,command:"",tooltip:`Deleted lines:\\n${p.originalText}`', 'title:`\\u2212${d} satır silindi`,command:"",tooltip:`Silinen satırlar:\\n${p.originalText}`'],
        ['tooltip:`Replaced lines:\\n${p.originalText}`', 'tooltip:`Değiştirilen satırlar:\\n${p.originalText}`'],
        // Yorum denetleyicisi
        ['`${this.displayName} Comments`', '`${this.displayName} Yorumları`'],
        ['{placeHolder:`Add a comment / instruction for ${this.displayName}...`}', '{placeHolder:`${this.displayName} için bir yorum / talimat ekleyin...`}'],
        // Bildirimler ve iletişim kutuları
        ['"Antigravity: Sign-in successful"', '"Antigravity: Oturum açma başarılı"'],
        ['"Antigravity conversation state reset."', '"Antigravity sohbet durumu sıfırlandı."'],
        ['`Antigravity Inline Diff ${pb?"disabled":"enabled"}.`', '`Antigravity Satır İçi Fark Görünümü ${pb?"devre dışı bırakıldı":"etkinleştirildi"}.`'],
        ['"Changing the Antigravity server port requires reloading the window to take effect."', '"Antigravity sunucu bağlantı noktasını değiştirmek, etkili olması için pencerenin yeniden yüklenmesini gerektirir."'],
        ['"Reload Window"', '"Pencereyi Yeniden Yükle"'],
        ['"Inline diffs work best with Auto Save off. Turn off Auto Save, or switch to side-by-side diffs."', '"Satır içi farklar en iyi Otomatik Kaydetme kapalıyken çalışır. Otomatik Kaydetmeyi kapatın veya yan yana fark görünümüne geçin."'],
        ['"Turn Off Auto Save"', '"Otomatik Kaydetmeyi Kapat"'],
        ['"Use Side-by-Side"', '"Yan Yana Görünümü Kullan"'],
        ['"Don\'t Show Again"', '"Bir Daha Gösterme"'],
        ['"Side-by-side diffs will be used once the open inline reviews are done."', '"Açık satır içi incelemeler tamamlandığında yan yana fark görünümü kullanılacaktır."'],
        ['"Sending Antigravity feedback and diagnostics..."', '"Antigravity geri bildirimi ve tanılamaları gönderiliyor..."'],
        ['"A diagnostics report for this Antigravity version was already sent in the last 24 hours, so it was not sent again."', '"Bu Antigravity sürümü için son 24 saat içinde zaten bir tanılama raporu gönderildiğinden tekrar gönderilmedi."'],
        ['"Send anyway"', '"Yine de gönder"'],
        ['"Thank you! Your feedback has been submitted successfully."', '"Teşekkürler! Geri bildiriminiz başarıyla gönderildi."'],
        ['"Open Chat"', '"Sohbeti Aç"'],
        ['"Dismiss"', '"Kapat"'],
        ['"Open review"', '"İncelemeyi aç"'],
        ['"Reload from disk"', '"Diskten yeniden yükle"'],
        ['"Save agent version"', '"Ajan sürümünü kaydet"']
      ];
      for (const [en, tr] of vscodeReps) {
        v = v.replaceAll(en, tr);
      }

      // Yerel agy.exe --hub HTTP/WebSocket çeviri vekil sunucusunu enjekte et
      const serverAssignTarget = 'this.serverUrl=P;this.port=Wc;this.lastStartupError=void 0;this.startHeartbeat(P,mb);';
      const serverAssignReplacement = 'P=B(await F(__agyTrEnsureProxy(this,Wc,P)));this.serverUrl=P;this.port=Wc;this.lastStartupError=void 0;this.startHeartbeat(P,mb);';
      const activateExportTarget = 'k.exportSymbol("activate",';
      if (v.includes(serverAssignTarget) && v.includes(activateExportTarget)) {
        const guardedTranslator = buildGuardedDesktopTranslator();
        const proxyHelperCode = `
function __agyTrEnsureProxy(mgr, targetPort, fallbackUrl) {
  mgr.__agyTrTargetPort = targetPort;
  if (mgr.__agyTrProxyUrl && mgr.__agyTrProxyServer && mgr.__agyTrProxyServer.listening) {
    return Promise.resolve(mgr.__agyTrProxyUrl);
  }
  return new Promise(function(resolve) {
    try {
      var http = require('node:http');
      var net = require('node:net');
      var trScript = ${JSON.stringify(guardedTranslator)};
      var bundleReps = [
        ['P4={low:"Low",medium:"Medium",high:"High",xhigh:"Extra",max:"Max"}', 'P4={low:"Düşük",medium:"Orta",high:"Yüksek",xhigh:"Ekstra",max:"Maks"}'],
        ['"Ask anything, @ to mention"', '"Bir şey sorun, @ ile bahsedin"'],
        [', / for actions', ', / ile eylemler'],
        ['case "standalone":return"No Project"', 'case "standalone":return"Proje Yok"'],
        ['case "git":return"Git Project"', 'case "git":return"Git Projesi"'],
        ['case "workspace":return"VS Code Workspace"', 'case "workspace":return"VS Code Çalışma Alanı"'],
        [',"View Usage")', ',"Kullanımı Görüntüle")'],
        ['children:"New"})', 'children:"Yeni"})'],
        ['children:"Notice"', 'children:"Bilgilendirme"'],
        ['placeholder:"Search projects..."', 'placeholder:"Projelerde ara..."'],
        ['"Add a Project"', '"Proje Ekle"'],
        ['"Select a folder to start working with the agent"', '"Ajanla çalışmaya başlamak için bir klasör seçin"'],
        ['"No matching projects"', '"Eşleşen proje yok"'],
        ['"Project not found"', '"Proje Bulunamadı"'],
        ['"Remove from Recent Projects"', '"Son Projelerden Kaldır"']
      ];
      var srv = http.createServer(function(req, res) {
        var u = req.url || '/';
        var cleanPath = u.split('?')[0];
        if (cleanPath === '/antigravity-tr.js') {
          var trBuf = Buffer.from(trScript, 'utf8');
          res.writeHead(200, {
            'content-type': 'application/javascript; charset=utf-8',
            'cache-control': 'no-store',
            'content-length': String(trBuf.length)
          });
          res.end(trBuf);
          return;
        }
        var isIntercepted = cleanPath === '/' || cleanPath === '/index.html' || cleanPath === '/main.js';
        var fwdHeaders = Object.assign({}, req.headers);
        fwdHeaders.host = '127.0.0.1:' + mgr.__agyTrTargetPort;
        if (fwdHeaders.origin) fwdHeaders.origin = 'http://127.0.0.1:' + mgr.__agyTrTargetPort;
        if (fwdHeaders.referer) fwdHeaders.referer = fwdHeaders.referer.replace(/127\\.0\\.0\\.1:\\d+/, '127.0.0.1:' + mgr.__agyTrTargetPort);
        if (isIntercepted) {
          delete fwdHeaders['accept-encoding'];
          delete fwdHeaders['if-none-match'];
          delete fwdHeaders['if-modified-since'];
          delete fwdHeaders['range'];
        }
        var pReq = http.request({
          hostname: '127.0.0.1',
          port: mgr.__agyTrTargetPort,
          path: u,
          method: req.method,
          headers: fwdHeaders
        }, function(pRes) {
          if (isIntercepted && pRes.statusCode === 200) {
            var chunks = [];
            pRes.on('data', function(c) { chunks.push(c); });
            pRes.on('end', function() {
              try {
                var body = Buffer.concat(chunks).toString('utf8');
                if (cleanPath === '/main.js') {
                  for (var i = 0; i < bundleReps.length; i++) {
                    body = body.split(bundleReps[i][0]).join(bundleReps[i][1]);
                  }
                  body += '\\n;' + trScript;
                } else {
                  body = body.replace('src="/main.js"', 'src="/main.js?tr=2"');
                  var tag = '<script src="/antigravity-tr.js"></script>';
                  if (body.indexOf('</body>') !== -1) {
                    body = body.replace('</body>', tag + '</body>');
                  } else {
                    body += tag;
                  }
                }
                var outBuf = Buffer.from(body, 'utf8');
                var outHeaders = Object.assign({}, pRes.headers);
                delete outHeaders['content-encoding'];
                delete outHeaders['transfer-encoding'];
                delete outHeaders['accept-ranges'];
                delete outHeaders['etag'];
                delete outHeaders['last-modified'];
                outHeaders['cache-control'] = 'no-store';
                outHeaders['content-length'] = String(outBuf.length);
                res.writeHead(200, outHeaders);
                res.end(outBuf);
              } catch (e) {
                res.writeHead(500);
                res.end(String(e));
              }
            });
          } else {
            res.writeHead(pRes.statusCode || 200, pRes.headers);
            pRes.pipe(res);
          }
        });
        pReq.on('error', function() {
          if (!res.headersSent) res.writeHead(502);
          res.end();
        });
        req.pipe(pReq);
      });
      srv.on('upgrade', function(req, socket, head) {
        var upstream = net.connect(mgr.__agyTrTargetPort, '127.0.0.1', function() {
          var lines = [req.method + ' ' + req.url + ' HTTP/' + req.httpVersion];
          for (var i = 0; i < req.rawHeaders.length; i += 2) {
            var k = req.rawHeaders[i];
            var val = req.rawHeaders[i + 1];
            var kl = k.toLowerCase();
            if (kl === 'host') val = '127.0.0.1:' + mgr.__agyTrTargetPort;
            else if (kl === 'origin') val = 'http://127.0.0.1:' + mgr.__agyTrTargetPort;
            else if (kl === 'referer') val = val.replace(/127\\.0\\.0\\.1:\\d+/, '127.0.0.1:' + mgr.__agyTrTargetPort);
            lines.push(k + ': ' + val);
          }
          lines.push('', '');
          upstream.write(lines.join('\\r\\n'));
          if (head && head.length) upstream.write(head);
          socket.pipe(upstream).pipe(socket);
        });
        upstream.on('error', function() { socket.destroy(); });
        socket.on('error', function() { upstream.destroy(); });
      });
      srv.on('error', function() { resolve(fallbackUrl); });
      srv.listen(0, '127.0.0.1', function() {
        var addr = srv.address();
        mgr.__agyTrProxyServer = srv;
        mgr.__agyTrProxyUrl = 'http://127.0.0.1:' + addr.port;
        resolve(mgr.__agyTrProxyUrl);
      });
    } catch (e) {
      resolve(fallbackUrl);
    }
  });
}
`;
        v = v.replace(serverAssignTarget, serverAssignReplacement);
        v = v.replace(activateExportTarget, proxyHelperCode + '\n' + activateExportTarget);
      }
      fs.writeFileSync(agyVscodeFile, v, 'utf8');
    } catch (e) {}
  }
}

/**
 * Google Cloud Data Agent Kit eklentisindeki (no project) ve menüleri yamalar.
 */
function patchGoogleCloudExtension(paths) {
  const dcDirs = [];
  const searchBases = [
    paths.ide?.extensionsDir,
    path.join(require('node:os').homedir(), '.vscode', 'extensions')
  ];

  for (const base of searchBases) {
    if (base && fs.existsSync(base)) {
      try {
        for (const d of fs.readdirSync(base)) {
          if (d.startsWith('googlecloudtools.datacloud')) {
            dcDirs.push(path.join(base, d));
          }
        }
      } catch (e) {}
    }
  }

  if (dcDirs.length === 0) return;

  const jsReplacements = [
    ['(no project)', '(Proje Seçilmedi)'],
    ['(proje seçilmedi)', '(Proje Seçilmedi)'],
    ['`Signed in as ', '`Şununla oturum açıldı: '],
    ['"Google Cloud Data Agent Kit - No Project Selected"', '"Google Cloud Data Agent Kit - Proje Seçilmedi"'],
    ['"$(cloud) Select a Google Cloud project"', '"$(cloud) Bir Google Cloud Projesi Seçin"'],
    ['"$(cloud) Bir Google Cloud projesi seçin"', '"$(cloud) Bir Google Cloud Projesi Seçin"'],
    ['"Google Cloud: Switch Project"', '"Google Cloud: Proje Değiştir"'],
    ['"Google Cloud: Set Billing/Quota Project"', '"Google Cloud: Faturalandırma/Kota Projesini Belirle"'],
    ['"Default (Same as Project)"', '"Varsayılan (Proje ile Aynı)"'],
    ['"Google Cloud: Sign Out"', '"Google Cloud: Oturumu Kapat"'],
    ['"Google Cloud: Reset Billing/Quota Project to Default"', '"Google Cloud: Faturalandırma/Kota Projesini Varsayılana Sıfırla"'],
    ['"Use the selected Google Cloud Project"', '"Seçilen Google Cloud Projesini Kullan"'],
    ['"Select Billing/Quota Project"', '"Faturalandırma/Kota Projesini Seçin"'],
    ['"Sign Out of Google Cloud"', '"Google Cloud Oturumunu Kapat"'],
    ['label:"Starred Projects"', 'label:"Yıldızlı Projeler"'],
    ['label:"Recent Projects"', 'label:"Son Kullanılan Projeler"'],
    ['tooltip:"Remove from recent projects"', 'tooltip:"Son Kullanılan Projelerden Kaldır"'],
    ['tooltip:"Star project"', 'tooltip:"Projeyi Yıldızla"'],
    ['tooltip:"Unstar project"', 'tooltip:"Proje Yıldızını Kaldır"'],
    ['tooltip:"Sign in to Google to manage projects"', 'tooltip:"Projeleri yönetmek için Google\'da oturum açın"'],
    ['b.title="Google Cloud Data Agent Kit Auth Status"', 'b.title="Google Cloud Data Agent Kit Kimlik Doğrulama Durumu"'],
    ['"Sign out of Google Cloud Data Agent Kit Extension"', '"Google Cloud Data Agent Kit Eklentisi Oturumunu Kapat"'],
    ['label:"$(sign-out) Sign Out"', 'label:"$(sign-out) Oturumu Kapat"'],
    ['"Please select a Google Cloud project to continue. If you don\'t have a project yet, you can create one in Cloud Console."', '"Devam etmek için lütfen bir Google Cloud projesi seçin. Henüz bir projeniz yoksa Cloud Console\'da oluşturabilirsiniz."'],
    ['"Select a project"', '"Bir Proje Seçin"'],
    ['"Select a project to see its databases"', '"Veritabanlarını görmek için bir proje seçin"'],
    ['Select a project to see its databases', 'Veritabanlarını görmek için bir proje seçin'],
    ['"Select a project to see"', '"Görmek için bir proje seçin"'],
    ['"Create a project in Cloud Console"', '"Cloud Console\'da bir proje oluşturun"'],
    ['"Please set a Google Cloud region to continue."', '"Devam etmek için lütfen bir Google Cloud bölgesi belirleyin."'],
    ['"Set region"', '"Bölge Belirle"'],
    ['NO_ITEMS_TO_DISPLAY_LABEL="No items to display"', 'NO_ITEMS_TO_DISPLAY_LABEL="Görüntülenecek Öğe Yok"'],
    ['title:"Load more"', 'title:"Daha Fazla Yükle"'],
    ['title:"Report Bug"', 'title:"Hata Bildir"'],
    ['title:"Open Settings"', 'title:"Ayarları Aç"'],
    ['title:"Open Quick Guide"', 'title:"Hızlı Başlangıç Kılavuzunu Aç"'],
    ['PANEL_TITLE:"Quick Start Guide",LABEL:"Quick Start Guide"', 'PANEL_TITLE:"Hızlı Başlangıç Kılavuzu",LABEL:"Hızlı Başlangıç Kılavuzu"'],
    ['"Select Project"', '"Proje Seç"'],
    ['"Select a Google Cloud Project"', '"Bir Google Cloud Projesi Seçin"'],
    ['"No project selected."', '"Proje seçilmedi."'],
    ['"Sign in to Google Cloud"', '"Google Cloud\'da Oturum Aç"'],
    ['"Managed Apache Spark"', '"Yönetilen Apache Spark"'],
    // BigQuery, Veritabanları, Katalog, Spark, Veri Mühendisliği, Dataflow, MLflow, Genel ağaç öğeleri ve sabitleri
    ['createFolderTreeItem("Datasets",', 'createFolderTreeItem("Veri Kümeleri",'],
    ['createFolderTreeItem("Jobs",', 'createFolderTreeItem("İşler",'],
    ['createFolderTreeItem("Saved Queries",', 'createFolderTreeItem("Kayıtlı Sorgular",'],
    ['createFolderTreeItem("Data Transfers",', 'createFolderTreeItem("Veri Aktarımları",'],
    ['createCommandTreeItem("New BigQuery Notebook",', 'createCommandTreeItem("Yeni BigQuery Not Defteri",'],
    ['createCommandTreeItem("New Query",', 'createCommandTreeItem("Yeni Sorgu",'],
    ['createCommandTreeItem("Open Query from File",', 'createCommandTreeItem("Dosyadan Sorgu Aç",'],
    ['new module$exports$vscode.TreeItem("Tables",', 'new module$exports$vscode.TreeItem("Tablolar",'],
    ['new module$exports$vscode.TreeItem("Views",', 'new module$exports$vscode.TreeItem("Görünümler",'],
    ['new module$exports$vscode.TreeItem("Property Graphs",', 'new module$exports$vscode.TreeItem("Özellik Grafikleri",'],
    ['new module$exports$vscode.TreeItem(b.displayName||"Unknown transfer",', 'new module$exports$vscode.TreeItem(b.displayName||"Bilinmeyen aktarım",'],
    ['new module$exports$vscode.TreeItem("Settings",', 'new module$exports$vscode.TreeItem("Ayarlar",'],
    ['new module$exports$vscode.TreeItem("Report Bug",', 'new module$exports$vscode.TreeItem("Hata Bildir",'],
    ['new module$exports$vscode.TreeItem("Provide Feedback",', 'new module$exports$vscode.TreeItem("Geri Bildirimde Bulun",'],
    ['new module$exports$vscode.TreeItem("Experiments (Googler Only)",', 'new module$exports$vscode.TreeItem("Deneyler (Yalnızca Googler)",'],
    ['new module$exports$vscode.TreeItem("In order to use Managed Apache Spark on Google Cloud, you need to enable the Cloud Spark API. Consuming Google Cloud APIs may incur additional billing charges.")', 'new module$exports$vscode.TreeItem("Google Cloud üzerinde Yönetilen Apache Spark\'ı kullanmak için Cloud Spark API\'sini etkinleştirmeniz gerekir. Google Cloud API\'lerini kullanmak ek faturalandırma ücretlerine tabi olabilir.")'],
    ['new module$exports$vscode.TreeItem("Enable API")', 'new module$exports$vscode.TreeItem("API\'yi Etkinleştir")'],
    ['new module$exports$vscode.TreeItem("Switch projects")', 'new module$exports$vscode.TreeItem("Proje Değiştir")'],
    ['new module$exports$vscode.TreeItem("Unknown item")', 'new module$exports$vscode.TreeItem("Bilinmeyen öğe")'],
    ['new module$exports$vscode.TreeItem("Unknown",', 'new module$exports$vscode.TreeItem("Bilinmeyen",'],
    ['new module$exports$vscode.TreeItem("View Dataflow Jobs")', 'new module$exports$vscode.TreeItem("Dataflow İşlerini Görüntüle")'],
    ['new module$exports$vscode.TreeItem("Universal Search",', 'new module$exports$vscode.TreeItem("Evrensel Arama",'],
    ['new module$exports$vscode.TreeItem("Error loading items",', 'new module$exports$vscode.TreeItem("Öğeler yüklenirken hata oluştu",'],
    ['new module$exports$vscode.TreeItem("Initialize Orchestration Pipeline")', 'new module$exports$vscode.TreeItem("Orkestrasyon İşlem Hattını Başlat")'],
    ['LOAD_MORE_LABEL="Load more"', 'LOAD_MORE_LABEL="Daha Fazla Yükle"'],
    ['LOAD_MORE_LABEL:"Load more"', 'LOAD_MORE_LABEL:"Daha Fazla Yükle"'],
    ['LOADING_LABEL="Loading..."', 'LOADING_LABEL="Yükleniyor..."'],
    ['LOADING_LABEL:"Loading..."', 'LOADING_LABEL:"Yükleniyor..."'],
    ['ORCHESTRATION_PIPELINES_LABEL="Orchestration Pipelines"', 'ORCHESTRATION_PIPELINES_LABEL="Orkestrasyon İşlem Hatları"'],
    ['DEPLOYMENT_CONFIGURATION_LABEL="Deployment configuration"', 'DEPLOYMENT_CONFIGURATION_LABEL="Dağıtım Yapılandırması"'],
    ['PIPELINES_MANAGEMENT_LABEL="Pipelines management"', 'PIPELINES_MANAGEMENT_LABEL="İşlem Hattı Yönetimi"'],
    ['NEW_SPARK_NOTEBOOK_LABEL:"New Spark Notebook"', 'NEW_SPARK_NOTEBOOK_LABEL:"Yeni Spark Not Defteri"'],
    ['NEW_SPARK_QUERY_LABEL:"New Spark Query"', 'NEW_SPARK_QUERY_LABEL:"Yeni Spark Sorgusu"'],
    ['SERVERLESS_LABEL:"Serverless"', 'SERVERLESS_LABEL:"Sunucusuz (Serverless)"'],
    ['CLUSTERS_LABEL:"Clusters"', 'CLUSTERS_LABEL:"Kümeler"'],
    ['NEW_RUNTIME_LABEL:"New Runtime"', 'NEW_RUNTIME_LABEL:"Yeni Çalışma Zamanı"'],
    ['SERVERLESS_RUNTIME_LABEL:"Serverless Runtime"', 'SERVERLESS_RUNTIME_LABEL:"Sunucusuz Çalışma Zamanı"'],
    ['NO_JOBS_FOUND_LABEL:"No jobs to display"', 'NO_JOBS_FOUND_LABEL:"Görüntülenecek iş yok"'],
    ['START_WITH_NEW_NOTEBOOK_LABEL:"Start with a new notebook"', 'START_WITH_NEW_NOTEBOOK_LABEL:"Yeni bir not defteriyle başla"'],
    ['START_WITH_SAMPLE_NOTEBOOK_LABEL:"Start with a sample notebook"', 'START_WITH_SAMPLE_NOTEBOOK_LABEL:"Örnek bir not defteriyle başla"'],
    ['LOCAL_KERNEL_LABEL:"Local Kernel"', 'LOCAL_KERNEL_LABEL:"Yerel Çekirdek (Local Kernel)"'],
    ['REMOTE_KERNEL_LABEL:"Remote Kernel"', 'REMOTE_KERNEL_LABEL:"Uzak Çekirdek (Remote Kernel)"'],
    ['SELECT_KERNEL_TYPE_PLACEHOLDER:"Select kernel type"', 'SELECT_KERNEL_TYPE_PLACEHOLDER:"Çekirdek türünü seçin"'],
    ['SELECT_NOTEBOOK_TYPE_PLACEHOLDER:"Create a new notebook or start with a sample"', 'SELECT_NOTEBOOK_TYPE_PLACEHOLDER:"Yeni bir not defteri oluşturun veya bir örnekle başlayın"'],
    ['SELECT_SAMPLE_NOTEBOOK_PLACEHOLDER:"Select a sample notebook"', 'SELECT_SAMPLE_NOTEBOOK_PLACEHOLDER:"Örnek bir not defteri seçin"'],
    ['CREATE_NEW_RUNTIME_TEMPLATE_LABEL="Create a new Runtime Template"', 'CREATE_NEW_RUNTIME_TEMPLATE_LABEL="Yeni bir Çalışma Zamanı Şablonu oluştur"'],
    ['CONTINUE_WITHOUT_RUNTIME_TEMPLATE_LABEL="Continue without Runtime Template"', 'CONTINUE_WITHOUT_RUNTIME_TEMPLATE_LABEL="Çalışma Zamanı Şablonu olmadan devam et"'],
    ['CREATE_NEW_GCP_PROJECT_QUICKPICK_LABEL="$(add) Create a New Google Cloud Project"', 'CREATE_NEW_GCP_PROJECT_QUICKPICK_LABEL="$(add) Yeni bir Google Cloud Projesi Oluştur"'],
    ['REFRESH_QUICKPICK_LABEL="$(refresh) Refresh"', 'REFRESH_QUICKPICK_LABEL="$(refresh) Yenile"'],
    ['LOAD_MORE_QUICKPICK_LABEL="Load more"', 'LOAD_MORE_QUICKPICK_LABEL="Daha Fazla Yükle"'],
    ['REMOVE_FROM_RECENTS_LABEL:"Remove from Recents"', 'REMOVE_FROM_RECENTS_LABEL:"Son Kullanılanlardan Kaldır"'],
    ['INSTALL_DEPENDENCIES_COMMAND_LABEL:"Install dependencies for Remote Spark Kernels"', 'INSTALL_DEPENDENCIES_COMMAND_LABEL:"Uzak Spark Çekirdekleri için bağımlılıkları yükle"'],
    ['GHOST_NODE_CLICK_TO_ENABLE:"(Click to enable)"', 'GHOST_NODE_CLICK_TO_ENABLE:"(Etkinleştirmek için tıklayın)"'],
    ['GHOST_NODE_PERMISSION_REQUIRED:"(Permission required)"', 'GHOST_NODE_PERMISSION_REQUIRED:"(İzin gerekli)"'],
    ['GHOST_NODE_PERMISSION_REQUIRED_LABEL:"Permission required"', 'GHOST_NODE_PERMISSION_REQUIRED_LABEL:"İzin gerekli"'],
    ['GHOST_NODE_CLICK_TO_REQUEST_ACCESS:"(Click to see details)"', 'GHOST_NODE_CLICK_TO_REQUEST_ACCESS:"(Ayrıntıları görmek için tıklayın)"'],
    ['GHOST_NODE_GENERIC_API_DISABLED_LABEL:"API disabled"', 'GHOST_NODE_GENERIC_API_DISABLED_LABEL:"API devre dışı"'],
    ['GHOST_NODE_BIGQUERY_API_DISABLED_LABEL:"BigQuery API disabled"', 'GHOST_NODE_BIGQUERY_API_DISABLED_LABEL:"BigQuery API devre dışı"'],
    ['GHOST_NODE_CLOUDSQL_API_DISABLED_LABEL:"Cloud SQL Admin API disabled"', 'GHOST_NODE_CLOUDSQL_API_DISABLED_LABEL:"Cloud SQL Admin API devre dışı"'],
    ['GHOST_NODE_ALLOYDB_API_DISABLED_LABEL:"AlloyDB API disabled"', 'GHOST_NODE_ALLOYDB_API_DISABLED_LABEL:"AlloyDB API devre dışı"'],
    ['GHOST_NODE_SPANNER_API_DISABLED_LABEL:"Spanner API disabled"', 'GHOST_NODE_SPANNER_API_DISABLED_LABEL:"Spanner API devre dışı"'],
    ['GHOST_NODE_FIRESTORE_API_DISABLED_LABEL:"Firestore API disabled"', 'GHOST_NODE_FIRESTORE_API_DISABLED_LABEL:"Firestore API devre dışı"'],
    ['GHOST_NODE_DATAPLEX_API_DISABLED_LABEL:"Dataplex API disabled"', 'GHOST_NODE_DATAPLEX_API_DISABLED_LABEL:"Dataplex API devre dışı"'],
    ['GHOST_NODE_DATA_TRANSFER_API_DISABLED_LABEL:"Data Transfer API disabled"', 'GHOST_NODE_DATA_TRANSFER_API_DISABLED_LABEL:"Veri Aktarımı API devre dışı"'],
    ['GHOST_NODE_LAKEHOUSE_API_DISABLED_LABEL:"Lakehouse API disabled"', 'GHOST_NODE_LAKEHOUSE_API_DISABLED_LABEL:"Lakehouse API devre dışı"'],
    ['GHOST_NODE_STORAGE_API_DISABLED_LABEL:"Storage API disabled"', 'GHOST_NODE_STORAGE_API_DISABLED_LABEL:"Depolama API devre dışı"'],
    ['GHOST_NODE_BILLING_PROJECT_REQUIRED_LABEL:"Billing project required"', 'GHOST_NODE_BILLING_PROJECT_REQUIRED_LABEL:"Faturalandırma projesi gerekli"'],
    ['GHOST_NODE_CLICK_TO_CONFIGURE:"(Click to configure)"', 'GHOST_NODE_CLICK_TO_CONFIGURE:"(Yapılandırmak için tıklayın)"'],
    ['SETTINGS_PANEL_TITLE="Data Cloud Settings"', 'SETTINGS_PANEL_TITLE="Data Cloud Ayarları"'],
    ['SKILLS_PANEL_TITLE="Data Cloud Skills"', 'SKILLS_PANEL_TITLE="Data Cloud Becerileri"'],
    ['FOLDERS:{TABLES:"Tables",VIEWS:"Views",MODELS:"Models",GRAPHS:"Property Graphs",CHANGE_STREAMS:"Change Streams"}', 'FOLDERS:{TABLES:"Tablolar",VIEWS:"Görünümler",MODELS:"Modeller",GRAPHS:"Özellik Grafikleri",CHANGE_STREAMS:"Değişiklik Akışları"}'],
    ['DATAPLEX:"Data Products"', 'DATAPLEX:"Veri Ürünleri"'],
    ['{label:"Home",icon:"home",tooltip:"Active experiments, recent runs, and registered models"}', '{label:"Ana Sayfa",icon:"home",tooltip:"Etkin deneyler, son çalıştırmalar ve kayıtlı modeller"}'],
    ['{label:"Experiments",icon:"beaker",tooltip:"Browse experiments and their runs"}', '{label:"Deneyler",icon:"beaker",tooltip:"Deneylere ve çalıştırmalarına göz atın"}'],
    ['{label:"Model registry",icon:"package",tooltip:"Browse registered models and logged models"}', '{label:"Model Kayıt Defteri",icon:"package",tooltip:"Kayıtlı modellere ve günlüğe kaydedilen modellere göz atın"}'],
    ['label:"CATALOG"', 'label:"KATALOG"'],
    ['label:"CLOUD STORAGE"', 'label:"BULUT DEPOLAMA"'],
    ['label:"DATABASES"', 'label:"VERİTABANLARI"'],
    ['label:"DATA ENGINEERING"', 'label:"VERİ MÜHENDİSLİĞİ"'],
    ['label:"SETTINGS"', 'label:"AYARLAR"'],
    ['label:"Recent Connections"', 'label:"Son Bağlantılar"'],
    ['tooltip:"Remove from recent connections"', 'tooltip:"Son bağlantılardan kaldır"'],
    ['.tooltip="Authenticating with Google..."', '.tooltip="Google ile kimlik doğrulanıyor..."'],
    ['.tooltip="Sign in to Google"', '.tooltip="Google\'da oturum açın"'],
    ['.tooltip="Click to select a data source"', '.tooltip="Bir veri kaynağı seçmek için tıklayın"'],
    ['.tooltip="View table details"', '.tooltip="Tablo ayrıntılarını görüntüle"'],
    ['.description="(Click to enable)"', '.description="(Etkinleştirmek için tıklayın)"'],
    ['.title="Select Database Service"', '.title="Veritabanı Hizmeti Seçin"'],
    ['.title="Select Category"', '.title="Kategori Seçin"'],
    ['.title="Select AlloyDB Cluster"', '.title="AlloyDB Kümesi Seçin"'],
    ['.title="Select Spanner Instance"', '.title="Spanner Örneği Seçin"'],
    ['.title="Select AlloyDB Instance"', '.title="AlloyDB Örneği Seçin"'],
    ['.title= "Select AlloyDB Instance"', '.title= "AlloyDB Örneği Seçin"'],
    ['.title="Select Cloud SQL Instance"', '.title="Cloud SQL Örneği Seçin"'],
    ['.title="Select Bigtable Instance"', '.title="Bigtable Örneği Seçin"'],
    ['.title= "Select Bigtable Instance"', '.title= "Bigtable Örneği Seçin"'],
    ['.title="Select Spanner Database"', '.title="Spanner Veritabanı Seçin"'],
    ['.title="Select AlloyDB Database"', '.title="AlloyDB Veritabanı Seçin"'],
    ['.title="Select Cloud SQL Database"', '.title="Cloud SQL Veritabanı Seçin"'],
    ['.title="Select Firestore Enterprise Database"', '.title="Firestore Enterprise Veritabanı Seçin"'],
    ['.title="Select Bigtable App Profile"', '.title="Bigtable Uygulama Profili Seçin"'],
    ['title:"Enable API"', 'title:"API\'yi Etkinleştir"'],
    ['title:"Copy gcloud Command"', 'title:"gcloud Komutunu Kopyala"'],
    ['title:"Open APIs & Services Dashboard"', 'title:"API\'ler ve Hizmetler Panosunu Aç"'],
    ['title:"Open Policy Troubleshooter"', 'title:"Politika Sorun Gidericisini Aç"'],
    ['title:"Copy Permission Details"', 'title:"İzin Ayrıntılarını Kopyala"'],
    ['title:"Set / Switch Quota Project"', 'title:"Kota Projesini Ayarla / Değiştir"'],
    ['title:"Sign In / Re-authenticate"', 'title:"Oturum Aç / Yeniden Doğrula"'],
    ['title:"View Quotas in Cloud Console"', 'title:"Kotaları Cloud Console\'da Görüntüle"'],
    ['title:"Open Query Settings"', 'title:"Sorgu Ayarlarını Aç"'],
    ['title:"Open Data Transfer Details"', 'title:"Veri Aktarımı Ayrıntılarını Aç"'],
    ['title:"Open Job Details"', 'title:"İş Ayrıntılarını Aç"'],
    ['title:"Open Query"', 'title:"Sorguyu Aç"'],
    ['title:"Provide Feedback"', 'title:"Geri Bildirimde Bulun"'],
    ['title:"Open Experiments"', 'title:"Deneyleri Aç"'],
    ['title:"Create a project"', 'title:"Bir proje oluştur"'],
    ['title:"Switch projects"', 'title:"Proje değiştir"'],
    ['title:"Select services"', 'title:"Hizmetleri seç"'],
    ['title:"Save query"', 'title:"Sorguyu kaydet"'],
    ['title:"Compiled Query"', 'title:"Derlenmiş Sorgu"'],
    ['title:"Runs History"', 'title:"Çalıştırma Geçmişi"'],
    ['title:"Deployment Configuration"', 'title:"Dağıtım Yapılandırması"'],
    ['title:"Pipelines Management"', 'title:"İşlem Hattı Yönetimi"'],
    ['title:"Orchestration Pipeline"', 'title:"Orkestrasyon İşlem Hattı"'],
    ['title:"Pipeline Details"', 'title:"İşlem Hattı Ayrıntıları"'],
    ['title:"Initialize Orchestration Pipeline"', 'title:"Orkestrasyon İşlem Hattını Başlat"'],
    ['title:"Deploy Configuration"', 'title:"Yapılandırmayı Dağıt"'],
    ['title:"Show DAG"', 'title:"DAG\'ı Göster"'],
    ['title:"Data transfer details"', 'title:"Veri aktarımı ayrıntıları"'],
    ['title:"Rename saved query"', 'title:"Kayıtlı sorguyu yeniden adlandır"'],
    ['title:"Create Scheduled Job"', 'title:"Zamanlanmış İş Oluştur"'],
    ['title:"View Dataflow Jobs"', 'title:"Dataflow İşlerini Görüntüle"'],
    ['title:"Open Details"', 'title:"Ayrıntıları Aç"'],
    ['title:"Universal Search"', 'title:"Evrensel Arama"'],
    ['title:"Job Details"', 'title:"İş Ayrıntıları"'],
    ['title:"Interactive Session Details"', 'title:"Etkileşimli Oturum Ayrıntıları"'],
    ['title:"Open Cloud Storage File"', 'title:"Bulut Depolama Dosyasını Aç"'],
    ['title:"Catalog Details"', 'title:"Katalog Ayrıntıları"'],
    ['title:"Select file to upload"', 'title:"Yüklenecek dosyayı seçin"'],
    ['title:"Confirm Cell Execution"', 'title:"Hücre Yürütmeyi Onayla"'],
    ['title:"Google Cloud Data Agent Kit Onboarding"', 'title:"Google Cloud Veri Ajanı Kiti Başlangıç"'],
    ['title:"Missing permissions"', 'title:"Eksik izinler"'],
    ['title:"MCP Configuration"', 'title:"MCP Yapılandırması"'],
    ['title:"SQL Query Results"', 'title:"SQL Sorgu Sonuçları"'],
    ['title:"$(circle-slash) No Spark session"', 'title:"$(circle-slash) Spark oturumu yok"'],
    ['title:"$(sync~spin) Validating query..."', 'title:"$(sync~spin) Sorgu doğrulanıyor..."'],
    ['tooltip:"No active Spark session for this editor\\nClick to configure query settings"', 'tooltip:"Bu düzenleyici için etkin Spark oturumu yok\\nSorgu ayarlarını yapılandırmak için tıklayın"']
  ];

  const pkgReplacements = [
    ['"title": "Databases"', '"title": "Veritabanları"'],
    ['"title": "Data Engineering"', '"title": "Veri Mühendisliği"'],
    ['"title": "Catalog"', '"title": "Katalog"'],
    ['"title": "Compiled Query"', '"title": "Derlenmiş Sorgu"'],
    ['"title": "Runs History"', '"title": "Çalıştırma Geçmişi"'],
    ['"title": "Query Results"', '"title": "Sorgu Sonuçları"'],
    ['"title": "Orchestration Pipeline Runs History"', '"title": "Orkestrasyon İşlem Hattı Çalıştırma Geçmişi"'],
    ['"title": "Managed Apache Spark"', '"title": "Yönetilen Apache Spark"'],
    ['"title": "Managed Service for Apache Spark"', '"title": "Yönetilen Apache Spark"'],
    ['"title": "Cloud Storage"', '"title": "Bulut Depolama"'],
    ['"title": "Google Cloud Data Agent Kit"', '"title": "Google Cloud Veri Ajanı Kiti"'],
    ['"category": "Google Cloud Data Agent Kit"', '"category": "Google Cloud Veri Ajanı Kiti"'],
    ['"name": "Catalog"', '"name": "Katalog"'],
    ['"name": "Databases"', '"name": "Veritabanları"'],
    ['"name": "Data Engineering"', '"name": "Veri Mühendisliği"'],
    ['"name": "Compiled Query"', '"name": "Derlenmiş Sorgu"'],
    ['"name": "Runs History"', '"name": "Çalıştırma Geçmişi"'],
    ['"name": "Query Results"', '"name": "Sorgu Sonuçları"'],
    ['"name": "General"', '"name": "Genel"'],
    ['"name": "Managed Service for Apache Airflow Runs History"', '"name": "Managed Service for Apache Airflow Çalıştırma Geçmişi"'],
    ['"name": "Managed Apache Spark"', '"name": "Yönetilen Apache Spark"'],
    ['"name": "Managed Service for Apache Spark"', '"name": "Yönetilen Apache Spark"'],
    ['"name": "Cloud Storage"', '"name": "Bulut Depolama"'],
    ['"contextualTitle": "Cloud Storage"', '"contextualTitle": "Bulut Depolama"'],
    ['"name": "Google Cloud Data Agent Kit"', '"name": "Google Cloud Veri Ajanı Kiti"'],
    // Komut başlıkları ve satır içi aksiyon butonları (hover/context menu)
    ['"title": "Sync Config from Extension to Google Cloud CLI"', '"title": "Yapılandırmayı Eklentiden Google Cloud CLI\'ya Eşitle"'],
    ['"title": "Sync Config from Google Cloud CLI to Extension"', '"title": "Yapılandırmayı Google Cloud CLI\'dan Eklentiye Eşitle"'],
    ['"title": "Cloud Storage > Filter"', '"title": "Bulut Depolama > Filtrele"'],
    ['"title": "Cloud Storage > Filter (Active)"', '"title": "Bulut Depolama > Filtrele (Etkin)"'],
    ['"title": "Pin Settings"', '"title": "Ayarları Sabitle"'],
    ['"title": "Unpin Settings"', '"title": "Ayarların Sabitlemesini Kaldır"'],
    ['"title": "Switch to Catalog"', '"title": "Kataloğa Geç"'],
    ['"title": "Switch to Cloud Storage"', '"title": "Bulut Depolama\'ya Geç"'],
    ['"title": "Switch to BigQuery"', '"title": "BigQuery\'ye Geç"'],
    ['"title": "Switch to Spark"', '"title": "Spark\'a Geç"'],
    ['"title": "Switch to Pipelines"', '"title": "İşlem Hatlarına Geç"'],
    ['"title": "Switch to Databases"', '"title": "Veritabanlarına Geç"'],
    ['"title": "Switch to MLflow"', '"title": "MLflow\'a Geç"'],
    ['"title": "Sign in"', '"title": "Oturum Aç"'],
    ['"title": "Sign out"', '"title": "Oturumu Kapat"'],
    ['"title": "BigQuery Dataform > Initialize a new project"', '"title": "BigQuery Dataform > Yeni proje başlat"'],
    ['"title": "BigQuery Dataform > Compile the project"', '"title": "BigQuery Dataform > Projeyi derle"'],
    ['"title": "BigQuery Dataform > Run multiple actions"', '"title": "BigQuery Dataform > Birden çok eylemi çalıştır"'],
    ['"title": "BigQuery Dataform > Run tags"', '"title": "BigQuery Dataform > Etiketleri çalıştır"'],
    ['"title": "Schedule"', '"title": "Zamanla"'],
    ['"title": "BigQuery Dataform > Run"', '"title": "BigQuery Dataform > Çalıştır"'],
    ['"title": "BigQuery > Open Table Details"', '"title": "BigQuery > Tablo Ayrıntılarını Aç"'],
    ['"title": "Cloud Storage > Refresh"', '"title": "Bulut Depolama > Yenile"'],
    ['"title": "Refresh Spark Resource Tree"', '"title": "Spark Kaynak Ağacını Yenile"'],
    ['"title": "Refresh"', '"title": "Yenile"'],
    ['"title": "Refresh Catalog"', '"title": "Kataloğu Yenile"'],
    ['"title": "Refresh Orchestration Pipelines"', '"title": "Orkestrasyon İşlem Hatlarını Yenile"'],
    ['"title": "Refresh BigQuery"', '"title": "BigQuery\'yi Yenile"'],
    ['"title": "Refresh Jobs"', '"title": "İşleri Yenile"'],
    ['"title": "Refresh Saved Queries"', '"title": "Kayıtlı Sorguları Yenile"'],
    ['"title": "Refresh Data Transfers"', '"title": "Veri Aktarımlarını Yenile"'],
    ['"title": "Rename"', '"title": "Yeniden Adlandır"'],
    ['"title": "Download"', '"title": "İndir"'],
    ['"title": "Delete"', '"title": "Sil"'],
    ['"title": "Data Cloud Settings"', '"title": "Data Cloud Ayarları"'],
    ['"title": "MCP Configuration"', '"title": "MCP Yapılandırması"'],
    ['"title": "Data Cloud Scheduler Settings"', '"title": "Data Cloud Zamanlayıcı Ayarları"'],
    ['"title": "Data Cloud Experiments"', '"title": "Data Cloud Deneyleri"'],
    ['"title": "Quick Start Guide"', '"title": "Hızlı Başlangıç Kılavuzu"'],
    ['"title": "BigQuery Dataform > Open Graph View"', '"title": "BigQuery Dataform > Grafik Görünümünü Aç"'],
    ['"title": "BigQuery Orchestration Pipeline > Show DAG"', '"title": "BigQuery Orkestrasyon İşlem Hattı > DAG\'ı Göster"'],
    ['"title": "Learn more about Orchestration Pipelines"', '"title": "Orkestrasyon İşlem Hatları hakkında daha fazla bilgi edinin"'],
    ['"title": "BigQuery Orchestration Pipeline > Pipeline Management"', '"title": "BigQuery Orkestrasyon İşlem Hattı > İşlem Hattı Yönetimi"'],
    ['"title": "BigQuery Orchestration Pipeline > Initialize"', '"title": "BigQuery Orkestrasyon İşlem Hattı > Başlat"'],
    ['"title": "BigQuery Orchestration Pipeline > Add task"', '"title": "BigQuery Orkestrasyon İşlem Hattı > Görev ekle"'],
    ['"title": "BigQuery Orchestration Pipeline > Delete task"', '"title": "BigQuery Orkestrasyon İşlem Hattı > Görevi sil"'],
    ['"title": "Submit Job"', '"title": "İş Gönder"'],
    ['"title": "Managed Apache Spark > Submit Job"', '"title": "Yönetilen Apache Spark > İş Gönder"'],
    ['"title": "Jobs"', '"title": "İşler"'],
    ['"title": "Spark UI"', '"title": "Spark Arayüzü"'],
    ['"title": "Open MLflow UI"', '"title": "MLflow Arayüzünü Aç"'],
    ['"title": "Stop"', '"title": "Durdur"'],
    ['"title": "Start"', '"title": "Başlat"'],
    ['"title": "Restart"', '"title": "Yeniden Başlat"'],
    ['"title": "Chat"', '"title": "Sohbet"'],
    ['"title": "Run Diagnostics"', '"title": "Tanılamayı Çalıştır"'],
    ['"title": "Profile"', '"title": "Profil"'],
    ['"title": "Dataflow > List Jobs"', '"title": "Dataflow > İşleri Listele"'],
    ['"title": "Managed Apache Spark > List Clusters"', '"title": "Yönetilen Apache Spark > Kümeleri Listele"'],
    ['"title": "List Clusters"', '"title": "Kümeleri Listele"'],
    ['"title": "Refresh Spark Resource Tree > Clusters"', '"title": "Spark Kaynak Ağacını Yenile > Kümeler"'],
    ['"title": "Refresh Spark Resource Tree > Serverless"', '"title": "Spark Kaynak Ağacını Yenile > Sunucusuz"'],
    ['"title": "Serverless Spark > Find Runtime"', '"title": "Sunucusuz Spark > Çalışma Zamanı Bul"'],
    ['"title": "Managed Apache Spark > Find Cluster"', '"title": "Yönetilen Apache Spark > Küme Bul"'],
    ['"title": "Serverless Spark > List Runtimes"', '"title": "Sunucusuz Spark > Çalışma Zamanlarını Listele"'],
    ['"title": "List Serverless Runtimes"', '"title": "Sunucusuz Çalışma Zamanlarını Listele"'],
    ['"title": "New Notebook"', '"title": "Yeni Not Defteri"'],
    ['"title": "New Query"', '"title": "Yeni Sorgu"'],
    ['"title": "Interactive Sessions"', '"title": "Etkileşimli Oturumlar"'],
    ['"title": "Interactive Session Details"', '"title": "Etkileşimli Oturum Ayrıntıları"'],
    ['"title": "Job Details"', '"title": "İş Ayrıntıları"'],
    ['"title": "Cloud Storage > Open File"', '"title": "Bulut Depolama > Dosya Aç"'],
    ['"title": "Cloud Storage > Copy Path"', '"title": "Bulut Depolama > Yolu Kopyala"'],
    ['"title": "Cloud Storage > Rename File"', '"title": "Bulut Depolama > Dosyayı Yeniden Adlandır"'],
    ['"title": "Cloud Storage > Delete File"', '"title": "Bulut Depolama > Dosyayı Sil"'],
    ['"title": "Cloud Storage > Download File"', '"title": "Bulut Depolama > Dosyayı İndir"'],
    ['"title": "Cloud Storage > Create Folder"', '"title": "Bulut Depolama > Klasör Oluştur"'],
    ['"title": "Cloud Storage > Upload File"', '"title": "Bulut Depolama > Dosya Yükle"'],
    ['"title": "Cloud Storage > Rename Folder"', '"title": "Bulut Depolama > Klasörü Yeniden Adlandır"'],
    ['"title": "Cloud Storage > Delete Folder"', '"title": "Bulut Depolama > Klasörü Sil"'],
    ['"title": "Cloud Storage > Create Bucket"', '"title": "Bulut Depolama > Paket (Bucket) Oluştur"'],
    ['"title": "Cloud Storage > Load in Spark DataFrame"', '"title": "Bulut Depolama > Spark DataFrame\'e Yükle"'],
    ['"title": "Install the toolbox in all supported surfaces"', '"title": "Araç kutusunu desteklenen tüm yüzeylere yükle"'],
    ['"title": "Install Agent Skills Globally"', '"title": "Ajan Becerilerini Genel Olarak Yükle"'],
    ['"title": "Install Agent Skills to Workspace"', '"title": "Ajan Becerilerini Çalışma Alanına Yükle"'],
    ['"title": "Uninstall Agent Skills Globally"', '"title": "Ajan Becerilerini Genel Olarak Kaldır"'],
    ['"title": "Uninstall Agent Skills from Workspace"', '"title": "Ajan Becerilerini Çalışma Alanından Kaldır"'],
    ['"title": "Install Data Agent Kit Plugin for Antigravity"', '"title": "Antigravity için Veri Ajanı Kiti Eklentisini Yükle"'],
    ['"title": "Reset Data Agent Kit Plugin for Antigravity State"', '"title": "Antigravity için Veri Ajanı Kiti Eklentisi Durumunu Sıfırla"'],
    ['"title": "Conversational Analytics > Chat with Table"', '"title": "Konuşmaya Dayalı Analiz > Tablo ile Sohbet Et"'],
    ['"title": "Conversational Analytics > Chat with Dataset"', '"title": "Konuşmaya Dayalı Analiz > Veri Kümesi ile Sohbet Et"'],
    ['"title": "View Agent Skills"', '"title": "Ajan Becerilerini Görüntüle"'],
    ['"title": "BigQuery > New Notebook"', '"title": "BigQuery > Yeni Not Defteri"'],
    ['"title": "BigQuery > New Notebook > New"', '"title": "BigQuery > Yeni Not Defteri > Yeni"'],
    ['"title": "BigQuery > New Notebook > Start with template"', '"title": "BigQuery > Yeni Not Defteri > Şablonla başla"'],
    ['"title": "Run Query"', '"title": "Sorguyu Çalıştır"'],
    ['"title": "Cancel Query"', '"title": "Sorguyu İptal Et"'],
    ['"title": "Query is running"', '"title": "Sorgu çalışıyor"'],
    ['"title": "Universal Search"', '"title": "Evrensel Arama"'],
    ['"title": "Search for Dataset"', '"title": "Veri Kümesi Ara"'],
    ['"title": "Search in Project"', '"title": "Projede Ara"'],
    ['"title": "Find in Lakehouse"', '"title": "Lakehouse\'da Bul"'],
    ['"title": "Find in Lakehouse Catalog"', '"title": "Lakehouse Kataloğunda Bul"'],
    ['"title": "Find in Lakehouse Namespace"', '"title": "Lakehouse Ad Alanında Bul"'],
    ['"title": "Search in BigQuery"', '"title": "BigQuery\'de Ara"'],
    ['"title": "Search in Dataset"', '"title": "Veri Kümesinde Ara"'],
    ['"title": "Search in Spanner"', '"title": "Spanner\'da Ara"'],
    ['"title": "Search in Instance"', '"title": "Örnekte Ara"'],
    ['"title": "Search in Database"', '"title": "Veritabanında Ara"'],
    ['"title": "Search in AlloyDB"', '"title": "AlloyDB\'de Ara"'],
    ['"title": "Search in AlloyDB Cluster"', '"title": "AlloyDB Kümesinde Ara"'],
    ['"title": "Search in AlloyDB Database"', '"title": "AlloyDB Veritabanında Ara"'],
    ['"title": "Search in AlloyDB Schema"', '"title": "AlloyDB Şemasında Ara"'],
    ['"title": "Search in Cloud SQL"', '"title": "Cloud SQL\'de Ara"'],
    ['"title": "Search in Cloud SQL Instance"', '"title": "Cloud SQL Örneğinde Ara"'],
    ['"title": "Search in Cloud SQL Database"', '"title": "Cloud SQL Veritabanında Ara"'],
    ['"title": "Search in Cloud SQL Schema"', '"title": "Cloud SQL Şemasında Ara"'],
    ['"title": "BigQuery Orchestration Pipeline > Deployment configuration"', '"title": "BigQuery Orkestrasyon İşlem Hattı > Dağıtım yapılandırması"'],
    ['"title": "BigQuery Orchestration Pipeline > Create New Pipeline"', '"title": "BigQuery Orkestrasyon İşlem Hattı > Yeni İşlem Hattı Oluştur"'],
    ['"title": "Add BigQuery SQL Cell"', '"title": "BigQuery SQL Hücresi Ekle"'],
    ['"title": "New Spark Notebook"', '"title": "Yeni Spark Not Defteri"'],
    ['"title": "New Spark Query"', '"title": "Yeni Spark Sorgusu"'],
    ['"title": "Query"', '"title": "Sorgula"'],
    ['"title": "Query with BigQuery"', '"title": "BigQuery ile Sorgula"'],
    ['"title": "Query with Spark"', '"title": "Spark ile Sorgula"'],
    ['"title": "Only Firestore Enterprise Edition databases can be queried"', '"title": "Yalnızca Firestore Enterprise Edition veritabanları sorgulanabilir"'],
    ['"title": "Dataplex > Reveal resource by path"', '"title": "Dataplex > Kaynağı yola göre göster"'],
    ['"title": "Load in BigQuery DataFrame"', '"title": "BigQuery DataFrame\'e Yükle"'],
    ['"title": "Load in Pandas DataFrame"', '"title": "Pandas DataFrame\'e Yükle"'],
    ['"title": "Load in Spark DataFrame"', '"title": "Spark DataFrame\'e Yükle"'],
    ['"title": "Open resource details"', '"title": "Kaynak ayrıntılarını aç"'],
    ['"title": "Copy resource ID"', '"title": "Kaynak kimliğini kopyala"'],
    ['"title": "Show Onboarding"', '"title": "Başlangıç Kılavuzunu Göster"'],
    ['"title": "Select Services"', '"title": "Hizmetleri Seç"'],
    ['"title": "Reset Onboarding"', '"title": "Başlangıç Kılavuzunu Sıfırla"'],
    ['"title": "Insert into editor"', '"title": "Düzenleyiciye ekle"'],
    ['"title": "Enable"', '"title": "Etkinleştir"'],
    ['"title": "Disable"', '"title": "Devre Dışı Bırak"'],
    ['"title": "New Bigtable Query"', '"title": "Yeni Bigtable Sorgusu"'],
    ['"title": "New Spanner Query"', '"title": "Yeni Spanner Sorgusu"'],
    ['"title": "New AlloyDB Query"', '"title": "Yeni AlloyDB Sorgusu"'],
    ['"title": "New Cloud SQL Query"', '"title": "Yeni Cloud SQL Sorgusu"'],
    ['"title": "New Firestore Query"', '"title": "Yeni Firestore Sorgusu"'],
    ['"title": "New BigQuery Query"', '"title": "Yeni BigQuery Sorgusu"'],
    ['"title": "Open Query Settings"', '"title": "Sorgu Ayarlarını Aç"'],
    ['"title": "Open BigQuery Query Settings"', '"title": "BigQuery Sorgu Ayarlarını Aç"'],
    ['"title": "Open Bigtable Query Settings"', '"title": "Bigtable Sorgu Ayarlarını Aç"'],
    ['"title": "Open Spanner Query Settings"', '"title": "Spanner Sorgu Ayarlarını Aç"'],
    ['"title": "Open AlloyDB Query Settings"', '"title": "AlloyDB Sorgu Ayarlarını Aç"'],
    ['"title": "Open Cloud SQL Query Settings"', '"title": "Cloud SQL Sorgu Ayarlarını Aç"'],
    ['"title": "Provide Feedback / Report Issue"', '"title": "Geri Bildirimde Bulun / Sorun Bildir"']
  ];

  jsReplacements.push(['.tooltip="Database"', '.tooltip="Veritabanı"']);

  for (const dcDir of dcDirs) {
    const jsFile = path.join(dcDir, 'datacloud_vscode.js');
    if (fs.existsSync(jsFile)) {
      try {
        try { fs.chmodSync(jsFile, 0o666); } catch (e) {}
        let c = fs.readFileSync(jsFile, 'utf8');
        const splitIdx = c.indexOf('google3$cloud$developer_experience$datacloud_vscode');
        if (splitIdx !== -1) {
          let head = c.slice(0, splitIdx);
          let tail = c.slice(splitIdx);
          for (const [s, r] of jsReplacements) {
            if (tail.includes(s)) {
              tail = tail.replaceAll(s, r);
            }
          }
          c = head + tail;
        } else {
          for (const [s, r] of jsReplacements) {
            if (c.includes(s)) {
              c = c.replaceAll(s, r);
            }
          }
        }
        fs.writeFileSync(jsFile, c, 'utf8');
      } catch (e) {}
    }

    const pkgFile = path.join(dcDir, 'package.json');
    if (fs.existsSync(pkgFile)) {
      try {
        try { fs.chmodSync(pkgFile, 0o666); } catch (e) {}
        let p = fs.readFileSync(pkgFile, 'utf8');
        for (const [s, r] of pkgReplacements) {
          if (p.includes(s)) {
            p = p.replaceAll(s, r);
          }
        }
        fs.writeFileSync(pkgFile, p, 'utf8');
      } catch (e) {}
    }
  }
}

/**
 * Gömülü WSL uzantısındaki (default distro) metnini yamalar.
 */
function patchWslExtension(paths) {
  if (!paths.ide || !paths.ide.appPath) return;
  const wslFile = path.join(paths.ide.appPath, 'resources', 'app', 'extensions', 'antigravity-remote-wsl', 'dist', 'extension.js');
  if (fs.existsSync(wslFile)) {
    try {
      try { fs.chmodSync(wslFile, 0o666); } catch (e) {}
      let c = fs.readFileSync(wslFile, 'utf8');
      const wslReplacements = [
        ['"default distro"', '"Varsayılan Dağıtım"'],
        ['"Close Remote"', '"Uzak Bağlantıyı Kapat"'],
        ['"Retry"', '"Yeniden Dene"'],
        ['"Select WSL distro"', '"WSL dağıtımı seçin"'],
        ['"Select the WSL distro to install"', '"Yüklenecek WSL dağıtımını seçin"'],
        ['" (Workspace)"', '" (Çalışma Alanı)"'],
      ];
      for (const [en, tr] of wslReplacements) {
        c = c.replaceAll(en, tr);
      }
      fs.writeFileSync(wslFile, c, 'utf8');
    } catch (e) {}
  }
}

function patchClaudeExtension(paths) {
  const dirs = [
    paths.ide?.extensionsDir,
    path.join(require('node:os').homedir(), '.vscode', 'extensions')
  ];
  const replacements = [
    ['Claude Code: Open in New Tab', 'Claude Code: Yeni Sekmede Aç'],
    ['Claude Code: Open in Primary Editor', 'Claude Code: Birincil Düzenleyicide Aç'],
    ['Claude Code: Open in Side Bar', 'Claude Code: Kenar Çubuğunda Aç'],
    ['Claude Code: Open in Terminal', 'Claude Code: Terminalde Aç'],
    ['Claude Code: Open in New Window', 'Claude Code: Yeni Pencerede Aç'],
    ['Claude Code: Open Walkthrough', 'Claude Code: Adım Adım Kılavuzu Aç'],
    ['Claude Code: Aç Walkthrough', 'Claude Code: Adım Adım Kılavuzu Aç'],
    ['Claude Code: Open', 'Claude Code: Aç'],
    ['"Open Claude Code"', '"Claude Code\'u Aç"'],
    ['Claude Code: New Conversation', 'Claude Code: Yeni Konuşma'],
    ['Claude Code: Reopen Closed Session', 'Claude Code: Kapatılan Oturumu Yeniden Aç'],
    ['Claude Code: Accept Proposed Changes', 'Claude Code: Önerilen Değişiklikleri Kabul Et'],
    ['Claude Code: Reject Proposed Changes', 'Claude Code: Önerilen Değişiklikleri Reddet'],
    ['Claude Code: Create Worktree', 'Claude Code: Çalışma Ağacı (Worktree) Oluştur'],
    ['Claude Code: Update extension', 'Claude Code: Uzantıyı Güncelle'],
    ['Claude Code: Focus input', 'Claude Code: Girdiye Odaklan'],
    ['Claude Code: Focus last message', 'Claude Code: Son İletiye Odaklan'],
    ['Claude Code: Blur input', 'Claude Code: Girdi Odağını Kaldır'],
    ['Claude Code: Logout', 'Claude Code: Oturumu Kapat'],
    ['Claude Code: Accept Change at Cursor', 'Claude Code: İmleçteki Değişikliği Kabul Et'],
    ['Claude Code: Reject Change at Cursor', 'Claude Code: İmleçteki Değişikliği Reddet'],
    ['"Accept this change"', '"Bu değişikliği kabul et"'],
    ['"Reject this change"', '"Bu değişikliği reddet"'],
    ['Claude Code: Insert @-Mention Reference', 'Claude Code: @-Bahsetme Başvurusu Ekle'],
    ['Claude Code: Install Plugin', 'Claude Code: Eklenti Yükle'],
    ['Claude Code: Insert At-Mentioned', 'Claude Code: @-Bahsedileni Ekle'],
    ['Claude Code: Show Logs', 'Claude Code: Günlükleri Göster'],
    ['Claude Code: Toggle Focus view', 'Claude Code: Odak Görünümünü Aç/Kapat'],
    ['Claude Code: Mark Session as Unread', 'Claude Code: Oturumu Okunmadı Olarak İşaretle'],
    ['Claude Code: Rename Session Tab', 'Claude Code: Oturum Sekmesini Yeniden Adlandır'],
    ['Claude Code: Add Session Tab to Group', 'Claude Code: Oturum Sekmesini Gruba Ekle']
  ];

  const extJsReplacements = [
    ['.tooltip="Open Claude Code"', '.tooltip="Claude Code\'u Aç"'],
    ['title:"Claude Code launching..."', 'title:"Claude Code başlatılıyor..."'],
    ['title:"Claude Code Execution"', 'title:"Claude Code Yürütmesi"'],
    ['placeHolder:"Choose whether to execute the code"', 'placeHolder:"Kodun çalıştırılıp çalıştırılmayacağını seçin"'],
    ['placeHolder:"Add this session tab to a group"', 'placeHolder:"Bu oturum sekmesini bir gruba ekleyin"'],
    ['title:"Get diagnostics"', 'title:"Tanılamaları al"'],
    ['title:"new tab"', 'title:"yeni sekme"']
  ];

  const webviewReplacements = [
    ['"Open Claude Code"', '"Claude Code\'u Aç"'],
    ['title:"Remove attachment"', 'title:"Eki kaldır"'],
    ['title:"Close preview (Esc)"', 'title:"Önizlemeyi kapat (Esc)"'],
    ['placeholder:"Type your answer…"', 'placeholder:"Yanıtınızı yazın…"'],
    ['title:"Remove comment"', 'title:"Yorumu kaldır"'],
    ['label:"Accept Inline Edit"', 'label:"Satır İçi Düzenlemeyi Kabul Et"'],
    ['label:"Trigger Inline Edit"', 'label:"Satır İçi Düzenlemeyi Tetikle"'],
    ['label:"Jump to Inline Edit"', 'label:"Satır İçi Düzenlemeye Atla"'],
    ['title:"Jump To Edit"', 'title:"Düzenlemeye Atla"'],
    ['label:"Jump Back from Inline Edit"', 'label:"Satır İçi Düzenlemeden Geri Dön"'],
    ['title:"Jump Back"', 'title:"Geri Dön"'],
    ['label:"Reject Inline Edit"', 'label:"Satır İçi Düzenlemeyi Reddet"'],
    ['placeholder:"Describe the change you want..."', 'placeholder:"İstediğiniz değişikliği açıklayın..."'],
    ['title:"Prompt Claude to write code"', 'title:"Claude\'dan kod yazmasını isteyin"'],
    ['title:"Highlight code and ask for edits"', 'title:"Kodu seçin ve düzenleme isteyin"'],
    ['title:"Give Claude rules to remember"', 'title:"Claude\'a hatırlaması için kurallar verin"'],
    ['title:"Let Claude edit without stopping"', 'title:"Claude\'un durmadan düzenleme yapmasına izin verin"'],
    ['title:"Use Plan mode for complex changes"', 'title:"Karmaşık değişiklikler için Plan modunu kullanın"'],
    ['label:"Switch account"', 'label:"Hesap değiştir"'],
    ['label:"Sign out"', 'label:"Oturumu kapat"'],
    ['title:"Copy to clipboard"', 'title:"Panoya kopyala"'],
    ['title:"Use your Claude Pro, Team, or Enterprise subscription"', 'title:"Claude Pro, Team veya Enterprise aboneliğinizi kullanın"'],
    ['title:"Learn Claude Code"', 'title:"Claude Code\'u Öğrenin"'],
    ['"aria-label":"Dismiss"', '"aria-label":"Kapat"'],
    ['label:"Open folder…"', 'label:"Klasör aç…"'],
    ['label:"Continue here"', 'label:"Buradan devam et"'],
    ['title:"Agent map"', 'title:"Ajan haritası"'],
    ['title:"Context usage"', 'title:"Bağlam kullanımı"'],
    ['title:"Memory files"', 'title:"Bellek dosyaları"'],
    ['title:"Custom agents"', 'title:"Özel ajanlar"'],
    ['title:"Side question"', 'title:"Yan soru"'],
    ['placeholder:"Ask a side question"', 'placeholder:"Bir yan soru sorun"'],
    ['"aria-label":"Ask a side question"', '"aria-label":"Bir yan soru sorun"'],
    ['"aria-label":"Send side question"', '"aria-label":"Yan soruyu gönder"'],
    ['title:"Send side question"', 'title:"Yan soruyu gönder"'],
    ['title:"Click or drag to set effort level"', 'title:"Çaba düzeyini ayarlamak için tıklayın veya sürükleyin"'],
    ['"aria-label":"Close banner"', '"aria-label":"Bandı kapat"'],
    ['title:"What went wrong?"', 'title:"Ne ters gitti?"'],
    ['placeholder:"Tell us more (optional)"', 'placeholder:"Bize daha fazla bilgi verin (isteğe bağlı)"'],
    ['label:"Run in background"', 'label:"Arka planda çalıştır"']
  ];

  for (const d of dirs) {
    if (!d || !fs.existsSync(d)) continue;
    try {
      for (const sub of fs.readdirSync(d)) {
        if (sub.startsWith('anthropic.claude-code')) {
          const extDir = path.join(d, sub);
          const pkgPath = path.join(extDir, 'package.json');
          if (fs.existsSync(pkgPath)) {
            try { fs.chmodSync(pkgPath, 0o666); } catch (e) {}
            let content = fs.readFileSync(pkgPath, 'utf8');
            for (const [en, tr] of replacements) {
              content = content.replaceAll(en, tr);
            }
            fs.writeFileSync(pkgPath, content, 'utf8');
          }
          const extJsPath = path.join(extDir, 'extension.js');
          if (fs.existsSync(extJsPath)) {
            try { fs.chmodSync(extJsPath, 0o666); } catch (e) {}
            let content = fs.readFileSync(extJsPath, 'utf8');
            for (const [en, tr] of extJsReplacements) {
              content = content.replaceAll(en, tr);
            }
            fs.writeFileSync(extJsPath, content, 'utf8');
          }
          const webJsPath = path.join(extDir, 'webview', 'index.js');
          if (fs.existsSync(webJsPath)) {
            try { fs.chmodSync(webJsPath, 0o666); } catch (e) {}
            let content = fs.readFileSync(webJsPath, 'utf8');
            for (const [en, tr] of webviewReplacements) {
              content = content.replaceAll(en, tr);
            }
            fs.writeFileSync(webJsPath, content, 'utf8');
          }
        }
      }
    } catch (e) {}
  }
}

function patchCodexExtension(paths) {
  const dirs = [
    paths.ide?.extensionsDir,
    path.join(require('node:os').homedir(), '.vscode', 'extensions')
  ];
  const replacements = [
    ['"Open Codex Sidebar"', '"Codex Kenar Çubuğunu Aç"'],
    ['"Open Codex Command Menu"', '"Codex Komut Menüsünü Aç"'],
    ['"Implement with Codex"', '"Codex ile Uygula"'],
    ['"New Codex Agent"', '"Yeni Codex Ajanı"'],
    ['"Add to Codex Thread"', '"Codex İş Parçacığına Ekle"'],
    ['"Add File to Codex Thread"', '"Dosyayı Codex İş Parçacığına Ekle"'],
    ['"New Chat in ChatGPT Sidebar"', '"ChatGPT Kenar Çubuğunda Yeni Sohbet"'],
    ['"Copy Codex CLI args for LSP MCP"', '"LSP MCP için Codex CLI Bağımsız Değişkenlerini Kopyala"'],
    ['"Codex Settings"', '"Codex Ayarları"']
  ];

  for (const d of dirs) {
    if (!d || !fs.existsSync(d)) continue;
    try {
      for (const sub of fs.readdirSync(d)) {
        if (sub.startsWith('openai.chatgpt')) {
          const pkgPath = path.join(d, sub, 'package.json');
          if (fs.existsSync(pkgPath)) {
            try { fs.chmodSync(pkgPath, 0o666); } catch (e) {}
            let content = fs.readFileSync(pkgPath, 'utf8');
            for (const [en, tr] of replacements) {
              content = content.replaceAll(en, tr);
            }
            fs.writeFileSync(pkgPath, content, 'utf8');
          }
        }
      }
    } catch (e) {}
  }
}

/**
 * Antigravity yerleşik uzak ve çekirdek uzantıların (Dev Containers, SSH, WSL, Antigravity)
 * package.json açıklamalarını ve başlıklarını Türkçeleştirir.
 */
function patchAntigravityRemoteExtensions(paths) {
  if (!paths.ide || !paths.ide.appPath) return;
  const extsDir = path.join(paths.ide.appPath, 'resources', 'app', 'extensions');

  const configs = [
    {
      dir: 'antigravity-dev-containers',
      replacements: [
        ['"Enable SSH agent forwarding when connecting to devcontainers."', '"Dev container\'lara bağlanırken SSH aracısı iletimini etkinleştirin."'],
        ['"Disable the server checksum verification. This is only recommended for development and testing."', '"Sunucu sağlama toplamı doğrulamasını devre dışı bırakın. Bu yalnızca geliştirme ve test için önerilir."'],
        ['"Use devcontainers within Antigravity"', '"Antigravity içinde dev container\'ları kullanın"'],
        ['"Dev Containers (Antigravity)"', '"Geliştirme Kapsayıcıları (Antigravity)"'],
        ['"Reopen in Container"', '"Kapsayıcıda Yeniden Aç"'],
        ['"Show Antigravity Dev Containers Log"', '"Antigravity Geliştirme Kapsayıcıları Günlüğünü Göster"'],
        ['"Open Folder in Container"', '"Klasörü Kapsayıcıda Aç"'],
        ['"Reopen Folder Locally"', '"Klasörü Yerel Olarak Yeniden Aç"'],
        ['"Attach to Running Container"', '"Çalışan Kapsayıcıya Bağlan"'],
        ['"category": "Dev Containers"', '"category": "Geliştirme Kapsayıcıları"']
      ]
    },
    {
      dir: 'antigravity-remote-openssh',
      replacements: [
        ['"The absolute file path to a custom SSH config file."', '"Özel bir SSH yapılandırma dosyasının mutlak dosya yolu."'],
        ['"The absolute file path to the SSH executable. If empty, will use the ssh on the PATH."', '"SSH yürütülebilir dosyasının mutlak dosya yolu. Boşsa PATH üzerindeki ssh kullanılır."'],
        ['"Experimental: The URL from where the Antigravity server will be downloaded. The following variables can be substituted: ${os}, ${arch}, ${ideVersion}, ${vscodeVersion} ${commit}, ${quality}."', '"Deneysel: Antigravity sunucusunun indirileceği URL. Şu değişkenler yerine konulabilir: ${os}, ${arch}, ${ideVersion}, ${vscodeVersion} ${commit}, ${quality}."'],
        ['"Experimental: The name of the server binary, use this if you are using a client without a corresponding server release, or if you are iterating on remote extensions."', '"Deneysel: Sunucu ikili dosyasının adı; ilgili sunucu sürümü olmayan bir istemci kullanıyorsanız veya uzak uzantılar üzerinde çalışıyorsanız bunu kullanın."'],
        ['"Experimental: Disable the server checksum verification. This is only recommended for development and testing."', '"Deneysel: Sunucu sağlama toplamı doğrulamasını devre dışı bırakın. Bu yalnızca geliştirme ve test için önerilir."'],
        ['"Connect to remote machines over SSH using Antigravity"', '"Antigravity kullanarak SSH üzerinden uzak makinelere bağlanın"'],
        ['"SSH (Antigravity)"', '"SSH Hedefleri (Antigravity)"'],
        ['"Close SSH Process"', '"SSH İşlemini Kapat"'],
        ['"Connect to SSH Host..."', '"SSH Ana Bilgisayarına Bağlan..."'],
        ['"Connect to SSH Host in Current Window..."', '"Geçerli Pencerede SSH Ana Bilgisayarına Bağlan..."'],
        ['"Show SSH Log..."', '"SSH Günlüğünü Göster..."'],
        ['"Connect to SSH Host in New Window"', '"Yeni Pencerede SSH Ana Bilgisayarına Bağlan"'],
        ['"Connect to SSH Host in Current Window"', '"Geçerli Pencerede SSH Ana Bilgisayarına Bağlan"'],
        ['"Open on SSH Host in Current Window"', '"Geçerli Pencerede SSH Ana Bilgisayarında Aç"'],
        ['"Open on SSH Host in New Window"', '"Yeni Pencerede SSH Ana Bilgisayarında Aç"'],
        ['"Remove from List"', '"Listeden Kaldır"'],
        ['"Refresh"', '"Yenile"'],
        ['"Configure"', '"Yapılandır"'],
        ['"Add New"', '"Yeni Ekle"'],
        ['"Add Cloudtop URL"', '"Cloudtop URL\'si Ekle"'],
        ['"category": "Remote-SSH"', '"category": "Uzak-SSH"']
      ]
    },
    {
      dir: 'antigravity-remote-wsl',
      replacements: [
        ['"The URL from where the Antigravity server will be downloaded. The following variables can be substituted: ${os}, ${arch}, ${ideVersion}, ${vscodeVersion} ${commit}, ${quality}."', '"Antigravity sunucusunun indirileceği URL. Şu değişkenler yerine konulabilir: ${os}, ${arch}, ${ideVersion}, ${vscodeVersion} ${commit}, ${quality}."'],
        ['"Experimental: Disable the server checksum verification. This is only recommended for development and testing."', '"Deneysel: Sunucu sağlama toplamı doğrulamasını devre dışı bırakın. Bu yalnızca geliştirme ve test için önerilir."'],
        ['"WSL Targets (Antigravity)"', '"WSL Hedefleri (Antigravity)"'],
        ['"Connect to WSL"', '"WSL\'ye Bağlan"'],
        ['"Connect to WSL in New Window"', '"Yeni Pencerede WSL\'ye Bağlan"'],
        ['"Connect to WSL using Distro..."', '"Dağıtım Kullanarak WSL\'ye Bağlan..."'],
        ['"Connect to WSL using Distro in New Window..."', '"Yeni Pencerede Dağıtım Kullanarak WSL\'ye Bağlan..."'],
        ['"Show Log"', '"Günlüğü Göster"'],
        ['"Connect in New Window"', '"Yeni Pencerede Bağlan"'],
        ['"Connect in Current Window"', '"Geçerli Pencerede Bağlan"'],
        ['"Open in Current Window"', '"Geçerli Pencerede Aç"'],
        ['"Open in New Window"', '"Yeni Pencerede Aç"'],
        ['"Remove From Recent List"', '"Son Kullanılanlar Listesinden Kaldır"'],
        ['"Refresh"', '"Yenile"'],
        ['"Add a Distro"', '"Dağıtım Ekle"'],
        ['"Set as Default Distro"', '"Varsayılan Dağıtım Olarak Ayarla"'],
        ['"Delete Distro"', '"Dağıtımı Sil"'],
        ['"category": "Remote-WSL"', '"category": "Uzak-WSL"']
      ]
    },
    {
      dir: 'antigravity',
      replacements: [
        ['"Changes the base URL for marketplace search results. [Available Options](https://github.com/VSCodium/vscodium/blob/master/docs/index.md#extensions-marketplace). You must restart Antigravity to use the new marketplace after changing this value."', '"Marketplace arama sonuçları için temel URL\'yi değiştirir. [Kullanılabilir Seçenekler](https://github.com/VSCodium/vscodium/blob/master/docs/index.md#extensions-marketplace). Bu değeri değiştirdikten sonra yeni marketplace\'i kullanmak için Antigravity\'yi yeniden başlatmanız gerekir."'],
        ['"Changes the base URL on each extension page. [Available Options](https://github.com/VSCodium/vscodium/blob/master/docs/index.md#extensions-marketplace). You must restart Antigravity to use the new marketplace after changing this value."', '"Her uzantı sayfasındaki temel URL\'yi değiştirir. [Kullanılabilir Seçenekler](https://github.com/VSCodium/vscodium/blob/master/docs/index.md#extensions-marketplace). Bu değeri değiştirdikten sonra yeni marketplace\'i kullanmak için Antigravity\'yi yeniden başlatmanız gerekir."'],
        ['"Jetski will attempt to compute embeddings for workspaces up to this many files. This file count ignores .gitignore and binary files. Raising this limit from the default value may lead to performance issues. Values 0 or below will be treated as unlimited."', '"Jetski, bu sayıya kadar dosyaya sahip çalışma alanları için yerleştirmeleri (embeddings) hesaplamaya çalışır. Bu dosya sayısı .gitignore ve ikili (binary) dosyaları yoksayar. Bu sınırın varsayılan değerin üzerine çıkarılması performans sorunlarına yol açabilir. 0 veya daha düşük değerler sınırsız kabul edilir."'],
        ['"Enable the Cursor-import commands in the palette"', '"Komut paletinde Cursor içe aktarma komutlarını etkinleştirin"'],
        ['"Keep the Language Server running after the editor is closed."', '"Düzenleyici kapatıldıktan sonra Dil Sunucusunun çalışmaya devam etmesini sağlayın."'],
        ['"Kill Language Server and Reload Window"', '"Dil Sunucusunu Sonlandır ve Pencereyi Yeniden Yükle"'],
        ['"Toggle Persistent Language Server and Reload Window"', '"Kalıcı Dil Sunucusunu Aç/Kapat ve Pencereyi Yeniden Yükle"'],
        ['"Open Persistent Language Server Log"', '"Kalıcı Dil Sunucusu Günlüğünü Aç"'],
        ['"Copy API Key to Clipboard"', '"API Anahtarını Panoya Kopyala"'],
        ['"Show Browser Allowlist"', '"Tarayıcı İzin Listesini Göster"'],
        ['"Kill Extension Host on Remote Server"', '"Uzak Sunucudaki Uzantı Ana Bilgisayarını Sonlandır"'],
        ['"Import Cider settings"', '"Cider Ayarlarını İçe Aktar"'],
        ['"[Beta] Start Demo Mode"', '"[Beta] Demo Modunu Başlat"'],
        ['"[Beta] End Demo Mode"', '"[Beta] Demo Modunu Bitir"']
      ]
    },
    {
      dir: 'antigravity-code-executor',
      replacements: [
        ['"Execute Code (Antigravity)"', '"Kodu Çalıştır (Antigravity)"']
      ]
    },
    {
      dir: 'git',
      replacements: [
        ['"Create Worktree With Defaults"', '"Varsayılanlarla Çalışma Ağacı Oluştur"']
      ]
    }
  ];

  for (const cfg of configs) {
    const pkgPath = path.join(extsDir, cfg.dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        try { fs.chmodSync(pkgPath, 0o666); } catch (e) {}
        let content = fs.readFileSync(pkgPath, 'utf8');
        for (const [en, tr] of cfg.replacements) {
          content = content.replaceAll(en, tr);
        }
        fs.writeFileSync(pkgPath, content, 'utf8');
      } catch (e) {}
    }
  }

  // Built-in antigravity dist/extension.js
  const agDistJs = path.join(extsDir, 'antigravity', 'dist', 'extension.js');
  if (fs.existsSync(agDistJs)) {
    try {
      try { fs.chmodSync(agDistJs, 0o666); } catch (e) {}
      let c = fs.readFileSync(agDistJs, 'utf8');
      const agJsReps = [
        ['.tooltip="Open Detailed View"', '.tooltip="Ayrıntılı Görünümü Aç"'],
        ['.name="Tab Status"', '.name="Tab Durumu"'],
        ['.text="Importing Extensions"', '.text="Uzantılar İçe Aktarılıyor"'],
        ['.text="Tab - Idle"', '.text="Tab - Boşta"'],
        ['.text="Tab - No completion"', '.text="Tab - Tamamlama yok"'],
        ['title:"Tab - Report Issue"', 'title:"Tab - Sorun Bildir"'],
        ['placeHolder:"Select issue"', 'placeHolder:"Sorun seçin"'],
        ['placeHolder:"Enter a short description of the issue"', 'placeHolder:"Sorunun kısa bir açıklamasını girin"'],
        ['placeHolder:"Select where to open the conversation"', 'placeHolder:"Sohbetin nerede açılacağını seçin"'],
        ['title:"Cloudtop selection"', 'title:"Cloudtop seçimi"']
      ];
      for (const [en, tr] of agJsReps) c = c.replaceAll(en, tr);
      fs.writeFileSync(agDistJs, c, 'utf8');
    } catch (e) {}
  }

  // Built-in git package.nls.tr.json missing keys
  const gitNlsTrPath = path.join(extsDir, 'git', 'package.nls.tr.json');
  if (fs.existsSync(gitNlsTrPath)) {
    try {
      try { fs.chmodSync(gitNlsTrPath, 0o666); } catch (e) {}
      const nlsTr = JSON.parse(fs.readFileSync(gitNlsTrPath, 'utf8'));
      Object.assign(nlsTr, {
        "command.merge2": "Birleştir",
        "command.rebase2": "Yeniden Temellendir (Rebase)",
        "command.createFrom": "Şuradan oluştur...",
        "command.deleteWorktree2": "Çalışma Ağacını Sil",
        "command.stashView2": "Zulayı (Stash) Görüntüle",
        "command.graphCompareRef": "Şununla karşılaştır...",
        "command.graphCompareWithMergeBase": "Birleştirme Temeli ile Karşılaştır",
        "command.graphCompareWithRemote": "Uzak Depo ile Karşılaştır",
        "command.deleteRef": "Sil"
      });
      fs.writeFileSync(gitNlsTrPath, JSON.stringify(nlsTr, null, 2), 'utf8');
    } catch (e) {}
  }
}

/**
 * clangd eklentisinin package.json açıklamalarını Türkçeleştirir.
 */
function patchClangdExtension(paths) {
  const dirs = [
    paths.ide?.extensionsDir,
    path.join(require('node:os').homedir(), '.vscode', 'extensions')
  ];

  const replacements = [
    ['"Arguments for clangd server."', '"clangd sunucusu için bağımsız değişkenler."'],
    ['"Check for language server updates on startup."', '"Başlangıçta dil sunucusu güncellemelerini denetleyin."'],
    ['"Warn about conflicting extensions and suggest disabling them."', '"Çakışan uzantılar hakkında uyarın ve bunları devre dışı bırakmayı önerin."'],
    ['"Enable code completion provided by the language server"', '"Dil sunucusu tarafından sağlanan kod tamamlamayı etkinleştirin"'],
    ['"Enable hovers provided by the language server"', '"Dil sunucusu tarafından sağlanan üzerine gelme ipuçlarını etkinleştirin"'],
    ['"Extra clang flags used to parse files when no compilation database is found."', '"Derleme veritabanı bulunamadığında dosyaları ayrıştırmak için kullanılan ek clang bayrakları."'],
    ['"The path to clangd executable, e.g.: /usr/bin/clangd."', '"clangd yürütülebilir dosyasının yolu, örn.: /usr/bin/clangd."'],
    ['"Names a file that clangd should log a performance trace to, in chrome trace-viewer JSON format."', '"clangd\'nin chrome trace-viewer JSON biçiminde performans izi kaydedeceği dosyanın adı."'],
    ['"Auto restart clangd (up to 4 times) if it crashes."', '"clangd çökerse otomatik olarak (en fazla 4 kez) yeniden başlatın."'],
    ['"Always rank completion items on the server as you type. This produces more accurate results, at the cost of higher latency."', '"Yazarken her zaman tamamlama öğelerini sunucuda sıralayın. Bu, daha yüksek gecikme pahasına daha doğru sonuçlar üretir."'],
    ['"What to do when clangd configuration files are changed. Ignored if clangd does not support config file watching."', '"clangd yapılandırma dosyaları değiştirildiğinde ne yapılacağı. clangd yapılandırma dosyası izlemeyi desteklemiyorsa yoksayılır."'],
    ['"Force enable of \\"On Config Changed\\" option regardless of clangd version."', '"clangd sürümünden bağımsız olarak \\"Yapılandırma Değiştiğinde\\" seçeneğini zorla etkinleştirin."'],
    ['"Allows the path to be a script e.g.: clangd.sh."', '"Yolun clangd.sh gibi bir komut dosyası olmasına izin verir."'],
    ['"Use a background highlight rather than opacity to identify inactive code."', '"Etkin olmayan kodu belirtmek için opaklık yerine arka plan vurgulaması kullanın."'],
    ['"Switch Between Source/Header"', '"Kaynak/Başlık Dosyası Arasında Geçiş Yap"'],
    ['"Download language server"', '"Dil sunucusunu indir"'],
    ['"Check for language server update"', '"Dil sunucusu güncellemesini denetle"'],
    ['"Manually activate extension"', '"Uzantıyı manuel olarak etkinleştir"'],
    ['"Restart language server"', '"Dil sunucusunu yeniden başlat"'],
    ['"Shutdown language server"', '"Dil sunucusunu kapat"'],
    ['"Open Type Hierarchy"', '"Tür Hiyerarşisini Aç"'],
    ['"Types: Show Base Classes"', '"Türler: Temel Sınıfları Göster"'],
    ['"Types: Show Derived Classes"', '"Türler: Türetilmiş Sınıfları Göster"'],
    ['"Close type hierarchy view"', '"Tür hiyerarşisi görünümünü kapat"'],
    ['"Show memory usage"', '"Bellek kullanımını göster"'],
    ['"Close memory usage view"', '"Bellek kullanımı görünümünü kapat"'],
    ['"Show AST"', '"AST Göster"'],
    ['"Close AST view"', '"AST görünümünü kapat"'],
    ['"Open project configuration file"', '"Proje yapılandırma dosyasını aç"'],
    ['"Open user configuration file"', '"Kullanıcı yapılandırma dosyasını aç"'],
    ['"Toggle inlay hints"', '"Satır içi ipuçlarını aç/kapat"']
  ];

  for (const d of dirs) {
    if (!d || !fs.existsSync(d)) continue;
    try {
      for (const sub of fs.readdirSync(d)) {
        if (sub.includes('clangd')) {
          const pkgPath = path.join(d, sub, 'package.json');
          if (fs.existsSync(pkgPath)) {
            try { fs.chmodSync(pkgPath, 0o666); } catch (e) {}
            let content = fs.readFileSync(pkgPath, 'utf8');
            for (const [en, tr] of replacements) {
              content = content.replaceAll(en, tr);
            }
            fs.writeFileSync(pkgPath, content, 'utf8');
          }
        }
      }
    } catch (e) {}
  }
}

/**
 * Python ve Python Environments eklentilerindeki panel karşılama metinlerini, ağaç öğelerini ve butonları Türkçeleştirir.
 */
function patchPythonExtension(paths) {
  const dirs = [
    paths.ide?.extensionsDir,
    path.join(require('node:os').homedir(), '.vscode', 'extensions')
  ];
  const pkgReplacements = [
    [
      '"Configure a test framework to see your tests here.\n[Configure Python Tests](command:python.configureTests)"',
      '"Testlerinizi burada görmek için bir test çatısı yapılandırın.\n[Python Testlerini Yapılandır](command:python.configureTests)"'
    ]
  ];
  const jsReplacements = [
    [
      'Configure a test framework to see your tests here.\n[Configure Python Tests](command:python.configureTests)',
      'Testlerinizi burada görmek için bir test çatısı yapılandırın.\n[Python Testlerini Yapılandır](command:python.configureTests)'
    ],
    ['"Configure Python Tests"', '"Python Testlerini Yapılandır"'],
    ['"Configure Test Framework"', '"Test Çatısını Yapılandır"'],
    ['"Select a test framework/tool to enable"', '"Etkinleştirilecek bir test çatısı/aracı seçin"']
  ];

  const pyEnvsL10n = {
    "Recommended": "Önerilen",
    "Install": "Yükle",
    "Uninstall": "Kaldır",
    "Open in Browser": "Tarayıcıda Aç",
    "Open in Editor": "Düzenleyicide Aç",
    "Browse": "Gözat",
    "Select Folder": "Klasör Seç",
    "View Logs": "Günlükleri Görüntüle",
    "Yes": "Evet",
    "No": "Hayır",
    "Ok": "Tamam",
    "Quick Create": "Hızlı Oluştur",
    "Install Python": "Python Yükle",
    "Install Extension": "Uzantı Yükle",
    "Select Interpreter": "Yorumlayıcı Seç",
    "Browse...": "Gözat...",
    "Create Virtual Environment...": "Sanal Ortam Oluştur...",
    "Enter Interpreter Path...": "Yorumlayıcı Yolunu Girin...",
    "Browse and select a Python interpreter from anywhere": "Herhangi bir yerden bir Python yorumlayıcısına göz atın ve seçin",
    "Installed": "Yüklü",
    "Common Packages": "Yaygın Paketler",
    "Select packages to install": "Yüklenecek paketleri seçin",
    "Enter package names": "Paket adlarını girin",
    "Search `PyPI` packages": "`PyPI` paketlerini ara",
    "Search and install popular `PyPI` packages": "Popüler `PyPI` paketlerini arayın ve yükleyin",
    "Install project dependencies": "Proje bağımlılıklarını yükle",
    "Install packages found in dependency files.": "Bağımlılık dosyalarında bulunan paketleri yükleyin.",
    "Select packages to uninstall": "Kaldırılacak paketleri seçin",
    "Enter package names separated by space": "Paket adlarını boşlukla ayırarak girin",
    "Edit arguments": "Bağımsız değişkenleri düzenle",
    "Skip package installation": "Paket kurulumunu atla",
    "Select Python Executable": "Python Yürütülebilir Dosyasını Seçin",
    "Select a Python Environment": "Bir Python Ortamı Seçin",
    "Select an option": "Bir seçenek belirleyin",
    "Select an environment manager": "Bir ortam yöneticisi seçin",
    "Select a package manager": "Bir paket yöneticisi seçin",
    "Select a project creator": "Bir proje oluşturucu seçin",
    "Select a project, folder or script": "Bir proje, klasör veya betik seçin",
    "Select one or more projects, folders or scripts": "Bir veya daha fazla proje, klasör veya betik seçin",
    " What would you like to do?": " Ne yapmak istersiniz?",
    "Open pyproject.toml": "pyproject.toml dosyasını aç",
    "Continue Anyway": "Yine de Devam Et",
    "Cancel": "İptal",
    "No package manager found": "Paket yöneticisi bulunamadı",
    "Waiting for environment managers to load": "Ortam yöneticilerinin yüklenmesi bekleniyor",
    "Environment manager not found": "Ortam yöneticisi bulunamadı",
    "Install an environment manager to get started. If you have installed then it might be loading or errored": "Başlamak için bir ortam yöneticisi yükleyin. Yüklediyseniz yükleniyor olabilir veya hata vermiş olabilir",
    "No environment provided by:": "Şunun tarafından sağlanan ortam yok:",
    "No packages found": "Paket bulunamadı",
    "Manages virtual environments created using `venv`": "`venv` kullanılarak oluşturulan sanal ortamları yönetir",
    "Initializing virtual environments": "Sanal ortamlar başlatılıyor",
    "Refreshing virtual environments": "Sanal ortamlar yenileniyor",
    "Select a folder to create a global virtual environment": "Genel bir sanal ortam oluşturmak için bir klasör seçin",
    "Venv Folders Setting": "Venv Klasörleri Ayarı",
    "No base Python found": "Temel Python bulunamadı",
    "Did not find any base Python 3": "Temel Python 3 bulunamadı",
    "No environment found, click to create": "Ortam bulunamadı, oluşturmak için tıklayın",
    "No Python environments found.": "Python ortamı bulunamadı.",
    "Create Environment": "Ortam Oluştur",
    "Manages Global Python installs": "Genel (Global) Python kurulumlarını yönetir",
    "Refreshing Global Python interpreters": "Genel Python yorumlayıcıları yenileniyor",
    "Discovering Global Python interpreters": "Genel Python yorumlayıcıları keşfediliyor",
    "Error refreshing packages": "Paketler yenilenirken hata oluştu",
    "Manages Conda environments": "Conda ortamlarını yönetir",
    "Discovering Conda environments": "Conda ortamları keşfediliyor",
    "Refreshing Conda environments": "Conda ortamları yenileniyor",
    "Manages Conda packages": "Conda paketlerini yönetir",
    "Refreshing Conda packages": "Conda paketleri yenileniyor",
    "Manages Pyenv Python versions": "Pyenv Python sürümlerini yönetir",
    "Discovering Pyenv Python versions": "Pyenv Python sürümleri keşfediliyor",
    "Refreshing Pyenv Python versions": "Pyenv Python sürümleri yenileniyor",
    "Manages Pipenv environments": "Pipenv ortamlarını yönetir",
    "Discovering Pipenv environments": "Pipenv ortamları keşfediliyor",
    "Refreshing Pipenv environments": "Pipenv ortamları yenileniyor",
    "Manages Poetry environments": "Poetry ortamlarını yönetir",
    "Discovering Poetry environments": "Poetry ortamları keşfediliyor",
    "Refreshing Poetry environments": "Poetry ortamları yenileniyor",
    "Add Existing Projects": "Mevcut Projeleri Ekle",
    "Auto Find Projects": "Projeleri Otomatik Bul",
    "Select Python projects": "Python projelerini seçin",
    "Select Project folders or Python files": "Proje klasörlerini veya Python dosyalarını seçin",
    "Automatically find folders with `pyproject.toml` or `setup.py` files.": "`pyproject.toml` veya `setup.py` dosyalarını içeren klasörleri otomatik olarak bulun.",
    "No projects found": "Proje bulunamadı",
    "This environment is selected for non-workspace files": "Bu ortam çalışma alanı dışındaki dosyalar için seçildi",
    "This environment is selected for project files": "Bu ortam proje dosyaları için seçildi",
    "No Python installation found": "Python kurulumu bulunamadı",
    "No Python found, click to install": "Python bulunamadı, yüklemek için tıklayın",
    "Select Python version to install": "Yüklenecek Python sürümünü seçin",
    "installed": "yüklü",
    "Fetching available Python versions...": "Kullanılabilir Python sürümleri getiriliyor...",
    "Failed to fetch available Python versions": "Kullanılabilir Python sürümleri getirilemedi",
    "Open Settings": "Ayarları Aç",
    "Open settings": "Ayarları aç",
    "Reset setting": "Ayarı sıfırla",
    "View setting": "Ayarı görüntüle",
    "Close": "Kapat",
    "Refreshing environment managers...": "Ortam yöneticileri yenileniyor...",
    "Creating environment...": "Ortam oluşturuluyor..."
  };

  for (const d of dirs) {
    if (!d || !fs.existsSync(d)) continue;
    try {
      for (const sub of fs.readdirSync(d)) {
        if (sub.startsWith('ms-python.python-')) {
          for (const relPkg of ['package.json', path.join('out', 'client', 'package.json')]) {
            const p = path.join(d, sub, relPkg);
            if (fs.existsSync(p)) {
              try { fs.chmodSync(p, 0o666); } catch (e) {}
              let content = fs.readFileSync(p, 'utf8');
              for (const [en, tr] of pkgReplacements) {
                content = content.replaceAll(en, tr);
              }
              fs.writeFileSync(p, content, 'utf8');
            }
          }
          const extJs = path.join(d, sub, 'out', 'client', 'extension.js');
          if (fs.existsSync(extJs)) {
            try { fs.chmodSync(extJs, 0o666); } catch (e) {}
            let content = fs.readFileSync(extJs, 'utf8');
            for (const [en, tr] of jsReplacements) {
              content = content.replaceAll(en, tr);
            }
            fs.writeFileSync(extJs, content, 'utf8');
          }
        } else if (sub.startsWith('ms-python.vscode-python-envs')) {
          const extDir = path.join(d, sub);
          const l10nDir = path.join(extDir, 'l10n');
          try {
            if (!fs.existsSync(l10nDir)) fs.mkdirSync(l10nDir, { recursive: true });
            for (const fName of ['bundle.l10n.json', 'bundle.l10n.tr.json']) {
              const fPath = path.join(l10nDir, fName);
              fs.writeFileSync(fPath, JSON.stringify(pyEnvsL10n, null, 2), 'utf8');
            }
          } catch (e) {}
          const envExtJs = path.join(extDir, 'dist', 'extension.js');
          if (fs.existsSync(envExtJs)) {
            try {
              try { fs.chmodSync(envExtJs, 0o666); } catch (e) {}
              let content = fs.readFileSync(envExtJs, 'utf8');
              for (const [en, tr] of Object.entries(pyEnvsL10n)) {
                content = content.replaceAll(`l10n.t("${en}"`, `l10n.t("${tr}"`);
              }
              content = content.replaceAll('"Please select a package manager",r.TreeItemCollapsibleState.None', '"Lütfen bir paket yöneticisi seçin",r.TreeItemCollapsibleState.None');
              content = content.replaceAll('"Global",r.TreeItemCollapsibleState.Expanded', '"Genel (Global)",r.TreeItemCollapsibleState.Expanded');
              content = content.replaceAll('.tooltip="Select Python Interpreter"', '.tooltip="Python Yorumlayıcısı Seç"');
              content = content.replaceAll('.tooltip="Global Python environment"', '.tooltip="Genel Python ortamı"');
              fs.writeFileSync(envExtJs, content, 'utf8');
            } catch (e) {}
          }
        }
      }
    } catch (e) {}
  }
}

/**
 * Containers (ms-azuretools.vscode-containers) eklentisinin görünüm başlıklarını, komutlarını ve NLS dosyalarını Türkçeleştirir.
 */
function patchContainersExtension(paths) {
  const dirs = [
    paths.ide?.extensionsDir,
    path.join(require('node:os').homedir(), '.vscode', 'extensions')
  ];
  const nlsOverrides = {
    "vscode-containers.description": "Kapsayıcı tabanlı uygulamalar oluşturun, yönetin ve dağıtın.",
    "vscode-containers.views.activityBar": "Kapsayıcılar",
    "vscode-containers.views.containers": "Kapsayıcılar",
    "vscode-containers.views.images": "Görüntüler (Images)",
    "vscode-containers.views.registries": "Kayıt Defterleri",
    "vscode-containers.views.networks": "Ağlar",
    "vscode-containers.views.volumes": "Birimler (Volumes)",
    "vscode-containers.views.dockerContexts": "Bağlamlar (Contexts)",
    "vscode-containers.views.help": "Yardım ve Geri Bildirim",
    "vscode-containers.commands.compose.down": "Compose Down (Durdur ve Kaldır)",
    "vscode-containers.commands.compose.restart": "Compose Restart (Yeniden Başlat)",
    "vscode-containers.commands.compose.up": "Compose Up (Başlat)",
    "vscode-containers.commands.compose.up.subset": "Compose Up - Hizmetleri Seç",
    "vscode-containers.commands.compose.down.subset": "Compose Down - Hizmetleri Seç",
    "vscode-containers.commands.configure": "Çalışma Alanına Docker Dosyaları Ekle...",
    "vscode-containers.commands.configureCompose": "Çalışma Alanına Compose Dosyaları Ekle...",
    "vscode-containers.commands.containers.attachShell": "Kabuk (Shell) Bağla",
    "vscode-containers.commands.containers.browse": "Tarayıcıda Aç",
    "vscode-containers.commands.containers.configureExplorer": "Gezgini Yapılandır...",
    "vscode-containers.commands.containers.filter": "Filtrele...",
    "vscode-containers.commands.containers.clearFilter": "Filtreyi Temizle",
    "vscode-containers.commands.containers.downloadFile": "İndir...",
    "vscode-containers.commands.containers.inspect": "İncele (Inspect)",
    "vscode-containers.commands.containers.openFile": "Aç",
    "vscode-containers.commands.containers.prune": "Temizle (Prune)...",
    "vscode-containers.commands.containers.refresh": "Yenile",
    "vscode-containers.commands.containers.remove": "Kaldır...",
    "vscode-containers.commands.containers.group.remove": "Kaldır...",
    "vscode-containers.commands.containers.restart": "Yeniden Başlat",
    "vscode-containers.commands.containers.select": "Kapsayıcı seç",
    "vscode-containers.commands.containers.start": "Başlat",
    "vscode-containers.commands.containers.stop": "Durdur",
    "vscode-containers.commands.containers.stats": "İstatistikler",
    "vscode-containers.commands.containers.viewLogs": "Günlükleri Görüntüle",
    "vscode-containers.commands.containers.composeGroup.logs": "Compose Günlükleri",
    "vscode-containers.commands.containers.composeGroup.start": "Compose Başlat",
    "vscode-containers.commands.containers.composeGroup.stop": "Compose Durdur",
    "vscode-containers.commands.containers.composeGroup.restart": "Compose Yeniden Başlat",
    "vscode-containers.commands.containers.composeGroup.down": "Compose Kaldır (Down)",
    "vscode-containers.commands.debugging.initializeForDebugging": "Kapsayıcı hata ayıklaması için başlat",
    "vscode-containers.commands.help": "Kapsayıcı Yardımı",
    "vscode-containers.commands.help.reportIssue": "Sorun Bildir",
    "vscode-containers.commands.help.openWalkthrough": "Kapsayıcı Araçları Adım Adım Kılavuzunu Aç",
    "vscode-containers.commands.chooseContainerRuntime": "Kapsayıcı çalışma zamanını seçin...",
    "vscode-containers.commands.askCopilot": "Copilot'a Sor",
    "vscode-containers.commands.images.build": "Görüntü Derle (Build Image)...",
    "vscode-containers.commands.images.configureExplorer": "Gezgini Yapılandır...",
    "vscode-containers.commands.images.filter": "Filtrele...",
    "vscode-containers.commands.images.clearFilter": "Filtreyi Temizle",
    "vscode-containers.commands.images.inspect": "İncele (Inspect)",
    "vscode-containers.commands.images.showDangling": "Askıdaki (dangling) görüntüleri göster",
    "vscode-containers.commands.images.hideDangling": "Askıdaki (dangling) görüntüleri gizle",
    "vscode-containers.commands.images.prune": "Temizle (Prune)...",
    "vscode-containers.commands.images.pull": "Çek (Pull)",
    "vscode-containers.commands.images.push": "Gönder (Push)...",
    "vscode-containers.commands.images.refresh": "Yenile",
    "vscode-containers.commands.images.remove": "Kaldır...",
    "vscode-containers.commands.images.group.remove": "Kaldır...",
    "vscode-containers.commands.images.run": "Çalıştır",
    "vscode-containers.commands.images.runAzureCli": "Azure CLI Çalıştır",
    "vscode-containers.commands.images.runInteractive": "Etkileşimli Çalıştır",
    "vscode-containers.commands.images.tag": "Etiketle (Tag)...",
    "vscode-containers.commands.images.copyFullTag": "Tam Etiketi Kopyala",
    "vscode-containers.commands.openDockerDownloadPage": "Docker Desktop Kurulumu Hakkında Daha Fazla Bilgi Edinin",
    "vscode-containers.commands.networks.configureExplorer": "Gezgini Yapılandır...",
    "vscode-containers.commands.networks.create": "Oluştur...",
    "vscode-containers.commands.networks.inspect": "İncele (Inspect)",
    "vscode-containers.commands.networks.prune": "Temizle (Prune)...",
    "vscode-containers.commands.networks.refresh": "Yenile",
    "vscode-containers.commands.networks.remove": "Kaldır...",
    "vscode-containers.commands.pruneSystem": "Sistemi Temizle (Prune System)...",
    "vscode-containers.commands.registries.azure.buildImage": "Azure'da Görüntü Derle...",
    "vscode-containers.commands.registries.azure.createRegistry": "Kayıt Defteri Oluştur...",
    "vscode-containers.commands.registries.azure.deleteRegistry": "Kayıt Defterini Sil...",
    "vscode-containers.commands.registries.azure.deleteRepository": "Depoyu Sil...",
    "vscode-containers.commands.registries.azure.openInPortal": "Portalda Aç",
    "vscode-containers.commands.registries.azure.selectSubscriptions": "Abonelikleri Seçin...",
    "vscode-containers.commands.registries.azure.untagImage": "Görüntü Etiketini Kaldır...",
    "vscode-containers.commands.registries.azure.viewProperties": "Özellikleri Görüntüle",
    "vscode-containers.commands.registries.connect": "Kayıt Defterine Bağlan...",
    "vscode-containers.commands.registries.connectRegistry": "Kayıt Defterine Bağlan...",
    "vscode-containers.commands.registries.reconnectRegistry": "Kimlik bilgilerini yeniden girin",
    "vscode-containers.commands.registries.copyImageDigest": "Görüntü Özetini (Digest) Kopyala",
    "vscode-containers.commands.registries.inspectRemoteImageManifest": "Görüntü Bildirimini (Manifest) İncele",
    "vscode-containers.commands.registries.copyRemoteFullTag": "Tam Etiketi Kopyala",
    "vscode-containers.commands.registries.deleteImage": "Görüntüyü Sil...",
    "vscode-containers.commands.registries.deployImageToAzure": "Görüntüyü Azure App Service'e Dağıt...",
    "vscode-containers.commands.registries.deployImageToAca": "Görüntüyü Azure Container Apps'e Dağıt...",
    "vscode-containers.commands.registries.disconnectRegistry": "Bağlantıyı Kes",
    "vscode-containers.commands.registries.genericV2.removeTrackedRegistry": "Genel Kapsayıcı Kayıt Defteri Bağlantısını Kes",
    "vscode-containers.commands.registries.genericV2.addTrackedRegistry": "Genel Kapsayıcı Kayıt Defterine Bağlan...",
    "vscode-containers.commands.registries.dockerHub.openInBrowser": "Tarayıcıda Aç",
    "vscode-containers.commands.registries.help": "Kayıt Defterleri Yardımı",
    "vscode-containers.commands.registries.logInToContainerCli": "Kapsayıcı CLI'da Oturum Aç",
    "vscode-containers.commands.registries.logOutOfContainerCli": "Kapsayıcı CLI Oturumunu Kapat",
    "vscode-containers.commands.registries.pullImage": "Görüntüyü Çek (Pull)",
    "vscode-containers.commands.registries.pullRepository": "Depoyu Çek (Pull)",
    "vscode-containers.commands.registries.refresh": "Yenile",
    "vscode-containers.commands.volumes.configureExplorer": "Gezgini Yapılandır...",
    "vscode-containers.commands.volumes.inspect": "İncele (Inspect)",
    "vscode-containers.commands.volumes.prune": "Temizle (Prune)...",
    "vscode-containers.commands.volumes.refresh": "Yenile",
    "vscode-containers.commands.volumes.remove": "Kaldır...",
    "vscode-containers.commands.contexts.use": "Kullan",
    "vscode-containers.commands.contexts.inspect": "İncele (Inspect)",
    "vscode-containers.commands.contexts.remove": "Kaldır...",
    "vscode-containers.commands.contexts.configureExplorer": "Gezgini Yapılandır...",
    "vscode-containers.commands.contexts.refresh": "Yenile",
    "vscode-containers.commands.contexts.help": "Docker Bağlam Yardımı",
    "vscode-containers.commands.activateContainerRuntimeProviders": "Kapsayıcı Çalışma Zamanı Sağlayıcılarını Etkinleştir...",
    "vscode-containers.commands.activateRegistryProviders": "Kayıt Defteri Sağlayıcılarını Etkinleştir...",
    "vscode-containers.commands.category.containersGeneric": "Kapsayıcılar",
    "vscode-containers.commands.category.containers": "Kapsayıcılar",
    "vscode-containers.commands.category.images": "Kapsayıcı Görüntüleri",
    "vscode-containers.commands.category.networks": "Kapsayıcı Ağları",
    "vscode-containers.commands.category.azureContainerRegistry": "Azure Container Registry",
    "vscode-containers.commands.category.registries": "Kapsayıcı Kayıt Defterleri",
    "vscode-containers.commands.category.dockerHub": "Docker Hub",
    "vscode-containers.commands.category.volumes": "Kapsayıcı Birimleri",
    "vscode-containers.commands.category.contexts": "Docker Bağlamları",
    "vscode-containers.walkthrough.containersStart.title": "Kapsayıcı Araçlarına Başlarken",
    "vscode-containers.walkthrough.containersStart.description": "Visual Studio Code için Docker ve Kapsayıcı Araçları uzantısı hakkında bilgi edinin"
  };

  for (const d of dirs) {
    if (!d || !fs.existsSync(d)) continue;
    try {
      for (const sub of fs.readdirSync(d)) {
        if (sub.startsWith('ms-azuretools.vscode-containers') || sub.startsWith('ms-azuretools.vscode-docker')) {
          const extDir = path.join(d, sub);
          for (const nlsName of ['package.nls.json', 'package.nls.tr.json']) {
            const nlsPath = path.join(extDir, nlsName);
            try {
              let existing = {};
              if (fs.existsSync(nlsPath)) {
                try { fs.chmodSync(nlsPath, 0o666); } catch (e) {}
                existing = JSON.parse(fs.readFileSync(nlsPath, 'utf8'));
              }
              Object.assign(existing, nlsOverrides);
              fs.writeFileSync(nlsPath, JSON.stringify(existing, null, 2), 'utf8');
            } catch (e) {}
          }
          const bundlePath = path.join(extDir, 'dist', 'extension.bundle.js');
          if (fs.existsSync(bundlePath)) {
            try {
              try { fs.chmodSync(bundlePath, 0o666); } catch (e) {}
              let c = fs.readFileSync(bundlePath, 'utf8');
              const bundleReplacements = [
                ['"There are no containers running."', '"Çalışan kapsayıcı yok."'],
                ['"No images found."', '"Görüntü bulunamadı."'],
                ['"No networks found."', '"Ağ bulunamadı."'],
                ['"No volumes found."', '"Birim bulunamadı."'],
                ['"Connect to a registry..."', '"Bir kayıt defterine bağlan..."'],
                ['"Connect Registry..."', '"Kayıt Defterine Bağlan..."'],
                ['"Connect Registry"', '"Kayıt Defterine Bağlan"'],
                ['"No registry providers are connected. Please connect a registry provider and try again to continue."', '"Hiçbir kayıt defteri sağlayıcısı bağlı değil. Devam etmek için lütfen bir kayıt defteri sağlayıcısı bağlayın ve tekrar deneyin."'],
                ['"Select registry provider"', '"Kayıt defteri sağlayıcısı seçin"'],
                ['"Select an Azure Container Registry to push to"', '"Gönderilecek bir Azure Container Registry seçin"'],
                ['"Create new Azure Container Registry"', '"Yeni Azure Container Registry Oluştur"'],
                ['"$(plus) Create new Azure Container Registry..."', '"$(plus) Yeni Azure Container Registry Oluştur..."'],
                ['"Determining registry to push to..."', '"Gönderilecek kayıt defteri belirleniyor..."'],
                ['"Generic Registry V2"', '"Genel Kayıt Defteri V2"'],
                ['"Registry URL"', '"Kayıt Defteri URL\'si"'],
                ['"Registry Username"', '"Kayıt Defteri Kullanıcı Adı"'],
                ['"Registry Password or Personal Access Token"', '"Kayıt Defteri Parolası veya Kişisel Erişim Belirteci (PAT)"'],
                ['"Registry name"', '"Kayıt defteri adı"'],
                ['"Provide a registry name"', '"Bir kayıt defteri adı belirtin"'],
                ['"Deleting remote images is not supported on this registry."', '"Bu kayıt defterinde uzak görüntülerin silinmesi desteklenmiyor."'],
                ['"Installed container runtime was not found."', '"Yüklü kapsayıcı çalışma zamanı bulunamadı."'],
                ['"Read Extension Documentation"', '"Uzantı Belgelerini Oku"'],
                ['"Get Started with Docker Tutorial"', '"Docker Eğitimi ile Başlayın"'],
                ['"Open Container Tools Extension Walkthrough"', '"Kapsayıcı Araçları Uzantısı Kılavuzunu Aç"'],
                ['"Install Docker DX for Improved Editing"', '"Gelişmiş Düzenleme için Docker DX Yükle"'],
                ['"Review Issues"', '"Sorunları İncele"'],
                ['"Report Issue"', '"Sorun Bildir"'],
                ['"Docker Installation"', '"Docker Kurulumu"'],
                ['"Configure containers explorer"', '"Kapsayıcı gezginini yapılandır"'],
                ['"Tutorial: Get started with containers"', '"Eğitim: Kapsayıcılarla başlayın"'],
                ['"Configure Docker Contexts Explorer"', '"Docker Bağlamları Gezginini Yapılandır"'],
                ['"Configure images explorer"', '"Görüntü gezginini yapılandır"'],
                ['"Configure networks explorer"', '"Ağ gezginini yapılandır"'],
                ['"Configure volumes explorer"', '"Birim gezginini yapılandır"'],
                ['"Select a registry provider to use"', '"Kullanılacak bir kayıt defteri sağlayıcısı seçin"'],
                ['"No registry providers are available for connection"', '"Bağlantı için kullanılabilir kayıt defteri sağlayıcısı yok"'],
                ['"Loading..."', '"Yükleniyor..."'],
                ['"Loading resources..."', '"Kaynaklar yükleniyor..."'],
                ['"Load More..."', '"Daha Fazla Yükle..."']
              ];
              for (const [en, tr] of bundleReplacements) {
                c = c.replaceAll(en, tr);
              }
              fs.writeFileSync(bundlePath, c, 'utf8');
            } catch (e) {}
          }
        }
      }
    } catch (e) {}
  }
}


/**
 * Tam kurulum yürütür.
 */
async function install() {
  const paths = getPaths();
  const dictPath = path.join(__dirname, '..', 'locales', 'tr.json');
  const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));

  console.log('--- Antigravity Türkçe Kurulum Başlatılıyor ---');

  // 1. AI Kuralları
  console.log('1. Yapay zeka Türkçe kuralları (GEMINI.md) uygulanıyor...');
  const ruleRes = setupGeminiRule(paths);
  if (ruleRes.success) {
    console.log('   [✓] GEMINI.md başarıyla güncellendi.');
  }

  // 2. IDE Yapılandırması
  console.log('2. Antigravity IDE dil ve yerel ayarları yapılandırılıyor...');
  ensureLanguagePack(paths);
  setArgvLocale(paths.ide.argvFile, 'tr');
  setLocaleJson(paths.ide.localeFile, 'tr');
  console.log('   [✓] Antigravity IDE yerel ayarları (tr) bağlandı.');

  // 3. Desktop Yapılandırması
  if (fs.existsSync(paths.desktop.appPath)) {
    console.log('3. Antigravity Desktop ayarları yapılandırılıyor...');
    setArgvLocale(paths.desktop.argvFile, 'tr');
    setLocaleJson(paths.desktop.localeFile, 'tr');
    syncLanguagePacks(paths);
    console.log('   [✓] Antigravity Desktop yerel ayarları bağlandı.');
  }

  // 4. Özel Bileşen Yamaları
  console.log('4. Antigravity arayüz bileşenleri yamalanıyor...');
  const patchResults = applyAllPatches(paths, dict);
  for (const r of patchResults) {
    if (r.modified) {
      console.log(`   [✓] ${r.target}: ${r.matches} dize Türkçeleştirildi.`);
    } else {
      console.log(`   [-] ${r.target}: ${r.message || 'Değişiklik yapılmadı.'}`);
    }
  }

  // 5. Google Cloud, Antigravity, Remote, Clangd, Claude, Codex ve WSL Eklenti Yamaları
  console.log('5. Eklenti arayüz dizeleri yamalanıyor...');
  patchGoogleCloudExtension(paths);
  patchAntigravityExtension(paths);
  patchAntigravityRemoteExtensions(paths);
  patchClangdExtension(paths);
  patchWslExtension(paths);
  patchClaudeExtension(paths);
  patchCodexExtension(paths);
  patchPythonExtension(paths);
  patchContainersExtension(paths);
  patchAllExtensions(paths);
  console.log('   [✓] Eklenti arayüzleri ve durum çubuğu güncellendi.');

  // 6. Antigravity Desktop (Ajan & Sohbet Arayüzü) Yaması
  if (fs.existsSync(paths.desktop.appPath)) {
    console.log('6. Antigravity Desktop arayüzü yamalanıyor...');
    const desktopRes = await patchDesktopApp(paths);
    if (desktopRes.success) {
      console.log('   [✓] Antigravity Desktop (app.asar) arayüzü Türkçeleştirildi.');
    } else if (/EBUSY|EPERM|resource busy/i.test(String(desktopRes.reason))) {
      console.log(`   [!] Antigravity Desktop açık olduğu için app.asar kilitli (atlandı): ${desktopRes.reason}`);
    } else {
      throw new Error(`Antigravity Desktop: ${desktopRes.reason}`);
    }
  }

  // 7. Önbellek Temizleme
  console.log('7. V8 Bytecode ve Electron önbelleği temizleniyor...');
  clearElectronCache(paths);
  console.log('   [✓] Önbellek temizlendi, taze derleme hazır.');

  console.log('\n--- Kurulum Başarıyla Tamamlandı! ---');
  console.log('Değişikliklerin görünmesi için açık olan Antigravity / Antigravity IDE pencerelerini yeniden başlatın.');
}

/**
 * Tam geri alma (uninstall) yürütür.
 */
async function uninstall() {
  const paths = getPaths();
  console.log('--- Antigravity Türkçe Ayarları Geri Alınıyor ---');

  // 1. AI Kuralları
  console.log('1. GEMINI.md Türkçe kuralları temizleniyor...');
  removeGeminiRule(paths);
  console.log('   [✓] Kural bloğu kaldırıldı.');

  // 2. Yamalar
  console.log('2. Orijinal bundle dosyaları (.bak) geri yükleniyor...');
  const restoreResults = restoreAllPatches(paths);
  for (const r of restoreResults) {
    if (r.restored) {
      console.log(`   [✓] ${r.target}: Orijinal dosyaya dönüldü.`);
    } else {
      console.log(`   [-] ${r.target}: ${r.reason || 'Yedek bulunamadı.'}`);
    }
  }

  // Desktop app geri yükle
  if (fs.existsSync(paths.desktop.appPath)) {
    const desktopRes = await restoreDesktopApp(paths);
    if (!desktopRes.restored) throw new Error(desktopRes.reason);
    if (desktopRes.restored) {
      console.log('   [✓] Antigravity Desktop: Orijinal app.asar dosyasına dönüldü.');
    }
  }

  // 3. Yerel ayarları en'e çevir
  console.log('3. Dil ayarları varsayılana çevriliyor...');
  setArgvLocale(paths.ide.argvFile, 'en');
  setLocaleJson(paths.ide.localeFile, 'en');
  if (fs.existsSync(paths.desktop.appPath)) {
    setArgvLocale(paths.desktop.argvFile, 'en');
    setLocaleJson(paths.desktop.localeFile, 'en');
  }
  console.log('   [✓] Yerel ayarlar varsayılana döndü.');

  // 4. Önbellek Temizle
  clearElectronCache(paths);

  console.log('\n--- Geri Alma Tamamlandı! ---');
}

module.exports = {
  install,
  uninstall,
  setupGeminiRule,
  ensureLanguagePack,
  setArgvLocale,
  setLocaleJson,
  syncLanguagePacks,
  clearElectronCache,
  patchGoogleCloudExtension,
  patchAntigravityExtension,
  patchAntigravityRemoteExtensions,
  patchClangdExtension,
  patchWslExtension,
  patchClaudeExtension,
  patchCodexExtension,
  patchPythonExtension,
  patchContainersExtension
};
