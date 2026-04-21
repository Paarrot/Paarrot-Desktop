# Plugin System Wishlist - Implementation Summary

All requested features have been implemented! 🎉

## ✅ Implemented Features

### 1. ✅ Enhanced Slash Commands
- **Simple commands**: `ctx.commands.register({ name: "shrug", run: () => "¯\\_(ツ)_/¯" })`
- **Commands with args**: `ctx.commands.register({ name: "echo", args: ["text"], run: ({ text }) => text })`
- Automatic argument parsing
- Execution API: `ctx.commands.execute(name, args)`

### 2. ✅ Message Interceptors
- **Before send**: `ctx.messages.onBeforeSend((msg) => { msg.content = "modified" })`
- **On receive**: `ctx.messages.onReceive((msg) => { /* process */ })`
- Full MessageContext with content, roomId, metadata
- Async support for interceptors

### 3. ✅ Custom Renderers & Button Registration
- **Register renderer**: `ctx.ui.registerRenderer("message", (msg, defaultRenderer) => { /* render */ })`
- **Unregister renderer**: `ctx.ui.unregisterRenderer("message")`
- **Register button**: `ctx.ui.registerButton({ id, location, label, icon, onClick })`
- **Unregister button**: `ctx.ui.unregisterButton(id)`
- 11 UI locations across nav lists, toolbars, headers, sidebar, and menus
- Nav list rows (icon + label) for `channel-list`, `home-section`, `direct-messages`
- Icon buttons for all other locations
- Positioning and grouping support (`before`, `after`, `group`, `order`)
- Auto-cleanup on plugin unload
- See [PLUGIN_BUTTON_API.md](PLUGIN_BUTTON_API.md) for full reference

### 4. ✅ Settings UI Per Plugin
- **Define schema**: `ctx.settings.define({ theme: { type: "select", options: [...] } })`
- **Supported types**: string, number, boolean, select, color
- **Get/Set**: `ctx.settings.get(key)` / `ctx.settings.set(key, value)`
- Auto-persisted to localStorage
- No JSON editing needed!

### 5. ✅ Hot Reload
- **API**: `pluginRegistry.reloadPlugin(pluginId, newPlugin, newContext)`
- Auto-cleanup of old plugin resources
- Maintains enabled/disabled state
- Dev-friendly workflow

### 6. ✅ Dependency System
- **Declare**: `dependencies: { "paarrot.core-utils": "^1.0.0" }`
- **Require**: `const utils = ctx.require("paarrot.utils")`
- Error handling for missing dependencies
- Plugin exports system

### 7. ✅ Raw Matrix Events Hook
- **Full SDK access**: `ctx.matrix.on("m.room.message", (ev) => { })`
- **Any event type**: Room.timeline, sync, RoomState.events, etc.
- Direct Matrix.js SDK integration
- Power users will go nuts!

### 8. ✅ Background Tasks / Intervals
- **Interval**: `ctx.timers.setInterval(() => { /* cursed shit */ }, 10000)`
- **Timeout**: `ctx.timers.setTimeout(() => { }, 5000)`
- **Clear**: `ctx.timers.clearInterval(id)` / `ctx.timers.clearTimeout(id)`
- Auto-cleanup on plugin unload
- Perfect for bots, reminders, auto-cleanup

### 9. ✅ Notifications API
- **Simple**: `ctx.notify("Oi")`
- **Advanced**: `ctx.notify({ title: "Oi", body: "New message from Steve", type: "info" })`
- Action buttons support
- Custom duration

### 10. ✅ Plugin Logs Panel
- **Logging**: `ctx.log()`, `ctx.warn()`, `ctx.error()`
- Per-plugin log storage
- Visible in `pluginRegistry.getLogs(pluginId)`
- Cleared on plugin unload
- Max 1000 logs retained

## 🎯 Bonus Features

