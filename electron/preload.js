const { contextBridge, ipcRenderer } = require('electron');

// Map command names to Electron IPC channels
const commandMap = {
  'window_minimize': 'window:minimize',
  'window_maximize': 'window:maximize',
  'window_unmaximize': 'window:unmaximize',
  'window_close': 'window:close',
  'window_is_maximized': 'window:is-maximized',
  'window_start_drag': 'window:start-drag',
  'read_clipboard_image': 'read-clipboard-image',
  'write_clipboard_text': 'write-clipboard-text',
  'open_external_url': 'open-external-url',
  'get_youtube_stream': 'get-youtube-stream',
  'start_background_sync': 'start-background-sync',
  'stop_background_sync': 'stop-background-sync',
  'get_background_sync_state': 'get-background-sync-state',
  'check_for_updates': 'check-for-updates',
  'download_update': 'download-update',
  'install_update': 'install-update',
  'get_desktop_sources': 'get-desktop-sources'
};

// Shared invoke function for legacy API compatibility
const invokeHandler = async (command, args = {}) => {
  try {
    const channel = commandMap[command] || command;
    const result = await ipcRenderer.invoke(channel, args);

    // Return response in expected format
    if (result && result.success === false) {
      throw new Error(result.error || 'Unknown error');
    }

    // For commands that return data in a 'data' field
    if (result && result.data !== undefined) {
      return result.data;
    }

    // For simple commands that just return success/failure
    return result;
  } catch (error) {
    console.error(`[Electron IPC] Error invoking ${command}:`, error);
    throw error;
  }
};

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('__TAURI_INTERNALS__', {
  // Legacy API compatibility layer for existing frontend code
  metadata: {
    currentVersion: {
      version: '2.0.0',
      platform: process.platform,
      arch: process.arch
    }
  },
  // Add invoke function for legacy plugins
  invoke: invokeHandler,
  // Add stub for transformCallback to prevent errors with legacy plugins
  transformCallback: (callback) => {
    return callback;
  }
});

contextBridge.exposeInMainWorld('__TAURI__', {
  // Core IPC invoke - legacy API
  invoke: invokeHandler,

  // Event listeners (if needed for future events)
  listen: (event, handler) => {
    const subscription = (_, ...args) => handler(...args);
    ipcRenderer.on(event, subscription);
    
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(event, subscription);
    };
  }
});

// Also expose under electron namespace for direct Electron APIs
contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  arch: process.arch,
  versions: process.versions,
  
  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    unmaximize: () => ipcRenderer.invoke('window:unmaximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    startDrag: () => ipcRenderer.invoke('window:start-drag')
  },
  
  // Clipboard
  clipboard: {
    readImage: () => ipcRenderer.invoke('read-clipboard-image'),
    writeText: (text) => ipcRenderer.invoke('write-clipboard-text', text)
  },
  
  // External URLs
  shell: {
    openExternal: (url) => ipcRenderer.invoke('open-external-url', url)
  },
  
  // YouTube
  youtube: {
    getStream: (url) => ipcRenderer.invoke('get-youtube-stream', url)
  },
  
  // Background sync (stubs for desktop)
  sync: {
    start: (args) => ipcRenderer.invoke('start-background-sync', args),
    stop: () => ipcRenderer.invoke('stop-background-sync'),
    getState: () => ipcRenderer.invoke('get-background-sync-state')
  },
  
  // Auto-updater
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    onUpdateAvailable: (callback) => {
      ipcRenderer.on('update-available', (_, info) => callback(info));
    },
    onUpdateDownloadProgress: (callback) => {
      ipcRenderer.on('update-download-progress', (_, progress) => callback(progress));
    },
    onUpdateDownloaded: (callback) => {
      ipcRenderer.on('update-downloaded', (_, info) => callback(info));
    }
  },
  
  // Desktop capturer (for screen sharing)
  desktopCapturer: {
    getSources: (opts) => ipcRenderer.invoke('get-desktop-sources', opts)
  },
  
  // API action handler (for external API server)
  api: {
    onAction: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on('api-action', handler);
      return () => ipcRenderer.removeListener('api-action', handler);
    },
    sendResponse: (channel, result) => {
      ipcRenderer.invoke(channel, result);
    }
  },
  
  // Desktop notifications
  notification: {
    show: (options) => ipcRenderer.invoke('show-notification', options)
  }
});

// Preload script ready

