/** Explicit, offline-only Apple Speech transcription, never falls back to cloud recognition. */
use serde::Serialize;
use std::time::Duration;

const MAX_WAV_BYTES: usize = 4_000_000;
const MAX_AUDIO_SECONDS: u32 = 90;
#[derive(Serialize, Clone)]
pub struct SpeechSegment {
    pub text: String,
    pub start: f64,
    pub duration: f64,
    pub confidence: f32,
}
#[derive(Serialize)]
pub struct Transcription {
    pub text: String,
    pub locale: String,
    pub on_device: bool,
    pub segments: Vec<SpeechSegment>,
}
fn check_input(wav: &[u8], locale: &str) -> Result<(), String> {
    if !matches!(locale, "en-US" | "en-GB" | "zh-CN" | "zh-TW" | "ja-JP" | "fr-FR" | "de-DE" | "es-ES") {
        return Err("Choose a supported recognition locale.".into());
    }
    if wav.len() < 44 || wav.len() > MAX_WAV_BYTES {
        return Err("Choose a 44-byte–4 MB normalized PCM WAV.".into());
    }
    if &wav[0..4] != b"RIFF" || &wav[8..12] != b"WAVE"
        || &wav[12..16] != b"fmt " || &wav[36..40] != b"data"
    {
        return Err("Only normalized RIFF WAVE with a standard 44-byte header is supported.".into());
    }
    let get_u32 = |n: usize| u32::from_le_bytes(wav[n..n + 4].try_into().unwrap());
    let get_u16 = |n: usize| u16::from_le_bytes(wav[n..n + 2].try_into().unwrap());
    let data_len = get_u32(40) as usize;
    if get_u32(4) as usize + 8 != wav.len() || data_len + 44 != wav.len()
        || get_u32(16) != 16 || get_u16(20) != 1 || get_u16(22) != 1
        || get_u32(24) != 16_000 || get_u32(28) != 32_000
        || get_u16(32) != 2 || get_u16(34) != 16
        || data_len < 2 || data_len % 2 != 0 || data_len > MAX_AUDIO_SECONDS as usize * 32_000
    {
        return Err("Expected a consistent mono PCM16 16kHz WAV of at most 90 seconds.".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn transcribe_on_device_wav(wav: Vec<u8>, locale: String) -> Result<Transcription, String> {
    check_input(&wav, &locale)?;
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(move || macos_transcribe(&wav, &locale))
            .await.map_err(|_| "The local speech worker did not finish.".to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("The on-device Speech framework is only available in the macOS app.".into())
    }
}

#[cfg(target_os = "macos")]
#[link(name = "Speech", kind = "framework")]
extern "C" {}
#[cfg(target_os = "macos")]
#[link(name = "Foundation", kind = "framework")]
extern "C" {}

#[cfg(target_os = "macos")]
fn macos_transcribe(wav: &[u8], locale: &str) -> Result<Transcription, String> {
    use block::ConcreteBlock;
    use objc::{class, msg_send, sel, sel_impl};
    use objc::rc::autoreleasepool;
    use objc::runtime::{Object, BOOL};
    use std::ffi::{CStr, CString};
    use std::os::raw::c_char;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::mpsc;
    use std::io::Write;
    use std::fs::OpenOptions;
    use std::os::unix::fs::OpenOptionsExt;

    static NEXT_ID: AtomicU64 = AtomicU64::new(1);
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!("sentinel-box-speech-{}-{}.wav", std::process::id(), id));
    let mut file = OpenOptions::new().write(true).create_new(true).mode(0o600)
        .open(&path).map_err(|_| "Could not create a private temporary audio file.".to_string())?;
    struct RemoveFile(std::path::PathBuf);
    impl Drop for RemoveFile {
        fn drop(&mut self) { let _ = std::fs::remove_file(&self.0); }
    }
    let _cleanup = RemoveFile(path.clone());
    file.write_all(wav).map_err(|_| "Could not prepare temporary audio.".to_string())?;
    file.sync_all().map_err(|_| "Could not finish writing temporary audio.".to_string())?;
    drop(file);

    autoreleasepool(|| unsafe {
        // SFSpeechRecognizer authorization: NotDetermined=0, Denied=1, Restricted=2, Authorized=3.
        let mut permission: isize = msg_send![class!(SFSpeechRecognizer), authorizationStatus];
        if permission == 0 {
            let (tx, rx) = mpsc::channel::<isize>();
            let handler = ConcreteBlock::new(move |status: isize| { let _ = tx.send(status); }).copy();
            let _: () = msg_send![class!(SFSpeechRecognizer), requestAuthorization: &*handler];
            permission = rx.recv_timeout(Duration::from_secs(45))
                .map_err(|_| "Speech-recognition permission was not granted in time.".to_string())?;
        }
        if permission != 3 {
            return Err("Speech recognition permission is denied or restricted in macOS Settings.".into());
        }
        let id = CString::new(locale).map_err(|_| "Invalid language locale.".to_string())?;
        let ns_locale_name: *mut Object = msg_send![class!(NSString), stringWithUTF8String: id.as_ptr()];
        let native_locale: *mut Object = msg_send![class!(NSLocale), localeWithLocaleIdentifier: ns_locale_name];
        let recognizer: *mut Object = msg_send![class!(SFSpeechRecognizer), alloc];
        let recognizer: *mut Object = msg_send![recognizer, initWithLocale: native_locale];
        if recognizer.is_null() {
            return Err("Apple Speech could not create a recognizer for this locale.".into());
        }
        struct Release(*mut Object);
        impl Drop for Release {
            fn drop(&mut self) { if !self.0.is_null() { unsafe { let _: () = msg_send![self.0, release]; } } }
        }
        let _recognizer = Release(recognizer);
        let available: BOOL = msg_send![recognizer, isAvailable];
        let offline: BOOL = msg_send![recognizer, supportsOnDeviceRecognition];
        if (available as i8) == 0 || (offline as i8) == 0 {
            return Err("On-device Apple Speech recognition is unavailable for this language or Mac. No cloud fallback was used.".into());
        }
        let path_str = CString::new(path.to_string_lossy().as_bytes())
            .map_err(|_| "Invalid temporary audio location.".to_string())?;
        let path_obj: *mut Object = msg_send![class!(NSString), stringWithUTF8String: path_str.as_ptr()];
        let url: *mut Object = msg_send![class!(NSURL), fileURLWithPath: path_obj];
        let request: *mut Object = msg_send![class!(SFSpeechURLRecognitionRequest), alloc];
        let request: *mut Object = msg_send![request, initWithURL: url];
        if request.is_null() { return Err("Could not create a local audio recognition request.".into()); }
        let _request = Release(request);
        let _: () = msg_send![request, setRequiresOnDeviceRecognition: true];
        let _: () = msg_send![request, setShouldReportPartialResults: false];

        let (tx, rx) = mpsc::channel::<Result<(String, Vec<SpeechSegment>), String>>();
        let response = ConcreteBlock::new(move |result: *mut Object, error: *mut Object| {
            if !error.is_null() {
                let _ = tx.send(Err("Apple Speech could not decode or recognize this audio locally.".into()));
                return;
            }
            if result.is_null() { return; }
            let is_final: BOOL = unsafe { msg_send![result, isFinal] };
            if (is_final as i8) == 0 { return; }
            let best: *mut Object = unsafe { msg_send![result, bestTranscription] };
            if best.is_null() { return; }
            let string: *mut Object = unsafe { msg_send![best, formattedString] };
            if string.is_null() { return; }
            let pointer: *const c_char = unsafe { msg_send![string, UTF8String] };
            if pointer.is_null() { return; }
            let recognized = unsafe { CStr::from_ptr(pointer) }.to_string_lossy().to_string();
            // Apple Speech returns exact offsets relative to the selected audio,
            // not guessed phrase durations. Unsupported/invalid timings are dropped.
            let native_segments: *mut Object = unsafe { msg_send![best, segments] };
            let count: usize = if native_segments.is_null() { 0 } else {
                unsafe { msg_send![native_segments, count] }
            };
            let mut segments = Vec::new();
            for i in 0..count.min(5000) {
                let item: *mut Object = unsafe { msg_send![native_segments, objectAtIndex: i] };
                if item.is_null() { continue; }
                let start: f64 = unsafe { msg_send![item, timestamp] };
                let duration: f64 = unsafe { msg_send![item, duration] };
                let confidence: f32 = unsafe { msg_send![item, confidence] };
                let word: *mut Object = unsafe { msg_send![item, substring] };
                if word.is_null() { continue; }
                let value: *const c_char = unsafe { msg_send![word, UTF8String] };
                if value.is_null() || !start.is_finite() || !duration.is_finite()
                    || start < 0.0 || duration <= 0.0 || start + duration > 95.0 {
                    continue;
                }
                let text = unsafe { CStr::from_ptr(value) }.to_string_lossy().to_string();
                if text.trim().is_empty() || text.len() > 500 { continue; }
                segments.push(SpeechSegment {
                    text, start, duration,
                    confidence: if confidence.is_finite() { confidence.clamp(0.0, 1.0) } else { 0.0 },
                });
            }
            let _ = tx.send(Ok((recognized, segments)));
        }).copy();
        let task: *mut Object = msg_send![recognizer, recognitionTaskWithRequest: request resultHandler: &*response];
        if task.is_null() { return Err("Apple Speech could not start an offline recognition task.".into()); }
        let answer = rx.recv_timeout(Duration::from_secs(115));
        if answer.is_err() {
            let _: () = msg_send![task, cancel];
            return Err("The on-device transcription exceeded the 115-second time limit.".into());
        }
        let (text, segments) = answer.unwrap()?;
        if text.trim().is_empty() { return Err("No clear speech was recognized in this audio.".into()); }
        if text.len() > 100_000 { return Err("Transcript exceeds the 100 KB limit.".into()); }
        Ok(Transcription { text, locale: locale.to_string(), on_device: true, segments })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn valid_silence() -> Vec<u8> {
        let mut b = vec![0; 44 + 32_000];
        b[0..4].copy_from_slice(b"RIFF");let riff_len=b.len() as u32 - 8;b[4..8].copy_from_slice(&riff_len.to_le_bytes());
        b[8..12].copy_from_slice(b"WAVE"); b[12..16].copy_from_slice(b"fmt ");
        b[16..20].copy_from_slice(&16u32.to_le_bytes());b[20..22].copy_from_slice(&1u16.to_le_bytes());
        b[22..24].copy_from_slice(&1u16.to_le_bytes());b[24..28].copy_from_slice(&16_000u32.to_le_bytes());
        b[28..32].copy_from_slice(&32_000u32.to_le_bytes());b[32..34].copy_from_slice(&2u16.to_le_bytes());
        b[34..36].copy_from_slice(&16u16.to_le_bytes());b[36..40].copy_from_slice(b"data");
        b[40..44].copy_from_slice(&32_000u32.to_le_bytes()); b
    }
    #[test] fn validate_format_and_locale() {
        assert!(check_input(&valid_silence(), "en-US").is_ok());
        assert!(check_input(&valid_silence(), "zh-CN").is_ok());
        assert!(check_input(&valid_silence(), "xx-NONE").is_err());
        assert!(check_input(&[0,1,2], "en-US").is_err());
    }
    #[test] fn reject_inconsistent_header_and_overlong_audio() {
        let mut b = valid_silence();
        b[22] = 2;
        assert!(check_input(&b, "en-US").is_err());
        let mut x = valid_silence(); x.resize(44 + 32_000 * 91, 0);
        let expanded_len=x.len() as u32 - 8;x[4..8].copy_from_slice(&expanded_len.to_le_bytes());
        x[40..44].copy_from_slice(&(32_000u32 * 91).to_le_bytes());
        assert!(check_input(&x, "en-US").is_err());
    }
}
