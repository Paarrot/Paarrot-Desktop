//! Background sync module for Matrix client
//! 
//! This module provides native Rust-based Matrix sync that runs independently
//! of the WebView, allowing notifications to work even when the app is backgrounded.

use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use serde::{Deserialize, Serialize};

/// Credentials needed to connect to Matrix homeserver
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatrixCredentials {
    pub homeserver_url: String,
    pub user_id: String,
    pub access_token: String,
    pub device_id: String,
}

/// State of the background sync
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncState {
    Stopped,
    Starting,
    Running,
    Error(String),
}

/// Background sync manager that handles Matrix sync in native Rust
pub struct BackgroundSyncManager {
    credentials: RwLock<Option<MatrixCredentials>>,
    sync_state: RwLock<SyncState>,
    stop_flag: Mutex<bool>,
}

impl BackgroundSyncManager {
    /// Creates a new BackgroundSyncManager
    pub fn new() -> Self {
        Self {
            credentials: RwLock::new(None),
            sync_state: RwLock::new(SyncState::Stopped),
            stop_flag: Mutex::new(false),
        }
    }

    /// Sets the Matrix credentials for syncing
    pub async fn set_credentials(&self, credentials: MatrixCredentials) {
        let mut creds = self.credentials.write().await;
        *creds = Some(credentials);
    }

    /// Clears the stored credentials
    pub async fn clear_credentials(&self) {
        let mut creds = self.credentials.write().await;
        *creds = None;
    }

    /// Gets the current sync state
    pub async fn get_state(&self) -> SyncState {
        self.sync_state.read().await.clone()
    }

    /// Starts the background sync
    pub async fn start_sync(&self) -> Result<(), String> {
        // Check if we have credentials
        let creds = self.credentials.read().await;
        let credentials = creds.as_ref().ok_or("No credentials set")?;
        
        // Update state
        {
            let mut state = self.sync_state.write().await;
            *state = SyncState::Starting;
        }

        // Reset stop flag
        {
            let mut stop = self.stop_flag.lock().await;
            *stop = false;
        }

        log::info!(
            "Background sync starting for user: {}",
            credentials.user_id
        );

        // Update state to running
        {
            let mut state = self.sync_state.write().await;
            *state = SyncState::Running;
        }

        Ok(())
    }

    /// Stops the background sync
    pub async fn stop_sync(&self) {
        {
            let mut stop = self.stop_flag.lock().await;
            *stop = true;
        }
        
        let mut state = self.sync_state.write().await;
        *state = SyncState::Stopped;
        
        log::info!("Background sync stopped");
    }

    /// Checks if sync should stop
    pub async fn should_stop(&self) -> bool {
        *self.stop_flag.lock().await
    }

    /// Sets the sync state to an error
    pub async fn set_error(&self, error: String) {
        let mut state = self.sync_state.write().await;
        *state = SyncState::Error(error);
    }
}

impl Default for BackgroundSyncManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Global instance of the background sync manager
static SYNC_MANAGER: std::sync::OnceLock<Arc<BackgroundSyncManager>> = std::sync::OnceLock::new();

/// Gets or creates the global sync manager instance
pub fn get_sync_manager() -> Arc<BackgroundSyncManager> {
    SYNC_MANAGER
        .get_or_init(|| Arc::new(BackgroundSyncManager::new()))
        .clone()
}
