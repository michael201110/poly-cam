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

Montage Mode chooses framing from the car's speed, filtered turn rate, acceleration, and estimated jump/landing motion. It mixes follow shots, wide establishing views, roadside passes, and short mount details. Recent rigs and repeated shot families get lower selection weights.

- **Corners:** favors side tracking and an elevated drone view, placing side cameras outside the turn.
- **Fast straights:** mixes low chase, fresh trackside/fly-by shots, and occasional bonnet or wheel details.
- **Roadside passes:** creates a new world-space anchor ahead of the car using its current movement direction and speed. Holds the approach and pass, then changes shots when the car has passed or moved too far away.
- **Shot variations:** changes distance, height, side, mount, and FOV within a rig. Lower FOV gives trackside shots a longer-lens feel. The panel's FOV remains the base setting; montage applies an offset for each shot.
- **Transitions:** uses clean cuts between distant viewpoints and blends between compatible chase views. Your manual transition setting is retained for manual cameras and timelines.
- **Drone:** holds altitude above the car in world space with a level horizon, including during banking or a rollover.

Use **Montage pace** to choose **Cinematic** (default: roughly 4–7 seconds per shot, at least 2.8 seconds), **Balanced** (roughly 3–5 seconds, at least 2.1 seconds), or **Energetic** (roughly 2.5–4 seconds, at least 1.4 seconds). Idle shots hold longer, mount details are shorter, and action cues can change a shot after the minimum hold. A badly framed roadside shot or rollover may trigger an earlier recovery cut. Manually selecting a camera or pressing F7 pauses montage; F8 starts it again. Pace is saved between sessions.

Shot choices use a persisted xorshift seed in `localStorage` key `poly-cam.v1`. The current car API does not expose authoritative contact or landing flags, so those events are estimated. Automatic placement does not inspect track geometry or guarantee an unobstructed view; manually placed trackside cameras remain available when you need exact composition.

The timeline is a JSON array with `time` (seconds) and `mode` (mode name or numeric mode index), for example:

```json
[{"time":0,"mode":"Trackside Cam"},{"time":2.2,"mode":"Low Chase"},{"time":4.8,"mode":"Drone Cam"}]
```

Load, play, pause, and reset it from the panel. Use **Loop timeline** to repeat playback. Montage and timeline play enable Poly-Cam automatically.
