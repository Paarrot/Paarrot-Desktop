# Paarrot API Server Documentation

The Paarrot API server provides a local HTTP API for controlling the Paarrot desktop app from external applications like Stream Deck, keyboard macros, scripts, and other automation tools.

## Server Details

- **Base URL**: `http://127.0.0.1:33384`
- **Protocol**: HTTP
- **Content-Type**: `application/json`
- **CORS**: Enabled for all origins

## Authentication

Currently, no authentication is required. The API server only listens on localhost (127.0.0.1) for security.

## API Endpoints

### Health Check

Check if the API server is running.

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "ok",
  "app": "Paarrot API",
  "version": "1.0.0"
}
```

---

### Get Status

Get the current status of the app (mute, deafen, current room, etc.).

**Endpoint**: `GET /status`

**Response**:
```json
{
  "success": true,
  "data": {
    "muted": false,
    "deafened": false,
    "currentRoom": "!abc123:matrix.org",
    "connected": true
  }
}
```

---

### Mute/Unmute

Set the mute status.

**Endpoint**: `POST /mute`

**Request Body**:
```json
{
  "muted": true
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "muted": true
  }
}
```

---

### Toggle Mute

Toggle the current mute status.

**Endpoint**: `POST /mute/toggle`

**Response**:
```json
{
  "success": true,
  "data": {
    "muted": true
  }
}
```

---

### Deafen/Undeafen

Set the deafen status (deafening also mutes).

**Endpoint**: `POST /deafen`

**Request Body**:
```json
{
  "deafened": true
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "deafened": true
  }
}
```

---

### Toggle Deafen

Toggle the current deafen status.

**Endpoint**: `POST /deafen/toggle`

**Response**:
```json
{
  "success": true,
  "data": {
    "deafened": true
  }
}
```

---

### Change Channel/Room

Switch to a different Matrix room.

**Endpoint**: `POST /channel`

**Request Body**:
```json
{
  "roomId": "!abc123:matrix.org"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "roomId": "!abc123:matrix.org",
    "roomName": "General"
  }
}
```

---

### Get Channels/Rooms

Get a list of available rooms/channels.

**Endpoint**: `GET /channels`

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "roomId": "!abc123:matrix.org",
      "name": "General",
      "isDirect": false
    },
    {
      "roomId": "!def456:matrix.org",
      "name": "Random",
      "isDirect": false
    }
  ]
}
```

---

### Send Message

Send a message to a specific room.

**Endpoint**: `POST /message`

**Request Body**:
```json
{
  "roomId": "!abc123:matrix.org",
  "message": "Hello from the API!"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "eventId": "$abc123",
    "roomId": "!abc123:matrix.org"
  }
}
```

---

### Send Message to Current Room

Send a message to the currently active room.

**Endpoint**: `POST /message/current`

**Request Body**:
```json
{
  "message": "Hello from the API!"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "eventId": "$abc123",
    "roomId": "!abc123:matrix.org"
  }
}
```

---

### Get Current Room

Get information about the currently active room.

**Endpoint**: `GET /room/current`

**Response**:
```json
{
  "success": true,
  "data": {
    "roomId": "!abc123:matrix.org",
    "name": "General",
    "avatar": "mxc://matrix.org/abc123",
    "isDirect": false
  }
}
```

---

## Error Responses

All endpoints return error responses in the following format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

Common HTTP status codes:
- `200 OK` - Request successful
- `400 Bad Request` - Missing or invalid parameters
- `404 Not Found` - Endpoint not found
- `500 Internal Server Error` - Server error

---

## Example Usage

### cURL

```bash
# Toggle mute
curl -X POST http://127.0.0.1:33384/mute/toggle

# Send message to current room
curl -X POST http://127.0.0.1:33384/message/current \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!"}'

# Change channel
curl -X POST http://127.0.0.1:33384/channel \
  -H "Content-Type: application/json" \
  -d '{"roomId": "!abc123:matrix.org"}'
```

### JavaScript/Node.js

```javascript
const fetch = require('node-fetch');

// Toggle mute
async function toggleMute() {
  const response = await fetch('http://127.0.0.1:33384/mute/toggle', {
    method: 'POST'
  });
  const data = await response.json();
  console.log('Muted:', data.data.muted);
}

// Send message
async function sendMessage(roomId, message) {
  const response = await fetch('http://127.0.0.1:33384/message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ roomId, message })
  });
  const data = await response.json();
  console.log('Message sent:', data.data.eventId);
}
```

