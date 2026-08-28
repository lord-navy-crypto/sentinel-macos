// SPDX-License-Identifier: MPL-2.0
//go:build !darwin || !cgo

package main

type NativeCodeValidation struct {
	Available        bool   `json:"available"`
	Valid            bool   `json:"valid"`
	Status           string `json:"status"`
	Error            string `json:"error,omitempty"`
	AllArchitectures bool   `json:"all_architectures"`
	Source           string `json:"source"`
	Note             string `json:"note"`
}

func nativeStaticCodeValidate(_ string) NativeCodeValidation {
	return NativeCodeValidation{Available: false, Status: "not-compiled", AllArchitectures: false, Source: "Security.framework", Note: "Native Security.framework validation is available only in a real macOS CGO build. CLI codesign/spctl evidence remains available when present."}
}
