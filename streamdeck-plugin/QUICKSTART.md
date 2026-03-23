# Quick Start Guide - Paarrot Stream Deck Plugin

## For Users

### Installation (3 simple steps)

1. **Download the plugin**
   - Get `com.paarrot.streamdeck-v1.0.0.streamDeckPlugin` from releases

2. **Install**
   - Double-click the `.streamDeckPlugin` file
   - Stream Deck software will open and install it automatically

3. **Add to your Stream Deck**
   - Open Stream Deck software
   - Find "Paarrot" in the actions list (under "Voice & Chat")
   - Drag actions to your buttons

### Quick Action Guide

| Action | What it does | Setup needed? |
|--------|--------------|---------------|
| Toggle Mute | Mute/unmute mic | No |
| Toggle Deafen | Mute/unmute speakers | No |
| Change Channel | Switch rooms | Yes - pick room |
| Send Message | Send preset message | Yes - type message |
| Get Status | Show mute/deafen state | No |

### Configuration Examples

**Change Channel**:
1. Drag to button
2. Click button in Stream Deck to open settings
3. Select channel from dropdown
4. Done!

**Send Message**:
1. Drag to button
2. Click button in Stream Deck to open settings
3. Type message (e.g., "BRB!")
4. Done!

---

## For Developers

### Prerequisites

- Node.js (for build scripts)
- Stream Deck software
- Text editor

### Development Setup

```powershell
# Clone or download the repo
cd streamdeck-plugin

# Validate plugin structure
node validate.js

# Install to Stream Deck (Windows)
Copy-Item -Recurse -Force com.paarrot.streamdeck.sdPlugin "$env:APPDATA\Elgato\StreamDeck\Plugins\"

# Install to Stream Deck (macOS)
cp -r com.paarrot.streamdeck.sdPlugin ~/Library/Application\ Support/com.elgato.StreamDeck/Plugins/

# Restart Stream Deck software
```

### Making Changes

1. Edit files in `com.paarrot.streamdeck.sdPlugin/`
2. Run validation: `node validate.js`
3. Restart Stream Deck software
4. Test your changes

### Building for Distribution

```powershell
# Validate first
node validate.js

# Build .streamDeckPlugin file
node build.js

# Output will be in dist/ folder
```

### File Guide

```
com.paarrot.streamdeck.sdPlugin/
├── manifest.json              # Edit: plugin info, actions
├── plugin/
│   └── index.js              # Edit: main logic, API calls
├── propertyinspector/
│   ├── change-channel.html   # Edit: channel picker UI
│   └── send-message.html     # Edit: message input UI
└── images/                    # Edit: replace SVGs with your icons
    └── *.svg
```

### Adding a New Action

1. **Add to manifest.json**:
```json
{
  "Icon": "images/my-action",
  "Name": "My Action",
  "States": [{ "Image": "images/my-action" }],
  "Tooltip": "Does something cool",
  "UUID": "com.paarrot.streamdeck.myaction"
}
```

2. **Add icon**: `images/my-action.svg`

3. **Add logic in plugin/index.js**:
```javascript
const ACTIONS = {
  MY_ACTION: 'com.paarrot.streamdeck.myaction'
};

// In handleKeyDown:
case ACTIONS.MY_ACTION:
  // Your code here
  break;
```

4. **Test**: Restart Stream Deck software

### Testing

1. Enable Stream Deck console: `View > Open Console`
2. Watch for errors when pressing buttons
3. Test all actions with Paarrot running
4. Test with Paarrot not running (should fail gracefully)

### API Reference

The plugin calls these Paarrot API endpoints:

```javascript
// Status polling (every 1 second)
GET http://127.0.0.1:33384/status

// Toggle actions
POST http://127.0.0.1:33384/mute/toggle
POST http://127.0.0.1:33384/deafen/toggle

// Configured actions
POST http://127.0.0.1:33384/channel
  Body: { "roomId": "!abc:server.com" }

POST http://127.0.0.1:33384/message/current
  Body: { "message": "Hello!" }

// Property inspector
GET http://127.0.0.1:33384/channels
```

### Common Issues

**Plugin not loading**:
- Check manifest.json syntax (use validator)
- Ensure folder name is exactly `com.paarrot.streamdeck.sdPlugin`
- Restart Stream Deck software

**Actions not working**:
- Open console (View > Open Console)
- Check for JavaScript errors
- Verify Paarrot API is running

**Icons not showing**:
- Ensure files exist at paths specified in manifest
- Use .svg or .png format
- Check file paths are relative to plugin root

### Resources

- [Stream Deck SDK Documentation](https://docs.elgato.com/sdk)
- [Paarrot API Documentation](../API.md)
- [Example Plugins](https://github.com/elgatosf/streamdeck-plugins)

### Publishing Checklist

- [ ] Update version in manifest.json
- [ ] Run `node validate.js` (no errors)
- [ ] Test all actions
- [ ] Test with Paarrot off (graceful failure)
- [ ] Update README.md version history
- [ ] Run `node build.js`
- [ ] Test .streamDeckPlugin file installs correctly
- [ ] Create GitHub release with .streamDeckPlugin file

---

## Support

**Users**: See README.md troubleshooting section

**Developers**: Open an issue on GitHub with:
- What you're trying to do
- What's happening
- Console errors
- Plugin version
