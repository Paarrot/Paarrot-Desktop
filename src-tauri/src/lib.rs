//! Paarrot Desktop library for cross-platform builds including Android

#[cfg(mobile)]
mod mobile;

#[cfg(any(target_os = "android", target_os = "ios"))]
mod background_sync;
#[cfg(any(target_os = "android", target_os = "ios"))]
mod matrix_sync;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::{
    Manager,
    WebviewUrl,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::WebviewWindowBuilder,
    WindowEvent,
};

// Linux: Import for permission handling
#[cfg(target_os = "linux")]
use webkit2gtk::{PermissionRequestExt, WebViewExt};
#[cfg(target_os = "linux")]
use gtk::prelude::*;

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

/// Open a URL in the default browser (bypasses ACL issues with localhost plugin)
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

/// Open a URL in the default browser on mobile platforms
#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    tauri_plugin_opener::open_url(&url, None::<&str>).map_err(|e| e.to_string())
}

/// YouTube stream info returned by yt-dlp
#[derive(serde::Serialize)]
struct YouTubeStreamInfo {
    /// Direct video stream URL (may include video+audio or video only)
    video_url: String,
    /// Title of the video
    title: String,
}

/// Extract direct YouTube stream URL using yt-dlp
/// Requires yt-dlp to be installed and available in PATH
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn get_youtube_stream(url: String) -> Result<YouTubeStreamInfo, String> {
    use std::process::Command;
    
    // First get the title
    let title_output = Command::new("yt-dlp")
        .args(["--get-title", &url])
        .output()
        .map_err(|e| format!("Failed to run yt-dlp (is it installed?): {}", e))?;
    
    let title = if title_output.status.success() {
        String::from_utf8_lossy(&title_output.stdout).trim().to_string()
    } else {
        "YouTube Video".to_string()
    };
    
    // Get the best format with video+audio combined (up to 1080p)
    // -f "best[height<=1080]" gets combined format
    // Fallback to "bestvideo[height<=1080]+bestaudio/best" for separate streams
    let output = Command::new("yt-dlp")
        .args([
            "-g",  // Get URL only
            "-f", "best[height<=1080]/bestvideo[height<=1080]+bestaudio/best",
            &url
        ])
        .output()
        .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp error: {}", stderr));
    }
    
    let video_url = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    
    if video_url.is_empty() {
        return Err("yt-dlp returned empty URL".to_string());
    }
    
    Ok(YouTubeStreamInfo { video_url, title })
}

/// Stub for mobile platforms - YouTube streaming not supported
#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
async fn get_youtube_stream(_url: String) -> Result<YouTubeStreamInfo, String> {
    Err("YouTube streaming not supported on mobile".to_string())
}

/// Start background Matrix sync with the given credentials (mobile only)
#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
async fn start_background_sync(
    app_handle: tauri::AppHandle,
    homeserver_url: String,
    user_id: String,
    access_token: String,
    device_id: String,
) -> Result<(), String> {
    use crate::background_sync::{MatrixCredentials, get_sync_manager};
    use crate::matrix_sync::{init_client, run_sync_loop};
    
    let credentials = MatrixCredentials {
        homeserver_url,
        user_id,
        access_token,
        device_id,
    };

    // Set credentials
    let manager = get_sync_manager();
    manager.set_credentials(credentials.clone()).await;

    // Initialize the Matrix client
    init_client(&credentials).await?;

    // Start sync in background task
    let app = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_sync_loop(app).await {
            log::error!("Sync loop error: {}", e);
        }
    });

    Ok(())
}

/// Stop background Matrix sync (mobile only)
#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
async fn stop_background_sync() -> Result<(), String> {
    crate::matrix_sync::stop_sync().await;
    Ok(())
}

/// Get background sync state (mobile only)
#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
async fn get_background_sync_state() -> Result<String, String> {
    use crate::background_sync::get_sync_manager;
    
    let manager = get_sync_manager();
    let state = manager.get_state().await;
    
    Ok(format!("{:?}", state))
}

