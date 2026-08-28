// SPDX-License-Identifier: MPL-2.0
//go:build darwin && cgo

package main

/*
#cgo darwin LDFLAGS: -framework Security -framework CoreFoundation
#include <Security/Security.h>
#include <CoreFoundation/CoreFoundation.h>
#include <stdlib.h>
#include <string.h>

static char* sentinelCopyCFString(CFStringRef s) {
    if (!s) return NULL;
    CFIndex n = CFStringGetMaximumSizeForEncoding(CFStringGetLength(s), kCFStringEncodingUTF8) + 1;
    char *buf = (char*)malloc((size_t)n);
    if (!buf) return NULL;
    if (!CFStringGetCString(s, buf, n, kCFStringEncodingUTF8)) { free(buf); return NULL; }
    return buf;
}

static int sentinelValidateStatic(const char *path, char **errOut) {
    *errOut = NULL;
    CFStringRef p = CFStringCreateWithCString(kCFAllocatorDefault, path, kCFStringEncodingUTF8);
    if (!p) return -1;
    CFURLRef u = CFURLCreateWithFileSystemPath(kCFAllocatorDefault, p, kCFURLPOSIXPathStyle, false);
    CFRelease(p);
    if (!u) return -2;
    SecStaticCodeRef code = NULL;
    OSStatus s = SecStaticCodeCreateWithPath(u, kSecCSDefaultFlags, &code);
    CFRelease(u);
    if (s != errSecSuccess || !code) return (int)s;
    CFErrorRef e = NULL;
    SecCSFlags flags = kSecCSStrictValidate | kSecCSCheckAllArchitectures;
    s = SecStaticCodeCheckValidityWithErrors(code, flags, NULL, &e);
    if (e) {
        CFStringRef d = CFErrorCopyDescription(e);
        *errOut = sentinelCopyCFString(d);
        if (d) CFRelease(d);
        CFRelease(e);
    }
    CFRelease(code);
    return (int)s;
}
*/
import "C"
import "unsafe"

type NativeCodeValidation struct {
	Available        bool   `json:"available"`
	Valid            bool   `json:"valid"`
	Status           string `json:"status"`
	Error            string `json:"error,omitempty"`
	AllArchitectures bool   `json:"all_architectures"`
	Source           string `json:"source"`
	Note             string `json:"note"`
}

func nativeStaticCodeValidate(path string) NativeCodeValidation {
	cp := C.CString(path)
	defer C.free(unsafe.Pointer(cp))
	var ce *C.char
	status := int(C.sentinelValidateStatic(cp, &ce))
	out := NativeCodeValidation{Available: true, Valid: status == 0, AllArchitectures: true, Source: "Security.framework SecStaticCodeCheckValidityWithErrors", Note: "All-architecture static validation is requested for universal code. Validation is only valid while the underlying code remains unmodified."}
	if status == 0 {
		out.Status = "valid"
	} else {
		out.Status = "invalid"
	}
	if ce != nil {
		out.Error = C.GoString(ce)
		C.free(unsafe.Pointer(ce))
	}
	return out
}
