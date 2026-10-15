#!/usr/bin/env node
const { getPaths } = require('../src/config');
const { assertStopped } = require('../src/preflight');

async function main() {
  const [command = 'help', backup] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command)) {
    console.log(`Antigravity Türkçe Yama
Kullanım: node bin/antigravity-tr.js <komut>
  install-desktop      Masaüstü arayüzünü Türkçeleştir (2.17.0–2.23.1)
  repair-desktop       Eski Türkçe yamadaki siyah ekran döngüsünü düzelt
  restore-desktop      Masaüstü yedeğini geri yükle (isteğe bağlı yedek yolu)
  install              IDE + Desktop + dil kuralları (mevcut kapsamlı kurucu)
  restore              IDE + Desktop yamalarını geri al
  help                 Yardım
Kurulumdan önce uygulamaları kapatın. Gereksinim: Windows, Node.js >=22.12.`);
    return;
  }
  const full = ['install', 'apply', 'restore', 'uninstall', 'revert'].includes(command);
  if (!full && !['install-desktop', 'repair-desktop', 'restore-desktop'].includes(command)) throw new Error(`Bilinmeyen komut: ${command}`);
  const paths = getPaths();
  assertStopped(paths, full);
  if (full) {
    const installer = require('../src/installer');
    await (['install', 'apply'].includes(command) ? installer.install() : installer.uninstall());
    return;
  }
  const desktop = require('../src/desktop_patcher');
  const result = command === 'install-desktop' ? await desktop.patchDesktopApp(paths) :
    command === 'repair-desktop' ? await require('../src/desktop_repair').repairDesktopApp(paths) :
      await desktop.restoreDesktopApp(paths, backup);
  if (!(result.success || result.restored)) throw new Error(result.reason);
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error('Hata: ' + error.message); process.exitCode = 1; });
