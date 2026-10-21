//! Genuine on-device macOS Vision OCR. Never sends image bytes to a service.
use serde::Serialize;

const MAX_IMAGE_BYTES: usize = 8_000_000;
const MAX_OCR_LINES: usize = 1000;
const MAX_OCR_CHARACTERS: usize = 200_000;

#[derive(Serialize)]
pub struct OcrLine {
    pub text: String,
    pub confidence: f32,
}

/// This command accepts only pixels voluntarily selected by the user.
/// Vision is used on macOS; browser builds must show "not available", never fake OCR text.
#[tauri::command]
pub fn recognize_image_text(bytes: Vec<u8>, fast: bool) -> Result<Vec<OcrLine>, String> {
    if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
        return Err("Choose one image from 1 byte to 8 MB.".into());
    }
    #[cfg(target_os = "macos")]
    {
        return macos_vision(&bytes, fast);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = fast;
        Err("Native Apple Vision text recognition requires macOS.".into())
    }
}

#[cfg(target_os = "macos")]
#[link(name = "Vision", kind = "framework")]
extern "C" {}

#[cfg(target_os = "macos")]
#[link(name = "Foundation", kind = "framework")]
extern "C" {}

#[cfg(target_os = "macos")]
fn macos_vision(bytes: &[u8], fast: bool) -> Result<Vec<OcrLine>, String> {
    use objc::{class, msg_send, sel, sel_impl};
    use objc::rc::autoreleasepool;
    use objc::runtime::{BOOL, Object};
    use std::ffi::CStr;
    use std::os::raw::c_char;

    autoreleasepool(|| unsafe {
        let image_data: *mut Object = msg_send![class!(NSData), dataWithBytes: bytes.as_ptr() length: bytes.len()];
        if image_data.is_null() {
            return Err("Could not prepare image data.".into());
        }
        let options: *mut Object = msg_send![class!(NSDictionary), dictionary];
        let handler: *mut Object = msg_send![class!(VNImageRequestHandler), alloc];
        let handler: *mut Object = msg_send![handler, initWithData: image_data options: options];
        if handler.is_null() {
            return Err("Cannot create a Vision image request handler.".into());
        }

        let request: *mut Object = msg_send![class!(VNRecognizeTextRequest), new];
        if request.is_null() {
            let _: () = msg_send![handler, release];
            return Err("Apple Vision text recognition is unavailable.".into());
        }
        // VNRequestTextRecognitionLevelFast == 0, Accurate == 1.
        let level: usize = if fast { 0 } else { 1 };
        let _: () = msg_send![request, setRecognitionLevel: level];
        let _: () = msg_send![request, setUsesLanguageCorrection: true];
        let requests: *mut Object = msg_send![class!(NSArray), arrayWithObject: request];
        let mut error: *mut Object = std::ptr::null_mut();
        let ok: BOOL = msg_send![handler, performRequests: requests error: &mut error];

        let result = if !ok {
            Err("Apple Vision could not recognize this image. Try a clear PNG or JPEG.".into())
        } else {
            let observations: *mut Object = msg_send![request, results];
            if observations.is_null() {
                Ok(Vec::new())
            } else {
                let count: usize = msg_send![observations, count];
                let mut lines: Vec<OcrLine> = Vec::new();
                let mut total_chars = 0usize;
                for i in 0..count.min(MAX_OCR_LINES) {
                    let observation: *mut Object = msg_send![observations, objectAtIndex: i];
                    let candidates: *mut Object = msg_send![observation, topCandidates: 1usize];
                    let n: usize = msg_send![candidates, count];
                    if n == 0 { continue; }
                    let candidate: *mut Object = msg_send![candidates, objectAtIndex: 0usize];
                    let string: *mut Object = msg_send![candidate, string];
                    if string.is_null() { continue; }
                    let raw: *const c_char = msg_send![string, UTF8String];
                    if raw.is_null() { continue; }
                    let text = CStr::from_ptr(raw).to_string_lossy().to_string();
                    if text.trim().is_empty() { continue; }
                    total_chars += text.len();
                    if total_chars > MAX_OCR_CHARACTERS {
                        return Err("OCR output exceeds the 200 KB safety limit.".into());
                    }
                    let confidence: f32 = msg_send![candidate, confidence];
                    lines.push(OcrLine { text, confidence: confidence.clamp(0.0, 1.0) });
                }
                Ok(lines)
            }
        };
        let _: () = msg_send![request, release];
        let _: () = msg_send![handler, release];
        result
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refuses_empty_image_before_native_processing() {
        assert!(recognize_image_text(vec![], false).is_err());
    }
    #[test]
    fn refuses_excessively_large_image_before_native_processing() {
        assert!(recognize_image_text(vec![0; MAX_IMAGE_BYTES+1], true).is_err());
    }
}
