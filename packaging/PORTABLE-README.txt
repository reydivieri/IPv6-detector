IPv6 Detector - Portable for Windows x64
=======================================

1. Extract the ZIP into any folder (if you received the ZIP).
2. Double-click IPv6-Detector.exe.
3. Your default browser opens the local dashboard automatically.
4. Click Run diagnostics to inspect THIS computer.
5. Click Shut down app when finished. You can also press Ctrl+C in the
   application console. Closing the browser tab alone does not stop the app.

No Node.js installation, npm installation, or administrator account is normally
needed. The EXE contains its own Node.js runtime and application assets. You may
copy this folder to another supported computer. Keep NODE-LICENSE.txt with it
when redistributing. No source-project folder is needed.

Supported target: Windows 10/11 x64 with Windows PowerShell 5.1, standard Windows
networking/CIM modules and a modern browser. Windows on ARM, 32-bit Windows,
macOS and Linux are not covered by this release. Device-management policies
may block diagnostics or unsigned programs. This build is not code-signed.
The application does not modify these policies or request administrator access.

The program automatically chooses an unused loopback port. If a browser does
not open, copy the http://127.0.0.1 address printed in the application window
into your browser. Keep the application window open during use.

All UI and reports are in English. Network and hardware data stay in memory
unless you choose Export report. Reports contain device/network information;
review them before sharing. The PowerShell collector is written to a unique
temporary directory during a scan and removed when that scan finishes. A forced
termination or power loss may leave that temporary script behind.

The network tests connect to Cloudflare over IPv4 and IPv6 on port 443 and
query the configured DNS resolver for one.one.one.one. External connectivity is
required for those tests; local inventory can still be collected without it.
No network settings are changed and no LAN-wide device scan is performed.

IPv6 connectivity requires a working operating-system/adapter configuration,
router and upstream network path. CPU and RAM are shown for reference, not
scored against invented IPv6 hardware requirements. A failed connection test
does not prove that every IPv6 destination is unreachable.

For automated launch without opening a browser:
  IPv6-Detector.exe --no-browser

SHA256SUMS.txt identifies the exact EXE distributed in this folder.
BUILD-INFO.json records the runtime version and build architecture.

Runtime licensing: see NODE-LICENSE.txt, including bundled third-party notices.
