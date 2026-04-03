const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, clipboard, session, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const Store = require('electron-store');
const open = require('open');
const PaarrotAPIServer = require('./api-server');
const https = require('https');
const http = require('http');

// Handle Squirrel events for Windows installer
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Handle Squirrel.Windows installation/update events
if (process.platform === 'win32') {
  const handleSquirrelEvent = () => {
    if (process.argv.length === 1) {
      return false;
    }

    const squirrelEvent = process.argv[1];
    
    switch (squirrelEvent) {
      case '--squirrel-install':
      case '--squirrel-updated':
        // Install desktop and start menu shortcuts
        const cp = require('child_process');
        const updateDotExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
        const target = path.basename(process.execPath);
        const createShortcut = `${updateDotExe} --createShortcut=${target}`;
        
        cp.exec(createShortcut, () => {
          app.quit();
        });
        return true;

      case '--squirrel-uninstall':
        // Remove desktop and start menu shortcuts
        const cpUninstall = require('child_process');
        const updateDotExeUninstall = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
        const targetUninstall = path.basename(process.execPath);
        const removeShortcut = `${updateDotExeUninstall} --removeShortcut=${targetUninstall}`;
        
        cpUninstall.exec(removeShortcut, () => {
          app.quit();
        });
        return true;

      case '--squirrel-obsolete':
        // This is called on the outgoing version of your app before
        // we update to the new version - it's the opposite of
        // --squirrel-updated
        app.quit();
        return true;
    }

    return false;
  };

  if (handleSquirrelEvent()) {
    // Squirrel event handled and app will exit in 1000ms, so don't do anything else
    return;
  }
}

const execAsync = promisify(exec);
const store = new Store();

let mainWindow = null;
let tray = null;
let isQuitting = false;
let apiServer = null;

// Allow audio playback without requiring a prior user gesture (needed for notification sounds)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Set app name for notifications and system tray
app.setName('Paarrot');

// Gitea update configuration
const GITEA_API_BASE = 'http://synbox.ruv.wtf:8418/api/v1';
const GITEA_REPO = 'litruv/cinny-desktop';

let pendingUpdateInfo = null;
let downloadedUpdatePath = null;

/**
 * Compares two semver-style version strings.
 * @param {string} v1
 * @param {string} v2
 * @returns {number} 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1, v2) {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

/**
 * Performs an HTTP/HTTPS GET request and resolves with parsed JSON.
 * Follows redirects automatically.
 * @param {string} url
 * @returns {Promise<any>}
 */
function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const options = { headers: { 'User-Agent': `Paarrot/${app.getVersion()}` } };
    protocol.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGetJson(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    }).on('error', reject);
  });
}

/**
 * Downloads a file from a URL to a destination path, reporting progress.
 * Follows redirects automatically.
 * @param {string} url
 * @param {string} dest
 * @param {(percent: number) => void} onProgress
 * @returns {Promise<void>}
 */
function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const doRequest = (requestUrl) => {
      const protocol = requestUrl.startsWith('https') ? https : http;
      const options = { headers: { 'User-Agent': `Paarrot/${app.getVersion()}` } };
      protocol.get(requestUrl, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doRequest(res.headers.location);
          return;
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let transferred = 0;
        const file = fs.createWriteStream(dest);
        res.on('data', (chunk) => {
          transferred += chunk.length;
          if (total > 0) onProgress(Math.round((transferred / total) * 100));
        });
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      }).on('error', reject);
    };
    doRequest(url);
  });
}

/**
 * Checks the Gitea API for a newer release. Emits 'update-available' to the
 * renderer if one is found. Does NOT require a latest.yml asset.
 * @returns {Promise<{updateAvailable: boolean, info?: object}>}
 */
