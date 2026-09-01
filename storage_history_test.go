// SPDX-License-Identifier: MPL-2.0
package main

import "testing"

func TestStorageSnapshotCapturesVisibilityLimitations(t *testing.T) {
	res := &AdvancedStorageResult{
		Root: "/tmp", VisibleBytes: 100, FilesVisited: 10, DirsVisited: 2,
		PermissionErr: 1, SlowPathsSkipped: 2, Truncated: true,
		Categories: []StorageCategory{{Name: "Downloads", Size: 60, Files: 4}},
	}
	s := NewStorageSnapshot(res, 1000)
	if s.ID == "" || !s.Partial || len(s.Limitations) < 3 {
		t.Fatalf("snapshot=%+v", s)
	}
}

func TestCompareStorageSnapshotsAttributesGrowth(t *testing.T) {
	before := StorageSnapshot{
		ID: "before", CreatedAt: 1, Root: "/Users/test", VisibleBytes: 100,
		Categories: []StorageCategory{{Name: "Downloads", Size: 30, Files: 3}, {Name: "Documents", Size: 70, Files: 7}},
		FileTypes:  []StorageCategory{{Name: "video", Size: 20, Files: 1}},
	}
	after := StorageSnapshot{
		ID: "after", CreatedAt: 2, Root: "/Users/test", VisibleBytes: 145,
		Categories: []StorageCategory{{Name: "Downloads", Size: 75, Files: 5}, {Name: "Documents", Size: 70, Files: 7}},
		FileTypes:  []StorageCategory{{Name: "video", Size: 65, Files: 2}},
	}
	got := CompareStorageSnapshots(before, after)
	if got.DeltaBytes != 45 {
		t.Fatalf("delta=%d", got.DeltaBytes)
	}
	if len(got.DirectoryChanges) != 1 || got.DirectoryChanges[0].Name != "Downloads" || got.DirectoryChanges[0].DeltaBytes != 45 {
		t.Fatalf("directory changes=%+v", got.DirectoryChanges)
	}
	if len(got.FileTypeChanges) != 1 || got.FileTypeChanges[0].DeltaBytes != 45 {
		t.Fatalf("type changes=%+v", got.FileTypeChanges)
	}
}

func TestCompareStorageSnapshotsFlagsDifferentRoots(t *testing.T) {
	got := CompareStorageSnapshots(StorageSnapshot{Root: "/a"}, StorageSnapshot{Root: "/b"})
	if !got.Partial || len(got.Limitations) == 0 {
		t.Fatalf("comparison=%+v", got)
	}
}
