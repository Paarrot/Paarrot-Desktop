# Paarrot Plugin System

The Paarrot desktop client includes a powerful plugin system that allows you to extend and customize your Matrix experience.

## What are Plugins?

Plugins are small JavaScript modules that run inside Paarrot and can:
- Add custom commands
- Modify the UI
- React to Matrix events
- Add new settings sections
- Enhance functionality

## Installing Plugins

### From the Plugin Marketplace

1. Open **Settings** → **Plugins**
2. Browse the **Marketplace** tab
3. Click **Install** on any plugin you want to add
4. The plugin will be downloaded and enabled automatically

### Manual Installation

1. Download a plugin ZIP file
2. Extract it to your plugins directory:
   - **Windows**: `%APPDATA%\paarrot\plugins\`
   - **Linux**: `~/.config/Paarrot/plugins/`
   - **macOS**: `~/Library/Application Support/Paarrot/plugins/`
3. Restart Paarrot
4. Enable the plugin in **Settings** → **Plugins** → **Installed**

## Managing Plugins

### Viewing Installed Plugins

Go to **Settings** → **Plugins** → **Installed** to see all installed plugins.

### Enabling/Disabling Plugins

Click the toggle switch next to any plugin to enable or disable it. Disabled plugins won't run or use resources.

### Uninstalling Plugins

Click the **Uninstall** button next to any plugin to remove it completely.

### Searching Plugins

Use the search bar to filter plugins by name, description, author, or tags.

## Plugin Security

⚠️ **Important Security Information**

Plugins run with access to your Matrix client and can:
- Read your messages
- Send messages on your behalf
- Access your room list
- Modify app behavior

**Only install plugins from trusted sources!**

### Safety Tips

1. **Check the author**: Install plugins from known developers
2. **Read reviews**: Look for community feedback
3. **Review permissions**: Understand what the plugin can do
4. **Keep updated**: Update plugins regularly for security fixes
5. **Report issues**: If a plugin behaves suspiciously, report it immediately

## Developing Plugins

Want to create your own plugin? Check out the [Plugin API Reference](docs/PLUGIN_API.md).

### Quick Start

1. Create a plugin directory with:
   - `index.js` - Your plugin code
   - `plugin-metadata.json` - Plugin information

2. Implement the plugin interface:
```javascript
module.exports = {
  onLoad: async (context) => {
    // Your plugin initialization
    console.log('Plugin loaded!');
  },
  onUnload: async () => {
    // Cleanup when disabled
  }
};
```

3. Test locally by copying to your plugins directory

4. Publish to the [Plugin Directory](https://github.com/Paarrot/Plugin-Directory)

## Plugin API

Plugins have access to:
- **Matrix Client**: Full matrix-js-sdk client instance
- **React**: For building UI components
- **Commands**: Register custom slash commands
- **UI Buttons**: Inject buttons into 11 locations across the app (nav lists, toolbars, headers, sidebar)
- **UI Renderers**: Custom message and content renderers
- **Settings**: Add custom settings sections per plugin
- **Themes**: Register custom themes that appear in the theme selector
- **Matrix Events**: Hook into raw Matrix events
- **Timers**: Background intervals and timeouts, auto-cleaned on unload
- **Notifications**: System notifications

See the [Plugin API Reference](docs/PLUGIN_API.md) and [Button Registration API](docs/PLUGIN_BUTTON_API.md) for complete documentation.

## Example Plugins

Check out the `example-plugin/` directory for a simple example, or the `plugins/example-showcase-plugin/` for a full demonstration of all 11 UI button locations.

## Troubleshooting

### Plugin Won't Load

1. Check the browser console for errors (F12 → Console)
2. Look for `[PluginLoader]` messages
3. Verify `index.js` exists in the plugin directory
4. Ensure `plugin-metadata.json` is valid JSON

### Plugin Crashes

1. Disable the plugin in Settings → Plugins
2. Check console for error stack traces
3. Report the issue to the plugin author
4. Try reinstalling the plugin

### Performance Issues

If Paarrot becomes slow:
1. Disable plugins one by one to identify the culprit
2. Check for memory leaks in the console
3. Contact the plugin author with details

## Plugin Directory

The official Paarrot Plugin Directory is maintained at:
https://github.com/Paarrot/Plugin-Directory

Submit your plugins there to make them available in the marketplace!

## Support

- **Plugin API Reference**: [docs/PLUGIN_API.md](docs/PLUGIN_API.md)
- **Button API Reference**: [docs/PLUGIN_BUTTON_API.md](docs/PLUGIN_BUTTON_API.md)
- **Issues**: https://github.com/Paarrot/cinny-desktop/issues
- **Community**: Join our Matrix room for plugin development help

## License

Plugins are independent works and have their own licenses. Check each plugin's metadata for license information.