async function checkForGiteaUpdate() {
  const currentVersion = app.getVersion();
  console.log('Checking for updates, current version:', currentVersion);

  const releases = await httpGetJson(`${GITEA_API_BASE}/repos/${GITEA_REPO}/releases?limit=1`);

  if (!Array.isArray(releases) || releases.length === 0) {
    console.log('No releases found');
    return { updateAvailable: false };
  }

  const latest = releases[0];
  const latestVersion = latest.tag_name.replace(/^v/, '');
  console.log('Latest release version:', latestVersion);

  if (compareVersions(latestVersion, currentVersion) <= 0) {
    console.log('No update available');
    return { updateAvailable: false };
  }

  const assets = latest.assets || [];
  let downloadUrl = null;

  if (process.platform === 'win32') {
    const asset = assets.find((a) => /win.*\.exe$/i.test(a.name) || /Setup.*\.exe$/i.test(a.name));
    downloadUrl = asset?.browser_download_url || null;
  } else if (process.platform === 'linux') {
    const asset = assets.find((a) => a.name.endsWith('.AppImage'));
    downloadUrl = asset?.browser_download_url || null;
  } else if (process.platform === 'darwin') {
    const asset = assets.find((a) => a.name.endsWith('.dmg'));
    downloadUrl = asset?.browser_download_url || null;
  }

  pendingUpdateInfo = {
    version: latestVersion,
    releaseNotes: latest.body || '',
    releaseDate: latest.published_at,
    downloadUrl,
    htmlUrl: latest.html_url,
  };

  console.log('Update available:', latestVersion, '| asset URL:', downloadUrl || '(none, will use release page)');

  if (mainWindow) {
    mainWindow.webContents.send('update-available', pendingUpdateInfo);
  }

  return { updateAvailable: true, info: pendingUpdateInfo };
}

/**
 * Downloads the pending update asset to the temp directory, reporting progress.
 * If no direct asset URL is available, opens the release page in the browser.
 * @returns {Promise<{success: boolean, opened?: boolean}>}
 */
async function downloadGiteaUpdate() {
  if (!pendingUpdateInfo) throw new Error('No pending update info');

  const { downloadUrl, htmlUrl, version } = pendingUpdateInfo;

  if (!downloadUrl) {
    shell.openExternal(htmlUrl);
    return { success: true, opened: true };
  }

  const ext = downloadUrl.split('.').pop();
  const tmpDir = path.join(app.getPath('temp'), 'paarrot-update');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const destPath = path.join(tmpDir, `Paarrot-${version}-update.${ext}`);

  await downloadFile(downloadUrl, destPath, (percent) => {
    console.log(`Download progress: ${percent}%`);
    if (mainWindow) {
      mainWindow.webContents.send('update-download-progress', { percent, transferred: 0, total: 0 });
    }
  });

  downloadedUpdatePath = destPath;
  console.log('Update downloaded to:', destPath);

  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', pendingUpdateInfo);
  }

  return { success: true };
}

/**
 * Launches the downloaded installer (or opens the release page if no file was
 * downloaded) and quits the app.
 * On Linux/AppImage: overwrites the running AppImage in-place and relaunches.
 * On Windows: runs the installer and quits.
 * On macOS: opens the DMG for manual installation.
 */
function installGiteaUpdate() {
  if (downloadedUpdatePath && fs.existsSync(downloadedUpdatePath)) {
    if (process.platform === 'win32') {
      exec(`"${downloadedUpdatePath}"`);
      app.quit();
    } else if (process.platform === 'linux') {
      const currentAppImage = process.env.APPIMAGE;
      if (currentAppImage) {
        try {
          fs.chmodSync(downloadedUpdatePath, 0o755);
          fs.copyFileSync(downloadedUpdatePath, currentAppImage);
          fs.unlinkSync(downloadedUpdatePath);
          console.log('AppImage replaced, relaunching...');
          app.relaunch({ execPath: currentAppImage });
          app.quit();
        } catch (err) {
          console.error('Failed to replace AppImage in-place, opening file instead:', err);
          shell.openPath(downloadedUpdatePath);
          app.quit();
        }
      } else {
        // Not running as AppImage (e.g. dev/unpacked), just open it
        shell.openPath(downloadedUpdatePath);
        app.quit();
      }
    } else {
      // macOS: open the DMG for manual installation
      shell.openPath(downloadedUpdatePath);
      app.quit();
    }
  } else if (pendingUpdateInfo?.htmlUrl) {
    shell.openExternal(pendingUpdateInfo.htmlUrl);
    app.quit();
  }
}


// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Development mode detection
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const VITE_DEV_SERVER = 'http://localhost:38347';
const PORT = 44548;

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

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url, features }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    // Allow blank windows for screen share pop-outs with custom features
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
          }
        }
      };
    }
    return { action: 'allow' };
  });

  // Navigation handler - open external links in browser
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigins = [
      'http://localhost:8080',
      'http://localhost:44548',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:44548'
    ];
    
    const isAllowed = allowedOrigins.some(origin => url.startsWith(origin)) ||
                      url.startsWith('blob:') ||
                      url.startsWith('data:');
    
    if (!isAllowed && (url.startsWith('http://') || url.startsWith('https://'))) {
      event.preventDefault();
      shell.openExternal(url);
    }
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
  createWindow();
  createTray();
  
  // Start API server
  apiServer = new PaarrotAPIServer(mainWindow);
  apiServer.start().catch(err => {
    console.error('Failed to start API server:', err);
  });
  
  // Check for updates (not in development mode)
  if (!isDev) {
    // Check for updates on start (after 3 seconds)
    setTimeout(async () => {
      try {
        await checkForGiteaUpdate();
      } catch (err) {
        console.error('Failed to check for updates:', err);
      }
    }, 3000);

    // Check for updates every 6 hours
    setInterval(async () => {
      try {
        await checkForGiteaUpdate();
      } catch (err) {
        console.error('Failed to check for updates:', err);
      }
    }, 6 * 60 * 60 * 1000);
  }
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
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Read clipboard image
ipcMain.handle('read-clipboard-image', async () => {
  try {
    const image = clipboard.readImage();
    if (image.isEmpty()) {
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

// Get YouTube stream using yt-dlp
ipcMain.handle('get-youtube-stream', async (event, url) => {
  try {
    // Check if yt-dlp is available
    try {
      await execAsync('yt-dlp --version');
    } catch {
      return { 
        success: false, 
        error: 'yt-dlp is not installed. Please install yt-dlp to use YouTube features.' 
      };
    }

    // Get title
    let title = 'YouTube Video';
    try {
      const titleResult = await execAsync(`yt-dlp --get-title "${url}"`);
      title = titleResult.stdout.trim();
    } catch (e) {
      console.warn('Failed to get video title:', e.message);
    }

    // Get video URL
    const result = await execAsync(
      `yt-dlp -g -f "best[height<=1080]/bestvideo[height<=1080]+bestaudio/best" "${url}"`
    );
    
    const videoUrl = result.stdout.trim().split('\n')[0];
    
    if (!videoUrl) {
      return { success: false, error: 'yt-dlp returned empty URL' };
    }

    return { 
      success: true, 
      data: { video_url: videoUrl, title } 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `yt-dlp error: ${error.message}` 
    };
  }
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

// Auto-updater IPC handlers
ipcMain.handle('check-for-updates', async () => {
  if (isDev) {
    return { success: false, error: 'Updates are not available in development mode' };
  }
  try {
    const result = await checkForGiteaUpdate();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-update', async () => {
  if (isDev) {
    return { success: false, error: 'Updates are not available in development mode' };
  }
  try {
    const result = await downloadGiteaUpdate();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', () => {
  if (isDev) {
    return { success: false, error: 'Updates are not available in development mode' };
  }
  installGiteaUpdate();
  return { success: true };
});

ipcMain.handle('download-and-install-update', async () => {
  if (isDev) {
    return { success: false, error: 'Updates are not available in development mode' };
  }
  try {
    const result = await downloadGiteaUpdate();
    if (!result.opened) {
      installGiteaUpdate();
    }
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

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

console.log('Paarrot Electron main process started');
console.log('Development mode:', isDev);
console.log('Platform:', process.platform);
