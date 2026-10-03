# Installation

Poly-Cam follows the post-0.6.0 PolyModLoader repository layout: root `manifest.json` and `latest.json`, then a semver version folder containing `version.json` and the mod entrypoint.

**Import URL:** `https://cdn.polymodloader.com/gh/michael201110/poly-cam/v0.1.10`

1. Install PolyModLoader for PolyTrack 0.6.3.
2. Remove any earlier Poly-Cam entry, then copy the import URL above into PolyModLoader's **Add mod** URL field.
3. Select Poly-Cam in the PML mod list and launch PolyTrack.
4. Start a run. The panel status should say **Camera connected**. Click **OFF** to turn it **ON**, or press F6. Choose a camera from the dropdown or press F7.
5. Click **−** to minimize the panel and **+** to restore it. F9 hides the panel and game HUD for capture; F9 again restores them.
6. For OBS, press **F4** to completely hide the Poly-Cam window, including its minimized header. Press **F4** again to restore it. Camera and montage keep running, and the window returns to its previous minimized/expanded state. F11 controls browser fullscreen. You can rebind the window shortcut in PML's Poly-Cam keybind settings.

The release entry bundles all Poly-Cam modules into one file, so PML's cached blob loading does not need relative imports. It imports `PolyTypes.js` from the official PML CDN and has no other mod dependencies. For local development, run `npm ci` and `npm run build`, serve the repository root, and add that URL as a mod source. PML does not load a loose source directory as an installed plugin.

The native spectator camera is separate from the car camera. Switch back to PolyTrack's car orbit/cockpit view when using Poly-Cam.
