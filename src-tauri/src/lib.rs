//! Paarrot Desktop library for cross-platform builds including Android

#[cfg(mobile)]
mod mobile;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    WindowEvent,
};

/// Read image from clipboard on Linux using arboard with Wayland support
#[cfg(target_os = "linux")]
#[tauri::command]
fn read_clipboard_image() -> Result<Option<String>, String> {
    use arboard::Clipboard;
    use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
    
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    
    match clipboard.get_image() {
        Ok(img) => {
            // Convert RGBA image data to PNG
            let width = img.width as u32;
            let height = img.height as u32;
            
            let mut png_data = Vec::new();
            {
                let mut encoder = png::Encoder::new(&mut png_data, width, height);
                encoder.set_color(png::ColorType::Rgba);
                encoder.set_depth(png::BitDepth::Eight);
                let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
                writer.write_image_data(&img.bytes).map_err(|e| e.to_string())?;
            }
            
            let base64_data = BASE64.encode(&png_data);
            Ok(Some(format!("data:image/png;base64,{}", base64_data)))
        }
        Err(_) => Ok(None), // No image in clipboard
    }
}

/// Stub for non-Linux platforms - returns None
#[cfg(not(target_os = "linux"))]
#[tauri::command]
fn read_clipboard_image() -> Result<Option<String>, String> {
    Ok(None)
}

/// Runs the Tauri application
pub fn run() {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let port = 44548;
        tauri::Builder::default()
            .plugin(tauri_plugin_localhost::Builder::new(port).build())
            .plugin(tauri_plugin_opener::init())
            .plugin(tauri_plugin_window_state::Builder::default().build())
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                // When a second instance tries to launch, focus the existing window
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }))
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec!["--minimized"]),
            ))
            .setup(|app| {
                // Create system tray
                let show_item = MenuItem::with_id(app, "show", "Show Paarrot", true, None::<&str>)?;
                let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

                let _tray = TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .build(app)?;

                Ok(())
            })
            .on_window_event(|window, event| {
                // Minimize to tray on close instead of quitting
                if let WindowEvent::CloseRequested { api, .. } = event {
                    window.hide().unwrap();
                    api.prevent_close();
                }
            })
            .invoke_handler(tauri::generate_handler![read_clipboard_image])
            .run(tauri::generate_context!())
            .expect("error while building tauri application");
    }

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        tauri::Builder::default()
            .plugin(tauri_plugin_opener::init())
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_deep_link::init())
            .invoke_handler(tauri::generate_handler![read_clipboard_image])
            .run(tauri::generate_context!())
            .expect("error while building tauri application");
    }
}
