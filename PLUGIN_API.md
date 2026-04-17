# Paarrot Plugin API Documentation

Complete reference for developing plugins for Paarrot/Cinny Desktop.

## Table of Contents

- [Getting Started](#getting-started)
- [Plugin Structure](#plugin-structure)
- [Plugin Context API](#plugin-context-api)
  - [Commands](#commands)
  - [Message Interceptors](#message-interceptors)
  - [Custom Renderers](#custom-renderers)
  - [Settings](#settings)
  - [Themes](#themes)
  - [Matrix Events](#matrix-events)
  - [Background Tasks](#background-tasks)
  - [Notifications](#notifications)
  - [Logging](#logging)
  - [Plugin Exports](#plugin-exports)
  - [Matrix Client](#matrix-client)

---

## Getting Started

### Plugin Location

Plugins are installed in:
- **Windows**: `%APPDATA%\paarrot\plugins\<plugin-name>\`
- **Linux**: `~/.config/Paarrot/plugins/<plugin-name>/`
- **macOS**: `~/Library/Application Support/Paarrot/plugins/<plugin-name>/`

### Required Files

- `index.js` - Main plugin file (required)
- `plugin-metadata.json` - Plugin metadata (required)
- `README.md` - Documentation (recommended)

### plugin-metadata.json

```json
{
  "name": "My Awesome Plugin",
  "version": "1.0.0",
  "description": "Does something cool",
  "author": "Your Name",
  "homepage": "https://github.com/username/plugin",
  "thumbnail": "https://example.com/icon.png",
  "tags": ["utility", "messaging", "fun"]
}
```

---

## Plugin Structure

### Basic Plugin

```javascript
module.exports = {
  name: "My Plugin",
  version: "1.0.0",
  dependencies: {
    // "other-plugin": "^1.0.0"
  },
  
  /**
   * Called when plugin loads
   * @param {PluginContext} ctx - Plugin context
   */
  onLoad: async (ctx) => {
    ctx.log('Plugin loaded!');
    
    // Initialize your plugin here
    ctx.commands.register({
      name: "hello",
      description: "Say hello",
      run: () => "Hello, world!"
    });
  },
  
  /**
   * Called when plugin unloads
   */
  onUnload: async () => {
    console.log('Plugin unloaded');
  },
  
  /**
   * API for other plugins
   */
  exports: null
};
```

---

## Plugin Context API

The `PluginContext` provides access to all plugin APIs:

```typescript
interface PluginContext {
  pluginId: string;
  matrixClient: MatrixClient;
  React: typeof import('react');
  
  commands: CommandsAPI;
  messages: MessagesAPI;
  ui: UIAPI;
  settings: SettingsAPI;
  matrix: MatrixEventsAPI;
  timers: TimersAPI;
  notify: NotificationFunction;
  log: LogFunction;
  warn: LogFunction;
  error: LogFunction;
  require: RequireFunction;
}
```

### Commands

Register slash commands that users can type in chat.

#### Register a Command

```javascript
ctx.commands.register({
  name: "mycommand",
  description: "Does something cool",
  args: ["arg1", "arg2"],  // Optional
  run: (args) => {
    // Return string to send as message
    return `Got args: ${args.arg1}, ${args.arg2}`;
  }
});
```

#### Examples

**Simple command:**
```javascript
ctx.commands.register({
  name: "shrug",
  description: "Send a shrug emoji",
  run: () => "¯\\_(ツ)_/¯"
});
// Usage: /shrug
```

**Command with arguments:**
```javascript
ctx.commands.register({
  name: "greet",
  description: "Greet someone",
  args: ["name"],
  run: ({ name }) => `Hello, ${name || 'stranger'}!`
});
// Usage: /greet Alice
```

**Advanced command:**
```javascript
ctx.commands.register({
  name: "calc",
  description: "Simple calculator",
  args: ["expression"],
  run: ({ expression }) => {
    try {
      const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
      const result = Function(`'use strict'; return (${sanitized})`)();
      return `${expression} = ${result}`;
    } catch (err) {
      return "Invalid expression";
    }
  }
});
// Usage: /calc 2 + 2 * 3
```

#### API Reference

```typescript
interface CommandsAPI {
  register(command: PluginCommand): void;
  unregister(name: string): void;
  execute(name: string, args: Record<string, any>): Promise<string | void>;
}

interface PluginCommand {
  name: string;
  description: string;
  args?: string[];
  run: (args: Record<string, any>) => string | void | Promise<string | void>;
}
```

---

### Message Interceptors

Intercept and modify messages before they're sent or after they're received.

#### Before Send

Modify outgoing messages before they're sent to the server.

```javascript
ctx.messages.onBeforeSend((msg) => {
  // Modify msg.content
  if (msg.content.includes('secret')) {
    msg.content = msg.content.replace(/secret/g, '█████');
  }
  
  // Add prefix
  msg.content = `[Bot] ${msg.content}`;
});
```

#### On Receive

Process incoming messages (read-only monitoring).

```javascript
ctx.messages.onReceive((msg) => {
  // Monitor for keywords
  if (msg.content.includes('important')) {
    ctx.notify({
      title: 'Important Message',
      body: msg.content,
      type: 'info'
    });
  }
});
```

#### Real-World Examples

**Auto-expand abbreviations:**
```javascript
ctx.messages.onBeforeSend((msg) => {
  const expansions = {
    'brb': 'be right back',
    'omw': 'on my way',
    'gtg': 'got to go',
    'afk': 'away from keyboard'
  };
  
  Object.entries(expansions).forEach(([abbr, full]) => {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    msg.content = msg.content.replace(regex, full);
  });
});
```

**Add auto-shrug to questions:**
```javascript
ctx.messages.onBeforeSend((msg) => {
  if (msg.content.trim().endsWith('?')) {
    msg.content += ' ¯\\_(ツ)_/¯';
  }
});
```

**Track mentions:**
```javascript
ctx.messages.onReceive((msg) => {
  const userId = ctx.matrixClient.getUserId();
  if (msg.content.includes(userId)) {
    ctx.log('You were mentioned!');
    ctx.notify('Someone mentioned you!');
  }
});
```

#### API Reference

```typescript
interface MessagesAPI {
  onBeforeSend(handler: (msg: Message) => void): void;
  onReceive(handler: (msg: Message) => void): void;
}

interface Message {
  content: string;
  roomId?: string;
  sender?: string;
  eventId?: string;
}
```

---

### Custom Renderers

Register custom UI renderers for messages, images, and other content types.

```javascript
// Custom message renderer
ctx.ui.registerRenderer("message", (msg, defaultRenderer) => {
  // Custom logic
  if (msg.sender?.includes('bot')) {
    // Return custom React component
    return ctx.React.createElement('div', {
      style: { background: 'yellow' }
    }, msg.content);
  }
  
  // Fall back to default
  return defaultRenderer?.();
});

// Custom image renderer
ctx.ui.registerRenderer("image", (data, defaultRenderer) => {
  // Add custom effects, borders, etc.
  return defaultRenderer?.();
});
```

#### API Reference

```typescript
interface UIAPI {
  registerRenderer(
    type: string,
    renderer: (data: any, defaultRenderer?: () => ReactNode) => ReactNode
  ): void;
}

type CustomRenderer = (
  data: any,
  defaultRenderer?: () => ReactNode
) => ReactNode;
```

---

### Settings

Define settings that users can configure in the UI.

#### Define Settings Schema

```javascript
ctx.settings.define({
  // Boolean toggle
  enableFeature: {
    type: "boolean",
    label: "Enable Feature",
    description: "Toggle this feature on/off",
    default: true
  },
  
  // String input
  apiKey: {
    type: "string",
    label: "API Key",
    description: "Your API key",
    default: ""
  },
  
  // Number input
  maxRetries: {
    type: "number",
    label: "Max Retries",
    description: "Maximum retry attempts",
    default: 3
  },
  
  // Select dropdown
  theme: {
    type: "select",
    label: "Theme",
    description: "Choose a theme",
    options: [
      { value: "dark", label: "Dark Mode" },
      { value: "light", label: "Light Mode" }
    ],
    default: "dark"
  },
  
  // Color picker
  accentColor: {
    type: "color",
    label: "Accent Color",
    description: "Choose your accent color",
    default: "#6366f1"
  }
});
```

#### Get/Set Settings

```javascript
// Get a setting
const theme = ctx.settings.get('theme');
const enabled = ctx.settings.get('enableFeature');

// Set a setting (usually done by user in UI)
ctx.settings.set('theme', 'dark');
```

#### API Reference

```typescript
interface SettingsAPI {
  define(schema: SettingsSchema): void;
  get<T = any>(key: string): T | undefined;
  set(key: string, value: any): void;
}

interface SettingDefinition {
  type: 'string' | 'number' | 'boolean' | 'select' | 'color';
  label?: string;
  description?: string;
  default?: any;
  options?: Array<{ value: any; label: string }>;
}

type SettingsSchema = Record<string, SettingDefinition>;
```

---

### Themes

Register custom themes that appear in the theme selector dropdown. Themes use CSS that's injected once when the plugin loads.

#### Register a Theme

```javascript
ctx.themes.register({
  id: "my-theme",
  name: "My Custom Theme",
  kind: "dark",  // "light" or "dark"
  css: `
    body.plugin-my-plugin-my-theme {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    }
    
    .plugin-my-plugin-my-theme #root {
      background: linear-gradient(180deg, rgba(22, 33, 62, 0.5) 0%, rgba(15, 52, 96, 0.3) 100%);
    }
    
    .plugin-my-plugin-my-theme {
      --tc-link: hsl(213, 100%, 80%);
    }
  `
});
```

#### How It Works

1. CSS is injected as a `<style>` tag when plugin loads
2. Theme appears in Settings → General → Theme dropdown
3. When selected, the class `.plugin-{pluginId}-{themeId}` is applied to `<body>`
4. Your CSS rules match and style the app

#### Theme Class Name

Your theme CSS selector will be: `.plugin-{pluginId}-{themeId}`

Example: plugin ID `my-plugin` + theme ID `dark-blue` = `.plugin-my-plugin-dark-blue`

#### CSS Custom Properties

Available CSS variables you can override:
- `--tc-link` - Link color
- `--mx-uc-1` through `--mx-uc-8` - Matrix user ID colors (for different users)
- `--font-emoji` - Emoji font family
- `--font-secondary` - Secondary font family

#### Styling Elements

Common selectors to style:
- `body.plugin-{pluginId}-{themeId}` - Body background
- `.plugin-{pluginId}-{themeId} #root` - Main app container
- `.plugin-{pluginId}-{themeId} [role="navigation"]` - Navigation sidebar
- `.plugin-{pluginId}-{themeId} aside` - Side panels
- `.plugin-{pluginId}-{themeId} main` - Main content area
- `.plugin-{pluginId}-{themeId} header` - Headers
- `.plugin-{pluginId}-{themeId} button` - Buttons

#### Examples

**Dark Theme with Gradients:**
```javascript
ctx.themes.register({
  id: "midnight",
  name: "Midnight Blue 🌙",
  kind: "dark",
  css: `
    body.plugin-my-plugin-midnight {
      background: linear-gradient(135deg, #0a192f 0%, #112240 50%, #1a365d 100%);
    }
    
    .plugin-my-plugin-midnight #root {
      background: linear-gradient(180deg, rgba(17, 34, 64, 0.5) 0%, rgba(26, 54, 93, 0.3) 100%);
    }
    
    .plugin-my-plugin-midnight [role="navigation"],
    .plugin-my-plugin-midnight aside {
      background: linear-gradient(180deg, rgba(10, 25, 47, 0.8) 0%, rgba(17, 34, 64, 0.9) 100%);
      backdrop-filter: blur(8px);
    }
    
    .plugin-my-plugin-midnight main {
      background: linear-gradient(135deg, rgba(17, 34, 64, 0.4) 0%, rgba(26, 54, 93, 0.3) 100%);
    }
    
    .plugin-my-plugin-midnight header {
      background: linear-gradient(90deg, rgba(10, 25, 47, 0.9) 0%, rgba(17, 34, 64, 0.8) 100%);
    }
    
    .plugin-my-plugin-midnight {
      --tc-link: hsl(213, 100%, 80%);
    }
  `
});
```

**Light Theme:**
```javascript
ctx.themes.register({
  id: "sunrise",
  name: "Sunrise ☀️",
  kind: "light",
  css: `
    body.plugin-my-plugin-sunrise {
      background: linear-gradient(135deg, #fff4e6 0%, #ffe0b2 50%, #ffcc80 100%);
    }
    
    .plugin-my-plugin-sunrise #root {
      background: linear-gradient(180deg, rgba(255, 224, 178, 0.5) 0%, rgba(255, 204, 128, 0.3) 100%);
    }
    
    .plugin-my-plugin-sunrise [role="navigation"],
    .plugin-my-plugin-sunrise aside {
      background: linear-gradient(180deg, rgba(255, 244, 230, 0.9) 0%, rgba(255, 224, 178, 0.95) 100%);
      backdrop-filter: blur(8px);
    }
    
    .plugin-my-plugin-sunrise button:hover {
      filter: brightness(0.95);
    }
    
    .plugin-my-plugin-sunrise {
      --tc-link: hsl(30, 100%, 40%);
    }
  `
});
```

**Minimal Theme:**
```javascript
ctx.themes.register({
  id: "forest",
  name: "Forest Green 🌲",
  kind: "dark",
  css: `
    body.plugin-my-plugin-forest {
      background: #1a2f23;
    }
    
    .plugin-my-plugin-forest {
      --tc-link: hsl(140, 60%, 70%);
      --mx-uc-1: hsl(140, 60%, 65%);
      --mx-uc-2: hsl(150, 60%, 70%);
      --mx-uc-3: hsl(130, 60%, 65%);
      --mx-uc-4: hsl(160, 60%, 70%);
      --mx-uc-5: hsl(120, 60%, 65%);
      --mx-uc-6: hsl(145, 60%, 60%);
      --mx-uc-7: hsl(135, 60%, 70%);
      --mx-uc-8: hsl(155, 60%, 70%);
    }
  `
});
```

#### Unregister Theme

```javascript
ctx.themes.unregister("my-theme");
```

#### API Reference

```typescript
interface ThemesAPI {
  register(theme: PluginTheme): void;
  unregister(themeId: string): void;
}

interface PluginTheme {
  id: string;
  name: string;
  kind: 'light' | 'dark';
  /** CSS string that will be injected when theme is active */
  css: string;
}
```

**Notes:**
- CSS is injected once when the plugin loads (not per theme change)
- Theme IDs are automatically prefixed with `plugin-{pluginId}-` to avoid conflicts
- Theme class names follow the pattern: `.plugin-{pluginId}-{themeId}`
- Themes appear in Settings → General → Theme selector
- CSS stays in the page until plugin is unloaded
- Themes work exactly like built-in themes (Silver, Dark, Mocha, etc.)
- Use gradients, backdrop-filters, and transitions for polished themes

---

### Matrix Events

Hook into raw Matrix events for advanced functionality.

#### Listen to Events

```javascript
// Room messages
ctx.matrix.on("m.room.message", (event) => {
  const content = event.getContent();
  ctx.log('Message:', content.body);
});

// Membership changes
ctx.matrix.on("m.room.member", (event) => {
  const content = event.getContent();
  ctx.log('Membership:', content.membership);
});

// Timeline events
ctx.matrix.on("Room.timeline", (event) => {
  if (event.getType() === 'm.room.message') {
    const sender = event.getSender();
    ctx.log('Timeline event from:', sender);
  }
});

// Sync state
ctx.matrix.on("sync", (state, prevState) => {
  ctx.log('Sync state:', state);
});
```

#### Remove Event Handlers

```javascript
const handler = (event) => {
  ctx.log('Event received');
};

ctx.matrix.on("m.room.message", handler);

// Later...
ctx.matrix.off("m.room.message", handler);
```

#### API Reference

```typescript
interface MatrixEventsAPI {
  on(eventType: string, handler: (event: MatrixEvent) => void): void;
  off(eventType: string, handler: (event: MatrixEvent) => void): void;
}
```

**Common Event Types:**
- `m.room.message` - Room messages
- `m.room.member` - Membership changes
- `m.room.name` - Room name changes
- `m.room.topic` - Room topic changes
- `Room.timeline` - Timeline events
- `sync` - Sync state changes

---

### Background Tasks

Run periodic tasks or delayed actions.

#### Set Interval

```javascript
// Run every 30 seconds
const intervalId = ctx.timers.setInterval(() => {
  ctx.log('Periodic task running');
  
  // Do something periodically
  const stats = {
    timestamp: Date.now(),
    setting: ctx.settings.get('theme')
  };
  ctx.log('Stats:', stats);
}, 30000);

// Clear interval
ctx.timers.clearInterval(intervalId);
```

#### Set Timeout

```javascript
// Run once after delay
const timeoutId = ctx.timers.setTimeout(() => {
  ctx.notify({
    title: 'Reminder',
    body: 'This is a delayed notification',
    type: 'info'
  });
}, 10000);  // 10 seconds

// Clear timeout
ctx.timers.clearTimeout(timeoutId);
```

#### API Reference

```typescript
interface TimersAPI {
  setInterval(callback: () => void, ms: number): number;
  setTimeout(callback: () => void, ms: number): number;
  clearInterval(id: number): void;
  clearTimeout(id: number): void;
}
```

**Note:** Timers are automatically cleaned up when the plugin is unloaded.

---

### Notifications

Show system notifications to the user.

#### Simple Notification

```javascript
ctx.notify('Hello, world!');
```

#### Detailed Notification

```javascript
ctx.notify({
  title: 'Plugin Alert',
  body: 'Something important happened!',
  type: 'info',        // 'info' | 'success' | 'error' | 'warning'
  duration: 5000       // milliseconds (optional)
});
```

#### Examples

```javascript
// Success notification
ctx.notify({
  title: 'Success',
  body: 'Operation completed successfully!',
  type: 'success'
});

// Error notification
ctx.notify({
  title: 'Error',
  body: 'Something went wrong',
  type: 'error'
});

// Warning
ctx.notify({
  title: 'Warning',
  body: 'This action cannot be undone',
  type: 'warning'
});
```

#### API Reference

```typescript
type NotificationFunction = (
  options: NotificationOptions | string
) => void;

interface NotificationOptions {
  title: string;
  body: string;
  type?: 'info' | 'success' | 'error' | 'warning';
  duration?: number;
}
```

---

### Logging

Log messages to the console and plugin logs panel.

```javascript
// Info logs
ctx.log('Plugin started');
ctx.log('User count:', 42);
ctx.log('Complex object:', { foo: 'bar', nested: { value: 123 } });

// Warning logs
ctx.warn('This is a warning');
ctx.warn('Deprecated feature used');

// Error logs
ctx.error('Something went wrong');
ctx.error('Error details:', errorObject);
```

#### API Reference

```typescript
type LogFunction = (...args: any[]) => void;

interface PluginContext {
  log: LogFunction;    // Info level
  warn: LogFunction;   // Warning level
  error: LogFunction;  // Error level
}
```

**Note:** All logs are visible in:
- Browser console (F12)
- Plugin logs panel (Settings → Plugins → Logs) - coming soon

---

### Plugin Exports

Export functions and data for other plugins to use.

#### Define Exports

```javascript
module.exports = {
  // ... onLoad, onUnload ...
  
  exports: {
    version: "1.0.0",
    
    utils: {
      greet: (name) => `Hello, ${name}!`,
      
      processText: (text) => text.toUpperCase(),
      
      getStats: () => ({
        version: "1.0.0",
        features: ['commands', 'settings']
      })
    }
  }
};
```

#### Use Another Plugin's Exports

```javascript
// In your plugin
const otherPlugin = ctx.require('other-plugin-id');

if (otherPlugin) {
  const greeting = otherPlugin.utils.greet('World');
  ctx.log(greeting);  // "Hello, World!"
  
  const processed = otherPlugin.utils.processText('hello');
  ctx.log(processed);  // "HELLO"
  
  const stats = otherPlugin.utils.getStats();
  ctx.log('Stats:', stats);
}
```

#### API Reference

```typescript
type RequireFunction = (pluginId: string) => any;

interface Plugin {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  onLoad: (ctx: PluginContext) => Promise<void>;
  onUnload?: () => Promise<void>;
  exports?: any;
}
```

---

### Matrix Client

Direct access to the Matrix.js SDK for advanced operations.

```javascript
// Get user info
const userId = ctx.matrixClient.getUserId();
const displayName = ctx.matrixClient.getUser(userId)?.displayName;

// Get rooms
const rooms = ctx.matrixClient.getRooms();
ctx.log(`You're in ${rooms.length} rooms`);

// Get specific room
const room = ctx.matrixClient.getRoom(roomId);
if (room) {
  const name = room.name;
  const members = room.getMembers();
  ctx.log(`Room: ${name}, Members: ${members.length}`);
}

// Sync state
const syncState = ctx.matrixClient.getSyncState();
ctx.log('Sync state:', syncState);

// Send custom event
await ctx.matrixClient.sendEvent(roomId, 'm.room.message', {
  msgtype: 'm.text',
  body: 'Hello from plugin!'
});
```

#### API Reference

```typescript
interface PluginContext {
  matrixClient: MatrixClient;  // Full Matrix.js SDK client
}
```

For full Matrix.js SDK documentation, see: https://matrix-org.github.io/matrix-js-sdk/

---

## Complete Example

Here's a complete plugin that demonstrates all features:

```javascript
/**
 * Example Plugin - All Features
 */
module.exports = {
  name: "Example Plugin",
  version: "1.0.0",
  dependencies: {},
  
  onLoad: async (ctx) => {
    ctx.log('🚀 Plugin loading...');
    
    // === COMMANDS ===
    ctx.commands.register({
      name: "hello",
      description: "Say hello",
      run: () => "Hello, world!"
    });
    
    ctx.commands.register({
      name: "greet",
      description: "Greet someone",
      args: ["name"],
      run: ({ name }) => `Hello, ${name}!`
    });
    
    // === INTERCEPTORS ===
    ctx.messages.onBeforeSend((msg) => {
      // Auto-expand abbreviations
      msg.content = msg.content.replace(/\bbrb\b/gi, 'be right back');
      
      // Add emoji if enabled
      if (ctx.settings.get('addEmoji')) {
        msg.content += ' ✨';
      }
    });
    
    ctx.messages.onReceive((msg) => {
      // Track keywords
      const keywords = ctx.settings.get('keywords') || '';
      keywords.split(',').forEach(keyword => {
        if (msg.content.includes(keyword.trim())) {
          ctx.notify(`Keyword detected: ${keyword}`);
        }
      });
    });
    
    // === SETTINGS ===
    ctx.settings.define({
      addEmoji: {
        type: "boolean",
        label: "Add Emoji",
        description: "Add sparkles to messages",
        default: false
      },
      keywords: {
        type: "string",
        label: "Track Keywords",
        description: "Comma-separated keywords to track",
        default: "important,urgent"
      },
      theme: {
        type: "select",
        label: "Theme",
        options: [
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" }
        ],
        default: "dark"
      }
    });
    
    // === THEMES ===
    ctx.themes.register({
      id: "example-theme",
      name: "Example Theme",
      kind: "dark",
      colors: {
        background: "#1a1a2e",
        surface: "#16213e",
        primary: "#0f3460",
        secondary: "#533483",
        onBackground: "#ffffff",
        onSurface: "#e0e0e0"
      }
    });
    
    // === MATRIX EVENTS ===
    ctx.matrix.on("m.room.message", (event) => {
      const content = event.getContent();
      if (content.body?.includes('example')) {
        ctx.log('Keyword found in message');
      }
    });
    
    // === BACKGROUND TASKS ===
    ctx.timers.setInterval(() => {
      ctx.log('Periodic check');
    }, 60000);  // Every minute
    
    // === NOTIFICATIONS ===
    ctx.notify({
      title: 'Example Plugin',
      body: 'Plugin loaded successfully!',
      type: 'success'
    });
    
    // === EXPORTS ===
    this.exports = {
      version: "1.0.0",
      greet: (name) => `Hello, ${name}!`
    };
    
    ctx.log('✅ Plugin loaded');
  },
  
  onUnload: async () => {
    console.log('Plugin unloaded');
  },
  
  exports: null
};
```

---

## Best Practices

### Error Handling

Always wrap plugin code in try-catch:

```javascript
onLoad: async (ctx) => {
  try {
    // Your code here
  } catch (error) {
    ctx.error('Plugin error:', error);
    ctx.notify({
      title: 'Plugin Error',
      body: error.message,
      type: 'error'
    });
  }
}
```

### Cleanup

Clean up resources in `onUnload`:

```javascript
onUnload: async () => {
  // Timers are auto-cleared
  // Event handlers are auto-removed
  // Settings are persisted automatically
  
  console.log('Plugin unloaded');
}
```

### Settings Validation

Validate settings before use:

```javascript
const maxRetries = ctx.settings.get('maxRetries') || 3;
const keywords = (ctx.settings.get('keywords') || '').split(',').filter(k => k.trim());
```

### Logging

Use appropriate log levels:

```javascript
ctx.log('Info message');       // Normal operation
ctx.warn('Warning message');   // Potential issues
ctx.error('Error message');    // Actual errors
```

### Performance

- Use intervals sparingly (30s+ recommended)
- Avoid heavy processing in message interceptors
- Cache expensive computations
- Clean up timers when not needed

---

## Troubleshooting

### Plugin Won't Load

1. Check console for errors (F12)
2. Verify `plugin-metadata.json` exists
3. Check for JavaScript syntax errors
4. Ensure `onLoad` function exists

### Commands Not Working

1. Ensure plugin is enabled
2. Check console for "Commands registered" message
3. Verify command name doesn't conflict
4. Try `/test` command first

### Settings Not Showing

1. Check settings schema is defined
2. Verify setting types are valid
3. Look for JavaScript errors in console

### Interceptors Not Working

1. Check plugin is enabled
2. Verify interceptors are registered in `onLoad`
3. Check console logs for interceptor messages

---

## Publishing Your Plugin

To publish your plugin to the Paarrot Plugin Directory:

1. Create a GitHub repository
2. Add these files:
   - `index.js`
   - `plugin-metadata.json`
   - `README.md`
3. Create a ZIP file: `your-plugin.zip`
4. Submit to: https://github.com/Paarrot/Plugin-Directory

---

## Support

- Documentation: https://github.com/Paarrot/cinny-desktop/blob/main/PLUGIN_API.md
- Examples: https://github.com/Paarrot/cinny-desktop/tree/main/example-plugin
- Issues: https://github.com/Paarrot/cinny-desktop/issues
- Community: https://matrix.to/#/#paarrot:matrix.org

---

## License

MIT License - See LICENSE file for details
