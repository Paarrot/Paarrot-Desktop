# Paarrot API Quick Start

A local HTTP API server for controlling Paarrot from external devices like Stream Deck, scripts, and automation tools.

## 🚀 Getting Started

The API server starts automatically when you run Paarrot. It listens on `http://127.0.0.1:33384`.

### Test the API

**Option 1: Using Postman**

Import the Postman collection for easy testing:
1. Open Postman
2. Click **Import** → **File**
3. Select `paarrot-api.postman_collection.json`
4. All endpoints will be ready to use!

The collection is automatically updated on git push.

**Option 2: Using the test script**
```bash
node test-api.js
```

**Option 3: Using curl**
```bash
./test-api.sh
```

**Option 4: Manual curl commands**
```bash
# Health check
curl http://127.0.0.1:33384/health

# Toggle mute
curl -X POST http://127.0.0.1:33384/mute/toggle

# Send message
curl -X POST http://127.0.0.1:33384/message/current \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from API!"}'
```

## 📝 Quick Reference

### Common Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Check if API is running |
| `/status` | GET | Get app status (mute, deafen, etc.) |
| `/mute/toggle` | POST | Toggle microphone mute |
| `/deafen/toggle` | POST | Toggle deafen |
| `/channels` | GET | Get list of rooms |
| `/channel` | POST | Switch to a room |
| `/message/current` | POST | Send message to current room |

## 🎮 Stream Deck Integration

1. Install the "API Ninja" or "HTTP Request" plugin
2. Create buttons with these settings:

**Mute Toggle Button:**
- URL: `http://127.0.0.1:33384/mute/toggle`
- Method: POST

**Quick Message Button:**
- URL: `http://127.0.0.1:33384/message/current`
- Method: POST
- Body: `{"message": "BRB!"}`

## 🔧 Integration with Paarrot

To enable full functionality, you need to implement the action handlers in the Cinny frontend:

1. Import the API handler in your app initialization:
```typescript
import { initPaarrotAPI } from './app/paarrot-api';

// After Matrix client is initialized
initPaarrotAPI(matrixClient);
```

2. Implement the TODO items in `cinny/src/app/paarrot-api.ts`:
   - Mute/unmute logic (WebRTC audio)
   - Deafen logic (WebRTC audio output)
   - Navigation to rooms (router integration)
   - Get current room from URL/state

## 📖 Full Documentation

See [API.md](API.md) for complete API documentation including:
- All available endpoints
- Request/response formats
- Error handling
- Code examples in multiple languages
- Detailed integration guide

## 🛠️ Configuration

Edit `electron/api-server.js` to customize:
- Port number (default: 33384)
- Timeout duration (default: 10s)
- CORS settings

## 🐛 Troubleshooting

**API not responding:**
1. Check if Paarrot is running
2. Look for "Paarrot API server listening" in console logs
3. Verify port 33384 is not in use: `lsof -i :33384`

**Actions not working:**
1. Check browser console for errors
2. Ensure `initPaarrotAPI()` is called in your app
3. Implement the TODO items in `paarrot-api.ts`

**Port in use:**
Edit `electron/api-server.js` and change the port number in the constructor.

## 📦 Files

- `electron/api-server.js` - API server implementation
- `cinny/src/app/paarrot-api.ts` - Client-side handler (needs implementation)
- `test-api.js` - Node.js test script
- `test-api.sh` - Bash test script
- `API.md` - Full documentation

## 🔐 Security

- API only listens on localhost (127.0.0.1)
- Not accessible from network
- No authentication required (local only)
- CORS enabled for all origins (safe since localhost only)

## 💡 Examples

**Python Script:**
```python
import requests

def toggle_mute():
    r = requests.post('http://127.0.0.1:33384/mute/toggle')
    print(r.json())

toggle_mute()
```

**JavaScript:**
```javascript
async function sendQuickMessage(msg) {
  const res = await fetch('http://127.0.0.1:33384/message/current', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg })
  });
  return res.json();
}
```

## 🎯 Next Steps

1. Run Paarrot: `npm run dev`
2. Test the API: `node test-api.js`
3. Integrate the handler: Import and call `initPaarrotAPI()`
4. Implement the TODO items in `paarrot-api.ts`
5. Create Stream Deck buttons or automation scripts!

---

For more details, see [API.md](API.md)
