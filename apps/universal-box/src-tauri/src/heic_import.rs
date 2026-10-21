//! Offline macOS HEIC input decoder for explicit user-selected images only.
//! Relies on Apple's built-in /usr/bin/sips; no shell, network or third-party service.
use std::fs;
#[cfg(target_os = "macos")]
use std::io::Write;
#[cfg(target_os = "macos")]
use std::os::unix::fs::DirBuilderExt;
#[cfg(target_os = "macos")]
use std::path::PathBuf;
#[cfg(target_os = "macos")]
use std::sync::atomic::{AtomicU64, Ordering};
#[cfg(target_os = "macos")]
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_HEIC_BYTES: usize = 8_000_000;
const MAX_PNG_BYTES: usize = 24_000_000;
const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";

fn looks_like_heic(bytes: &[u8]) -> bool {
    if bytes.len() < 20 || &bytes[4..8] != b"ftyp" {
        return false;
    }
    bytes[8..bytes.len().min(64)]
        .chunks_exact(4)
        .any(|brand| matches!(brand, b"heic" | b"heix" | b"hevc" | b"hevx" | b"heim" | b"heis"))
}

fn check_png(data: &[u8]) -> Result<(), String> {
    if data.len() < 24 || data.len() > MAX_PNG_BYTES || &data[..8] != PNG_SIGNATURE {
        return Err("The local HEIC decoder did not produce a supported PNG.".into());
    }
    if &data[12..16] != b"IHDR" {
        return Err("The converted image is not a standard PNG.".into());
    }
    let width = u32::from_be_bytes(data[16..20].try_into().unwrap());
    let height = u32::from_be_bytes(data[20..24].try_into().unwrap());
    if width == 0 || height == 0 || (width as u64) * (height as u64) > 8_000_000 {
        return Err("Decoded HEIC photo exceeds the 8-million-pixel preview limit.".into());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
static STAGING_COUNTER: AtomicU64 = AtomicU64::new(0);

#[cfg(target_os = "macos")]
struct TemporaryImageFolder(PathBuf);
#[cfg(target_os = "macos")]
impl Drop for TemporaryImageFolder {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[cfg(target_os = "macos")]
fn temporary_folder() -> Result<TemporaryImageFolder, String> {
    for _ in 0..6 {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH)
            .map_err(|_| "Unable to allocate temporary image workspace")?
            .as_nanos();
        let n = STAGING_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir()
            .join(format!("sentinel-heic-{}-{stamp}-{n}", std::process::id()));
        let mut maker = fs::DirBuilder::new();
        maker.mode(0o700);
        match maker.create(&path) {
            Ok(()) => return Ok(TemporaryImageFolder(path)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("Could not create a private temporary directory for HEIC.".into()),
        }
    }
    Err("Could not allocate a unique temporary HEIC directory.".into())
}

#[cfg(target_os = "macos")]
fn convert_heic(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let temporary = temporary_folder()?;
    let source = temporary.0.join("selected.heic");
    let output = temporary.0.join("converted.png");
    let mut file = fs::OpenOptions::new().write(true).create_new(true)
        .open(&source).map_err(|_| "Cannot stage selected HEIC image locally.")?;
    file.write_all(bytes).map_err(|_| "Cannot write selected image to private temporary storage.")?;
    file.sync_all().map_err(|_| "Cannot finalize temporary image input.")?;
    drop(file);

    // -Z bounds iPhone's original 12/48 MP photo before sending pixels to the WebView.
    // No shell, user-supplied path, env script or external network process.
    let status = std::process::Command::new("/usr/bin/sips")
        .arg("-s").arg("format").arg("png")
        .arg("-Z").arg("2048")
        .arg(&source).arg("--out").arg(&output)
        .output().map_err(|_| "macOS built-in image converter (sips) is unavailable.")?;
    if !status.status.success() {
        return Err("macOS could not decode this HEIC photo. Check whether it is damaged or unsupported.".into());
    }
    let meta = fs::metadata(&output).map_err(|_| "HEIC conversion produced no PNG output.")?;
    if meta.len() > MAX_PNG_BYTES as u64 {
        return Err("Converted PNG exceeds 24 MB; the photo is not processed.".into());
    }
    let png = fs::read(&output).map_err(|_| "Cannot read converted PNG.")?;
    check_png(&png)?;
    Ok(png)
}

/// User-approved HEIC image bytes -> local PNG pixels (bounded to 2048 px longest edge).
#[tauri::command]
pub async fn decode_heic_to_png(bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    if bytes.len() < 20 || bytes.len() > MAX_HEIC_BYTES {
        return Err("HEIC photo must be from 20 bytes to 8 MB.".into());
    }
    if !looks_like_heic(&bytes) {
        return Err("Selected file does not have a supported HEIC image signature.".into());
    }
    #[cfg(target_os = "macos")]
    {
        return tauri::async_runtime::spawn_blocking(move || convert_heic(&bytes))
            .await.map_err(|_| "macOS HEIC conversion task failed.".to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = bytes;
        Err("HEIC decoding is only available in the Sentinel Box macOS app.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_heic_ftyp_brands_without_accepting_mislabeled_png() {
        assert!(!looks_like_heic(b"\x89PNG\r\n\x1a\n"));
        assert!(!looks_like_heic(b"\0\0\0\x18ftypavif\0\0\0\0mif1"));
        assert!(looks_like_heic(b"\0\0\0\x18ftypheic\0\0\0\0heic"));
        assert!(looks_like_heic(b"\0\0\0\x18ftypmif1\0\0\0\0heix"));
    }
    #[test]
    fn validates_png_bytes_and_bounded_image_dimensions() {
        let mut data = Vec::new();
        data.extend_from_slice(PNG_SIGNATURE);
        data.extend_from_slice(&13u32.to_be_bytes());
        data.extend_from_slice(b"IHDR");
        data.extend_from_slice(&1024u32.to_be_bytes());
        data.extend_from_slice(&768u32.to_be_bytes());
        assert!(check_png(&data).is_ok());
        data[16..20].copy_from_slice(&10000u32.to_be_bytes());
        assert!(check_png(&data).is_err());
    }
}
