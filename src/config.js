const path = require('path');
const os = require('os');
const fs = require('fs');

function getPaths() {
  const home = os.homedir();
  const platform = process.platform;

  let ideAppPath = null;
  let ideDataPath = null;
  let ideUserConfigPath = null;
  let desktopAppPath = null;
  let desktopDataPath = null;
  let desktopUserConfigPath = null;

  if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');

    ideAppPath = path.join(localAppData, 'Programs', 'Antigravity IDE');
    ideDataPath = path.join(home, '.antigravity-ide');
    ideUserConfigPath = path.join(appData, 'Antigravity IDE');

    desktopAppPath = path.join(localAppData, 'Programs', 'Antigravity');
    desktopDataPath = path.join(home, '.antigravity');
    desktopUserConfigPath = path.join(appData, 'Antigravity');
  } else if (platform === 'darwin') {
    ideAppPath = '/Applications/Antigravity IDE.app/Contents/Resources/app';
    ideDataPath = path.join(home, '.antigravity-ide');
    ideUserConfigPath = path.join(home, 'Library', 'Application Support', 'Antigravity IDE');

    desktopAppPath = '/Applications/Antigravity.app/Contents/Resources/app';
    desktopDataPath = path.join(home, '.antigravity');
    desktopUserConfigPath = path.join(home, 'Library', 'Application Support', 'Antigravity');
  } else {
    // Linux
    ideAppPath = '/opt/Antigravity IDE/resources/app';
    ideDataPath = path.join(home, '.antigravity-ide');
    ideUserConfigPath = path.join(home, '.config', 'Antigravity IDE');

    desktopAppPath = '/opt/Antigravity/resources/app';
    desktopDataPath = path.join(home, '.antigravity');
    desktopUserConfigPath = path.join(home, '.config', 'Antigravity');
  }

  const geminiDir = path.join(home, '.gemini');
  const geminiRuleFile = path.join(geminiDir, 'GEMINI.md');

  return {
    platform,
    home,
    geminiDir,
    geminiRuleFile,
    ide: {
      appPath: ideAppPath,
      dataPath: ideDataPath,
      userConfigPath: ideUserConfigPath,
      workbenchFile: path.join(ideAppPath, 'resources', 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.js'),
      jetskiFile: path.join(ideAppPath, 'resources', 'app', 'out', 'jetskiAgent', 'main.js'),
      argvFile: path.join(ideDataPath, 'argv.json'),
      localeFile: path.join(ideUserConfigPath, 'User', 'locale.json'),
      languagePacksFile: path.join(ideUserConfigPath, 'languagepacks.json'),
      extensionsDir: path.join(ideDataPath, 'extensions'),
      cliCmd: path.join(ideAppPath, 'bin', 'antigravity-ide.cmd'),
      productFile: path.join(ideAppPath, 'resources', 'app', 'product.json'),
      nlsFile: path.join(ideAppPath, 'resources', 'app', 'out', 'nls.messages.json'),
      nlsKeysFile: path.join(ideAppPath, 'resources', 'app', 'out', 'nls.keys.json'),
      mainFile: path.join(ideAppPath, 'resources', 'app', 'out', 'main.js')
    },
    desktop: {
      appPath: desktopAppPath,
      dataPath: desktopDataPath,
      userConfigPath: desktopUserConfigPath,
      argvFile: path.join(desktopDataPath, 'argv.json'),
      localeFile: path.join(desktopUserConfigPath, 'User', 'locale.json'),
      languagePacksFile: path.join(desktopUserConfigPath, 'languagepacks.json'),
      extensionsDir: path.join(desktopDataPath, 'extensions')
    }
  };
}

module.exports = {
  getPaths
};
