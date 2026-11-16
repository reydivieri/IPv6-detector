IPv6 Detector 1.1.0 adds Japanese language selection, local route analysis and IPv4/IPv6 traceroute to the portable Windows dashboard.

## New in 1.1.0

- Switch between **English** and **日本語**, including diagnostic explanations and recommendations. The language preference is remembered in the browser across portable launches on the same loopback host.
- Inspect the routes Windows selects for the test targets, along with default routes and combined route/interface metrics.
- Review equal-priority or alternative default routes, disconnected default routes, virtual adapters and VPN-style /1 routes. These are observations, not automatic judgments that a connection is unnecessary.
- Run a separate IPv4/IPv6 traceroute to fixed Cloudflare targets, with up to 16 hops and a 40-second process limit per family.
- Export canonical diagnostic data together with localized explanations and the latest separate trace results.

## Download and run

1. Download **IPv6-Detector-Windows-x64.zip** below.
2. Extract the archive and double-click **IPv6-Detector.exe**.
3. Click **Run diagnostics** in the browser dashboard.
4. Choose your language and click **Trace IPv4 / IPv6** to inspect upstream hops.
5. Click **Shut down app** when finished.

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
- Traceroute observes **device → router/gateway → upstream network → Cloudflare**, not the ISP-to-device return path. Hop ownership is not identified, and non-responsive hops remain unknown. A timeout does not establish an unnecessary or broken hop.
- Router readiness is inferred from the device's network configuration. Router settings are not read directly, and a failed probe does not uniquely identify an ISP problem.
- Diagnostics are read-only. The external tests contact Cloudflare and the configured DNS resolver; traceroute sends ICMP probes. No routes are removed or disabled.

## Validation

All 21 automated tests passed, covering readiness, HTTP behavior, route observations, trace parsing and Japanese translations. The portable EXE is tested in an isolated folder with Node.js removed from PATH, including bilingual assets, a real Windows device/route scan, IPv4/IPv6 traceroute and clean shutdown. Testing on a separate physical computer and visual browser verification remain outstanding.
