// SPDX-License-Identifier: MPL-2.0
package main

import (
	"net/http"
	"sort"
	"time"
)

const storageAgingOldestLimit = 30

type StorageAgeBucket struct {
	ID string `json:"id"`
	Label string `json:"label"`
	Files int `json:"files"`
	Bytes uint64 `json:"bytes"`
}

type StorageAgingItem struct {
	Path string `json:"path"`
	Name string `json:"name"`
	Size uint64 `json:"size"`
	ModifiedAt int64 `json:"modified_at"`
	AgeDays int `json:"age_days"`
}

type StorageTrendPoint struct {
	SnapshotID string `json:"snapshot_id"`
	CreatedAt int64 `json:"created_at"`
	VisibleBytes uint64 `json:"visible_bytes"`
	Partial bool `json:"partial"`
}

type StorageAgingReport struct {
	GeneratedAt string `json:"generated_at"`
	Root string `json:"root,omitempty"`
	FilesConsidered int `json:"files_considered"`
	BytesConsidered uint64 `json:"bytes_considered"`
	Buckets []StorageAgeBucket `json:"buckets"`
	OldestLargeFiles []StorageAgingItem `json:"oldest_large_files,omitempty"`
	Trend []StorageTrendPoint `json:"trend,omitempty"`
	Limitations []string `json:"limitations,omitempty"`
	Note string `json:"note"`
}

func storageAgeBucket(ageDays int) int {
	switch {
	case ageDays < 30: return 0
	case ageDays < 90: return 1
	case ageDays < 365: return 2
	case ageDays < 730: return 3
	default: return 4
	}
}

func BuildStorageAgingReport(result *AdvancedStorageResult, snapshots []StorageSnapshot, now time.Time) StorageAgingReport {
	if now.IsZero(){now=time.Now()}
	out:=StorageAgingReport{GeneratedAt:now.UTC().Format(time.RFC3339),Buckets:[]StorageAgeBucket{{ID:"lt30d",Label:"< 30 days"},{ID:"30-90d",Label:"30–90 days"},{ID:"90-365d",Label:"90–365 days"},{ID:"1-2y",Label:"1–2 years"},{ID:"2y-plus",Label:"2+ years"}},Note:"Aging is calculated only for the bounded large-file set retained by the latest Storage Intelligence scan. It is not a complete inventory of every file on the volume."}
	if result==nil { out.Limitations=append(out.Limitations,"no completed Storage Intelligence result is available"); return out }
	out.Root=result.Root
	for _,f:=range result.LargeFiles {
		if f.ModUnix<=0 { continue }
		age:=int(now.Unix()-f.ModUnix)/86400;if age<0{age=0}
		idx:=storageAgeBucket(age);out.Buckets[idx].Files++;out.Buckets[idx].Bytes+=f.Size;out.FilesConsidered++;out.BytesConsidered+=f.Size
		out.OldestLargeFiles=append(out.OldestLargeFiles,StorageAgingItem{Path:f.Path,Name:f.Name,Size:f.Size,ModifiedAt:f.ModUnix,AgeDays:age})
	}
	sort.SliceStable(out.OldestLargeFiles,func(i,j int)bool{if out.OldestLargeFiles[i].AgeDays!=out.OldestLargeFiles[j].AgeDays{return out.OldestLargeFiles[i].AgeDays>out.OldestLargeFiles[j].AgeDays};if out.OldestLargeFiles[i].Size!=out.OldestLargeFiles[j].Size{return out.OldestLargeFiles[i].Size>out.OldestLargeFiles[j].Size};return out.OldestLargeFiles[i].Path<out.OldestLargeFiles[j].Path})
	if len(out.OldestLargeFiles)>storageAgingOldestLimit{out.OldestLargeFiles=out.OldestLargeFiles[:storageAgingOldestLimit];out.Limitations=append(out.Limitations,"oldest-large-file detail is bounded to 30 rows")}
	for _,s:=range snapshots{if result.Root!=""&&s.Root!=""&&s.Root!=result.Root{continue};out.Trend=append(out.Trend,StorageTrendPoint{SnapshotID:s.ID,CreatedAt:s.CreatedAt,VisibleBytes:s.VisibleBytes,Partial:s.Partial})}
	sort.SliceStable(out.Trend,func(i,j int)bool{return out.Trend[i].CreatedAt<out.Trend[j].CreatedAt})
	if result.Truncated||result.PermissionErr>0||result.SlowPathsSkipped>0{out.Limitations=append(out.Limitations,"latest storage scan was partial; age distribution reflects only observed bounded large-file evidence")}
	if out.FilesConsidered==0{out.Limitations=append(out.Limitations,"latest scan exposed no large files with usable modification timestamps")}
	return out
}

func (a *app) storageAgingV23() StorageAgingReport {
	var snapshots []StorageSnapshot
	if cp:=controlPlaneFor(a!=nil&&a.ephemeral);cp!=nil&&cp.storageHistory!=nil{snapshots=cp.storageHistory.list()}
	var result *AdvancedStorageResult
	if a!=nil&&a.jobs!=nil{result=a.jobs.latestResult()}
	return BuildStorageAgingReport(result,snapshots,time.Now())
}

func (a *app) handleStorageAgingV23(w http.ResponseWriter,r *http.Request){if r.Method!=http.MethodGet{writeJSON(w,http.StatusMethodNotAllowed,map[string]any{"error":"GET required"});return};writeJSON(w,http.StatusOK,a.storageAgingV23())}
