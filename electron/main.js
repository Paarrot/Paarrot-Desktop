const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, clipboard, session, desktopCapturer, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, execFile, execFileSync } = require('child_process');
const { promisify } = require('util');
const Store = require('electron-store').default;
const openPkg = require('open');
const open = openPkg.default;
const openApps = openPkg.apps;
const PaarrotAPIServer = require('./api-server');
const { createDiscordCollectiblesService } = require('./discord-collectibles');
const https = require('https');
const http = require('http');
const AdmZip = require('adm-zip');
const { autoUpdater } = require('electron-updater');

// Development mode detection - MUST be declared before any code that might use it
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const VITE_DEV_SERVER = 'http://localhost:38347';
const VITE_DEV_PORT = '38347';
const PORT = 44548;

function isLoopbackHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

/**
 * Open http(s) links in a real browser.
 * On Linux, Electron's shell.openExternal / xdg-open often hit xdg-desktop-portal
 * which can hand https:// to Discover instead of Firefox. Always launch a browser
 * binary first; only fall back to the portal as a last resort.
 */
async function openExternalUrl(url) {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    await shell.openExternal(url);
    return;
  }

  if (process.platform === 'linux') {
    const browserCandidates = [
      openApps?.browser,
      openApps?.firefox,
      openApps?.chrome,
      openApps?.edge,
      openApps?.brave,
      'firefox',
      'firefox-esr',
      'google-chrome',
      'google-chrome-stable',
      'chromium',
      'chromium-browser',
      'brave-browser',
      'microsoft-edge',
      'microsoft-edge-stable',
    ].filter(Boolean);

    let lastError;
    for (const name of browserCandidates) {
      try {
        await open(url, { app: { name } });
        return;
      } catch (err) {
        lastError = err;
      }
    }
    console.warn('[openExternalUrl] Browser candidates failed, falling back to shell.openExternal', lastError);
    await shell.openExternal(url);
    return;
  }

  try {
    await open(url);
  } catch (err) {
    console.warn('[openExternalUrl] open() failed, falling back to shell.openExternal', err);
    await shell.openExternal(url);
  }
}

/** Keep Vite HMR / same-origin navigations inside Electron; only true externals go to the OS browser. */
function isAppOwnedUrl(targetUrl, currentUrl) {
  try {
    const next = new URL(targetUrl);
    if (currentUrl) {
      const current = new URL(currentUrl);
      if (current.origin === next.origin) return true;
      // localhost ↔ 127.0.0.1 on the same Vite port after a full reload
      if (
        isDev &&
        isLoopbackHost(current.hostname) &&
        isLoopbackHost(next.hostname) &&
        current.port === next.port
      ) {
        return true;
      }
    }
    if (isDev && isLoopbackHost(next.hostname) && next.port === VITE_DEV_PORT) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const store = new Store();
const discordCollectibles = createDiscordCollectiblesService(store);
const PROTOCOL_SCHEME = 'paarrot';

let mainWindow = null;
let tray = null;
let isQuitting = false;
let apiServer = null;
let pendingDeepLink = null;
let protocolRegistrationState = {
  before: false,
  registerCall: false,
  after: false,
  error: null,
};

// Allow audio playback without requiring a prior user gesture (needed for notification sounds)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Enable GPU acceleration
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-webgl');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas');

// Set app name for notifications and system tray
app.setName('Paarrot');

// Configure auto-updater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// Set feed URL manually as fallback if app-update.yml is missing
if (!isDev) {
  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'Paarrot',
      repo: 'Paarrot-Desktop',
      releaseType: 'release'
    });
  } catch (err) {
    console.warn('Failed to set feed URL:', err);
  }
}

autoUpdater.on('checking-for-update', () => {
  console.log('Checking for updates...');
  if (mainWindow) {
    mainWindow.webContents.send('update-checking');
  }
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate
    });
  }
});

autoUpdater.on('update-not-available', (info) => {
  console.log('No update available. Current version:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-not-available', { version: info.version });
  }
});

autoUpdater.on('error', (err) => {
  console.error('Update error:', err);
  if (mainWindow) {
    mainWindow.webContents.send('update-error', { error: err.message });
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  console.log(`Download progress: ${progressObj.percent}%`);
  if (mainWindow) {
    mainWindow.webContents.send('update-download-progress', {
      percent: progressObj.percent,
      transferred: progressObj.transferred,
      total: progressObj.total
    });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', {
      version: info.version,
      releaseNotes: info.releaseNotes
    });
  }
});


// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    // Someone tried to run a second instance, focus our window
    const deepLink = extractDeepLinkFromArgv(argv);
    if (deepLink) {
      pendingDeepLink = deepLink;
    }

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();

      if (pendingDeepLink) {
        applyDeepLink(pendingDeepLink);
      }
    }
  });
}

pendingDeepLink = extractDeepLinkFromArgv(process.argv);

/**
 * Extracts a paarrot:// deep link URL from argv.
 * @param {string[]} argv - Process argument vector.
 * @returns {string|null} The deep link URL or null.
 */
function extractDeepLinkFromArgv(argv) {
  if (!Array.isArray(argv)) {
    return null;
  }

  const match = argv.find((arg) => typeof arg === 'string' && arg.toLowerCase().startsWith(`${PROTOCOL_SCHEME}://`));

  return match || null;
}

/**
 * Converts a paarrot:// deep link into an in-app hash route.
 * Supports:
 * - Hash routes: paarrot://anything/#/login/server/
 * - Path routes (SSO-safe): paarrot://desktop/login/server/?loginToken=...
 * Preserves SSO loginToken from the URL query (Synapse inserts it before `#`).
 * @param {string} deepLink - The incoming protocol URL.
 * @returns {string|null} Hash route value without leading #.
 */
