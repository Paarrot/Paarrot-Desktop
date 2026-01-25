//! Cinny Desktop library for cross-platform builds including Android

#[cfg(mobile)]
mod mobile;

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
            .plugin(tauri_plugin_shell::init())
            .plugin(tauri_plugin_window_state::Builder::default().build())
            .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_updater::Builder::new().build())
            .invoke_handler(tauri::generate_handler![read_clipboard_image])
            .run(tauri::generate_context!())
            .expect("error while building tauri application");
    }

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        tauri::Builder::default()
            .plugin(tauri_plugin_shell::init())
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_deep_link::init())
            .invoke_handler(tauri::generate_handler![read_clipboard_image])
            .run(tauri::generate_context!())
            .expect("error while building tauri application");
    }
}
