// SPDX-License-Identifier: MPL-2.0
//go:build !darwin || !cgo

package main

import "errors"

func nativeFSEventsAvailable() bool { return false }
func startNativeFSEvents(_ []string, _ uint64, _ func(string, uint32, uint64)) error {
	return errors.New("native FSEvents unavailable")
}
func stopNativeFSEvents() {}