function deepLinkToHashRoute(deepLink) {
  if (!deepLink) {
    return null;
  }

  if (!deepLink.toLowerCase().startsWith(`${PROTOCOL_SCHEME}://`)) {
    return null;
  }

  let hashRoute = null;
  let loginToken = null;

  try {
    const parsed = new URL(deepLink);
    loginToken = parsed.searchParams.get('loginToken');

    if (parsed.hash && parsed.hash.length > 1) {
      const hashValue = parsed.hash.slice(1);
      hashRoute = hashValue.startsWith('/') ? hashValue : `/${hashValue}`;
    } else if (parsed.pathname && parsed.pathname !== '/') {
      // paarrot://desktop/login/... → /login/...
      hashRoute = parsed.pathname;
      if (parsed.search && parsed.search.length > 1) {
        // Keep non-loginToken query on the route; loginToken merged below
        const params = new URLSearchParams(parsed.search);
        params.delete('loginToken');
        const rest = params.toString();
        if (rest) {
          hashRoute += `?${rest}`;
        }
      }
    }
  } catch {
    const hashIndex = deepLink.indexOf('#');
    if (hashIndex !== -1) {
      const hashValue = deepLink.slice(hashIndex + 1);
      if (hashValue) {
        hashRoute = hashValue.startsWith('/') ? hashValue : `/${hashValue}`;
      }
    }

    const match = deepLink.match(/[?&]loginToken=([^&#]+)/i);
    if (match) {
      try {
        loginToken = decodeURIComponent(match[1]);
      } catch {
        loginToken = match[1];
      }
    }
  }

  if (loginToken) {
    if (!hashRoute) {
      hashRoute = '/';
    }
    const queryIndex = hashRoute.indexOf('?');
    const pathPart = queryIndex === -1 ? hashRoute : hashRoute.slice(0, queryIndex);
    const params = new URLSearchParams(queryIndex === -1 ? '' : hashRoute.slice(queryIndex + 1));
    if (!params.has('loginToken')) {
      params.set('loginToken', loginToken);
    }
    const query = params.toString();
    hashRoute = query ? `${pathPart}?${query}` : pathPart;
  }

  return hashRoute;
}

/**
 * Applies a deep link to the current window and brings the app to foreground.
 * @param {string} deepLink - The incoming protocol URL.
 */
function applyDeepLink(deepLink) {
  if (!mainWindow) {
    pendingDeepLink = deepLink;
    return;
  }

  const hashRoute = deepLinkToHashRoute(deepLink);
  if (!hashRoute) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();

  if (isDev) {
    mainWindow.loadURL(`${VITE_DEV_SERVER}/#${hashRoute}`).catch((error) => {
      console.error('[Protocol] Failed to load deep link route in dev:', error);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../cinny/dist/index.html'), { hash: hashRoute }).catch((error) => {
      console.error('[Protocol] Failed to load deep link route in production:', error);
    });
  }

  pendingDeepLink = null;
}

/**
 * Registers the app as handler for paarrot:// links.
 * @returns {{ before: boolean; registerCall: boolean; after: boolean; error: string | null }}
 */
function registerAppProtocol() {
  const before = app.isDefaultProtocolClient(PROTOCOL_SCHEME);
  let registered = false;
  let error = null;

  try {
    if (process.defaultApp) {
      registered = app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
    } else {
      registered = app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  let after = app.isDefaultProtocolClient(PROTOCOL_SCHEME);
  // In Windows dev mode, default ownership may stay false even when registry command points to this app.
  if (!after && process.platform === 'win32') {
    const currentCommand = getExpectedWindowsProtocolCommand();
    const hkcuCommand = queryWindowsRegistryDefaultSync(`HKCU\\Software\\Classes\\${PROTOCOL_SCHEME}\\shell\\open\\command`);
    if (hkcuCommand && normalizeWindowsCommand(hkcuCommand) === normalizeWindowsCommand(currentCommand)) {
      after = true;
    }
  }

  return {
    before,
    registerCall: registered,
    after,
    error,
  };
}

/**
 * Gets the command that should be registered for paarrot:// on Windows.
 * @returns {string}
 */
function getExpectedWindowsProtocolCommand() {
  return process.defaultApp && process.argv[1]
    ? `"${process.execPath}" "${path.resolve(process.argv[1])}" "%1"`
    : `"${process.execPath}" "%1"`;
}

/**
 * Normalizes a Windows command string for reliable comparisons.
 * @param {string} command - Command string to normalize.
 * @returns {string}
 */
function normalizeWindowsCommand(command) {
  return String(command).replace(/\\/g, '/').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Reads the default Windows registry value synchronously.
 * @param {string} keyPath - Registry key path.
 * @returns {string|null} Default value content.
 */
function queryWindowsRegistryDefaultSync(keyPath) {
  try {
    const stdout = execFileSync('reg.exe', ['query', keyPath, '/ve'], { encoding: 'utf8' });
    const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const valueLine = lines.find((line) => line.startsWith('(Default)'));
    if (!valueLine) {
      return null;
    }

    const parsed = valueLine.split(/\s{2,}/).filter(Boolean);
    return parsed.length >= 3 ? parsed.slice(2).join(' ') : null;
  } catch {
    return null;
  }
}

function syncProtocolRegistrationState() {
  protocolRegistrationState = registerAppProtocol();
  console.log(`[Protocol] ${PROTOCOL_SCHEME}:// before=${protocolRegistrationState.before} registerCall=${protocolRegistrationState.registerCall} after=${protocolRegistrationState.after}${protocolRegistrationState.error ? ` error=${protocolRegistrationState.error}` : ''}`);
}

/**
 * Refresh Linux xdg-mime association for paarrot:// to the current app desktop file.
 * AppImage upgrades often leave a stale desktop id in mimeapps.list.
 */
async function ensureLinuxProtocolHandler() {
  const home = app.getPath('home');
  const searchDirs = [
    path.join(home, '.local', 'share', 'applications'),
    '/usr/share/applications',
    '/var/lib/flatpak/exports/share/applications',
  ];

  let desktopId = null;
  for (const dir of searchDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir);
      // Prefer the newest AppImageLauncher desktop entry when several exist.
      const matches = entries
        .filter((name) => /paarrot/i.test(name) && name.endsWith('.desktop'))
        .map((name) => {
          try {
            return { name, mtime: fs.statSync(path.join(dir, name)).mtimeMs };
          } catch {
            return { name, mtime: 0 };
          }
        })
        .sort((a, b) => b.mtime - a.mtime);
      if (matches.length > 0) {
        desktopId = matches[0].name;
        break;
      }
    } catch {
      // keep looking
    }
  }

  if (!desktopId) {
    desktopId = 'paarrot.desktop';
  }

  // Rewrite mimeapps.list so stale AppImage ids cannot win over xdg-mime default.
  try {
    const mimeappsPath = path.join(home, '.config', 'mimeapps.list');
    let content = '';
    try {
      content = fs.readFileSync(mimeappsPath, 'utf8');
    } catch {
      content = '';
    }

    const schemeLine = `x-scheme-handler/${PROTOCOL_SCHEME}=${desktopId}`;
    const lines = content ? content.split(/\r?\n/) : [];
    let section = null;
    const next = [];
    let wroteDefault = false;
    let wroteAdded = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '[Default Applications]' || trimmed === '[Added Associations]') {
        section = trimmed;
        next.push(line);
        continue;
      }
      if (trimmed.startsWith('x-scheme-handler/paarrot=')) {
        if (section === '[Default Applications]') {
          next.push(schemeLine);
          wroteDefault = true;
        } else if (section === '[Added Associations]') {
          next.push(`${schemeLine};`);
          wroteAdded = true;
        }
        continue;
      }
      next.push(line);
    }

    if (!next.some((l) => l.trim() === '[Default Applications]')) {
      next.push('', '[Default Applications]');
    }
    if (!wroteDefault) {
      const idx = next.findIndex((l) => l.trim() === '[Default Applications]');
      next.splice(idx + 1, 0, schemeLine);
    }
    if (!next.some((l) => l.trim() === '[Added Associations]')) {
      next.unshift('[Added Associations]');
    }
    if (!wroteAdded) {
      const idx = next.findIndex((l) => l.trim() === '[Added Associations]');
      next.splice(idx + 1, 0, `${schemeLine};`);
    }

    fs.mkdirSync(path.dirname(mimeappsPath), { recursive: true });
    fs.writeFileSync(mimeappsPath, `${next.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`);
    console.log(`[Protocol] mimeapps.list → ${desktopId} for x-scheme-handler/${PROTOCOL_SCHEME}`);
  } catch (error) {
    console.warn('[Protocol] Failed to rewrite mimeapps.list:', error);
  }

  await new Promise((resolve) => {
    execFile(
      'xdg-mime',
      ['default', desktopId, `x-scheme-handler/${PROTOCOL_SCHEME}`],
      { timeout: 5000 },
      (error, _stdout, stderr) => {
        if (error) {
          console.warn(`[Protocol] xdg-mime default failed (${desktopId}):`, error.message, stderr);
        } else {
          console.log(`[Protocol] xdg-mime default → ${desktopId} for x-scheme-handler/${PROTOCOL_SCHEME}`);
        }
        resolve();
      }
    );
  });

  await new Promise((resolve) => {
    execFile('update-desktop-database', [path.join(home, '.local', 'share', 'applications')], { timeout: 5000 }, () => {
      resolve();
    });
  });
}

/**
 * Reads a named Windows registry value.
 * @param {string} keyPath - Registry key path.
 * @param {string} valueName - Registry value name.
 * @returns {Promise<string|null>} Registry value content.
 */
async function queryWindowsRegistryValue(keyPath, valueName) {
  try {
    const { stdout } = await execAsync(`reg query "${keyPath}" /v "${valueName}"`);
    const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const valueLine = lines.find((line) => line.toLowerCase().startsWith(valueName.toLowerCase()));
    if (!valueLine) {
      return null;
    }

    const parsed = valueLine.split(/\s{2,}/).filter(Boolean);
    return parsed.length >= 3 ? parsed.slice(2).join(' ') : null;
  } catch {
    return null;
  }
}

/**
 * Reads the default Windows registry value.
 * @param {string} keyPath - Registry key path.
 * @returns {Promise<string|null>} Default value content.
 */
async function queryWindowsRegistryDefault(keyPath) {
  try {
    const { stdout } = await execAsync(`reg query "${keyPath}" /ve`);
    const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const valueLine = lines.find((line) => line.startsWith('(Default)'));
    if (!valueLine) {
      return null;
    }

    const parsed = valueLine.split(/\s{2,}/).filter(Boolean);
    return parsed.length >= 3 ? parsed.slice(2).join(' ') : null;
  } catch {
    return null;
  }
}

/**
 * Provides Windows-specific protocol association diagnostics for paarrot://.
 * @returns {Promise<{userChoiceProgId: string | null; userChoiceCommand: string | null; hkcuCommand: string | null; hklmCommand: string | null}>}
 */
async function getWindowsProtocolDiagnostics() {
  if (process.platform !== 'win32') {
    return null;
  }

  const userChoiceProgId = await queryWindowsRegistryValue(
    `HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\${PROTOCOL_SCHEME}\\UserChoice`,
    'ProgId'
  );

  let userChoiceCommand = null;
  if (userChoiceProgId) {
    userChoiceCommand =
      (await queryWindowsRegistryDefault(`HKCU\\Software\\Classes\\${userChoiceProgId}\\shell\\open\\command`)) ||
      (await queryWindowsRegistryDefault(`HKLM\\Software\\Classes\\${userChoiceProgId}\\shell\\open\\command`));
  }

  const hkcuCommand = await queryWindowsRegistryDefault(`HKCU\\Software\\Classes\\${PROTOCOL_SCHEME}\\shell\\open\\command`);
  const hklmCommand = await queryWindowsRegistryDefault(`HKLM\\Software\\Classes\\${PROTOCOL_SCHEME}\\shell\\open\\command`);

  return {
    userChoiceProgId,
    userChoiceCommand,
    hkcuCommand,
    hklmCommand,
  };
}

/**
 * Ensures Windows has user-level URL protocol class entries for paarrot://
 * so the scheme appears in Default Apps link associations.
 * @returns {Promise<void>}
 */
async function ensureWindowsProtocolRegistryEntries() {
  if (process.platform !== 'win32') {
    return;
  }

  const openCommand = getExpectedWindowsProtocolCommand();
  const iconValue = `"${process.execPath}",0`;
  const protocolDisplayName = `URL:${PROTOCOL_SCHEME} Protocol`;

  await execFileAsync('reg.exe', [
    'add',
    `HKCU\\Software\\Classes\\${PROTOCOL_SCHEME}`,
    '/ve',
    '/t',
    'REG_SZ',
    '/d',
    protocolDisplayName,
    '/f',
  ]);

  await execFileAsync('reg.exe', [
    'add',
    `HKCU\\Software\\Classes\\${PROTOCOL_SCHEME}`,
    '/v',
    'URL Protocol',
    '/t',
    'REG_SZ',
    '/d',
    '',
    '/f',
  ]);

  await execFileAsync('reg.exe', [
    'add',
    `HKCU\\Software\\Classes\\${PROTOCOL_SCHEME}\\DefaultIcon`,
    '/ve',
    '/t',
    'REG_SZ',
    '/d',
    iconValue,
    '/f',
  ]);

  await execFileAsync('reg.exe', [
    'add',
    `HKCU\\Software\\Classes\\${PROTOCOL_SCHEME}\\shell\\open\\command`,
    '/ve',
    '/t',
    'REG_SZ',
    '/d',
    openCommand,
    '/f',
  ]);
}

/**
 * Returns renderer-friendly protocol diagnostics payload.
 * @returns {Promise<{ success: boolean; data: { scheme: string; platform: string; isDefault: boolean; before: boolean; registerCall: boolean; error: string | null; windows: null | {userChoiceProgId: string | null; userChoiceCommand: string | null; hkcuCommand: string | null; hklmCommand: string | null} } }>}
 */
async function getProtocolStatusPayload() {
  return {
    success: true,
    data: {
      scheme: PROTOCOL_SCHEME,
      platform: process.platform,
      isDefault: app.isDefaultProtocolClient(PROTOCOL_SCHEME),
      before: protocolRegistrationState.before,
      registerCall: protocolRegistrationState.registerCall,
      error: protocolRegistrationState.error,
      windows: await getWindowsProtocolDiagnostics(),
    },
  };
}

// Helper to get correct icon path in dev vs packaged app
function getIconPath(iconName) {
  if (isDev) {
    return path.join(__dirname, '../icons', iconName);
  }
  // In packaged app, extraResources puts icons in resources/icons/
  return path.join(process.resourcesPath, 'icons', iconName);
}

function createWindow() {
  // Restore window state or use defaults
  const savedState = store.get('windowState', {});
  
  // Validate saved position is within visible screen bounds
  const { screen } = require('electron');
  let validPosition = false;
  if (savedState.x !== undefined && savedState.y !== undefined) {
    const displays = screen.getAllDisplays();
    validPosition = displays.some((display) => {
      const { x, y, width, height } = display.workArea;
      return savedState.x >= x && savedState.x < x + width &&
             savedState.y >= y && savedState.y < y + height;
    });
  }

  const windowState = {
    width: savedState.width ?? 1280,
    height: savedState.height ?? 905,
    x: validPosition ? savedState.x : undefined,
    y: validPosition ? savedState.y : undefined,
    isMaximized: savedState.isMaximized ?? false,
  };

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    title: 'Paarrot',
    frame: false, // Custom window decorations
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      // Enable navigation gestures (works on macOS and some Linux environments)
      enableBlinkFeatures: 'OverscrollHistoryNavigation'
    },
    icon: getIconPath(process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    show: false // Don't show until ready
  });

  // Enable trackpad swipe gestures for navigation on macOS
  if (process.platform === 'darwin') {
    try {
      mainWindow.on('swipe', (event, direction) => {
        console.log(`Paarrot: Swipe gesture detected: ${direction}`);
        if (direction === 'left' && mainWindow.webContents.canGoForward()) {
          console.log('Paarrot: Navigating forward');
          mainWindow.webContents.goForward();
        } else if (direction === 'right' && mainWindow.webContents.canGoBack()) {
          console.log('Paarrot: Navigating back');
          mainWindow.webContents.goBack();
        }
      });
    } catch (error) {
      console.error('Paarrot: Failed to set up swipe gestures:', error);
    }
  }
  
  // On Linux, the OverscrollHistoryNavigation Blink feature should handle it automatically
  // On Windows, mouse buttons 4 & 5 are typically used for navigation (handled by Chromium)

  // Restore maximized state
  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  // Save window state on resize/move
  const saveWindowState = () => {
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized() && !mainWindow.isFullScreen()) {
      const bounds = mainWindow.getBounds();
      store.set('windowState', {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        isMaximized: false
      });
    }
  };

  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('maximize', () => {
    store.set('windowState.isMaximized', true);
  });
  mainWindow.on('unmaximize', () => {
    store.set('windowState.isMaximized', false);
  });

  // Set up session handlers BEFORE loading the app
  // Auto-approve media permissions including screen capture
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'microphone', 'camera', 'display-capture', 'notifications'];
    
    if (allowedPermissions.includes(permission)) {
      console.log(`Paarrot: Auto-approving permission: ${permission}`);
      callback(true);
    } else {
      console.log(`Paarrot: Denying permission: ${permission}`);
      callback(false);
    }
  });

  // Handle screen capture requests - always allow
  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    console.log(`Paarrot: Permission check - ${permission} from ${requestingOrigin}`);
    return true; // Allow all permissions
  });

  // Handle display media request (screen sharing) - this is the key for Electron screen capture
  mainWindow.webContents.session.setDisplayMediaRequestHandler(async (request, callback) => {
    console.log('Paarrot: Display media request received', request);
    
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 150, height: 150 }
      });
      
      console.log('Paarrot: Available sources:', sources.length);
      sources.forEach((s, i) => console.log(`  ${i}: ${s.name} (${s.id})`));
      
      if (sources.length === 0) {
        console.log('Paarrot: No sources available, denying request');
        callback({});
        return;
      }
      
      // Prefer screens over windows
      const source = sources.find(s => s.id.startsWith('screen:')) || sources[0];
      console.log('Paarrot: Selected source:', source.name, source.id);
      
      // Return the selected source - video is required
      callback({ video: source });
    } catch (error) {
      console.error('Paarrot: Error getting display sources:', error);
      callback({});
    }
  }, { useSystemPicker: false });

  // Disable default context menu, only show for text selection and images
  mainWindow.webContents.on('context-menu', (event, params) => {
    const { selectionText, isEditable, mediaType, srcURL } = params;
    
    // Show context menu for text selection, editable fields, or images
    if (selectionText || isEditable || mediaType === 'image') {
      // Build a minimal menu for text operations
      const template = [];
      
      if (params.misspelledWord) {
        // Add spelling suggestions
        params.dictionarySuggestions.slice(0, 5).forEach(suggestion => {
          template.push({
            label: suggestion,
            click: () => mainWindow.webContents.replaceMisspelling(suggestion)
          });
        });
        if (template.length > 0) {
          template.push({ type: 'separator' });
        }
      }
      
      // Image context menu options
      if (mediaType === 'image' && srcURL) {
        template.push(
          {
            label: 'Copy Image',
            click: () => {
              mainWindow.webContents.copyImageAt(params.x, params.y);
            }
          },
          {
            label: 'Save Image As...',
            click: () => {
              mainWindow.webContents.downloadURL(srcURL);
            }
          }
        );
        if (selectionText) {
          template.push({ type: 'separator' });
        }
      }
      
      if (selectionText) {
        template.push(
          {
            label: 'Copy',
            role: 'copy',
            accelerator: 'CmdOrCtrl+C'
          }
        );
      }
      
      if (isEditable) {
        if (selectionText) {
          template.push(
            {
              label: 'Cut',
              role: 'cut',
              accelerator: 'CmdOrCtrl+X'
            }
          );
        }
        template.push(
          {
            label: 'Paste',
            role: 'paste',
            accelerator: 'CmdOrCtrl+V'
          }
        );
        if (selectionText) {
          template.push({ type: 'separator' });
          template.push(
            {
              label: 'Select All',
              role: 'selectAll',
              accelerator: 'CmdOrCtrl+A'
            }
          );
        }
      }
      
      if (template.length > 0) {
        const menu = Menu.buildFromTemplate(template);
        menu.popup(mainWindow);
      }
    }
    // If no text selected, not editable, and not an image, suppress the context menu entirely
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL(VITE_DEV_SERVER);
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // In production, serve from built files
    mainWindow.loadFile(path.join(__dirname, '../cinny/dist/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    // Check for --minimized flag (autostart)
    if (!process.argv.includes('--minimized')) {
      mainWindow.show();
    }
  });

  // Handle window close - minimize to tray
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in default browser (keep same-origin / Vite in Electron)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === '' || url === 'about:blank') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          frame: false,
          resizable: true,
          backgroundColor: '#000000',
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false,
          },
        },
      };
    }

    if (isAppOwnedUrl(url, mainWindow.webContents.getURL())) {
      return { action: 'allow' };
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      openExternalUrl(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Navigation handler - open external links in browser.
  // Same-origin / local Vite navigations (HMR full reload) must stay in-app.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return;
    }

    if (isAppOwnedUrl(url, mainWindow.webContents.getURL())) {
      return;
    }

    event.preventDefault();
    openExternalUrl(url);
  });

  return mainWindow;
}

