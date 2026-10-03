import { clamp, localPoint } from "./math.js";

export const MODES = [
    "Cinematic Chase", "Low Chase", "Front Chase", "Side Tracking", "Orbit Cam",
    "Drone Cam", "Trackside Cam", "Fly-By Cam", "Vehicle Mount", "Freecam"
];

const point = (x = 0, y = 0, z = 0) => ({ x, y, z });

export class CameraRig {
    constructor(name) { this.name = name; }
    compose(context, runtime, out) { return out; }
}

export class ChaseRig extends CameraRig {
    constructor(low = false) { super(low ? "Low Chase" : "Cinematic Chase"); this.low = low; }
    compose({ position, quaternion, speed }, runtime, out) {
        const speedScale = clamp(speed / 220, 0, 1);
        const distance = this.low ? 7 + speedScale * 1.3 : 8.5;
        const height = this.low ? 0.85 : 2.15;
        localPoint(out.position, position, quaternion, this.low ? 0.18 : 0.25, height, -distance);
        localPoint(out.target, position, quaternion, 0, this.low ? 0.55 : 1.1, 3.4 + speedScale * 2.5);
        out.fov = runtime.fov + (this.low ? 7 : 0) + Math.min(5, speedScale * 4);
        out.positionSharpness = this.low ? 5.5 : 3.4;
        out.targetSharpness = 6;
        out.rotationSharpness = 7;
        return out;
    }
}

export class FrontChaseRig extends CameraRig {
    constructor() { super("Front Chase"); }
    compose({ position, quaternion }, runtime, out) {
        localPoint(out.position, position, quaternion, 0, 2.2, 9);
        localPoint(out.target, position, quaternion, 0, 1, -0.4);
        out.fov = runtime.fov; out.positionSharpness = 3; out.targetSharpness = 7; out.rotationSharpness = 7;
        return out;
    }
}

export class SideTrackingRig extends CameraRig {
    constructor() { super("Side Tracking"); }
    compose({ position, quaternion }, runtime, out) {
        localPoint(out.position, position, quaternion, runtime.side * 8, 2.2, runtime.longitudinal);
        localPoint(out.target, position, quaternion, 0, 0.9, 0.3);
        out.fov = runtime.fov; out.positionSharpness = 3; out.targetSharpness = 6; out.rotationSharpness = 7;
        return out;
    }
}

export class OrbitRig extends CameraRig {
    constructor() { super("Orbit Cam"); }
    compose({ position, quaternion, dt }, runtime, out) {
        runtime.orbitAngle += dt * runtime.orbitSpeed * runtime.orbitDirection;
        const x = Math.sin(runtime.orbitAngle) * runtime.orbitRadius;
        const z = Math.cos(runtime.orbitAngle) * runtime.orbitRadius;
        localPoint(out.position, position, quaternion, x, runtime.orbitHeight, z);
        localPoint(out.target, position, quaternion, 0, 1, 0);
        out.fov = runtime.fov; out.positionSharpness = 2.3; out.targetSharpness = 4; out.rotationSharpness = 5;
        return out;
    }
}

export class DroneRig extends CameraRig {
    constructor() { super("Drone Cam"); }
    compose({ position, quaternion }, runtime, out) {
        localPoint(out.position, position, quaternion, 0, runtime.droneAltitude, -5);
        localPoint(out.target, position, quaternion, 0, 0.9, 2);
        out.fov = runtime.fov; out.positionSharpness = 1.6; out.targetSharpness = 4.5; out.rotationSharpness = 4;
        return out;
    }
}

