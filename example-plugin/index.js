// Example plugin for Paarrot - Demonstrates all plugin API features
// This plugin showcases commands, message interceptors, settings, logging, and more

module.exports = {
  name: "Example Plugin",
  version: "2.0.0",
  
  /**
   * Called when the plugin is loaded
   * @param {PluginContext} ctx - The plugin context with access to all APIs
   */
  onLoad: async (ctx) => {
    ctx.log('🎉 Example plugin is loading...');
    
    try {
      // 1. Register commands with args
      ctx.commands.register({
        name: "shrug",
        description: "Send a shrug emoji",
        run: () => {
          ctx.log('Shrug command executed');
          return "¯\\_(ツ)_/¯";
        }
      });

      ctx.commands.register({
        name: "echo",
        args: ["text"],
        description: "Echo back your text",
        run: ({ text }) => {
          ctx.log('Echo command:', text);
          return text || "Nothing to echo!";
        }
      });

      ctx.commands.register({
        name: "wave",
        description: "Wave at someone",
        args: ["name"],
        run: ({ name }) => {
          return `👋 Hey ${name || 'everyone'}!`;
        }
      });

      // 2. Message interceptors
      ctx.messages.onBeforeSend((msg) => {
        // Auto-expand abbreviations
        if (msg.content === "brb") {
          msg.content = "be right back!";
          ctx.log('Expanded brb to full phrase');
        }
        if (msg.content === "omw") {
          msg.content = "on my way!";
        }
      });

      ctx.messages.onReceive((msg) => {
        // Log all received messages (for debugging)
        ctx.log(`Received message in ${msg.roomId}:`, msg.content.substring(0, 50));
      });

      // 3. Define settings
      ctx.settings.define({
        autoShrug: {
          type: "boolean",
          label: "Auto Shrug",
          description: "Automatically append ¯\\_(ツ)_/¯ to messages ending with '?'",
          default: false
        },
        theme: {
          type: "select",
          label: "Plugin Theme",
          description: "Choose your preferred theme",
          options: [
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
            { value: "purple", label: "Purple" }
          ],
          default: "dark"
        },
        customPrefix: {
          type: "string",
          label: "Custom Prefix",
          description: "Prefix for plugin commands",
          default: "[Plugin]"
        }
      });

      // Use settings
      const autoShrug = ctx.settings.get('autoShrug');
      if (autoShrug) {
        ctx.log('Auto shrug is enabled!');
        ctx.messages.onBeforeSend((msg) => {
          if (msg.content.endsWith('?')) {
            msg.content += ' ¯\\_(ツ)_/¯';
          }
        });
      }

      // 4. Listen to raw Matrix events
      ctx.matrix.on('Room.timeline', (event) => {
        if (event.getType() === 'm.room.message') {
          const content = event.getContent();
          if (content.body?.includes('hello')) {
            ctx.log('Someone said hello!');
          }
        }
      });

      // 5. Background tasks
      ctx.timers.setInterval(() => {
        ctx.log('Background task running... (every 30s)');
        // You could check for notifications, clean up data, etc.
      }, 30000);

      // 6. Notifications
      ctx.notify({
        title: "Example Plugin",
        body: "Plugin loaded successfully!",
        type: "success"
      });

      // 7. Custom UI renderer (conceptual - would need UI integration)
      ctx.ui.registerRenderer("custom-message", (msg) => {
        ctx.log('Rendering custom message:', msg);
        // Return custom React component
        return null;
      });

      // 8. Export API for other plugins
      this.exports = {
        greet: (name) => {
          return `Hello, ${name}!`;
        },
        version: "2.0.0"
      };

      ctx.log('✅ Example plugin loaded successfully!');
      ctx.log('Registered commands: /shrug, /echo, /wave');
      ctx.log('Settings:', {
        autoShrug: ctx.settings.get('autoShrug'),
        theme: ctx.settings.get('theme'),
        prefix: ctx.settings.get('customPrefix')
      });
      
    } catch (error) {
      ctx.error('Failed to load example plugin:', error);
    }
  },
  
  /**
   * Called when the plugin is unloaded or disabled
   */
  onUnload: async () => {
    console.log('[ExamplePlugin] Plugin is unloading...');
    console.log('[ExamplePlugin] Cleaned up successfully!');
  },

  // Exports for other plugins to use via ctx.require()
  exports: null // Will be set during onLoad
};