function createTray() {
  const iconPath = getIconPath('icon.png');
  const trayIcon = nativeImage.createFromPath(iconPath);
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Paarrot',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('Paarrot');

  // Click tray icon to show window
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// App lifecycle
app.whenReady().then(() => {
  if (process.platform === 'win32') {
    ensureWindowsProtocolRegistryEntries().catch((error) => {
      console.warn('[Protocol] Startup registry ensure failed:', error);
    });
  }

  syncProtocolRegistrationState();

  if (process.platform === 'linux') {
    ensureLinuxProtocolHandler().catch((error) => {
      console.warn('[Protocol] Startup Linux protocol ensure failed:', error);
    });
  }

  createWindow();
  createTray();

  if (pendingDeepLink) {
    applyDeepLink(pendingDeepLink);
  }
  
  // Start API server
  apiServer = new PaarrotAPIServer(mainWindow);
  apiServer.start().catch(err => {
    console.error('Failed to start API server:', err);
  });
  
  // Check for updates on startup
  setTimeout(() => {
    if (isDev) {
      // Exercise the title-bar updater UI with a mock update.
      sendUpdaterEvent('update-available', {
        version: '99.0.0-dev',
        releaseNotes: 'Mock update for development — download to preview the title-bar progress UI.',
        releaseDate: new Date().toISOString(),
        mock: true,
      });
      return;
    }
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('Failed to check for updates:', err);
    });
  }, 2500);

  if (!isDev) {
    // Check for updates every 6 hours
    setInterval(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('Failed to check for updates:', err);
      });
    }, 6 * 60 * 60 * 1000);
  }
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  applyDeepLink(url);
});