/// Stub commands for desktop (no-op since background sync is mobile-only)
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn start_background_sync(
    _app_handle: tauri::AppHandle,
    _homeserver_url: String,
    _user_id: String,
    _access_token: String,
    _device_id: String,
) -> Result<(), String> {
    Ok(()) // Desktop doesn't need background sync
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn stop_background_sync() -> Result<(), String> {
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn get_background_sync_state() -> Result<String, String> {
    Ok("NotApplicable".to_string())
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
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_http::init())
            .setup(move |app| {
                // In dev mode, use Vite dev server; in production, use localhost plugin
                let url: tauri::Url = if cfg!(dev) {
                    "http://localhost:8080".parse().unwrap()
                } else {
                    format!("http://localhost:{}", port).parse().unwrap()
                };
                
                // Create the main window manually with navigation handler for external links
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                    .title("Paarrot")
                    .inner_size(1280.0, 905.0)
                    .center()
                    .resizable(true)
                    .disable_drag_drop_handler()
                    .on_navigation(|url| {
                        let url_str = url.as_str();
                        // Allow navigation to localhost (our app) and special protocols
                        if url_str.starts_with("http://localhost") 
                            || url_str.starts_with("https://localhost") 
                            || url_str.starts_with("tauri://")
                            || url_str.starts_with("blob:")
                            || url_str.starts_with("data:")
                        {
                            return true;
                        }
                        // Block external URLs - open them in default browser
                        if url_str.starts_with("http://") || url_str.starts_with("https://") {
                            let _ = tauri_plugin_opener::open_url(url_str, None::<&str>);
                            return false;
                        }
                        true
                    })
                    .build()?;
                
                // Linux: Set up permission handler to auto-allow microphone/camera access
                #[cfg(target_os = "linux")]
                {
                    if let Some(webview_window) = app.get_webview_window("main") {
                        let _ = webview_window.with_webview(|webview| {
                            use webkit2gtk::UserMediaPermissionRequestExt;
                            
                            let wv = webview.inner();
                            wv.connect_permission_request(|_webview, permission_request| {
                                // Check if this is a user media (microphone/camera) permission request
                                if let Some(user_media_request) = permission_request.downcast_ref::<webkit2gtk::UserMediaPermissionRequest>() {
                                    // Log what's being requested
                                    let is_audio = user_media_request.is_for_audio_device();
                                    let is_video = user_media_request.is_for_video_device();
                                    eprintln!("Paarrot: Media permission request - audio: {}, video: {}", is_audio, is_video);
                                    
                                    // Allow the request
                                    permission_request.allow();
                                    return true;
                                }
                                
                                // For other permission types, allow by default
                                permission_request.allow();
                                true
                            });
                        });
                    }
                }
                
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
            .invoke_handler(tauri::generate_handler![
                read_clipboard_image, 
                open_external_url,
                get_youtube_stream,
                start_background_sync,
                stop_background_sync,
                get_background_sync_state
            ])
            .run(tauri::generate_context!())
            .expect("error while building tauri application");
    }

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        use tauri::{WebviewUrl, webview::WebviewWindowBuilder};
        
        tauri::Builder::default()
            .plugin(tauri_plugin_opener::init())
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_deep_link::init())
            .setup(|app| {
                // Create the main window for mobile with navigation handler for external links
                WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                    .on_navigation(|url| {
                        let url_str = url.as_str();
                        // Allow navigation to app resources and special protocols
                        if url_str.starts_with("tauri://")
                            || url_str.starts_with("http://tauri.localhost")
                            || url_str.starts_with("https://tauri.localhost")
                            || url_str.starts_with("blob:")
                            || url_str.starts_with("data:")
                            || url_str.starts_with("about:")
                        {
                            return true;
                        }
                        // External URLs - open in default browser
                        if url_str.starts_with("http://") || url_str.starts_with("https://") {
                            let _ = tauri_plugin_opener::open_url(url_str, None::<&str>);
                            return false;
                        }
                        true
                    })
                    .build()?;
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                read_clipboard_image, 
                open_external_url,
                get_youtube_stream,
                start_background_sync,
                stop_background_sync,
                get_background_sync_state
            ])
            .run(tauri::generate_context!())
            .expect("error while building tauri application");
    }
}
