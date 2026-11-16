# IPv6 Detector

A local Windows dashboard for inspecting this computer's network connections, device specifications and IPv6 readiness. The interface and reports are in English. No npm packages are required.

## Run the portable Windows application

Download **IPv6-Detector-Windows-x64.zip** from [GitHub Releases](https://github.com/reydivieri/IPv6-detector/releases). The portable executable is distributed as a release asset; GitHub's **Code > Download ZIP** contains source code, not the built application. If you built locally, the package is in `release/IPv6-Detector-Windows-x64.zip`.

Extract the package and double-click **IPv6-Detector.exe**. You do not need to install Node.js or npm on the target device. The default browser opens automatically on an available loopback port. Click **Run diagnostics** to inspect that device, then **Shut down app** when finished. Closing just the browser tab leaves the local application running; you can also press `Ctrl+C` or close its console window to quit.

The executable contains the runtime, JavaScript modules and browser assets. It runs independently of this source directory. The console remains open during use. This is a local application with a browser interface, not an embedded-browser desktop window. Target devices need Windows 10/11 **x64**, standard Windows PowerShell 5.1 networking/CIM modules, and a modern browser. This release does not target 32-bit Windows, Windows on ARM, macOS or Linux. Existing organization policies still apply.

The executable is unsigned. The release includes usage instructions, the official Node.js runtime license with dependency notices, build information and an executable SHA-256 checksum. Keep the license with the application when redistributing. A checksum for the ZIP is provided alongside it. The build uses [Node.js single executable application support](https://nodejs.org/api/single-executable-applications.html).

## Run from source

Requirements: Windows 10/11, Node.js 22 or newer, Windows PowerShell with the NetAdapter, NetTCPIP and DnsClient modules. PowerShell script execution must be permitted by your existing policy. Administrator privileges are normally unnecessary. The application does not change execution policy or network settings.

```powershell
npm start
```

Open **http://127.0.0.1:3000**, then click **Run diagnostics**. Use `Ctrl+C` in the terminal to stop the server. For a different port:

```powershell
$env:PORT = '3001'
npm start
```

If your organization blocks scripts or network inspection, ask its administrator about the reported restriction. If a port is already in use, choose another port.

## Features

- Physical and active virtual adapters, connection state, Windows network profile name when available, link speed and MAC address.
- IPv4 and IPv6 addresses, prefix lengths, address states, address scopes, default gateways and configured DNS servers.
- CPU, logical processors, installed/free RAM, OS version and architecture.
- IPv6 binding, preferred local/global addresses, default route, DNS AAAA resolution and public IPv6 TLS checks.
- A separate IPv4 baseline test, recommendations, active-adapter filter and downloadable JSON report.
- Loading, failed-scan and empty states. Failed rescans preserve and identify the previous report.

## What the result means

“IPv6 connected” means this process completed a certificate-verified TLS handshake to Cloudflare (`2606:4700:4700::1111:443`, with the address and port treated separately). IPv4 uses `1.1.1.1:443`; both use the TLS server name `one.one.one.one`. AAAA lookup uses the system-configured DNS resolver for `one.one.one.one`. These are real outbound tests, not simulated values. TLS time includes connection establishment and the handshake; it is not ICMP ping latency or a bandwidth test.

An unsuccessful test may reflect a target-specific block, firewall, VPN, transient issue or restricted execution environment. It does not prove every IPv6 destination is unreachable. IPv6 DNS records can be resolved over IPv4. A link-local or ULA address is useful locally but does not establish public internet reachability. A global address or default route alone is not proof of internet access either. The probes use Windows route selection and do not test each adapter independently.

The device assessment reports observed IPv6 support on active adapters. CPU and RAM are informational, with no invented minimum hardware threshold or upgrade recommendation. Windows includes IPv6 support; actual connectivity also depends on adapter settings, routing and the upstream network. Reference: [Microsoft IPv6 configuration guidance](https://learn.microsoft.com/en-us/troubleshoot/windows-server/networking/configure-ipv6-in-windows).

The app inspects networks **connected to this computer**. It does not discover every device on the LAN, scan ports, list nearby Wi-Fi networks or guarantee that a network profile name is the Wi-Fi SSID. It never changes adapter settings.

## Privacy and architecture

The HTTP server binds only to `127.0.0.1` and validates the Host header. Browser assets are local, without remote fonts, analytics or third-party scripts. Diagnostic data stays in memory until restart; the app writes a report only when you choose Export. The portable version writes its bundled PowerShell collector to a unique temporary folder for each scan and removes that folder afterward. Forced termination or power loss can leave that temporary script behind. Reports contain network addresses, MAC addresses and device details, so review them before sharing. Cloudflare sees the source address of the connection probes; your configured resolver receives the DNS query.

`server.mjs` serves the interface and `/api/scan`. `scripts/collect.ps1` collects Windows state as JSON. `lib/diagnostics.mjs` performs probes and evaluates evidence. The browser renders dynamic values as text. Concurrent scans share one collection; results are cached for five seconds to avoid repeated expensive commands. PowerShell collection times out after 45 seconds; TLS tests after five seconds and DNS after four seconds. Do not publish this service or bind it to a public network interface.

## Development plan and estimates

These are estimates for one developer; environment restrictions and expanded requirements can change them.

| Step | Deliverable | Estimated time |
| --- | --- | --- |
| 1. Scope and design | Windows-only local architecture, English interface, readiness criteria | 15–30 minutes |
| 2. Device and network inventory | Read-only PowerShell collection, adapter details, CPU/RAM/OS | 45–90 minutes |
| 3. IPv6 diagnostics | Address and route checks, DNS and real TLS probes, recommendations | 45–90 minutes |
| 4. Dashboard | Responsive interface, scan feedback, filtering and report export | 1–2 hours |
| 5. Validation and handoff | Automated tests, real-device checks, documentation | 45–90 minutes |
| **Total for a reviewed MVP** | **Usable local Windows application** | **About 3.5–7 hours** |

An initial functional version can be built in approximately 20–30 minutes with coding assistance. Broader validation across Wi-Fi, Ethernet, VPN, IPv4-only and dual-stack networks needs additional testing. Portable Windows x64 packaging is now implemented. A desktop installer, code signing and cross-platform support remain separate work.

## Build the portable release

Building currently requires Windows x64 and **Node.js 26.13.1**, matching the runtime license bundled in `packaging/`. No npm packages or bundlers are needed. Target users do not need this build environment.

```powershell
npm run build:portable
npm run test:portable
```

The build produces `release/IPv6-Detector-Windows-x64/IPv6-Detector.exe`, supporting notices/instructions and `release/IPv6-Detector-Windows-x64.zip` with a ZIP checksum. The build configuration is generated in `build/sea-config.json`. `portable.mjs` is the executable entry point. The SEA virtual filesystem embeds the original modules and assets, so builds use the same diagnostic implementation as the source version. If changing the Node.js runtime, update `packaging/NODE-VERSION.txt` and obtain that exact release's official license/third-party notices first.

The portable smoke test copies only the EXE to an isolated temporary directory, removes Node.js from `PATH`, starts without opening a browser, checks embedded resources, runs a real read-only device/network scan and requests authenticated shutdown. Its local inventory requires Windows permissions unavailable in some sandboxes. It verifies independence from the source tree and an installed Node.js command, but does not replace testing on a separate clean Windows device.

## Checks

```powershell
npm test
node --check server.mjs
node --check lib/diagnostics.mjs
node --check public/app.js
```

Automated tests cover address classification and readiness decisions, including link-local-only connectivity, tentative addresses, disconnected adapters and unknown bindings. HTTP tests cover local assets, Host validation, concurrent scan caching, failed-scan recovery and authenticated portable shutdown. Validate actual connectivity on more than one network before relying on results for operational decisions.
