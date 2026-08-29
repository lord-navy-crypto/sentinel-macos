// SPDX-License-Identifier: MPL-2.0
package main

import "testing"

func TestParseProcessTableEvidence(t *testing.T) {
	raw := `  PID  PPID USER      %CPU %MEM     ELAPSED COMM
  101     1 alice      2.5  1.2    00:01:12 /Applications/Example.app/Contents/MacOS/Example
  202   101 alice      0.0  0.3       02:03 /usr/bin/helper`
	got := ParseProcessTableEvidence(raw)
	if got.ParsedRows != 2 || len(got.Processes) != 2 { t.Fatalf("process parse=%+v", got) }
	if got.Processes[0].PID != 101 || got.Processes[0].PPID != 1 || got.Processes[0].CPUPercent != 2.5 { t.Fatalf("first process=%+v", got.Processes[0]) }
}

func TestParseOpenFileEvidence(t *testing.T) {
	raw := `COMMAND   PID  USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
Example   101 alice  cwd    DIR   1,17      640    2 /Users/alice/Projects
Example   101 alice  txt    REG   1,17   123456  912 /Applications/Example.app/Contents/MacOS/Example
Example   101 alice   12u  IPv4 0x123      0t0  TCP localhost:5555->localhost:6000`
	got := ParseOpenFileEvidence(raw)
	if got.Kind != "process_open_files" || got.ParsedRows != 3 || len(got.OpenFiles) != 3 { t.Fatalf("open files parse=%+v", got) }
	if got.OpenFiles[1].PID != 101 || got.OpenFiles[1].FD != "txt" || got.OpenFiles[1].Name != "/Applications/Example.app/Contents/MacOS/Example" { t.Fatalf("open file=%+v", got.OpenFiles[1]) }
	if got.OpenFiles[2].Type != "IPv4" || got.OpenFiles[2].Name != "localhost:5555->localhost:6000" { t.Fatalf("socket row=%+v", got.OpenFiles[2]) }
}

func TestParseFilesystemEvidence(t *testing.T) {
	raw := `Filesystem      Size   Used  Avail Capacity iused ifree %iused Mounted on
/dev/disk3s1s1  460Gi   15Gi  210Gi     7%  400k  2.0G    0% /
/dev/disk3s5     460Gi  120Gi  210Gi    37%  900k  2.0G    0% /System/Volumes/Data`
	got := ParseFilesystemEvidence(raw)
	if got.ParsedRows != 2 || got.Filesystems[1].MountedOn != "/System/Volumes/Data" { t.Fatalf("filesystem parse=%+v", got) }
}

func TestParseMountEvidence(t *testing.T) {
	raw := `/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)
/dev/disk3s5 on /System/Volumes/Data (apfs, local, journaled, nobrowse)`
	got := ParseMountEvidence(raw)
	if got.ParsedRows != 2 { t.Fatalf("mount parse=%+v", got) }
	if got.Mounts[0].Device != "/dev/disk3s1s1" || got.Mounts[0].MountedOn != "/" || len(got.Mounts[0].Options) < 3 { t.Fatalf("mount row=%+v", got.Mounts[0]) }
}

func TestParseSigningEvidence(t *testing.T) {
	raw := `Executable=/Applications/Example.app/Contents/MacOS/Example
Identifier=com.example.app
Authority=Developer ID Application: Example Corp (TEAM123456)
Authority=Developer ID Certification Authority
TeamIdentifier=TEAM123456
Runtime Version=26.0.0
Signature size=9053`
	got := ParseSigningEvidence(raw)
	if got.ParsedRows != 1 || got.Signing == nil { t.Fatalf("signing parse=%+v", got) }
	if got.Signing.Identifier != "com.example.app" || got.Signing.TeamIdentifier != "TEAM123456" || len(got.Signing.Authorities) != 2 { t.Fatalf("signing=%+v", got.Signing) }
}

func TestParseGatekeeperEvidenceAcceptedAndRejected(t *testing.T) {
	accepted := ParseGatekeeperEvidence(`/Applications/Example.app: accepted
source=Notarized Developer ID
origin=Developer ID Application: Example Corp (TEAM123456)`)
	if accepted.Gatekeeper == nil || accepted.Gatekeeper.Assessment != "accepted" || accepted.Gatekeeper.Source != "Notarized Developer ID" { t.Fatalf("accepted=%+v", accepted) }
	rejected := ParseGatekeeperEvidence(`/tmp/Example.app: rejected
source=no usable signature`)
	if rejected.Gatekeeper == nil || rejected.Gatekeeper.Assessment != "rejected" { t.Fatalf("rejected=%+v", rejected) }
}

func TestSystemConsoleDispatchesOpenFileParser(t *testing.T) {
	got := ParseSystemConsoleEvidence("process-open-files", "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nA 12 u txt REG 1,1 10 2 /tmp/A")
	if got.Kind != "process_open_files" || len(got.OpenFiles) != 1 { t.Fatalf("dispatch=%+v", got) }
}

func TestExpandedPowerParserIsStructured(t *testing.T) {
	got := ParseSystemConsoleEvidence("power-settings", "System-wide power settings")
	if got.Kind != "power_policy" || got.ParsedRows == 0 { t.Fatalf("expanded power parser=%+v", got) }
}

func TestUnknownStructuredParserPreservesLimitation(t *testing.T) {
	got := ParseSystemConsoleEvidence("definitely-unknown-tool", "opaque output")
	if got.Kind != "raw" || len(got.Limitations) == 0 { t.Fatalf("fallback=%+v", got) }
}
