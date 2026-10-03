# Verification and development

## Automated checks

Install dependencies and build the committed release entry:

```powershell
npm ci
npm run build
npm test
```

The lifecycle check reproduces PML's source replacement: run `preInit`, execute the patched game function to create classes, then run `init`. It verifies the camera callbacks are installed before class creation and preserve native method execution. Other checks cover bundled imports, vehicle direction, and freecam direction.

## Real game smoke check

The game check uses the actual PolyModLoader 0.6.3 checkout, including its PolyTrack game assets. These assets are not distributed with Poly-Cam. Point the script at your checkout and an installed Chromium browser:

```powershell
$env:POLYCAM_PML_ROOT = 'C:\path\to\PolyModLoader'
$env:POLYCAM_BROWSER = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:game
```

It serves the checkout locally, loads the built mod through PML's normal import lifecycle, and runs headless Edge with software rendering. The test substitutes a local URL for the checkout's official `PolyTypes.js` file. Screenshots go into the ignored `artifacts/` directory.

For v0.1.6, the game checks passed for:

- Startup and a connected car camera.
- All ten rigs and correct front/chase positioning.
- Left/right side tracking and rendered FOV projection.
- Freecam keyboard movement and mouse dragging.
- Bookmark saving/restoring, timeline playback, and montage switching.
- Panel minimize/expand and clean capture/restore.
- Native camera position, rotation, and FOV after disabling.
- Loading the next track, live driving, and native cockpit selection.
- No vehicle transform, speed, or car-state changes inside the camera callback.

Replay playback, other mods, mobile/touch use, and later game versions are outside this automated check.

Version 0.1.7 replaces the montage director and adjusts shot framing. It has been built successfully; the checks listed above describe v0.1.6, not a new game check of the montage changes.

Version 0.1.8 adds the F11 window visibility shortcut and has been built successfully. The shortcut has not been checked in game.

Version 0.1.9 moves window visibility to F4, using a new binding ID so PML ignores the previous shortcut's saved F11 assignment. The build succeeded; the shortcut has not been checked in game.
