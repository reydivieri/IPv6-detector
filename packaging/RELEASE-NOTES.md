IPv6 Detector 1.0.0 provides a portable, English-language Windows dashboard for local network and device diagnostics.

## Download and run

1. Download **IPv6-Detector-Windows-x64.zip** below.
2. Extract the archive and double-click **IPv6-Detector.exe**.
3. Click **Run diagnostics** in the browser dashboard.
4. Click **Shut down app** when finished.

Node.js and npm do not need to be installed on the target device. Keep the included Node.js runtime license with the executable when redistributing it. A SHA-256 checksum file is provided alongside the archive.

## Features

- Windows adapter details, IPv4/IPv6 addresses, default gateways and DNS servers.
- CPU, memory and operating-system information.
- IPv6 readiness checklist with address, route, DNS and verified TLS connection checks.
- Recommendations, active-adapter filtering and JSON report export.
- Automatic local port selection and authenticated application shutdown.

## Compatibility and limits

- Windows 10/11 x64, standard Windows PowerShell networking/CIM modules and a modern browser.
- This build is unsigned. Existing Windows and organization security policies apply.
- The interface opens in the default browser; the application console remains open during use.
- Router readiness is inferred from the device's network configuration. Router settings are not read directly, and a failed probe does not uniquely identify an ISP problem.
- Diagnostics are read-only. The external tests contact Cloudflare and the configured DNS resolver.

## Validation

All 12 automated tests passed. The portable EXE was also tested in an isolated folder with Node.js removed from PATH, including embedded assets, a real Windows device scan and clean shutdown. ZIP and executable checksums were verified. Testing on a separate physical computer and visual browser verification remain outstanding.
