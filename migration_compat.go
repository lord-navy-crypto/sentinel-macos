// SPDX-License-Identifier: MPL-2.0
package main

// Transitional source aliases keep older Alpha/readiness code compiling while
// the current product uses the version-neutral migration API. They do not
// change persisted schemas or runtime behavior.
type V23MigrationReport = MigrationReport

func currentV23MigrationReport() MigrationReport { return currentMigrationReport() }