### Python

```python
import requests

# Toggle mute
def toggle_mute():
    response = requests.post('http://127.0.0.1:33384/mute/toggle')
    data = response.json()
    print('Muted:', data['data']['muted'])

# Send message
def send_message(room_id, message):
    response = requests.post('http://127.0.0.1:33384/message', json={
        'roomId': room_id,
        'message': message
    })
    data = response.json()
    print('Message sent:', data['data']['eventId'])
```

---

## Stream Deck Integration

To integrate with Stream Deck:

1. Install the "API Ninja" or "HTTP Request" plugin for Stream Deck
2. Create a button with the following configuration:
   - **URL**: `http://127.0.0.1:33384/mute/toggle`
   - **Method**: POST
   - **Headers**: `Content-Type: application/json`

Example configurations:

**Mute Toggle Button**:
- URL: `http://127.0.0.1:33384/mute/toggle`
- Method: POST

**Deafen Toggle Button**:
- URL: `http://127.0.0.1:33384/deafen/toggle`
- Method: POST

**Send Quick Message**:
- URL: `http://127.0.0.1:33384/message/current`
- Method: POST
- Body: `{"message": "BRB!"}`

---

## Client-Side Implementation

To enable the API functionality in the Paarrot app, you need to implement the action handlers in your Matrix client code. The API server sends actions via IPC to the renderer process, which should handle them and respond.

### Example Handler (TypeScript/React)

Add this to your app initialization:

```typescript
// Listen for API actions from the Electron API server
if (window.electron?.api?.onAction) {
  window.electron.api.onAction(async (action:  {
    action: string;
    params: any;
    responseChannel: string;
  }) => {
    try {
      let result;
      
      switch (action.action) {
        case 'toggle-mute':
          // Toggle microphone mute
          result = await toggleMicrophone();
          break;
          
        case 'set-mute':
          // Set microphone mute state
          result = await setMicrophone(action.params.muted);
          break;
          
        case 'toggle-deafen':
          // Toggle deafen (mute speakers)
          result = await toggleDeafen();
          break;
          
        case 'set-deafen':
          // Set deafen state
          result = await setDeafen(action.params.deafened);
          break;
          
        case 'change-channel':
          // Navigate to a different room
          result = await changeRoom(action.params.roomId);
          break;
          
        case 'get-channels':
          // Get list of rooms
          result = await getRoomList();
          break;
          
        case 'send-message':
          // Send message to specific room
          result = await sendMessage(action.params.roomId, action.params.message);
          break;
          
        case 'send-message-current':
          // Send message to current room
          result = await sendMessageToCurrent(action.params.message);
          break;
          
        case 'get-current-room':
          // Get current room info
          result = await getCurrentRoomInfo();
          break;
          
        case 'get-status':
          // Get current app status
          result = await getAppStatus();
          break;
          
        default:
          throw new Error(`Unknown action: ${action.action}`);
      }
      
      // Send success response back
      window.electron.api.sendResponse(action.responseChannel, {
        success: true,
        data: result
      });
    } catch (error) {
      // Send error response back
      window.electron.api.sendResponse(action.responseChannel, {
        success: false,
        error: error.message
      });
    }
  });
}
```

---

## Configuration

The API server can be configured by modifying `electron/api-server.js`:

- **Default Port**: 33384 (can be changed in the constructor)
- **Bind Address**: 127.0.0.1 (localhost only for security)
- **Timeout**: 10 seconds for actions

---

## Security Notes

1. The API server only listens on localhost (127.0.0.1) and is not accessible from the network
2. No authentication is implemented - anyone with local access can control the app
3. Consider adding API key authentication if needed for your use case
4. CORS is enabled for all origins since it's localhost only

---

## Troubleshooting

**API server not starting**:
- Check if port 33384 is already in use
- Check console logs for errors
- Verify Express is installed: `npm install express cors body-parser`

**Actions not working**:
- Ensure the client-side handler is implemented
- Check browser console for errors
- Verify the action names match between API server and client

**Timeout errors**:
- Actions must respond within 10 seconds
- Check if the Matrix client is initialized
- Verify the action handler is registered

---

## Future Enhancements

Potential features to add:
- WebSocket support for real-time events
- Authentication with API keys
- Voice channel controls (join/leave)
- User status updates
- Notification controls
- Screen sharing controls
