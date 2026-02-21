#!/usr/bin/env node

/**
 * Generate Postman collection from API documentation
 * This script reads the API.md file and generates a Postman collection
 */

const fs = require('fs');
const path = require('path');

const collection = {
  info: {
    _postman_id: 'paarrot-api-collection',
    name: 'Paarrot API',
    description: 'API endpoints for controlling Paarrot (Cinny Desktop) features like muting, deafening, channel navigation, and messaging.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    _exporter_id: 'paarrot-api',
  },
  item: [
    {
      name: 'Health & Status',
      item: [
        {
          name: 'Health Check',
          request: {
            method: 'GET',
            header: [],
            url: {
              raw: '{{baseUrl}}/health',
              host: ['{{baseUrl}}'],
              path: ['health'],
            },
            description: 'Check if the API server is running and healthy.',
          },
        },
        {
          name: 'Get Status',
          request: {
            method: 'GET',
            header: [],
            url: {
              raw: '{{baseUrl}}/status',
              host: ['{{baseUrl}}'],
              path: ['status'],
            },
            description: 'Get current application status including mute/deafen state, current room, connection status, and user ID.',
          },
        },
      ],
    },
    {
      name: 'Audio Controls',
      item: [
        {
          name: 'Toggle Mute',
          request: {
            method: 'POST',
            header: [],
            url: {
              raw: '{{baseUrl}}/mute/toggle',
              host: ['{{baseUrl}}'],
              path: ['mute', 'toggle'],
            },
            description: 'Toggle microphone mute state. Works only when in an active call.',
          },
        },
        {
          name: 'Set Mute',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: {
              mode: 'raw',
              raw: JSON.stringify({ muted: true }, null, 2),
            },
            url: {
              raw: '{{baseUrl}}/mute',
              host: ['{{baseUrl}}'],
              path: ['mute'],
            },
            description: 'Set microphone mute to a specific state (true/false). Works only when in an active call.',
          },
        },
        {
          name: 'Toggle Deafen',
          request: {
            method: 'POST',
            header: [],
            url: {
              raw: '{{baseUrl}}/deafen/toggle',
              host: ['{{baseUrl}}'],
              path: ['deafen', 'toggle'],
            },
            description: 'Toggle deafen state (mutes all incoming audio and your microphone). Works only when in an active call.',
          },
        },
        {
          name: 'Set Deafen',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: {
              mode: 'raw',
              raw: JSON.stringify({ deafened: true }, null, 2),
            },
            url: {
              raw: '{{baseUrl}}/deafen',
              host: ['{{baseUrl}}'],
              path: ['deafen'],
            },
            description: 'Set deafen to a specific state (true/false). Works only when in an active call.',
          },
        },
      ],
    },
    {
      name: 'Rooms & Channels',
      item: [
        {
          name: 'Get Channels',
          request: {
            method: 'GET',
            header: [],
            url: {
              raw: '{{baseUrl}}/channels',
              host: ['{{baseUrl}}'],
              path: ['channels'],
            },
            description: 'Get list of all available rooms/channels with their details (roomId, name, isDirect, avatar).',
          },
        },
        {
          name: 'Get Current Room',
          request: {
            method: 'GET',
            header: [],
            url: {
              raw: '{{baseUrl}}/room/current',
              host: ['{{baseUrl}}'],
              path: ['room', 'current'],
            },
            description: 'Get information about the currently active room.',
          },
        },
        {
          name: 'Change Channel',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: {
              mode: 'raw',
              raw: JSON.stringify({ roomId: '!YourRoomId:server.com' }, null, 2),
            },
            url: {
              raw: '{{baseUrl}}/channel',
              host: ['{{baseUrl}}'],
              path: ['channel'],
            },
            description: 'Navigate to a different room/channel by providing its roomId.',
          },
        },
      ],
    },
    {
      name: 'Messaging',
      item: [
        {
          name: 'Send Message to Room',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: {
              mode: 'raw',
              raw: JSON.stringify(
                {
                  roomId: '!YourRoomId:server.com',
                  message: 'Hello from Postman!',
                },
                null,
                2
              ),
            },
            url: {
              raw: '{{baseUrl}}/message',
              host: ['{{baseUrl}}'],
              path: ['message'],
            },
            description: 'Send a text message to a specific room by providing roomId and message content.',
          },
        },
        {
          name: 'Send Message to Current Room',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: {
              mode: 'raw',
              raw: JSON.stringify({ message: 'Hello from Postman!' }, null, 2),
            },
            url: {
              raw: '{{baseUrl}}/message/current',
              host: ['{{baseUrl}}'],
              path: ['message', 'current'],
            },
            description: 'Send a text message to the currently active room.',
          },
        },
      ],
    },
  ],
  variable: [
    {
      key: 'baseUrl',
      value: 'http://127.0.0.1:33384',
      type: 'string',
    },
  ],
};

// Write the collection to file (in the project root)
const outputPath = path.join(__dirname, '..', 'paarrot-api.postman_collection.json');
fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2) + '\n');

console.log('✅ Postman collection generated:', outputPath);