app.on('window-all-closed', () => {
  // On macOS, apps stay active until Cmd+Q
  if (process.platform !== 'darwin') {
    // But we want to stay in tray, so don't quit
    // app.quit();
  }
});

app.on('activate', () => {
  // On macOS, recreate window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (mainWindow) {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  
  // Stop API server
  if (apiServer) {
    apiServer.stop();
  }
});

// ==================== IPC Handlers ====================

// Window controls
ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window:unmaximize', () => {
  if (mainWindow) mainWindow.unmaximize();
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:focus', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.handle('window:flash-frame', (event, flash = true) => {
  console.log('[Main] window:flash-frame called with:', flash);
  if (mainWindow) {
    console.log('[Main] Calling flashFrame on mainWindow');
    mainWindow.flashFrame(flash);
    return { success: true };
  }
  console.log('[Main] No mainWindow available');
  return { success: false, error: 'No window' };
});

ipcMain.handle('window:is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

/**
 * Returns protocol registration health for the renderer settings page.
 * @returns {Promise<{ success: boolean; data: { scheme: string; platform: string; isDefault: boolean; before: boolean; registerCall: boolean; error: string | null; windows: null | {userChoiceProgId: string | null; userChoiceCommand: string | null; hkcuCommand: string | null; hklmCommand: string | null} } }>}
 */
ipcMain.handle('protocol:get-status', () => {
  return getProtocolStatusPayload();
});

/**
 * Re-runs protocol registry ensure and protocol registration.
 * @returns {Promise<{ success: boolean; data: { scheme: string; platform: string; isDefault: boolean; before: boolean; registerCall: boolean; error: string | null; windows: null | {userChoiceProgId: string | null; userChoiceCommand: string | null; hkcuCommand: string | null; hklmCommand: string | null} } }>}
 */
ipcMain.handle('protocol:repair', async () => {
  if (process.platform === 'win32') {
    try {
      await ensureWindowsProtocolRegistryEntries();
    } catch (error) {
      console.warn('[Protocol] Failed to write Windows URL protocol registry entries:', error);
    }
  }

  syncProtocolRegistrationState();

  if (process.platform === 'linux') {
    try {
      await ensureLinuxProtocolHandler();
    } catch (error) {
      console.warn('[Protocol] Failed to refresh Linux protocol handler:', error);
    }
  }

  const status = await getProtocolStatusPayload();
  return {
    success: true,
    data: status.data,
  };
});

ipcMain.handle('window:start-drag', () => {
  if (mainWindow) mainWindow.webContents.startDrag({ file: '', icon: nativeImage.createEmpty() });
});

// Get app version (Tauri-compatible API)
ipcMain.handle('plugin:app|version', () => {
  return app.getVersion();
});

// Open external URL
ipcMain.handle('open-external-url', async (event, url) => {
  try {
    await openExternalUrl(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Save a media blob from the renderer via a native Save dialog.
 * Payload: { filename, mimeType?, data: Uint8Array | ArrayBuffer | number[] }
 */
ipcMain.handle('media:save-file', async (event, payload = {}) => {
  try {
    const filename = typeof payload.filename === 'string' && payload.filename.trim()
      ? path.basename(payload.filename.trim()) || 'download'
      : 'download';
    const mimeType = typeof payload.mimeType === 'string' ? payload.mimeType : '';
    const raw = payload.data;
    if (!raw) {
      return { success: false, error: 'Missing file data' };
    }

    const buffer = Buffer.from(
      raw instanceof ArrayBuffer
        ? new Uint8Array(raw)
        : ArrayBuffer.isView(raw)
          ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
          : raw
    );

    const ext = path.extname(filename).replace(/^\./, '').toLowerCase();
    const filters = (() => {
      if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
        return [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
          { name: 'All Files', extensions: ['*'] },
        ];
      }
      if (mimeType.startsWith('video/') || ['mp4', 'webm', 'mkv', 'mov'].includes(ext)) {
        return [
          { name: 'Videos', extensions: ['mp4', 'webm', 'mkv', 'mov'] },
          { name: 'All Files', extensions: ['*'] },
        ];
      }
      if (mimeType.startsWith('audio/') || ['mp3', 'ogg', 'wav', 'm4a', 'flac'].includes(ext)) {
        return [
          { name: 'Audio', extensions: ['mp3', 'ogg', 'wav', 'm4a', 'flac'] },
          { name: 'All Files', extensions: ['*'] },
        ];
      }
      if (mimeType === 'application/pdf' || ext === 'pdf') {
        return [
          { name: 'PDF', extensions: ['pdf'] },
          { name: 'All Files', extensions: ['*'] },
        ];
      }
      if (ext) {
        return [
          { name: ext.toUpperCase(), extensions: [ext] },
          { name: 'All Files', extensions: ['*'] },
        ];
      }
      return [{ name: 'All Files', extensions: ['*'] }];
    })();

    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    const result = await dialog.showSaveDialog(win || undefined, {
      title: 'Save file',
      defaultPath: filename,
      filters,
    });

    if (result.canceled || !result.filePath) {
      return { success: true, canceled: true };
    }

    await fs.promises.writeFile(result.filePath, buffer);
    return { success: true, path: result.filePath };
  } catch (error) {
    console.error('[media:save-file] failed:', error);
    return { success: false, error: error.message || String(error) };
  }
});

// Read clipboard image
ipcMain.handle('read-clipboard-image', async () => {
  try {
    // Extra Things: only trust an image when the clipboard actually advertises one.
    // On Linux, readImage() can return a stale bitmap after copying plain text/URLs.
    const formats = clipboard.availableFormats();
    const hasImageFormat = formats.some((format) => format.startsWith('image/'));
    if (!hasImageFormat) {
      return { success: true, data: null };
    }

    const image = clipboard.readImage();
    if (image.isEmpty()) {
      return { success: true, data: null };
    }

    const { width, height } = image.getSize();
    if (width < 2 || height < 2) {
      return { success: true, data: null };
    }
    
    // Convert to PNG base64
    const pngBuffer = image.toPNG();
    const base64 = pngBuffer.toString('base64');
    return { 
      success: true, 
      data: `data:image/png;base64,${base64}` 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Write text to clipboard
ipcMain.handle('write-clipboard-text', async (event, text) => {
  try {
    clipboard.writeText(text);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-sound-base-url', () => {
  if (isDev) return null; // renderer uses ./sound/ relative path in dev
  return `file://${path.join(process.resourcesPath, 'sound').replace(/\\/g, '/')}`;
});

// Play notification sound via the renderer's Chromium audio engine.
// Chromium has native OGG support on all platforms, so this is always reliable.
ipcMain.handle('play-notification-sound', async (event, soundType = 'message') => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false, error: 'No main window' };
  }
  const soundFile = soundType === 'invite' ? 'invite.ogg' : 'notification.ogg';
  // In dev, Vite serves sounds via HTTP so relative path works.
  // In production, sounds are in resources/sound/ as plain files (extraResources).
  const audioSrc = isDev
    ? `./sound/${soundFile}`
    : `file://${path.join(process.resourcesPath, 'sound', soundFile).replace(/\\/g, '/')}`;
  try {
    await mainWindow.webContents.executeJavaScript(
      `new Audio('${audioSrc}').play().catch(() => {}); true;`
    );
    return { success: true };
  } catch (error) {
    console.error('[Audio] Failed to play sound:', error);
    return { success: false, error: error.message };
  }
});

// Get a direct YouTube stream using yt-dlp.
async function getYouTubeStream(url) {
  try {
    try {
      await execFileAsync('yt-dlp', ['--version']);
    } catch {
      return {
        success: false,
        error: 'yt-dlp is not installed. Please install yt-dlp to use YouTube features.',
      };
    }

    let title = 'YouTube Video';
    try {
      const titleResult = await execFileAsync('yt-dlp', ['--no-playlist', '--get-title', url]);
      title = titleResult.stdout.trim();
    } catch (e) {
      console.warn('Failed to get video title:', e.message);
    }

    const result = await execFileAsync('yt-dlp', [
      '--no-playlist',
      '-g',
      '-f',
      'best[height<=1080]/bestvideo[height<=1080]+bestaudio/best',
      url,
    ]);
    const videoUrl = result.stdout.trim().split('\n')[0];

    if (!videoUrl) {
      return { success: false, error: 'yt-dlp returned empty URL' };
    }

    return {
      success: true,
      data: { video_url: videoUrl, title },
    };
  } catch (error) {
    return {
      success: false,
      error: `yt-dlp error: ${error.message}`,
    };
  }
}

// Get YouTube stream using yt-dlp
ipcMain.handle('get-youtube-stream', async (event, url) => {
  return getYouTubeStream(url);
});

// Background sync stubs (desktop doesn't need it)
ipcMain.handle('start-background-sync', async () => {
  return { success: true };
});

ipcMain.handle('stop-background-sync', async () => {
  return { success: true };
});

ipcMain.handle('get-background-sync-state', async () => {
  return { success: true, data: 'NotApplicable' };
});

// Auto-updater IPC handlers (mock in development so title-bar UI can be exercised)
let mockDownloadTimer = null;
let mockDownloadPercent = 0;

function sendUpdaterEvent(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function startMockDownload() {
  if (mockDownloadTimer) {
    clearInterval(mockDownloadTimer);
  }
  mockDownloadPercent = 0;
  sendUpdaterEvent('update-download-progress', {
    percent: 0,
    transferred: 0,
    total: 100,
    mock: true,
  });

  mockDownloadTimer = setInterval(() => {
    mockDownloadPercent = Math.min(100, mockDownloadPercent + 4 + Math.random() * 6);
    const percent = Math.round(mockDownloadPercent);
    sendUpdaterEvent('update-download-progress', {
      percent,
      transferred: percent,
      total: 100,
      mock: true,
    });

    if (percent >= 100) {
      clearInterval(mockDownloadTimer);
      mockDownloadTimer = null;
      sendUpdaterEvent('update-downloaded', {
        version: '99.0.0-dev',
        releaseNotes: 'Mock update for development.',
        mock: true,
      });
    }
  }, 180);
}

ipcMain.handle('check-for-updates', async () => {
  if (isDev) {
    sendUpdaterEvent('update-checking', { mock: true });
    await new Promise((resolve) => setTimeout(resolve, 600));
    sendUpdaterEvent('update-available', {
      version: '99.0.0-dev',
      releaseNotes: 'Mock update for development — download to preview the title-bar progress UI.',
      releaseDate: new Date().toISOString(),
      mock: true,
    });
    return { success: true, data: { updateInfo: { version: '99.0.0-dev' }, mock: true } };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-update', async () => {
  if (isDev) {
    startMockDownload();
    return { success: true, data: { mock: true } };
  }
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', () => {
  if (isDev) {
    sendUpdaterEvent('update-not-available', {
      version: app.getVersion(),
      mock: true,
      message: 'Mock install — restart skipped in development.',
    });
    return { success: true, data: { mock: true } };
  }
  autoUpdater.quitAndInstall();
  return { success: true };
});

ipcMain.handle('download-and-install-update', async () => {
  if (isDev) {
    startMockDownload();
    return { success: true, data: { mock: true } };
  }
  try {
    await autoUpdater.downloadUpdate();
    autoUpdater.quitAndInstall();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('updater-is-mock', () => ({ success: true, data: { mock: isDev } }));

// Screen capture / desktopCapturer handler
ipcMain.handle('get-desktop-sources', async (event, opts) => {
  try {
    const sources = await desktopCapturer.getSources(opts);
    return { success: true, data: sources };
  } catch (error) {
    console.error('Failed to get desktop sources:', error);
    return { success: false, error: error.message };
  }
});

// Desktop notification handler
ipcMain.handle('show-notification', async (event, { title, body, icon, roomId, eventId }) => {
  try {
    const { Notification } = require('electron');
    
    if (!Notification.isSupported()) {
      console.error('Notifications not supported on this system');
      return { success: false, error: 'Notifications not supported on this system' };
    }
    
    const notification = new Notification({
      title: title || 'Paarrot',
      body: body || '',
      icon: icon || getIconPath(process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
      silent: false,
    });
    
    notification.on('click', () => {
      console.log('Paarrot: Notification clicked, roomId:', roomId);
      if (mainWindow) {
        console.log('Paarrot: Sending navigation to renderer');
        mainWindow.show();
        mainWindow.focus();
        if (roomId) {
          mainWindow.webContents.send('notification:navigate', { roomId, eventId });
          console.log('Paarrot: Navigation event sent');
        }
      } else {
        console.log('Paarrot: No mainWindow available');
      }
    });
    
    notification.on('show', () => console.log('Paarrot: Notification shown'));
    notification.on('failed', (e, err) => console.error('Paarrot: Notification failed:', err));
    
    notification.show();
    
    return { success: true };
  } catch (error) {
    console.error('Failed to show notification:', error);
    return { success: false, error: error.message };
  }
});

// Plugin management
const getPluginsDir = () => {
  try {
    const pluginsPath = path.join(app.getPath('userData'), 'plugins');
    if (!fs.existsSync(pluginsPath)) {
      fs.mkdirSync(pluginsPath, { recursive: true });
    }
    return pluginsPath;
  } catch (error) {
    console.error('Failed to get plugins directory:', error);
    throw error;
  }
};

/**
 * Resolves plugin entry file from directory.
 * Supports direct `index.js` or `package.json#main` entries.
 */
const resolvePluginEntryFromDir = (pluginDir) => {
  const packageJsonPath = path.join(pluginDir, 'package.json');

  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (typeof packageJson.main === 'string') {
        const mainPath = path.resolve(pluginDir, packageJson.main);
        if (fs.existsSync(mainPath)) {
          return mainPath;
        }
      }
    } catch (error) {
      console.warn(`Failed to parse package.json in ${pluginDir}:`, error);
    }
  }

  const indexPath = path.join(pluginDir, 'index.js');
  return fs.existsSync(indexPath) ? indexPath : null;
};

/**
 * Resolves plugin entry file from extracted plugin directory.
 * Handles archives that unpack into single nested root folder.
 */
const resolvePluginEntryPath = (pluginDir) => {
  const directEntry = resolvePluginEntryFromDir(pluginDir);
  if (directEntry) {
    return directEntry;
  }

  const childDirectories = fs.readdirSync(pluginDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (childDirectories.length !== 1) {
    return null;
  }

  return resolvePluginEntryFromDir(path.join(pluginDir, childDirectories[0].name));
};

ipcMain.handle('plugin:get-path', async () => {
  try {
    // Wait for app to be ready before accessing userData path
    await app.whenReady();
    return { success: true, data: getPluginsDir() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('plugin:download', async (event, { pluginId, downloadUrl, name }) => {
  try {
    // Wait for app to be ready before accessing userData path
    await app.whenReady();
    const pluginsDir = getPluginsDir();
    const pluginDir = path.join(pluginsDir, pluginId);
    
    // Check if already installed
    if (fs.existsSync(pluginDir)) {
      return { success: false, error: 'Plugin already installed' };
    }
    
    // Validate downloadUrl
    if (!downloadUrl || typeof downloadUrl !== 'string' || downloadUrl.trim() === '') {
      return { success: false, error: 'Plugin metadata missing downloadUrl field' };
    }
    
    // Download the zip file
    const tempZipPath = path.join(app.getPath('temp'), `${pluginId}.zip`);
    
    await new Promise((resolve, reject) => {
      const protocol = downloadUrl.startsWith('https') ? https : http;
      const file = fs.createWriteStream(tempZipPath);
      
      protocol.get(downloadUrl, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirect
          const redirectUrl = response.headers.location;
          const redirectProtocol = redirectUrl.startsWith('https') ? https : http;
          redirectProtocol.get(redirectUrl, (redirectResponse) => {
            redirectResponse.pipe(file);
            file.on('finish', () => {
              file.close(resolve);
            });
          }).on('error', reject);
        } else {
          response.pipe(file);
          file.on('finish', () => {
            file.close(resolve);
          });
        }
      }).on('error', (err) => {
        fs.unlinkSync(tempZipPath);
        reject(err);
      });
    });
    
    // Extract the zip file to temp location first
    const tempExtractDir = path.join(app.getPath('temp'), `${pluginId}-extract`);
    if (fs.existsSync(tempExtractDir)) {
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempExtractDir, { recursive: true });
    
    const zip = new AdmZip(tempZipPath);
    zip.extractAllTo(tempExtractDir, true);
    
    // Clean up temp zip
    fs.unlinkSync(tempZipPath);
    
    // GitHub archives extract to repo-name-branch/ folder, flatten it
    const extractedContents = fs.readdirSync(tempExtractDir);
    let sourceDir = tempExtractDir;
    
    // If single folder exists, move contents up one level
    if (extractedContents.length === 1) {
      const singleItem = path.join(tempExtractDir, extractedContents[0]);
      if (fs.statSync(singleItem).isDirectory()) {
        sourceDir = singleItem;
      }
    }
    
    // Move contents to final plugin directory
    fs.mkdirSync(pluginDir, { recursive: true });
    const files = fs.readdirSync(sourceDir);
    for (const file of files) {
      const srcPath = path.join(sourceDir, file);
      const destPath = path.join(pluginDir, file);
      fs.renameSync(srcPath, destPath);
    }
    
    // Clean up temp extract dir
    fs.rmSync(tempExtractDir, { recursive: true, force: true });
    
    // Store metadata
    const metadataPath = path.join(pluginDir, 'plugin-metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify({
      id: pluginId,
      name: name,
      installedDate: new Date().toISOString(),
    }, null, 2));
    
    return { success: true, data: { path: pluginDir } };
  } catch (error) {
    console.error('Failed to download plugin:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('plugin:list', async () => {
  try {
    // Wait for app to be ready before accessing userData path
    await app.whenReady();
    const pluginsDir = getPluginsDir();
    const plugins = [];
    
    if (fs.existsSync(pluginsDir)) {
      const items = fs.readdirSync(pluginsDir);
      
      for (const item of items) {
        const itemPath = path.join(pluginsDir, item);
        const stats = fs.statSync(itemPath);
        
        if (stats.isDirectory()) {
          const metadataPath = path.join(itemPath, 'plugin-metadata.json');
          if (fs.existsSync(metadataPath)) {
            try {
              const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
              plugins.push({
                id: item,
                path: itemPath,
                ...metadata
              });
            } catch (err) {
              console.error(`Failed to read metadata for plugin ${item}:`, err);
            }
          }
        }
      }
    }
    
    return { success: true, data: plugins };
  } catch (error) {
    console.error('Failed to list plugins:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('plugin:uninstall', async (event, pluginId) => {
  try {
    // Wait for app to be ready before accessing userData path
    await app.whenReady();
    const pluginsDir = getPluginsDir();
    const pluginDir = path.join(pluginsDir, pluginId);
    
    if (!fs.existsSync(pluginDir)) {
      return { success: false, error: 'Plugin not found' };
    }
    
    // Recursively delete the plugin directory
    const deleteDir = (dirPath) => {
      if (fs.existsSync(dirPath)) {
        fs.readdirSync(dirPath).forEach((file) => {
          const curPath = path.join(dirPath, file);
          if (fs.lstatSync(curPath).isDirectory()) {
            deleteDir(curPath);
          } else {
            fs.unlinkSync(curPath);
          }
        });
        fs.rmdirSync(dirPath);
      }
    };
    
    deleteDir(pluginDir);
    
    return { success: true };
  } catch (error) {
    console.error('Failed to uninstall plugin:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('plugin:read-code', async (event, pluginId) => {
  try {
    await app.whenReady();
    const pluginsDir = getPluginsDir();
    const pluginDir = path.join(pluginsDir, pluginId);
    const pluginPath = resolvePluginEntryPath(pluginDir);
    
    if (!pluginPath || !fs.existsSync(pluginPath)) {
      return { success: false, error: 'Plugin index.js not found' };
    }
    
    const code = fs.readFileSync(pluginPath, 'utf8');
    return { success: true, data: code };
  } catch (error) {
    console.error('Failed to read plugin code:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('discord-collectibles:fetch-catalog', async (event, { force } = {}) => {
  try {
    return await discordCollectibles.getCatalog({ force: Boolean(force) });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('discord-collectibles:download-assets', async (event, { assets }) => {
  try {
    if (!Array.isArray(assets) || assets.length === 0) {
      return { success: false, error: 'No assets to download' };
    }
    const downloaded = await discordCollectibles.downloadAssets(assets);
    return {
      success: true,
      data: downloaded.map((item) => ({
        role: item.role,
        url: item.url,
        filename: item.filename,
        mimeType: item.mimeType,
        data: item.data,
      })),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

console.log('Paarrot Electron main process started');
console.log('Development mode:', isDev);
console.log('Platform:', process.platform);
console.log('Plugin handlers registered');
