// SPDX-License-Identifier: MPL-2.0
package main

import "testing"

func TestSchemaMigrationPathRequiresSequentialVersions(t *testing.T) {
	got, err := SchemaMigrationPath(1, 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0] != 2 || got[1] != 3 {
		t.Fatalf("path=%v", got)
	}
}

func TestSchemaCompatibilityRejectsFutureVersion(t *testing.T) {
	if CanReadSentinelSchema(4) {
		t.Fatal("future schema must not be silently accepted")
	}
	if _, err := SchemaMigrationPath(3, 4); err == nil {
		t.Fatal("expected unsupported future migration")
	}
}
