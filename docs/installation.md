# Installation

Poly-Cam follows the post-0.6.0 PolyModLoader repository layout: root `manifest.json` and `latest.json`, then a semver version folder containing `version.json` and the mod entrypoint.

1. Install PolyModLoader for PolyTrack 0.6.3.
2. Add this repository as a PolyModLoader mod source, using the repository root.
3. Select Poly-Cam in the PML mod list and launch PolyTrack.
4. In a run or replay, use F6 to enable the cinematic camera and F7 to cycle rigs.

The version folder imports `PolyTypes.js` from the official PML CDN and has no other mod dependencies. For local development, serve the root and add that URL as a mod source. PML does not load a loose source directory as an installed plugin.
