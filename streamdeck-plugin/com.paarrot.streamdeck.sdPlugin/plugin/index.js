/**
 * Paarrot Stream Deck Plugin
 * Controls the Paarrot desktop app via its local API
 */

const API_BASE_URL = 'http://127.0.0.1:33384';
const POLL_INTERVAL = 1000; // Poll status every second

/**
 * Global plugin instance
 */
let websocket = null;
let pluginUUID = null;
let statusPollInterval = null;

/**
 * Track state for each action instance
 */
const actionStates = new Map();

/**
 * Action UUIDs
 */
const ACTIONS = {
  TOGGLE_MUTE: 'com.paarrot.streamdeck.togglemute',
  TOGGLE_DEAFEN: 'com.paarrot.streamdeck.toggledeafen',
  CHANGE_CHANNEL: 'com.paarrot.streamdeck.changechannel',
  SEND_MESSAGE: 'com.paarrot.streamdeck.sendmessage',
  GET_STATUS: 'com.paarrot.streamdeck.getstatus'
};

/**
 * Make API call to Paarrot
 */
async function callAPI(endpoint, method = 'GET', body = null) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'API call failed');
    }

    return data.data;
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    showAlert();
    throw error;
  }
}

/**
 * Get current app status
 */
async function getStatus() {
  return await callAPI('/status');
}

/**
 * Set mute state explicitly
 * @param {boolean} muted - Whether to mute
 */
async function setMute(muted) {
  return await callAPI('/mute', 'POST', { muted });
}

/**
 * Set deafen state explicitly
 * @param {boolean} deafened - Whether to deafen
 */
async function setDeafen(deafened) {
  return await callAPI('/deafen', 'POST', { deafened });
}

/**
 * Change channel
 */
async function changeChannel(roomId) {
  return await callAPI('/channel', 'POST', { roomId });
}

/**
 * Send message to current room
 */
async function sendMessage(message) {
  return await callAPI('/message/current', 'POST', { message });
}

/**
 * Get list of channels
 */
async function getChannels() {
  return await callAPI('/channels');
}

/**
 * Update button state based on status
 */
function updateButtonStates(status) {
  actionStates.forEach((state, context) => {
    if (state.action === ACTIONS.TOGGLE_MUTE) {
      const newState = status.muted ? 1 : 0;
      if (state.currentState !== newState) {
        setState(context, newState);
        state.currentState = newState;
      }
    } else if (state.action === ACTIONS.TOGGLE_DEAFEN) {
      const newState = status.deafened ? 1 : 0;
      if (state.currentState !== newState) {
        setState(context, newState);
        state.currentState = newState;
      }
    } else if (state.action === ACTIONS.GET_STATUS) {
      const title = `${status.muted ? 'M' : ''}${status.deafened ? 'D' : ''}${!status.muted && !status.deafened ? 'OK' : ''}`;
      setTitle(context, title);
    }
  });
}

/**
 * Start polling for status updates
 */
function startStatusPolling() {
  if (statusPollInterval) {
    return;
  }

  statusPollInterval = setInterval(async () => {
    try {
      const status = await getStatus();
      updateButtonStates(status);
    } catch (error) {
      // Silently fail - server might not be running
    }
  }, POLL_INTERVAL);
}

/**
 * Stop polling for status updates
 */
function stopStatusPolling() {
  if (statusPollInterval) {
    clearInterval(statusPollInterval);
    statusPollInterval = null;
  }
}

/**
 * Send command to Stream Deck
 */
function sendToStreamDeck(event, context, payload = {}) {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    const message = {
      event,
      context,
      ...payload
    };
    websocket.send(JSON.stringify(message));
  }
}

/**
 * Set button state
 */
function setState(context, state) {
  sendToStreamDeck('setState', context, { payload: { state } });
}

/**
 * Set button title
 */
function setTitle(context, title) {
  sendToStreamDeck('setTitle', context, { payload: { title } });
}

/**
 * Show alert on button
 */
function showAlert(context) {
  if (context) {
    sendToStreamDeck('showAlert', context);
  }
}

/**
 * Show OK on button
 */
function showOk(context) {
  sendToStreamDeck('showOk', context);
}

/**
 * Handle button press
 */
async function handleKeyDown(context, settings, action) {
  try {
    switch (action) {
      case ACTIONS.TOGGLE_MUTE: {
        // Get current state and set opposite
        const status = await getStatus();
        await setMute(!status.muted);
        showOk(context);
        break;
      }

      case ACTIONS.TOGGLE_DEAFEN: {
        // Get current state and set opposite
        const status = await getStatus();
        await setDeafen(!status.deafened);
        showOk(context);
        break;
      }

      case ACTIONS.CHANGE_CHANNEL:
        if (settings.roomId) {
          await changeChannel(settings.roomId);
          showOk(context);
        } else {
          showAlert(context);
        }
        break;

      case ACTIONS.SEND_MESSAGE:
        if (settings.message) {
          await sendMessage(settings.message);
          showOk(context);
        } else {
          showAlert(context);
        }
        break;

      case ACTIONS.GET_STATUS:
        const status = await getStatus();
        updateButtonStates(status);
        showOk(context);
        break;
    }

    // Force immediate status update
    const status = await getStatus();
    updateButtonStates(status);
  } catch (error) {
    showAlert(context);
  }
}

/**
 * Handle action appearing
 */
function handleWillAppear(context, settings, action) {
  actionStates.set(context, {
    action,
    settings,
    currentState: 0
  });

  // Get initial state
  getStatus()
    .then(status => updateButtonStates(status))
    .catch(() => {});
}

/**
 * Handle action disappearing
 */
function handleWillDisappear(context) {
  actionStates.delete(context);
}

/**
 * Handle settings change
 */
function handleDidReceiveSettings(context, settings, action) {
  const state = actionStates.get(context);
  if (state) {
    state.settings = settings;
  }
}

/**
 * Handle property inspector request
 */
function handleSendToPlugin(context, action, payload) {
  // Handle requests from property inspector
  if (payload.event === 'getChannels') {
    getChannels()
      .then(channels => {
        sendToStreamDeck('sendToPropertyInspector', context, {
          action,
          payload: {
            event: 'channelList',
            channels
          }
        });
      })
      .catch(error => {
        console.error('Failed to get channels:', error);
      });
  }
}

/**
 * Setup WebSocket connection to Stream Deck
 */
function connectElgatoStreamDeckSocket(inPort, inPluginUUID, inRegisterEvent, inInfo) {
  pluginUUID = inPluginUUID;

  websocket = new WebSocket(`ws://127.0.0.1:${inPort}`);

  websocket.onopen = () => {
    const registerPayload = {
      event: inRegisterEvent,
      uuid: inPluginUUID
    };
    websocket.send(JSON.stringify(registerPayload));

    // Start status polling
    startStatusPolling();
  };

  websocket.onmessage = (evt) => {
    try {
      const message = JSON.parse(evt.data);
      const { event, action, context, payload } = message;
      const settings = payload?.settings || {};

      switch (event) {
        case 'keyDown':
          handleKeyDown(context, settings, action);
          break;

        case 'willAppear':
          handleWillAppear(context, settings, action);
          break;

        case 'willDisappear':
          handleWillDisappear(context);
          break;

        case 'didReceiveSettings':
          handleDidReceiveSettings(context, settings, action);
          break;

        case 'sendToPlugin':
          handleSendToPlugin(context, action, payload);
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  };

  websocket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  websocket.onclose = () => {
    stopStatusPolling();
  };
}
