# Poly-Cam

Poly-Cam is a standalone PolyModLoader plugin for cinematic PolyTrack capture. It changes only the active car's rendered camera transform and FOV. It does not modify controls, vehicle state, simulation timing, lap times, or replay data.

## Status

Poly-Cam targets PolyTrack 0.6.3 and provides twelve rigs: cinematic chase, low chase, front chase, side tracking, orbit, drone, trackside, panning fly-by, vehicle mount, freecam, fixed flash fly-by, and drive-over. It includes shot transitions, a montage director, bookmarks, hotkeys, and a compact panel. Replay cars use the same vehicle camera hook as live cars.

Version 0.1.10 adds **Flash Fly-By** and **Drive-Over Cam**, raises Low Chase, and corrects follow-camera lag. Montage favors varied front, side, orbit, aerial and pass shots; rear chase appears at most once in four shots. **F4** hides the window for OBS and F11 remains available for fullscreen. Version 0.1.6 was exercised against the actual PolyTrack/PML 0.6.3 bundle in headless Edge; subsequent changes have been built but not checked in game. See [verification and development](docs/verification.md) and [architecture notes](docs/architecture.md).

## Install

**PolyModLoader import URL:** [`https://cdn.polymodloader.com/gh/michael201110/poly-cam/v0.1.10`](https://cdn.polymodloader.com/gh/michael201110/poly-cam/v0.1.10)

Remove the earlier Poly-Cam entry, then copy that URL into PolyModLoader's **Add mod** URL field and relaunch the game. This points at the `v0.1.10` release branch for PolyTrack 0.6.3. See [full installation instructions](docs/installation.md).

Start a run, then click **OFF** in the panel to turn it **ON**, or press **F6**. Choose a mode from the dropdown. The status should read **Camera connected**. Click **−** to minimize and **+** to expand.

Press **F4** to completely hide the window for OBS; press **F4** again to restore its previous minimized/expanded state. Camera and montage keep running. This shortcut controls the Poly-Cam window; F9 controls Clean Capture and the game HUD. F11 controls browser fullscreen.

For automatic shots, click **Montage** or press **F8** and leave **Montage pace** on **Cinematic**. Choose a camera manually to pause the director.

Select **Flash Fly-By** for a stationary view across the road as the car flashes past. **Drive-Over Cam** places a wide-angle camera at road level, looking up toward the approaching car. Both keep their direction fixed during a pass and prepare another position afterward. Drive-Over works best on a straight, level section.

## Controls

| Key | Action |
| --- | --- |
| F6 | Enable or restore Poly-Cam |
| F7 | Next camera rig |
| Shift+F7 | Previous camera rig |
| F8 | Toggle Montage Mode |
| F9 | Toggle Clean Capture (emergency restore) |
| F10 | Enter or leave freecam |
| F4 | Completely hide/show the Poly-Cam window for OBS |
| WASD | Move in freecam |
| Space / Ctrl | Move up / down in freecam |
| Shift / Alt | Fast / precise freecam movement |
| Mouse drag | Look while freecam is active |
| Wheel | Change freecam speed |
| Escape | Leave freecam and restore the cursor |

The panel includes controls for mode selection, FOV, trackside placement, bookmarks, and the optional JSON shot timeline. See [camera modes](docs/camera-modes.md).

## Scope and limitations

- PML camera hook currently targets PolyTrack 0.6.3.
- Rigs track each rendered car through PolyTrack's public car getters. This supports live driving and whichever car camera the game selects during replay playback.
- PolyTrack's separate spectator/free camera bypasses the vehicle camera hook; switch back to the car orbit/cockpit camera before enabling Poly-Cam.
- Trackside placement is world-space and can be composed with freecam; Poly-Cam does not search track geometry.
- Clean Capture hides Poly-Cam's panel and cursor, and uses PolyTrack 0.6.3's native H UI toggle. F9 toggles the HUD back on. It does not permanently remove game UI.
- Automated game checks cover startup, all ten rigs, panel controls, native camera restore and track changes. Replay playback and coexistence with other mods still need separate checks.

## License

MIT. PolyTrack and PolyModLoader remain their respective owners' projects.
