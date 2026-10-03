# Camera modes

- **Cinematic Chase:** smooth trailing shot with speed-aware look-ahead and moderate FOV.
- **Low Chase:** raised trailing framing, about 1.55 units above the car origin, with a closer following distance and less extreme FOV.
- **Front Chase:** camera ahead of the vehicle looking back.
- **Side Tracking:** lateral follow shot. Click the panel's **Right / Left** button to switch sides.
- **Orbit Cam:** slow orbit around the vehicle.
- **Drone Cam:** elevated follow shot with slower position response.
- **Trackside Cam:** fixed camera position, smooth pan to the car. First activation chooses a point near the car; enter freecam and choose **Place Trackside** to place it precisely.
- **Fly-By Cam:** camera waits ahead of the vehicle, pans through the pass, and settles after it.
- **Vehicle Mount:** local presets include front/rear bumper, bonnet, roof, and wheel positions.
- **Freecam:** manual camera movement. Click and drag to look; controls are listed in the README.
- **Flash Fly-By:** stationary camera beside the predicted path, looking across the road. Its position and direction remain fixed as the car flashes through the frame. It prepares another position after the pass.
- **Drive-Over Cam:** stationary wide-angle camera placed about six centimetres above the current road plane, directly on the predicted path. Looks back and up toward the approaching car so it passes overhead. Uses public wheel-contact points/normals for placement; best on straight, level road. It prepares another position after the pass. Original mode indices 0–9 are retained; Flash Fly-By and Drive-Over are indices 10 and 11.

FOV is adjustable from the panel. The chase rigs add a small speed response. Follow cameras carry their position and target by the car's movement, then smooth changes in relative framing. They also limit positional lag and increase rotation response at speed. This prevents the car from pulling away as speed rises. Distant mode changes skip position blending to avoid giant camera sweeps. The two fixed pass modes snap to their position and keep a fixed direction throughout each pass.

## Montage and timeline

Montage Mode chooses framing from speed, filtered turn rate, steering, acceleration, and wheel contacts. It starts with a front, side, orbit, aerial or pass shot. Rear chase appears at most once in every four shots, with shorter holds. Adjacent shots use different shot families; recent rigs get lower selection weights.

- **Corners:** mixes side, front, orbit and elevated drone views, placing side cameras outside the turn.
- **Straights:** mixes fresh trackside, panning fly-by, flash fly-by and drive-over shots with front, side, orbit, drone and occasional mount details. Drive-over selection requires at least three wheel contacts and a near-level, straight path.
- **Roadside passes:** creates a fresh world-space anchor ahead of the car using its movement direction, speed and current contact plane. Cuts shortly after the pass rather than holding a distant car. If a drive-over path is missed, the director changes shots.
- **Orbits and drones:** orbit shots begin near the front/side and sweep through a broader arc. Drone framing stays closer to the car.
- **Shot variations:** changes distance, height, side, mount, and FOV within a rig. Lower FOV gives trackside shots a longer-lens feel. The panel's FOV remains the base setting; montage applies an offset for each shot.
- **Transitions:** uses clean cuts between distant viewpoints and blends between compatible chase views. Your manual transition setting is retained for manual cameras and timelines.
- **Drone:** holds altitude above the car in world space with a level horizon, including during banking or a rollover.

Use **Montage pace** to choose **Cinematic** (default: roughly 4–7 seconds for moving shots, at least 2.8 seconds), **Balanced** (roughly 3–5 seconds, at least 2.1 seconds), or **Energetic** (roughly 2.5–4 seconds, at least 1.4 seconds). Idle shots hold longer; rear chase and mount details are shorter. Pass shots use their own shorter timing to show the approach and the car going past, then cut away. A missed pass or rollover may trigger a recovery cut. Manually selecting a camera or pressing F7 pauses montage; F8 starts it again. Pace is saved between sessions.

Shot choices use a persisted xorshift seed in `localStorage` key `poly-cam.v1`. `getCarState().wheelContact` supplies contact positions/normals and helps identify jumps/landings. Motion inference is used if that data is unavailable. Automatic placement projects the current contact plane ahead of the car; it does not inspect upcoming track geometry. Sharp changes of slope or direction can miss a fixed pass shot, so use a straight section for Drive-Over. Manually placed trackside cameras remain available for exact composition.

The timeline is a JSON array with `time` (seconds) and `mode` (mode name or numeric mode index), for example:

```json
[{"time":0,"mode":"Trackside Cam"},{"time":2.2,"mode":"Low Chase"},{"time":4.8,"mode":"Drone Cam"}]
```

Load, play, pause, and reset it from the panel. Use **Loop timeline** to repeat playback. Montage and timeline play enable Poly-Cam automatically.
