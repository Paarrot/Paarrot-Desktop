# Plugin Button Registration API

An easy way to register plugin buttons in various UI locations with positioning and grouping support.

## Example Plugins

- **[example-button-plugin/](example-button-plugin/)** - Simple examples showing basic usage patterns
- **[example-showcase-plugin/](example-showcase-plugin/)** - Complete demonstration of ALL 11 locations ⭐

## UI Locations

Buttons render in two visual styles depending on location — **nav list rows** (icon + label, full width) or **icon buttons** (compact, toolbar/header style).

### Nav List Rows

These render as full-width list entries matching the style of built-in items like "Create Room" and "Message Search":

| Location | Where it appears |
|---|---|
| `channel-list` | Space channel list, below Lobby and Message Search |
| `home-section` | Home panel, inside the Rooms category above the room list |
| `direct-messages` | Direct Messages panel, below "Create Chat" and above the CHATS dropdown |

### Icon Buttons

These render as compact icon buttons inline with other toolbar/header controls:

| Location | Where it appears |
|---|---|
| `text-composer-toolbar` | Message composer toolbar (alongside emoji, sticker buttons) |
| `composer-actions` | Left side of the composer, beside the `+` attach button |
| `room-header` | Top room header bar, before the ⋮ menu button |
| `room-menu` | Room ⋮ dropdown menu |
| `message-actions` | Message hover action bar |
| `user-menu` | Right-click popup on the user avatar |
| `search-notification-section` | Notifications page header (right side) |
| `sidebar-actions` | Left sidebar — appears in **two** places: above the Explore Servers icon, and above the Search icon in the sticky bottom section |

> 💡 **Tip:** Install the [example-showcase-plugin](example-showcase-plugin/) to see exactly where each location appears in the UI!

## Basic Usage

### Simple Button

```javascript
module.exports = {
  name: 'my-plugin',
  version: '1.0.0',
  
  onLoad: (context) => {
    context.ui.registerButton({
      id: 'my-button',
      location: 'text-composer-toolbar',
      label: 'My Action',
      icon: '🎨',
      onClick: () => {
        context.log('Button clicked!');
      }
    });
  },
  
  onUnload: () => {
    // Buttons are automatically cleaned up on plugin unload
  }
};
```

## Positioning

### Before/After Positioning

Place your button before or after existing buttons:

```javascript
context.ui.registerButton({
  id: 'my-button',
  location: 'text-composer-toolbar',
  label: 'My Action',
  icon: '✨',
  position: {
    before: 'emoji-picker-button', // Place before emoji picker
    // OR
    after: 'sticker-button' // Place after sticker button
  }
});
```

### Grouping Buttons

Group related buttons together:

```javascript
context.ui.registerButton({
  id: 'action-1',
  location: 'text-composer-toolbar',
  label: 'Action 1',
  icon: '1️⃣',
  position: {
    group: 'my-plugin-tools',
    order: 1 // Lower numbers appear first
  }
});

context.ui.registerButton({
  id: 'action-2',
  location: 'text-composer-toolbar',
  label: 'Action 2',
  icon: '2️⃣',
  position: {
    group: 'my-plugin-tools',
    order: 2
  }
});
```

### Combined Positioning and Grouping

Place a group before/after other elements:

```javascript
context.ui.registerButton({
  id: 'tool-1',
  location: 'text-composer-toolbar',
  label: 'Tool 1',
  icon: '🔧',
  position: {
    group: 'my-tools',
    after: 'emoji-picker-button',
    order: 1
  }
});

context.ui.registerButton({
  id: 'tool-2',
  location: 'text-composer-toolbar',
  label: 'Tool 2',
  icon: '🔨',
  position: {
    group: 'my-tools',
    order: 2
  }
});
```

## Complete Example

```javascript
module.exports = {
  name: 'custom-tools',
  version: '1.0.0',
  
  onLoad: (context) => {
    // Nav list row — appears below "Create Chat" in the DMs panel
    context.ui.registerButton({
      id: 'dm-favorites',
      location: 'direct-messages',
      label: 'Favourites',
      icon: '⭐',
      onClick: () => context.log('Favourites clicked!')
    });

    // Nav list row — appears in the space channel list
    context.ui.registerButton({
      id: 'quick-access',
      location: 'channel-list',
      label: 'Quick Access',
      icon: '⚡',
      onClick: () => context.log('Quick access clicked!')
    });

    // Icon button — appears in the message composer toolbar
    context.ui.registerButton({
      id: 'format-bold',
      location: 'text-composer-toolbar',
      label: 'Bold',
      icon: '𝐁',
      position: {
        group: 'custom-formatting',
        order: 1
      },
      onClick: () => context.log('Bold clicked!')
    });

    // Icon button — appears in the room header
    context.ui.registerButton({
      id: 'special-search',
      location: 'room-header',
      label: 'Special Search',
      icon: '🔍',
      position: { after: 'search-button' },
      onClick: () => context.log('Special search clicked!')
    });

    // Sidebar icon — appears above Explore and above Search
    context.ui.registerButton({
      id: 'plugin-panel',
      location: 'sidebar-actions',
      label: 'Plugin Panel',
      icon: '🧩',
      onClick: () => context.log('Plugin panel clicked!')
    });
  },
  
  onUnload: () => {
    // All registered buttons are automatically cleaned up
  }
};
```