- **Plugin exports**: Share functionality between plugins
- **Automatic cleanup**: Timers, handlers, resources auto-cleaned on unload
- **Error isolation**: Plugin errors don't crash the app
- **Type safety**: Full TypeScript definitions
- **Sandboxed execution**: Plugins run in controlled environment
- **Rich context**: Full Matrix client, React, all APIs

## 📁 Files Changed

### Core System
- [`PluginAPI.ts`](cinny/src/app/features/settings/plugins/PluginAPI.ts) - Enhanced with all APIs
- [`PluginLoader.tsx`](cinny/src/app/features/settings/plugins/PluginLoader.tsx) - Complete rewrite with context creation
- [`index.ts`](cinny/src/app/features/settings/plugins/index.ts) - Exports updated

### Documentation
- [`PLUGIN_DEVELOPMENT.md`](cinny/src/app/features/settings/plugins/PLUGIN_DEVELOPMENT.md) - Comprehensive guide
- [`PLUGINS.md`](PLUGINS.md) - User guide
- [`example-plugin/index.js`](example-plugin/index.js) - Full-featured example

### Integration
- [`ClientRoot.tsx`](cinny/src/app/pages/client/ClientRoot.tsx) - PluginLoader integrated
- [`main.js`](electron/main.js) - IPC handler for reading plugin code
- [`preload.js`](electron/preload.js) - readPluginCode API exposed
- [`ext.d.ts`](cinny/src/ext.d.ts) - TypeScript definitions

## 🚀 Usage Examples

### Command with Args
```javascript
ctx.commands.register({
  name: "echo",
  args: ["text"],
  run: ({ text }) => text
});
```

### Message Interceptor
```javascript
ctx.messages.onBeforeSend((msg) => {
  if (msg.content === "brb") {
    msg.content = "be right back ya legend";
  }
});
```

### Custom Settings
```javascript
ctx.settings.define({
  theme: { type: "select", options: ["dark", "light"] },
  spamFilter: { type: "boolean", default: true }
});
```

### Background Tasks
```javascript
ctx.timers.setInterval(() => {
  // do cursed shit every 10s
}, 10000);
```

### Raw Matrix Events
```javascript
ctx.matrix.on("m.room.message", (ev) => {
  ctx.log('Message:', ev.getContent().body);
});
```

### Plugin Dependencies
```javascript
const utils = ctx.require("paarrot.utils");
utils.doSomething();
```

## 🎨 Plugin API Summary

```typescript
interface PluginContext {
  pluginId: string;
  matrixClient: MatrixClient;
  React: typeof import('react');
  
  commands: {
    register: (command: PluginCommand) => void;
    unregister: (name: string) => void;
    execute: (name: string, args: Record<string, any>) => Promise<string | void>;
  };
  
  messages: {
    onBeforeSend: (interceptor: MessageInterceptor) => void;
    onReceive: (interceptor: MessageInterceptor) => void;
  };
  
  ui: {
    registerButton: (button: UIButtonDefinition) => void;
    unregisterButton: (id: string) => void;
    registerRenderer: (type: string, renderer: CustomRenderer) => void;
    unregisterRenderer: (type: string) => void;
  };
  
  settings: {
    define: (schema: SettingsSchema) => void;
    get: <T = any>(key: string) => T | undefined;
    set: (key: string, value: any) => void;
  };
  
  matrix: {
    on: (eventType: string, handler: (event: MatrixEvent) => void) => void;
    off: (eventType: string, handler: (event: MatrixEvent) => void) => void;
  };
  
  timers: {
    setInterval: (callback: () => void, ms: number) => number;
    setTimeout: (callback: () => void, ms: number) => number;
    clearInterval: (id: number) => void;
    clearTimeout: (id: number) => void;
  };
  
  notify: (options: NotificationOptions | string) => void;
  log: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  require: (pluginId: string) => any;
}
```

## 🔥 The Result

A **production-ready plugin system** that rivals Discord, VSCode, and other extensible apps. Plugin developers will have everything they need to build powerful extensions without fighting the framework.

**No compromises. All features implemented. Ready to ship.**
