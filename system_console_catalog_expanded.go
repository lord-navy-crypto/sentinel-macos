// SPDX-License-Identifier: MPL-2.0
package main

// expandedSystemConsoleTools adds broad, fixed-argument macOS Terminal-backed
// inspection buttons to System Console. These entries remain read-only and are
// executed through the existing no-shell, bounded-output query runner.
func expandedSystemConsoleTools(readonly, managed string) []SystemConsoleTool {
	return []SystemConsoleTool{
		// System & hardware
		{ID: "hardware-profile", Name: "Hardware overview", Intent: "understand", Domain: "system", Mode: "read_only", Summary: "Show model, chip/CPU, memory, serial-visible hardware fields, and hardware UUID from system_profiler.", Command: "/usr/sbin/system_profiler", BaseArgs: []string{"SPHardwareDataType"}, TimeoutSeconds: 12, Safety: readonly},
		{ID: "uptime", Name: "System uptime", Intent: "understand", Domain: "system", Mode: "read_only", Summary: "Show how long macOS has been running and the current load averages.", Command: "/usr/bin/uptime", TimeoutSeconds: 5, Safety: readonly},
		{ID: "boot-time", Name: "Kernel boot time", Intent: "understand", Domain: "system", Mode: "read_only", Summary: "Read the kernel boot-time value without changing system state.", Command: "/usr/sbin/sysctl", BaseArgs: []string{"kern.boottime"}, TimeoutSeconds: 5, Safety: readonly},
		{ID: "software-update-history", Name: "Software update history", Intent: "investigate", Domain: "system", Mode: "read_only", Summary: "Show macOS software-update installation history.", Command: "/usr/sbin/softwareupdate", BaseArgs: []string{"--history"}, TimeoutSeconds: 15, Safety: readonly},
		{ID: "system-extensions", Name: "System extensions", Intent: "investigate", Domain: "system", Mode: "read_only", Summary: "List installed/activated system extensions as reported by macOS.", Command: "/usr/bin/systemextensionsctl", BaseArgs: []string{"list"}, TimeoutSeconds: 8, Safety: readonly},
		{ID: "configuration-profiles", Name: "Enrollment status", Intent: "investigate", Domain: "system", Mode: "read_only", Summary: "Show whether the Mac reports MDM/device-enrollment status.", Command: "/usr/bin/profiles", BaseArgs: []string{"status", "-type", "enrollment"}, TimeoutSeconds: 8, Safety: readonly},

		// Processes & open resources
		{ID: "process-state-table", Name: "Process state table", Intent: "understand", Domain: "processes", Mode: "read_only", Summary: "Show PID, parent, state, owner, CPU, memory, elapsed time, and command for current processes.", Command: "/bin/ps", BaseArgs: []string{"-axo", "pid,ppid,state,user,%cpu,%mem,etime,comm"}, TimeoutSeconds: 5, Safety: readonly},
		{ID: "listening-processes", Name: "Listening TCP processes", Intent: "investigate", Domain: "processes", Mode: "read_only", Summary: "Show processes with currently visible listening TCP sockets.", Command: "/usr/sbin/lsof", BaseArgs: []string{"-nP", "-iTCP", "-sTCP:LISTEN"}, TimeoutSeconds: 8, Safety: readonly},

		// Storage, disks, search & backup
		{ID: "disk-layout", Name: "Disk & partition layout", Intent: "understand", Domain: "storage", Mode: "read_only", Summary: "List visible physical disks, containers, partitions, and volumes with diskutil.", Command: "/usr/sbin/diskutil", BaseArgs: []string{"list"}, TimeoutSeconds: 10, Safety: readonly},
		{ID: "apfs-layout", Name: "APFS containers", Intent: "investigate", Domain: "storage", Mode: "read_only", Summary: "Show APFS containers, volumes, roles, and capacity relationships.", Command: "/usr/sbin/diskutil", BaseArgs: []string{"apfs", "list"}, TimeoutSeconds: 12, Safety: readonly},
		{ID: "storage-profile", Name: "Storage profile", Intent: "understand", Domain: "storage", Mode: "read_only", Summary: "Show macOS storage-device and volume profile information.", Command: "/usr/sbin/system_profiler", BaseArgs: []string{"SPStorageDataType"}, TimeoutSeconds: 15, Safety: readonly},
		{ID: "spotlight-status", Name: "Spotlight index status", Intent: "investigate", Domain: "search", Mode: "read_only", Summary: "Inspect Spotlight indexing status for one absolute volume or directory path.", TargetKind: "path", Command: "/usr/bin/mdutil", BaseArgs: []string{"-s"}, TimeoutSeconds: 8, Safety: readonly},
		{ID: "time-machine-status", Name: "Time Machine status", Intent: "understand", Domain: "backup", Mode: "read_only", Summary: "Show whether a Time Machine backup is currently running and its visible state.", Command: "/usr/bin/tmutil", BaseArgs: []string{"status"}, TimeoutSeconds: 8, Safety: readonly},
		{ID: "time-machine-destinations", Name: "Time Machine destinations", Intent: "investigate", Domain: "backup", Mode: "read_only", Summary: "Show configured Time Machine destination information without changing backup configuration.", Command: "/usr/bin/tmutil", BaseArgs: []string{"destinationinfo"}, TimeoutSeconds: 8, Safety: readonly},

		// Network
		{ID: "network-interfaces", Name: "Network interfaces", Intent: "understand", Domain: "network", Mode: "read_only", Summary: "Show current interface addresses, flags, and link state with ifconfig.", Command: "/sbin/ifconfig", BaseArgs: []string{"-a"}, TimeoutSeconds: 6, Safety: readonly},
		{ID: "dns-configuration", Name: "DNS configuration", Intent: "investigate", Domain: "network", Mode: "read_only", Summary: "Show current DNS resolver configuration reported by SystemConfiguration.", Command: "/usr/sbin/scutil", BaseArgs: []string{"--dns"}, TimeoutSeconds: 6, Safety: readonly},
		{ID: "proxy-configuration", Name: "Proxy configuration", Intent: "investigate", Domain: "network", Mode: "read_only", Summary: "Show current proxy configuration reported by SystemConfiguration.", Command: "/usr/sbin/scutil", BaseArgs: []string{"--proxy"}, TimeoutSeconds: 6, Safety: readonly},
		{ID: "arp-neighbors", Name: "Local network neighbors", Intent: "investigate", Domain: "network", Mode: "read_only", Summary: "Show the current ARP neighbor cache; presence is network evidence, not a trust verdict.", Command: "/usr/sbin/arp", BaseArgs: []string{"-a"}, TimeoutSeconds: 6, Safety: readonly},
		{ID: "tcp-socket-table", Name: "TCP socket table", Intent: "investigate", Domain: "network", Mode: "read_only", Summary: "Show current TCP socket state from netstat without packet capture.", Command: "/usr/sbin/netstat", BaseArgs: []string{"-anv", "-p", "tcp"}, TimeoutSeconds: 8, Safety: readonly},
		{ID: "network-quality", Name: "Network quality test", Intent: "understand", Domain: "network", Mode: "read_only", Summary: "Run Apple's networkQuality measurement. It generates network test traffic but does not change persistent network settings.", Command: "/usr/bin/networkQuality", BaseArgs: []string{"-c"}, TimeoutSeconds: 15, Safety: "Measurement-only network query. It may generate temporary test traffic; no shell is invoked and no persistent network setting is changed."},

		// Power & battery
		{ID: "battery-status", Name: "Battery & power source", Intent: "understand", Domain: "power", Mode: "read_only", Summary: "Show battery charge, power source, and estimated state from pmset.", Command: "/usr/bin/pmset", BaseArgs: []string{"-g", "batt"}, TimeoutSeconds: 5, Safety: readonly},
		{ID: "power-assertions", Name: "Power assertions", Intent: "investigate", Domain: "power", Mode: "read_only", Summary: "Show processes and assertions currently preventing or influencing sleep/display sleep.", Command: "/usr/bin/pmset", BaseArgs: []string{"-g", "assertions"}, TimeoutSeconds: 6, Safety: readonly},
		{ID: "power-custom", Name: "Power policy by source", Intent: "investigate", Domain: "power", Mode: "read_only", Summary: "Show configured AC/battery power-management values without modifying them.", Command: "/usr/bin/pmset", BaseArgs: []string{"-g", "custom"}, TimeoutSeconds: 5, Safety: readonly},
		{ID: "power-profile", Name: "Power hardware profile", Intent: "understand", Domain: "power", Mode: "read_only", Summary: "Show battery/power hardware information from system_profiler.", Command: "/usr/sbin/system_profiler", BaseArgs: []string{"SPPowerDataType"}, TimeoutSeconds: 12, Safety: readonly},

		// Startup & services
		{ID: "launchctl-list", Name: "User launch services", Intent: "investigate", Domain: "startup", Mode: "read_only", Summary: "List services visible in the current launchd user domain. Use Launch & Service Explorer for relationship analysis.", Command: "/bin/launchctl", BaseArgs: []string{"list"}, TimeoutSeconds: 8, Safety: readonly},

		// Security posture
		{ID: "gatekeeper-status", Name: "Gatekeeper global status", Intent: "understand", Domain: "security", Mode: "read_only", Summary: "Show whether Gatekeeper assessments are globally enabled as reported by spctl.", Command: "/usr/sbin/spctl", BaseArgs: []string{"--status"}, TimeoutSeconds: 5, Safety: readonly},
		{ID: "filevault-status", Name: "FileVault status", Intent: "understand", Domain: "security", Mode: "read_only", Summary: "Show FileVault encryption status. Sentinel does not request recovery keys or credentials.", Command: "/usr/bin/fdesetup", BaseArgs: []string{"status"}, TimeoutSeconds: 6, Safety: readonly},
		{ID: "sip-status", Name: "System Integrity Protection", Intent: "understand", Domain: "security", Mode: "read_only", Summary: "Show System Integrity Protection status reported by csrutil.", Command: "/usr/bin/csrutil", BaseArgs: []string{"status"}, TimeoutSeconds: 6, Safety: readonly},

		// Bounded predefined logs
		{ID: "gatekeeper-log", Name: "Recent Gatekeeper log", Intent: "investigate", Domain: "logs", Mode: "read_only", Summary: "Show a bounded recent syspolicyd log window for Gatekeeper-related investigation.", Command: "/usr/bin/log", BaseArgs: []string{"show", "--last", "10m", "--style", "compact", "--predicate", "process == \"syspolicyd\""}, TimeoutSeconds: 12, Safety: readonly},
		{ID: "power-log", Name: "Recent power log", Intent: "investigate", Domain: "logs", Mode: "read_only", Summary: "Show a bounded recent powerd log window for sleep/power investigation.", Command: "/usr/bin/log", BaseArgs: []string{"show", "--last", "10m", "--style", "compact", "--predicate", "process == \"powerd\""}, TimeoutSeconds: 12, Safety: readonly},

		// Typed control/recovery entry points remain Sentinel-managed rather than direct terminal mutation.
		{ID: "launch-service-control", Name: "Startup & service control", Intent: "control", Domain: "startup", Mode: "sentinel_action", Summary: "Open Sentinel's typed Launch & Service workflow. Direct arbitrary launchctl mutation is intentionally not exposed.", Route: "/launch-services.html", Safety: managed},
		{ID: "network-investigation", Name: "Network relationship workspace", Intent: "control", Domain: "network", Mode: "sentinel_action", Summary: "Open the Network Relationship Explorer for current and retained network evidence.", Route: "/network-relations.html", Safety: managed},
		{ID: "intelligence-center", Name: "Intelligence Center", Intent: "control", Domain: "system", Mode: "sentinel_action", Summary: "Open Graph, Incidents, Timeline, Object Story, Visibility, and Cmd+K in one workspace.", Route: "/intelligence-center.html", Safety: managed},
	}
}