export class TracksideRig extends CameraRig {
    constructor() { super("Trackside Cam"); }
    compose({ position }, runtime, out) {
        if (!runtime.tracksidePlaced) {
            runtime.trackside.x = position.x + 12; runtime.trackside.y = position.y + 4; runtime.trackside.z = position.z + 18;
            runtime.tracksideLook.x = position.x; runtime.tracksideLook.y = position.y + 0.75; runtime.tracksideLook.z = position.z;
            runtime.tracksidePlaced = true;
        }
        out.position.x = runtime.trackside.x; out.position.y = runtime.trackside.y; out.position.z = runtime.trackside.z;
        if (runtime.tracksideFixed) {
            out.target.x = runtime.tracksideLook.x; out.target.y = runtime.tracksideLook.y; out.target.z = runtime.tracksideLook.z;
        } else {
            out.target.x = position.x; out.target.y = position.y + 0.75; out.target.z = position.z;
        }
        out.fov = runtime.fov; out.positionSharpness = 100;
        out.targetSharpness = runtime.tracksideFixed ? 100 : runtime.panSharpness;
        out.rotationSharpness = runtime.tracksideFixed ? 100 : runtime.panSharpness;
        return out;
    }
}

export class FlyByRig extends CameraRig {
    constructor() { super("Fly-By Cam"); }
    compose({ position, quaternion, dt }, runtime, out) {
        runtime.flybyClock += dt;
        const phase = runtime.flybyClock % 7;
        if (phase < 0.12 || runtime.flybyAnchor === null) {
            localPoint(runtime.flybyAnchor = runtime.flybyAnchor || point(), position, quaternion, runtime.flybySide * 5, 2.8, runtime.flybyDistance);
        }
        out.position.x = runtime.flybyAnchor.x; out.position.y = runtime.flybyAnchor.y; out.position.z = runtime.flybyAnchor.z;
        out.target.x = position.x; out.target.y = position.y + 0.7; out.target.z = position.z;
        out.fov = runtime.fov - 8; out.positionSharpness = 100;
        out.targetSharpness = phase > 4.8 ? 1.8 : 8; out.rotationSharpness = phase > 4.8 ? 2.5 : 9;
        return out;
    }
}

export class VehicleMountRig extends CameraRig {
    constructor() { super("Vehicle Mount"); }
    compose({ position, quaternion }, runtime, out) {
        const mounts = {
            "Front bumper": [0, 0.55, 2.3], "Rear bumper": [0, 0.65, -2.2],
            "Bonnet": [0, 1.05, 0.8], "Roof": [0, 1.85, 0.2],
            "Front-left wheel": [-0.75, 0.15, 1.2], "Front-right wheel": [0.75, 0.15, 1.2],
            "Rear wheel": [0.72, 0.18, -1.35]
        };
        const offset = mounts[runtime.mount] || mounts.Roof;
        localPoint(out.position, position, quaternion, offset[0], offset[1], offset[2]);
        localPoint(out.target, position, quaternion, 0, 0.7, 2.6);
        out.fov = runtime.fov; out.positionSharpness = 9; out.targetSharpness = 8; out.rotationSharpness = 8;
        return out;
    }
}

export class FreecamRig extends CameraRig {
    constructor() { super("Freecam"); }
    compose(context, runtime, out) {
        out.position.x = runtime.freePosition.x; out.position.y = runtime.freePosition.y; out.position.z = runtime.freePosition.z;
        if (runtime.freeLookAt) {
            out.target.x = context.position.x; out.target.y = context.position.y + 0.8; out.target.z = context.position.z;
        } else {
            const e = runtime.freeEuler;
            out.target.x = out.position.x - Math.sin(e.y) * Math.cos(e.x);
            out.target.y = out.position.y + Math.sin(e.x);
            out.target.z = out.position.z - Math.cos(e.y) * Math.cos(e.x);
        }
        out.fov = runtime.fov; out.positionSharpness = 100; out.targetSharpness = runtime.freeLookAt ? 5 : 100; out.rotationSharpness = 100;
        return out;
    }
}

export const createRigs = () => [
    new ChaseRig(), new ChaseRig(true), new FrontChaseRig(), new SideTrackingRig(),
    new OrbitRig(), new DroneRig(), new TracksideRig(), new FlyByRig(),
    new VehicleMountRig(), new FreecamRig()
];
