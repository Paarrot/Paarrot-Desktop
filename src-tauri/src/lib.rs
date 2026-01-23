//! Cinny Desktop library for cross-platform builds including Android

#[cfg(mobile)]
mod mobile;

/// Runs the Tauri application
pub fn run() {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let port = 44548;
        tauri::Builder::default()
            .plugin(tauri_plugin_localhost::Builder::new(port).build())
            .plugin(tauri_plugin_shell::init())
            .plugin(tauri_plugin_window_state::Builder::default().build())
            .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_updater::Builder::new().build())
            .run(tauri::generate_context!())
            .expect("error while building tauri application");
    }

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        tauri::Builder::default()
            .plugin(tauri_plugin_shell::init())
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_deep_link::init())
            .run(tauri::generate_context!())
            .expect("error while building tauri application");
    }
}
