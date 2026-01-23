//! Mobile-specific entry points for Android and iOS

/// Mobile entry point
#[tauri::mobile_entry_point]
fn main() {
    crate::run();
}
