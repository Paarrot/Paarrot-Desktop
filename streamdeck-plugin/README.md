# Paarrot Stream Deck Plugin

Control your Paarrot desktop app directly from your Elgato Stream Deck! Toggle mute, deafen, switch channels, and send quick messages with the press of a button.

## Features

- **Toggle Mute** - Mute/unmute your microphone with visual feedback
- **Toggle Deafen** - Deafen/undeafen (mute speakers) with visual feedback
- **Change Channel** - Switch between rooms/channels instantly
- **Send Message** - Send predefined messages to the current room
- **Get Status** - Display current mute/deafen status

## Requirements

- Elgato Stream Deck (any model)
- Stream Deck software version 6.0 or later
- Paarrot desktop app running with API server enabled
- Windows 10+ or macOS 10.14+

## Installation

### Method 1: Install from Release (easiest)

1. Download the latest `.streamDeckPlugin` file from the [Releases](https://github.com/yourusername/paarrot-streamdeck/releases) page
2. Double-click the file to install
3. Stream Deck software will open and install the plugin automatically

### Method 2: Manual Installation

1. Download or clone this repository
2. Copy the `com.paarrot.streamdeck.sdPlugin` folder to:
   - **Windows**: `%APPDATA%\Elgato\StreamDeck\Plugins\`
   - **macOS**: `~/Library/Application Support/com.elgato.StreamDeck/Plugins/`
3. Restart the Stream Deck software

### Method 3: Developer Mode

1. Open Stream Deck software
2. Open the Plugins view
3. Enable "Developer Mode" in settings
4. Drag the `com.paarrot.streamdeck.sdPlugin` folder into the Stream Deck window

## Setup

### 1. Ensure Paarrot API is Running

Make sure your Paarrot desktop app is running with the API server enabled on port 33384. You can test this by visiting:

```
http://127.0.0.1:33384/health
```

You should see:
```json
{
  "status": "ok",
  "app": "Paarrot API",
  "version": "1.0.0"
}
```

### 2. Add Actions to Stream Deck

1. Open Stream Deck software
2. Find "Paarrot" in the actions list
3. Drag actions onto your Stream Deck buttons
4. Configure actions as needed (see below)

## Actions

### Toggle Mute

**What it does**: Toggles your microphone mute status

**Configuration**: No configuration needed

**Visual Feedback**:
- Gray microphone icon = unmuted
- Red X over microphone = muted

**Usage**: Press to toggle between muted and unmuted. The button automatically updates to show the current state.

---

### Toggle Deafen

**What it does**: Toggles deafen status (mutes speakers and microphone)

**Configuration**: No configuration needed

**Visual Feedback**:
- Gray speaker icon = not deafened
- Red X over speaker = deafened

**Usage**: Press to toggle between deafened and not deafened. The button automatically updates to show the current state.

---

### Change Channel

**What it does**: Switches to a different room/channel

**Configuration**:
1. Drag action to a button
2. Click the button in Stream Deck to open settings
3. Select a channel from the dropdown OR enter a room ID manually
4. Click away to save

**Usage**: Press to instantly switch to the configured channel.

**Tips**:
- Channels are grouped by server in the dropdown
- Use manual room ID for rooms not in the list
- Room ID format: `!abc123:matrix.org`

---

### Send Message

**What it does**: Sends a predefined message to the currently active room

**Configuration**:
1. Drag action to a button
2. Click the button in Stream Deck to open settings
3. Type your message in the text area
4. Click away to save

**Usage**: Press to send the message to whichever room is currently active.

**Example Messages**:
- "BRB!" - Be right back
- "AFK for 5 minutes"
- "On my way!"
- "Thanks everyone!"
- "GG!" - Good game

---

### Get Status

**What it does**: Displays current mute/deafen status on the button

**Configuration**: No configuration needed

**Visual Feedback**:
- Shows "OK" when not muted or deafened
- Shows "M" when muted
- Shows "D" when deafened
- Shows "MD" when both muted and deafened

**Usage**: Button automatically updates every second. Press to force an immediate update.

## Troubleshooting

### Plugin not showing up

- Restart Stream Deck software
- Check that the plugin folder is in the correct location
- Ensure folder is named exactly `com.paarrot.streamdeck.sdPlugin`

### Actions not working

- Verify Paarrot is running
- Test API at `http://127.0.0.1:33384/health`
- Check console for errors (View > Open Console in Stream Deck)
- Ensure port 33384 is not blocked by firewall

### Button states not updating

- Check that Paarrot API is responding
- Try pressing the action to force an update
- Check Stream Deck console for connection errors

### "No channels available" in dropdown

- Ensure you're logged into Paarrot
- Verify you've joined at least one room
- Try entering the room ID manually instead

### Actions show red X (alert)

This means the API call failed. Common causes:
- Paarrot app not running
- API server not started
- Network/firewall blocking localhost connections
- Invalid room ID or message configuration

## Development

### Building from Source

No build step required! The plugin uses vanilla JavaScript.

### File Structure

```
com.paarrot.streamdeck.sdPlugin/
├── manifest.json                 # Plugin metadata and action definitions
├── plugin/
│   ├── index.html               # Plugin entry point
│   └── index.js                 # Main plugin logic
├── propertyinspector/
│   ├── change-channel.html      # Channel selector UI
│   └── send-message.html        # Message input UI
└── images/                       # Action icons
    ├── mute-off.svg
    ├── mute-on.svg
    ├── deafen-off.svg
    ├── deafen-on.svg
    ├── change-channel.svg
    ├── send-message.svg
    ├── status.svg
    ├── toggle-mute.svg
    ├── toggle-deafen.svg
    ├── plugin-icon.svg
    └── category-icon.svg
```

### Modifying the Plugin

1. Make changes to the files
2. Restart Stream Deck software to reload the plugin
3. Test your changes

### API Endpoints Used

- `GET /health` - Check API is running
- `GET /status` - Get current mute/deafen state
- `POST /mute/toggle` - Toggle mute
- `POST /deafen/toggle` - Toggle deafen
- `POST /channel` - Change channel
- `POST /message/current` - Send message
- `GET /channels` - Get channel list

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Enable Stream Deck console logging (View > Open Console)
3. Check Paarrot's console for API errors
4. File an issue on GitHub with logs and details

## License

This plugin is provided as-is. See LICENSE file for details.

## Credits

Created for Paarrot desktop app.

Icons designed specifically for this plugin.

## Version History

### 1.0.0 (Initial Release)
- Toggle Mute action
- Toggle Deafen action
- Change Channel action with dropdown
- Send Message action
- Get Status action
- Auto-updating button states
- Visual feedback for all actions
