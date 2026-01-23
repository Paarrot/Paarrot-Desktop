//! Mobile-specific entry points for Android and iOS

use tauri::{AppHandle, Runtime};

/// Mobile entry point
#[tauri::mobile_entry_point]
fn main() {
    crate::run();
}
