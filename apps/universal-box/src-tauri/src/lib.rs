use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::Manager;

const MAX_WORKSPACE_BYTES: usize = 3_000_000;
const WORKSPACE_FILENAME: &str = "workspace-v2.json";

fn check_workspace(contents: &str) -> Result<(), String> {
    if contents.len() > MAX_WORKSPACE_BYTES {
        return Err("Workspace exceeds the 3 MB safety limit".to_string());
    }
    let document: serde_json::Value =
        serde_json::from_str(contents).map_err(|_| "Workspace is not valid JSON".to_string())?;
    if document.get("version").and_then(serde_json::Value::as_i64) != Some(2)
        || !document.get("tasks").is_some_and(serde_json::Value::is_array)
        || !document.get("cards").is_some_and(serde_json::Value::is_array)
        || !document.get("notes").is_some_and(serde_json::Value::is_string)
    {
        return Err("Not a valid Daily Desk v2 workspace".to_string());
    }
    Ok(())
}

fn workspace_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data directory: {error}"))?;
    Ok(directory.join(WORKSPACE_FILENAME))
}

fn read_limited(path: &Path, limit: usize) -> Result<String, String> {
    let meta = fs::metadata(path).map_err(|error| format!("Could not read file metadata: {error}"))?;
    if meta.len() > limit as u64 {
        return Err("The selected file is too large".to_string());
    }
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Could not read the selected file: {error}"))?;
    if contents.len() > limit {
        return Err("The selected file is too large".to_string());
    }
    Ok(contents)
}

fn atomic_write(path: &Path, contents: &str) -> Result<(), String> {
    let directory = path.parent().ok_or("No storage directory found")?;
    fs::create_dir_all(directory)
        .map_err(|error| format!("Could not create data directory: {error}"))?;
    let temporary = path.with_extension("json.tmp");
    let mut file = fs::File::create(&temporary)
        .map_err(|error| format!("Could not create temporary file: {error}"))?;
    file.write_all(contents.as_bytes())
        .map_err(|error| format!("Could not write workspace data: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("Could not sync workspace data: {error}"))?;
    fs::rename(&temporary, path)
        .map_err(|error| format!("Could not replace saved workspace: {error}"))?;
    Ok(())
}

#[tauri::command]
fn load_workspace(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = workspace_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let contents = read_limited(&path, MAX_WORKSPACE_BYTES)?;
    check_workspace(&contents)?;
    Ok(Some(contents))
}

#[tauri::command]
fn save_workspace(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    check_workspace(&contents)?;
    atomic_write(&workspace_path(&app)?, &contents)
}

#[tauri::command]
fn export_backup(path: String, contents: String) -> Result<(), String> {
    check_workspace(&contents)?;
    let location = PathBuf::from(path);
    if location.extension().and_then(|part| part.to_str()) != Some("json") {
        return Err("Backup file must end in .json".to_string());
    }
    atomic_write(&location, &contents)
}

#[tauri::command]
fn read_backup(path: String) -> Result<String, String> {
    let location = PathBuf::from(path);
    if location.extension().and_then(|part| part.to_str()) != Some("json") {
        return Err("Backup file must end in .json".to_string());
    }
    let contents = read_limited(&location, MAX_WORKSPACE_BYTES)?;
    check_workspace(&contents)?;
    Ok(contents)
}

/// Keep the native writer aligned with the frontend allowlist.
fn supports_output_extension(extension: &str) -> bool {
    matches!(
        extension,
        "pdf" | "txt" | "md" | "csv" | "json" | "png" | "jpg" | "jpeg"
            | "webp" | "gif" | "docx" | "xlsx" | "pptx" | "zip" | "svg"
            | "ics" | "srt" | "vtt" | "wav" | "vcf"
    )
}

#[tauri::command]
fn write_output_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    if bytes.len() > 20_000_000 {
        return Err("The output file exceeds the 20 MB limit".into());
    }
    let location = PathBuf::from(path);
    let extension = location
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !supports_output_extension(&extension) {
        return Err("Unsupported output file extension".into());
    }
    if !location.parent().is_some_and(Path::is_dir) {
        return Err("The destination directory does not exist".into());
    }
    fs::write(&location, &bytes)
        .map_err(|error| format!("Could not save output file: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permits_all_desktop_media_and_contacts_exports() {
        for ext in ["ics", "srt", "vtt", "wav", "vcf", "svg", "zip", "pdf"] {
            assert!(supports_output_extension(ext), "missing output extension: {ext}");
        }
        for ext in ["exe", "sh", "html", "js", ""] {
            assert!(!supports_output_extension(ext), "forbidden output extension: {ext}");
        }
    }

    #[test]
    fn accepts_valid_v2_workspace() {
        assert!(check_workspace(r#"{"version":2,"tasks":[],"cards":[],"notes":""}"#).is_ok());
    }

    #[test]
    fn rejects_old_or_incomplete_workspace() {
        assert!(check_workspace(r#"{"version":1,"tasks":[],"cards":[],"notes":""}"#).is_err());
        assert!(check_workspace(r#"{"version":2,"tasks":[],"notes":""}"#).is_err());
        assert!(check_workspace("not json").is_err());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            save_workspace,
            export_backup,
            read_backup,
            write_output_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Daily Desk");
}
