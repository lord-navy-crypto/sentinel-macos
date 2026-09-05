// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestStorageReviewAgeAndDownloadClassification(t *testing.T) {
	now := time.Date(2026, 9, 5, 12, 0, 0, 0, time.UTC)
	if got := storageReviewAgeDays(now, now.Add(-181*24*time.Hour)); got != 181 {
		t.Fatalf("age days=%d want 181", got)
	}
	if got := storageReviewAgeDays(now, now.Add(time.Hour)); got != 0 {
		t.Fatalf("future modified time should clamp to zero, got %d", got)
	}
	cases := map[string]string{
		"archive.zip": "Archives",
		"image.dmg":   "Disk images",
		"setup.pkg":   "Installers",
		"paper.pdf":   "Documents",
		"photo.heic":  "Images",
		"movie.mov":   "Video",
		"audio.flac":  "Audio",
		"main.go":     "Code",
		"rows.parquet": "Data",
		"README":      "Other",
	}
	for name, want := range cases {
		if got := downloadCategory(name); got != want {
			t.Fatalf("downloadCategory(%q)=%q want %q", name, got, want)
		}
	}
	if got := downloadAgeBucket(181); got != "181+ days" {
		t.Fatalf("age bucket=%q", got)
	}
	if got := downloadSizeBucket(1024 * 1024 * 1024); got != "1 GB+" {
		t.Fatalf("size bucket=%q", got)
	}
}

func TestOldFileExplorerUsesModificationAgeAndSkipsSymlink(t *testing.T) {
	root := t.TempDir()
	now := time.Now()
	oldPath := filepath.Join(root, "old.bin")
	newPath := filepath.Join(root, "new.bin")
	if err := os.WriteFile(oldPath, make([]byte, 2*1024*1024), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(newPath, make([]byte, 2*1024*1024), 0600); err != nil {
		t.Fatal(err)
	}
	oldTime := now.Add(-220 * 24 * time.Hour)
	if err := os.Chtimes(oldPath, oldTime, oldTime); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(oldPath, filepath.Join(root, "old-link.bin")); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest("GET", "/api/maintenance/old-files?path="+root+"&days=180&min_mb=1", nil)
	rr := httptest.NewRecorder()
	(&app{}).handleOldFileExplorer(rr, req)
	if rr.Code != 200 {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	var body struct {
		Files []oldFileCandidate `json:"files"`
		Matched int `json:"matched_files"`
		Definition string `json:"definition"`
		NotEstablished string `json:"not_established"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Matched != 1 || len(body.Files) != 1 || body.Files[0].Path != oldPath {
		t.Fatalf("unexpected old-file result: %+v", body)
	}
	if body.Files[0].AgeDays < 180 {
		t.Fatalf("age days=%d", body.Files[0].AgeDays)
	}
	if body.Definition == "" || body.NotEstablished == "" {
		t.Fatal("evidence boundary metadata missing")
	}
}

func TestDownloadsIntelligenceIsPinnedToHomeDownloads(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	downloads := filepath.Join(home, "Downloads")
	if err := os.MkdirAll(downloads, 0700); err != nil {
		t.Fatal(err)
	}
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "outside.pkg"), []byte("outside"), 0600); err != nil {
		t.Fatal(err)
	}
	zipPath := filepath.Join(downloads, "archive.zip")
	pkgPath := filepath.Join(downloads, "setup.pkg")
	if err := os.WriteFile(zipPath, make([]byte, 1024), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(pkgPath, make([]byte, 2048), 0600); err != nil {
		t.Fatal(err)
	}
	oldTime := time.Now().Add(-200 * 24 * time.Hour)
	if err := os.Chtimes(zipPath, oldTime, oldTime); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(pkgPath, filepath.Join(downloads, "setup-link.pkg")); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest("GET", "/api/maintenance/downloads?path="+outside, nil)
	rr := httptest.NewRecorder()
	(&app{}).handleDownloadsIntelligence(rr, req)
	if rr.Code != 200 {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	var body struct {
		Path string `json:"path"`
		RegularFiles int `json:"regular_files"`
		Largest []downloadReviewItem `json:"largest_files"`
		ByCategory []storageReviewAggregate `json:"by_category"`
		Definition string `json:"definition"`
		NotEstablished string `json:"not_established"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Path != downloads {
		t.Fatalf("Downloads root=%q want %q", body.Path, downloads)
	}
	if body.RegularFiles != 2 {
		t.Fatalf("regular files=%d want 2; symlink should not count", body.RegularFiles)
	}
	for _, item := range body.Largest {
		if filepath.Dir(item.Path) != downloads {
			t.Fatalf("unexpected path escaped Downloads: %q", item.Path)
		}
	}
	seenArchive, seenInstaller := false, false
	for _, row := range body.ByCategory {
		if row.Name == "Archives" && row.Count == 1 { seenArchive = true }
		if row.Name == "Installers" && row.Count == 1 { seenInstaller = true }
	}
	if !seenArchive || !seenInstaller {
		t.Fatalf("category aggregates=%+v", body.ByCategory)
	}
	if body.Definition == "" || body.NotEstablished == "" {
		t.Fatal("Downloads evidence boundary metadata missing")
	}
}
