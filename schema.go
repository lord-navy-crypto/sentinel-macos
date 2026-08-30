// SPDX-License-Identifier: MPL-2.0
package main

import "fmt"

const (
	SentinelSchemaV1  = 1
	SentinelSchemaV2  = 2
	SentinelSchemaV23 = 3
)

type SchemaCompatibility struct {
	CurrentVersion int   `json:"current_version"`
	Readable       []int `json:"readable"`
	MigratableFrom []int `json:"migratable_from"`
}

func CurrentSchemaCompatibility() SchemaCompatibility {
	return SchemaCompatibility{
		CurrentVersion: SentinelSchemaV23,
		Readable:       []int{SentinelSchemaV1, SentinelSchemaV2, SentinelSchemaV23},
		MigratableFrom: []int{SentinelSchemaV1, SentinelSchemaV2},
	}
}

func CanReadSentinelSchema(version int) bool {
	return version >= SentinelSchemaV1 && version <= SentinelSchemaV23
}

func CanMigrateSentinelSchema(from, to int) bool {
	if from == to {
		return CanReadSentinelSchema(from)
	}
	return from >= SentinelSchemaV1 && from < to && to <= SentinelSchemaV23
}

// SchemaMigrationPath returns each schema version that must be applied in
// sequence. Actual state stores own their field-level migration functions; this
// helper prevents skipping intermediate compatibility steps.
func SchemaMigrationPath(from, to int) ([]int, error) {
	if !CanMigrateSentinelSchema(from, to) {
		return nil, fmt.Errorf("unsupported schema migration %d -> %d", from, to)
	}
	if from == to {
		return []int{from}, nil
	}
	out := make([]int, 0, to-from)
	for version := from + 1; version <= to; version++ {
		out = append(out, version)
	}
	return out, nil
}