## Unregistering Buttons

Buttons are automatically unregistered when the plugin is unloaded. To manually unregister:

```javascript
context.ui.unregisterButton('my-button-id');
```

## TypeScript Types

```typescript
import type { UIButtonDefinition, UIButtonPosition, UILocation } from '@paarrot/plugin-manager';

const button: UIButtonDefinition = {
  id: 'my-button',
  location: 'text-composer-toolbar',
  label: 'My Action',
  icon: '🎨',
  position: {
    group: 'my-tools',
    after: 'emoji-picker',
    order: 1
  },
  onClick: () => console.log('Clicked!')
};
```


## Basic Usage

### Simple Button

```javascript
module.exports = {
  name: 'my-plugin',
  version: '1.0.0',
  
  onLoad: (context) => {
    context.ui.registerButton({
      id: 'my-button',
      location: 'text-composer-toolbar',
      label: 'My Action',
      icon: '🎨',
      onClick: () => {
        context.log('Button clicked!');
      }
    });
  },
  
  onUnload: () => {
    // Buttons are automatically cleaned up on plugin unload
  }
};
```

## Positioning

### Before/After Positioning

Place your button before or after existing buttons:

```javascript
context.ui.registerButton({
  id: 'my-button',
  location: 'text-composer-toolbar',
  label: 'My Action',
  icon: '✨',
  position: {
    before: 'emoji-picker-button', // Place before emoji picker
    // OR
    after: 'sticker-button' // Place after sticker button
  }
});
```

### Grouping Buttons

Group related buttons together:

```javascript
context.ui.registerButton({
  id: 'action-1',
  location: 'text-composer-toolbar',
  label: 'Action 1',
  icon: '1️⃣',
  position: {
    group: 'my-plugin-tools',
    order: 1 // Lower numbers appear first
  }
});

context.ui.registerButton({
  id: 'action-2',
  location: 'text-composer-toolbar',
  label: 'Action 2',
  icon: '2️⃣',
  position: {
    group: 'my-plugin-tools',
    order: 2
  }
});
```

### Combined Positioning and Grouping

Place a group before/after other elements:

```javascript
context.ui.registerButton({
  id: 'tool-1',
  location: 'text-composer-toolbar',
  label: 'Tool 1',
  icon: '🔧',
  position: {
    group: 'my-tools',
    after: 'emoji-picker-button',
    order: 1
  }
});

context.ui.registerButton({
  id: 'tool-2',
  location: 'text-composer-toolbar',
  label: 'Tool 2',
  icon: '🔨',
  position: {
    group: 'my-tools',
    order: 2
  }
});
```

## Complete Example

```javascript
module.exports = {
  name: 'custom-tools',
  version: '1.0.0',
  
  onLoad: (context) => {
    // Nav list row — appears below "Create Chat" in the DMs panel
    context.ui.registerButton({
      id: 'dm-favorites',
      location: 'direct-messages',
      label: 'Favourites',
      icon: '⭐',
      onClick: () => context.log('Favourites clicked!')
    });

    // Nav list row — appears in the space channel list
    context.ui.registerButton({
      id: 'quick-access',
      location: 'channel-list',
      label: 'Quick Access',
      icon: '⚡',
      onClick: () => context.log('Quick access clicked!')
    });

    // Icon button — appears in the message composer toolbar
    context.ui.registerButton({
      id: 'format-bold',
      location: 'text-composer-toolbar',
      label: 'Bold',
      icon: '𝐁',
      position: {
        group: 'custom-formatting',
        order: 1
      },
      onClick: () => context.log('Bold clicked!')
    });

    // Icon button — appears in the room header
    context.ui.registerButton({
      id: 'special-search',
      location: 'room-header',
      label: 'Special Search',
      icon: '🔍',
      position: { after: 'search-button' },
      onClick: () => context.log('Special search clicked!')
    });

    // Sidebar icon — appears above Explore and above Search
    context.ui.registerButton({
      id: 'plugin-panel',
      location: 'sidebar-actions',
      label: 'Plugin Panel',
      icon: '🧩',
      onClick: () => context.log('Plugin panel clicked!')
    });
  },
  
  onUnload: () => {
    // All registered buttons are automatically cleaned up
  }
};
```

## Unregistering Buttons

Buttons are automatically unregistered when the plugin is unloaded. To manually unregister:

```javascript
context.ui.unregisterButton('my-button-id');
```

## TypeScript Types

```typescript
import type { UIButtonDefinition, UIButtonPosition, UILocation } from '@paarrot/plugin-manager';

const button: UIButtonDefinition = {
  id: 'my-button',
  location: 'text-composer-toolbar',
  label: 'My Action',
  icon: '🎨',
  position: {
    group: 'my-tools',
    after: 'emoji-picker',
    order: 1
  },
  onClick: () => console.log('Clicked!')
};
```
