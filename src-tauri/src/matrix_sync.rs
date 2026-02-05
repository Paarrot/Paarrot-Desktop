//! Matrix sync implementation using matrix-sdk
//! 
//! This module handles the actual Matrix sync loop and notification triggering.

use matrix_sdk::{
    Client, 
    config::SyncSettings,
    matrix_auth::MatrixSession,
    ruma::{
        events::room::message::{MessageType, SyncRoomMessageEvent},
        OwnedUserId, OwnedDeviceId,
    },
};
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;
use tokio::sync::RwLock;

use crate::background_sync::{MatrixCredentials, get_sync_manager};

/// Active Matrix client for background sync
static MATRIX_CLIENT: std::sync::OnceLock<RwLock<Option<Client>>> = std::sync::OnceLock::new();

fn get_client_lock() -> &'static RwLock<Option<Client>> {
    MATRIX_CLIENT.get_or_init(|| RwLock::new(None))
}

/// Initializes the Matrix client with the given credentials
pub async fn init_client(credentials: &MatrixCredentials) -> Result<Client, String> {
    // Pass the URL string directly - ClientBuilder::homeserver_url accepts impl AsRef<str>
    let client = Client::builder()
        .homeserver_url(&credentials.homeserver_url)
        .build()
        .await
        .map_err(|e| format!("Failed to build client: {}", e))?;

    // Restore the session
    let user_id: OwnedUserId = credentials.user_id.parse()
        .map_err(|e| format!("Invalid user ID: {}", e))?;
    
    let device_id: OwnedDeviceId = credentials.device_id.clone().into();
    
    let session = MatrixSession {
        meta: matrix_sdk::SessionMeta {
            user_id,
            device_id,
        },
        tokens: matrix_sdk::matrix_auth::MatrixSessionTokens {
            access_token: credentials.access_token.clone(),
            refresh_token: None,
        },
    };

    client.matrix_auth().restore_session(session).await
        .map_err(|e| format!("Failed to restore session: {}", e))?;

    // Store the client
    {
        let mut lock = get_client_lock().write().await;
        *lock = Some(client.clone());
    }

    Ok(client)
}

/// Runs the sync loop and triggers notifications for new messages
pub async fn run_sync_loop<R: tauri::Runtime>(app_handle: AppHandle<R>) -> Result<(), String> {
    let manager = get_sync_manager();
    
    let client = {
        let lock = get_client_lock().read().await;
        lock.clone().ok_or("Client not initialized")?
    };

    let own_user_id = client.user_id()
        .ok_or("Not logged in")?
        .to_owned();

    log::info!("Starting sync loop for {}", own_user_id);

    // Set up event handler for room messages
    let app_handle_clone = app_handle.clone();
    let own_user_clone = own_user_id.clone();
    
    client.add_event_handler(move |event: SyncRoomMessageEvent, room: matrix_sdk::Room| {
        let app = app_handle_clone.clone();
        let own_user = own_user_clone.clone();
        
        async move {
            // Only process original messages (not edits/reactions)
            if let SyncRoomMessageEvent::Original(original) = event {
                // Don't notify for our own messages
                if original.sender == own_user {
                    return;
                }

                // Get room name for notification
                let room_name = room.display_name().await
                    .map(|n| n.to_string())
                    .unwrap_or_else(|_| "Unknown room".to_string());

                // Get sender display name
                let sender_name = room.get_member(&original.sender).await
                    .ok()
                    .flatten()
                    .and_then(|m| m.display_name().map(|s| s.to_string()))
                    .unwrap_or_else(|| original.sender.to_string());

                // Get message body
                let body = match &original.content.msgtype {
                    MessageType::Text(text) => text.body.clone(),
                    MessageType::Image(_) => "📷 Image".to_string(),
                    MessageType::Video(_) => "🎥 Video".to_string(),
                    MessageType::Audio(_) => "🎵 Audio".to_string(),
                    MessageType::File(_) => "📎 File".to_string(),
                    MessageType::Location(_) => "📍 Location".to_string(),
                    MessageType::Emote(emote) => format!("* {} {}", sender_name, emote.body),
                    _ => "New message".to_string(),
                };

                // Send notification
                let title = format!("{} in {}", sender_name, room_name);
                
                if let Err(e) = app.notification()
                    .builder()
                    .title(&title)
                    .body(&body)
                    .show()
                {
                    log::error!("Failed to show notification: {}", e);
                }
            }
        }
    });

    // Run the sync loop
    let settings = SyncSettings::default();
    
    loop {
        // Check if we should stop
        if manager.should_stop().await {
            log::info!("Sync loop stopping due to stop flag");
            break;
        }

        // Perform one sync iteration
        match client.sync_once(settings.clone()).await {
            Ok(response) => {
                log::debug!("Sync completed, next_batch: {}", response.next_batch);
            }
            Err(e) => {
                log::error!("Sync error: {}", e);
                // Update state to error
                manager.set_error(e.to_string()).await;
                // Wait a bit before retrying
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
        }

        // Small delay between syncs to avoid hammering the server
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }

    Ok(())
}

/// Stops the sync and cleans up
pub async fn stop_sync() {
    let manager = get_sync_manager();
    manager.stop_sync().await;
    
    // Clear the client
    let mut lock = get_client_lock().write().await;
    *lock = None;
}
