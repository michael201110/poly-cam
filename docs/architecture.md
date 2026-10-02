# Architecture and PolyTrack integration

## Camera source research

PolyTrack 0.6.3's `main.bundle.js` vehicle class owns both the orbit and cockpit cameras. The public methods `getPosition()`, `getQuaternion()`, and `getSpeedKmh()` provide the rendered car transform and speed. `cameraOrbit` returns the native Three.js perspective camera; its position, quaternion, FOV, `lookAt()`, and `updateProjectionMatrix()` are directly usable.

The vehicle's `updateCameras(dt)` method updates both native cameras from the car transform. The render controller invokes `updateCameras` for its active car and replay cars, and its camera selection points at the chosen car's orbit camera. Poly-Cam uses a PolyModLoader `registerClassMixin` on the 0.6.3 car class (`ot.prototype.updateCameras`) and inserts a callback after the native orbit/cockpit update. No private fields are read by Poly-Cam itself; only the version-scoped mixin target and insertion token are bundle-specific.

This hook is render-side. It runs after the game's own camera update and writes only the camera object's transform/FOV. It does not patch simulation worker code, inputs, physics, replay frames, or clocks. When disabled the callback does nothing, leaving the native update result intact. Every car camera receives a camera composition update; only the camera selected by PolyTrack is rendered. This is what lets the same rigs work for replay playback without finding replay internals.

PolyTrack's spectator/free camera is a separate camera owned by the game controller. It bypasses the vehicle's `updateCameras` hook, so Poly-Cam currently works when PolyTrack is showing the car orbit/cockpit camera, not while the native spectator camera is selected.

PolyTrack 0.6.3 binds its built-in `ToggleUI` action to `KeyH`. Clean Capture dispatches that native toggle on entry and exit, and separately hides the Poly-Cam panel and cursor. It does not delete or replace game UI nodes. The restore action is F9.

## Modules

- `main.mod.js`: PML lifecycle and version-specific camera hook.
- `PolyCam`: transforms, transitions, director, bookmarks and timeline state.
- `rigs.js`: shared `CameraRig` contract and ten camera compositions.
- `input.js`: hotkeys and freecam key isolation.
- `ui.js`: cached panel nodes, clean capture, mode and timeline controls.

## Compatibility boundary

PolyTrack 0.6.3/PML 0.6.3 are the only declared target. The PML API exposes class mixins and public camera data, but it does not expose a stable high-level camera override API. Before supporting a later PolyTrack release, verify the car class scope, `updateCameras` implementation, token, and render camera selection against that release's bundle. If a later version changes these, Poly-Cam should fail to load that target rather than guessing tokens.

## Performance

Rig output, smoothing state, and quaternion scratch values are reused per vehicle. PolyTrack's public position/quaternion getters return fresh values, so the hook consumes those API allocations. No geometry searches or scene traversal occur per frame. FOV projection is recalculated only after the FOV changes.
