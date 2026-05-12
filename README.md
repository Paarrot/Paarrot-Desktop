# Paarrot 

Paarrot is a Matrix client focusing primarily on simple, elegant and secure interface. The desktop app is built with Electron and based on Cinny.
 
## Download

Installers for Windows and Linux can be downloaded from [releases](http://synbox.ruv.wtf:8418/litruv/cinny-desktop/releases).
 
Operating System | Download
---|---
Windows (x64) | <a href='http://synbox.ruv.wtf:8418/litruv/cinny-desktop/releases'>Get it on Windows</a>
Linux (AppImage) | <a href='http://synbox.ruv.wtf:8418/litruv/cinny-desktop/releases'>Get it on Linux</a>

### Linux Installation

For the best AppImage experience, we recommend using [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) which automatically integrates AppImages into your system.

## Local development

To setup development locally run the following commands:
* `git clone --recursive http://synbox.ruv.wtf:8418/litruv/cinny-desktop.git`
* `cd cinny-desktop/cinny`
* `npm ci`
* `cd ..`
* `npm ci` 

To build the app locally, run:
* `npm run build`

To start local dev server, run:
* `npm run dev`

## Plugin System

Paarrot includes a plugin system for extending and customising the app with JavaScript modules.

### Installing Plugins

1. Drop a plugin folder into your plugins directory:
   - **Windows**: `%APPDATA%\paarrot\plugins\<plugin-name>\`
   - **Linux**: `~/.config/Paarrot/plugins/<plugin-name>/`
   - **macOS**: `~/Library/Application Support/Paarrot/plugins/<plugin-name>/`
2. Enable it in **Settings → Plugins → Installed**

### What Plugins Can Do

- Register custom slash commands
- Intercept and modify messages
- Inject buttons into 11 UI locations (nav lists, toolbars, headers, sidebar, menus)
- Register custom themes
- Hook into raw Matrix events
- Run background tasks
- Show system notifications

### Plugin Locations (UI Buttons)

Plugins can inject buttons as **nav list rows** or **icon buttons** across the app:

| Location | Style | Where |
|---|---|---|
| `channel-list` | Nav row | Space channel list |
| `home-section` | Nav row | Home panel, above room list |
| `direct-messages` | Nav row | DMs panel, below "Create Chat" |
| `sidebar-actions` | Icon | Left sidebar — above Explore and above Search |
| `text-composer-toolbar` | Icon | Message composer toolbar |
| `composer-actions` | Icon | Beside the `+` attach button |
| `room-header` | Icon | Room header bar |
| `room-menu` | Icon | Room ⋮ dropdown |
| `message-actions` | Icon | Message hover bar |
| `user-menu` | Icon | Right-click on user avatar |
| `search-notification-section` | Icon | Notifications page header |

### Documentation

- [Plugin System Overview](PLUGINS.md)
- [Full Plugin API Reference](docs/PLUGIN_API.md)
- [Button Registration API](docs/PLUGIN_BUTTON_API.md)
- [Example Plugins](plugins/)
