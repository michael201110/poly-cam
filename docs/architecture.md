# Architecture and PolyTrack integration

## Camera source research

PolyTrack 0.6.3's `main.bundle.js` vehicle class owns both the orbit and cockpit cameras. The public methods `getPosition()`, `getQuaternion()`, and `getSpeedKmh()` provide the rendered car transform and speed. `cameraOrbit` returns the native Three.js perspective camera; its position, quaternion, FOV, `lookAt()`, and `updateProjectionMatrix()` are directly usable.

The vehicle's `updateCameras(dt)` method updates both native cameras from the car transform. The render controller invokes `updateCameras` for its active car and replay cars, and its camera selection points at the chosen car's orbit/cockpit camera. Poly-Cam derives insertion tokens from the actual `updateCameras` and renderer `setCamera` method bodies in PML's game function. The first callback runs after the native camera update; the second records which camera the renderer selected. Only the selected car is composed, so replay ghosts do not advance the timeline or consume freecam input. No private fields are read by Poly-Cam itself.

Both source patches must be registered in **preInit**. PML executes `globalFunc` between `preInit` and `init`; registering a global source mixin in `init` leaves the already-created classes unchanged. That was the cause of the earlier “Hook: waiting” failure. `init` creates the controller, registers hotkeys, and mounts the panel.

This hook runs on the rendering side and writes only the selected car's camera transform/FOV. It does not patch simulation worker code, physics, replay frames, or clocks. Freecam intercepts its movement keys locally so camera navigation does not drive the vehicle. Disabling restores the last native camera snapshot immediately; subsequent native camera updates run normally. The same car API is used during replay playback.

Vehicle forward in this release is **+Z**, while camera forward is **−Z**. Chase, front, mounts, fly-by placement, and freecam movement respect those conventions. Smoothing keeps its own position/quaternion/FOV state between updates because the game rewrites the native camera every frame. Poly-Cam rebuilds the projection after applying FOV, even when the cinematic FOV is steady.

PolyTrack's spectator/free camera is a separate camera owned by the game controller. It bypasses the vehicle's `updateCameras` hook, so Poly-Cam currently works when PolyTrack is showing the car orbit/cockpit camera, not while the native spectator camera is selected.

PolyTrack 0.6.3 binds its built-in `ToggleUI` action to `KeyH`. Clean Capture dispatches that native toggle on entry and exit, and separately hides the Poly-Cam panel and cursor. It does not delete or replace game UI nodes. The restore action is F9.

## Modules

- `src/main.mod.js`: PML lifecycle and version-specific camera hooks.
- `PolyCam`: transforms, transitions, director, bookmarks and timeline state.
- `shot-director.js`: filtered motion cues, weighted shot selection, pacing, framing variants and fresh roadside anchors. Uses per-car presentation data and the camera clock.
- `rigs.js`: shared `CameraRig` contract and ten camera compositions.
- `input.js`: hotkeys and freecam key isolation.
- `ui.js`: panel, clean capture, mode and timeline controls.

`npm run build` bundles `src/` into the current version folder and updates the manifests. Generated release files are committed for CDN distribution.

## Compatibility boundary

PolyTrack 0.6.3/PML 0.6.3 are the only declared target. The PML API exposes class mixins and public camera data, but it does not expose a stable high-level camera override API. Before supporting a later PolyTrack release, verify the car class scope, `updateCameras` implementation, token, and render camera selection against that release's bundle. If a later version changes these, Poly-Cam should fail to load that target rather than guessing tokens.

## Performance

Rig output, smoothing state, and quaternion scratch values are reused per vehicle. PolyTrack's public position/quaternion getters return fresh values, so the hook consumes those API allocations. No geometry searches or scene traversal occur per frame. Both selected-car camera projections are rebuilt after Poly-Cam's FOV is applied.
