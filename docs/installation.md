# Installation

Poly-Cam follows the post-0.6.0 PolyModLoader repository layout: root `manifest.json` and `latest.json`, then a semver version folder containing `version.json` and the mod entrypoint.

**Import URL:** `https://cdn.polymodloader.com/gh/michael201110/poly-cam/v0.1.5`

1. Install PolyModLoader for PolyTrack 0.6.3.
2. Copy the import URL above into PolyModLoader's **Add mod** URL field.
3. Select Poly-Cam in the PML mod list and launch PolyTrack.
4. In a run or replay, use F6 to enable the cinematic camera and F7 to cycle rigs.

The version folder imports `PolyTypes.js` from the official PML CDN and has no other mod dependencies. For local development, serve the root and add that URL as a mod source. PML does not load a loose source directory as an installed plugin.
