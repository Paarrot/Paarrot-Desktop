const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

class PaarrotAPIServer {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.app = express();
    this.server = null;
    this.port = 33384; // Default port for Paarrot API
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Enable CORS for all origins (you can restrict this if needed)
    this.app.use(cors());
    
    // Parse JSON bodies
    this.app.use(bodyParser.json());
    
    // Log all requests
    this.app.use((req, res, next) => {
      console.log(`Paarrot API: ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', app: 'Paarrot API', version: '1.0.0' });
    });

    // Get current status
    this.app.get('/status', async (req, res) => {
      try {
        const status = await this.executeAction('get-status');
        res.json({ success: true, data: status });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Mute/unmute
    this.app.post('/mute', async (req, res) => {
      try {
        const { muted } = req.body;
        const result = await this.executeAction('set-mute', { muted });
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Toggle mute
    this.app.post('/mute/toggle', async (req, res) => {
      try {
        const result = await this.executeAction('toggle-mute');
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Deafen/undeafen
    this.app.post('/deafen', async (req, res) => {
      try {
        const { deafened } = req.body;
        const result = await this.executeAction('set-deafen', { deafened });
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Toggle deafen
    this.app.post('/deafen/toggle', async (req, res) => {
      try {
        const result = await this.executeAction('toggle-deafen');
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Change channel/room
    this.app.post('/channel', async (req, res) => {
      try {
        const { roomId } = req.body;
        if (!roomId) {
          return res.status(400).json({ success: false, error: 'roomId is required' });
        }
        const result = await this.executeAction('change-channel', { roomId });
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get list of rooms/channels
    this.app.get('/channels', async (req, res) => {
      try {
        const result = await this.executeAction('get-channels');
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Send message
    this.app.post('/message', async (req, res) => {
      try {
        const { roomId, message } = req.body;
        if (!roomId || !message) {
          return res.status(400).json({ 
            success: false, 
            error: 'roomId and message are required' 
          });
        }
        const result = await this.executeAction('send-message', { roomId, message });
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Send message to current room
    this.app.post('/message/current', async (req, res) => {
      try {
        const { message } = req.body;
        if (!message) {
          return res.status(400).json({ 
            success: false, 
            error: 'message is required' 
          });
        }
        const result = await this.executeAction('send-message-current', { message });
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get current room info
    this.app.get('/room/current', async (req, res) => {
      try {
        const result = await this.executeAction('get-current-room');
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ 
        success: false, 
        error: 'Endpoint not found',
        availableEndpoints: [
          'GET /health',
          'GET /status',
          'POST /mute',
          'POST /mute/toggle',
          'POST /deafen',
          'POST /deafen/toggle',
          'POST /channel',
          'GET /channels',
          'POST /message',
          'POST /message/current',
          'GET /room/current'
        ]
      });
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      console.error('Paarrot API Error:', err);
      res.status(500).json({ success: false, error: err.message });
    });
  }

  /**
   * Execute an action by sending it to the renderer process
   * @param {string} action - The action to execute
   * @param {object} params - Parameters for the action
   * @returns {Promise<any>} - Result from the renderer
   */
  executeAction(action, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) {
        return reject(new Error('Main window is not available'));
      }

      // Create a unique response channel
      const responseChannel = `api-response-${Date.now()}-${Math.random()}`;
      
      // Set up one-time listener for the response
      const { ipcMain } = require('electron');
      const timeout = setTimeout(() => {
        ipcMain.removeHandler(responseChannel);
        reject(new Error('Action timed out'));
      }, 10000); // 10 second timeout

      ipcMain.handleOnce(responseChannel, async (event, result) => {
        clearTimeout(timeout);
        if (result.success) {
          resolve(result.data);
        } else {
          reject(new Error(result.error || 'Unknown error'));
        }
      });

      // Send the action to the renderer
      this.mainWindow.webContents.send('api-action', {
        action,
        params,
        responseChannel
      });
    });
  }

  start(port = this.port) {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, '127.0.0.1', () => {
        console.log(`Paarrot API server listening on http://127.0.0.1:${port}`);
        console.log('Available endpoints:');
        console.log('  GET  /health');
        console.log('  GET  /status');
        console.log('  POST /mute');
        console.log('  POST /mute/toggle');
        console.log('  POST /deafen');
        console.log('  POST /deafen/toggle');
        console.log('  POST /channel');
        console.log('  GET  /channels');
        console.log('  POST /message');
        console.log('  POST /message/current');
        console.log('  GET  /room/current');
        resolve(port);
      }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`Paarrot API: Port ${port} is already in use`);
          reject(new Error(`Port ${port} is already in use`));
        } else {
          console.error('Paarrot API: Failed to start server:', err);
          reject(err);
        }
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Paarrot API server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = PaarrotAPIServer;
