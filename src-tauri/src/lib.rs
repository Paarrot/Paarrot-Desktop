//! Cinny Desktop library for cross-platform builds including Android

#[cfg(mobile)]
mod mobile;

#[cfg(mobile)]
pub use mobile::*;

/// Runs the Tauri application
pub fn run() {
    let port = 44548;

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = {
        tauri::Builder::default()
            .plugin(tauri_plugin_localhost::Builder::new(port).build())
            .plugin(tauri_plugin_shell::init())
            .plugin(tauri_plugin_window_state::Builder::default().build())
            .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
    };

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = {
        tauri::Builder::default()
            .plugin(tauri_plugin_localhost::Builder::new(port).build())
            .plugin(tauri_plugin_shell::init())
    };

    builder
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
