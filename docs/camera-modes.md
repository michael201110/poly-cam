# Camera modes

- **Cinematic Chase:** smooth trailing shot with speed-aware look-ahead and moderate FOV.
- **Low Chase:** road-level trailing framing for speed and surface movement.
- **Front Chase:** camera ahead of the vehicle looking back.
- **Side Tracking:** lateral follow shot. Click the panel's **Right / Left** button to switch sides.
- **Orbit Cam:** slow orbit around the vehicle.
- **Drone Cam:** elevated follow shot with slower position response.
- **Trackside Cam:** fixed camera position, smooth pan to the car. First activation chooses a point near the car; enter freecam and choose **Place Trackside** to place it precisely.
- **Fly-By Cam:** camera waits ahead of the vehicle, pans through the pass, and settles after it.
- **Vehicle Mount:** local presets include front/rear bumper, bonnet, roof, and wheel positions.
- **Freecam:** manual camera movement. Click and drag to look; controls are listed in the README.

FOV is adjustable from the panel. The chase rigs add a small speed response. Rotation follows a smoothed look target using quaternion spherical interpolation. Distant mode changes skip position blending to avoid giant camera sweeps.

## Montage and timeline

Montage Mode reacts to speed threshold crossings, acceleration, fast straights, yaw changes, inferred jump/landing motion, recent rig history, and a five-second maximum shot duration. It enforces a 1.5-second minimum shot length to prevent rapid switching. It uses a persisted xorshift seed, which can be reproduced by restoring the stored seed in `localStorage` key `poly-cam.v1`. The current car API does not expose steering or authoritative airborne/landing flags, so those events are estimated from transform changes.

The timeline is a JSON array with `time` (seconds) and `mode` (mode name or numeric mode index), for example:

```json
[{"time":0,"mode":"Trackside Cam"},{"time":2.2,"mode":"Low Chase"},{"time":4.8,"mode":"Drone Cam"}]
```

Load, play, pause, and reset it from the panel. Use **Loop timeline** to repeat playback. Montage and timeline play enable Poly-Cam automatically.
