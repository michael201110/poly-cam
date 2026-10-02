# Poly-Cam

Poly-Cam is a standalone PolyModLoader plugin for cinematic PolyTrack capture. It changes only the active car's rendered camera transform and FOV. It does not modify controls, vehicle state, simulation timing, lap times, or replay data.

## Status

The first release targets PolyTrack 0.6.3. It establishes the camera hook and implements cinematic chase, low chase, front chase, side tracking, orbit, drone, trackside, fly-by, vehicle mount, and freecam rigs. It includes shot transitions, an event-weighted montage director, bookmarks, hotkeys, and a compact panel. Replay cars use the same vehicle camera hook as live cars.

PolyTrack/PML bundles change over time. The current integration is version-scoped and documented in [architecture notes](docs/architecture.md). Runtime validation in the game is still needed for replay selection, run lifecycle, and coexistence with other mods.

## Install

See [installation](docs/installation.md). In brief, import the repository's root into PolyModLoader's mod list.

## Controls

| Key | Action |
| --- | --- |
| F6 | Enable or restore Poly-Cam |
| F7 | Next camera rig |
| Shift+F7 | Previous camera rig |
| F8 | Toggle Montage Mode |
| F9 | Toggle Clean Capture (emergency restore) |
| F10 | Enter or leave freecam |
| WASD | Move in freecam |
| Space / Ctrl | Move up / down in freecam |
| Shift / Alt | Fast / precise freecam movement |
| Mouse | Look while freecam is active |
| Wheel | Change freecam speed |
| Escape | Leave freecam and restore the cursor |

The panel includes controls for mode selection, FOV, trackside placement, bookmarks, and the optional JSON shot timeline. See [camera modes](docs/camera-modes.md).

## Scope and limitations

- PML camera hook currently targets PolyTrack 0.6.3.
- Rigs track each rendered car through PolyTrack's public car getters. This supports live driving and whichever car camera the game selects during replay playback.
- PolyTrack's separate spectator/free camera bypasses the vehicle camera hook; switch back to the car orbit/cockpit camera before enabling Poly-Cam.
- Trackside placement is world-space and can be composed with freecam; Poly-Cam does not search track geometry.
- Clean Capture hides Poly-Cam's panel and cursor, and uses PolyTrack 0.6.3's native H UI toggle. F9 toggles the HUD back on. It does not permanently remove game UI.
- The plugin has not been runtime-tested inside PolyTrack in this workspace.

## License

MIT. PolyTrack and PolyModLoader remain their respective owners' projects.
