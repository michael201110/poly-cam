import { clamp, finiteVector, smoothstep } from "./math.js";
import { MODES, createRigs } from "./rigs.js";
import { InputController } from "./input.js";
import { UIController } from "./ui.js";
import { ShotDirector, MONTAGE_PACES } from "./shot-director.js";
import { readRoadSurface } from "./pass-shots.js";

const STORAGE_KEY = "poly-cam.v1";

function translateFrame(value, x, y, z) {
    if (!value) return;
    value.x += x; value.y += y; value.z += z;
}

function runtimeState() {
    return {
        initialized: false, fov: 72,
        side: 1, longitudinal: 0, orbitAngle: 0, orbitRadius: 11, orbitHeight: 3,
        orbitSpeed: 0.35, orbitDirection: 1, droneAltitude: 13,
        trackside: { x: 0, y: 0, z: 0 }, tracksideLook: { x: 0, y: 0, z: 0 }, tracksidePlaced: false, tracksideFixed: false, panSharpness: 4,
        flybyClock: 0, flybyAnchor: null, flybyDistance: 32, flybySide: 1,
        mount: "Roof", freePosition: { x: 0, y: 4, z: 10 }, freeEuler: { x: -0.1, y: 0 }, freeLookAt: false,
        previousSpeed: 0, acceleration: 0, previousPosition: { x: 0, y: 0, z: 0 },
        previousQuaternion: null, shotTime: 0, transition: null,
        lastFov: null, goalQuaternion: null, priorQuaternion: null,
        output: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 72, positionSharpness: 4, targetSharpness: 4, rotationSharpness: 5 },
        smoothPosition: { x: 0, y: 0, z: 0 }, smoothTarget: { x: 0, y: 0, z: 0 },
        directorState: null, montageShot: null,
        surface: { position: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } },
        context: { position: null, quaternion: null, speed: 0, previousSpeed: 0, acceleration: 0, dt: 0 }
    };
}

export class PolyCam {
    constructor() {
        this.enabled = false;
        this.montage = false;
        this.cleanCapture = false;
        this.rigs = createRigs();
        this.runtimes = new WeakMap();
        this.nativeCameras = new Map();
        this.bookmarks = [];
        this.timeline = [];
        this.timelineState = { playing: false, loop: false, time: 0, index: 0 };
        this.ui = new UIController(this);
        this.input = new InputController(this);
        this.baseFov = 72;
        this.side = 1;
        this.mount = "Roof";
        this.restoreSerial = 0;
        this.activationSerial = 0;
        this.pendingBookmark = null;
        this.lastShotAt = 0;
        this.directorSeed = 0x51f15e;
        this.director = new ShotDirector(() => this.random());
        this.montagePace = "Cinematic";
        this.montageSerial = 0;
        this.transitionMode = "BLEND";
        this.fixedTracksideOrientation = false;
        this.cameraHookSeen = false;
        this.cameraHookErrorLogged = false;
    }

    initialize(pml) {
        this.pml = pml;
        globalThis.__polyCamControllerV1 = this;
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
            this.bookmarks = Array.isArray(saved.bookmarks) ? saved.bookmarks : [];
            this.directorSeed = Number.isInteger(saved.seed) ? saved.seed >>> 0 : this.directorSeed;
            if (Object.hasOwn(MONTAGE_PACES, saved.pace)) this.montagePace = saved.pace;
        } catch { /* persistent storage may be unavailable */ }
        this.input.initialize(pml);
    }

    mountUI() { this.ui.mount(); }
    get mode() { return this.rigs[this.modeIndex]?.name || MODES[0]; }
    get modeIndex() { return this._modeIndex || 0; }
    set modeIndex(value) { this._modeIndex = (value + this.rigs.length) % this.rigs.length; }

    random() {
        let x = this.directorSeed >>> 0;
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        this.directorSeed = x >>> 0;
        return this.directorSeed / 4294967296;
    }

    setMode(index, { directed = false } = {}) {
        this.modeIndex = index;
        if (!directed && this.montage) { this.montage = false; this.montageSerial++; }
        this.lastShotAt = performance.now();
        this.ui.refresh();
    }

    nextMode(direction = 1) { this.setMode(this.modeIndex + direction); }
    toggleEnabled() {
        this.enabled = !this.enabled;
        if (this.enabled) this.activationSerial++;
        else { this.restoreNativeCameras(); this.input.keys.clear(); }
        this.ui.refresh();
    }
    toggleMontage() {
        this.montage = !this.montage;
        this.montageSerial++;
        if (this.montage) {
            this.timelineState.playing = false;
            this.input.keys.clear();
            if (this.mode === "Freecam") this.setMode(0, { directed: true });
            if (!this.enabled) this.toggleEnabled();
        }
        this.ui.refresh();
    }
    setMontagePace(pace) { if (!Object.hasOwn(MONTAGE_PACES, pace)) return; this.montagePace = pace; this.montageSerial++; this.persist(); this.ui.refresh(); }
    toggleCleanCapture() { this.cleanCapture = !this.cleanCapture; this.ui.setClean(this.cleanCapture); }

    selectCamera(camera) {
        this.selectedCamera = camera;
        if (camera !== this.activeCar?.cameraOrbit && camera !== this.activeCar?.cameraCockpit) {
            this.ui.setHookStatus("Waiting for a car camera");
            this.ui.lastCamera = null;
            this.ui.activeRuntime = null;
        }
    }

    handleCameraUpdate(car, dt) {
        if (car?.cameraOrbit !== this.selectedCamera && car?.cameraCockpit !== this.selectedCamera) return;
        this.cameraHookSeen = true;
        this.activeCar = car;
        this.ui.setHookStatus("Camera connected");
        this.ui.lastCamera = car.cameraOrbit;
        if (!this.enabled) return;
        if (!car?.cameraOrbit || typeof car.getPosition !== "function") {
            this.ui.setHookStatus("Camera target unavailable");
            return;
        }
        try {
            this.updateVehicleCamera(car, dt);
        } catch (error) {
            this.ui.setHookStatus("Camera error — see console");
            if (!this.cameraHookErrorLogged) {
                this.cameraHookErrorLogged = true;
                console.error("[Poly-Cam] Camera update failed:", error);
            }
        }
    }

    captureNativeCamera(camera) {
        if (!camera) return;
        let snapshot = this.nativeCameras.get(camera);
        if (!snapshot) {
            snapshot = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov };
            this.nativeCameras.set(camera, snapshot);
        } else { snapshot.position.copy(camera.position); snapshot.quaternion.copy(camera.quaternion); snapshot.fov = camera.fov; }
    }

    restoreNativeCameras() {
        for (const [camera, snapshot] of this.nativeCameras) {
            camera.position.copy(snapshot.position); camera.quaternion.copy(snapshot.quaternion); camera.fov = snapshot.fov;
            camera.updateProjectionMatrix(); camera.updateMatrix();
        }
        this.nativeCameras.clear();
    }

    updateVehicleCamera(car, dt) {
        if (!this.enabled) return;
        const camera = car.cameraOrbit;
        if (!camera || typeof car.getPosition !== "function") return;
        if (!car.hasFinished?.() || !this.nativeCameras.has(camera)) {
            this.captureNativeCamera(camera);
            this.captureNativeCamera(car.cameraCockpit);
        }
        let rt = this.runtimes.get(car);
        if (!rt) { rt = runtimeState(); this.runtimes.set(car, rt); }
        const position = car.getPosition();
        const quaternion = car.getQuaternion();
        const speed = Number(car.getSpeedKmh()) || 0;
        const now = performance.now();
        const step = clamp(Number(dt) > 0 ? Number(dt) : (now - (rt.lastUpdateAt ?? now)) / 1000, 0, 0.1);
        rt.lastUpdateAt = now;
        const context = rt.context;
        context.position = position; context.quaternion = quaternion; context.speed = speed; context.dt = step;
        const carState = car.getCarState?.();
        context.contactCount = readRoadSurface(carState, rt.surface);
        context.surface = rt.surface;
        context.steering = Number(carState?.steering) || 0;
        const runReset = Number.isFinite(carState?.frames) && Number.isFinite(rt.lastCarFrame) && carState.frames < rt.lastCarFrame;
        rt.lastCarFrame = carState?.frames;

        if (!rt.initialized) {
            rt.initialized = true;
            rt.lastFov = camera.fov;
            rt.currentFov = camera.fov;
            rt.previousSpeed = speed;
            rt.smoothPosition.x = camera.position.x; rt.smoothPosition.y = camera.position.y; rt.smoothPosition.z = camera.position.z;
            rt.smoothTarget.x = position.x; rt.smoothTarget.y = position.y; rt.smoothTarget.z = position.z;
            rt.goalQuaternion = camera.quaternion.clone(); rt.priorQuaternion = camera.quaternion.clone();
            rt.previousPosition.x = position.x; rt.previousPosition.y = position.y; rt.previousPosition.z = position.z;
            rt.previousQuaternion = quaternion.clone();
        }

        const carDx = position.x - rt.previousPosition.x, carDy = position.y - rt.previousPosition.y, carDz = position.z - rt.previousPosition.z;
        let rebased = false;
        const resetDistance = Math.max(20, speed / 3.6 * step * 4);
        if (runReset || rt.activationSerial !== this.activationSerial || carDx * carDx + carDy * carDy + carDz * carDz > resetDistance * resetDistance) {
            rebased = true;
            const reactivated = rt.activationSerial !== this.activationSerial;
            rt.smoothPosition.x = camera.position.x; rt.smoothPosition.y = camera.position.y; rt.smoothPosition.z = camera.position.z;
            rt.smoothTarget.x = position.x; rt.smoothTarget.y = position.y; rt.smoothTarget.z = position.z;
            rt.transition = null; rt.lastMode = this.modeIndex; rt.flybyAnchor = null;
            rt.activationSerial = this.activationSerial;
            rt.priorQuaternion.copy(camera.quaternion);
            rt.currentFov = camera.fov;
            rt.directorState = null; rt.montageShot = null;
            rt.passPlacement = null; rt.passElapsed = 0;
            rt.previousPosition.x = position.x; rt.previousPosition.y = position.y; rt.previousPosition.z = position.z;
            rt.previousQuaternion.copy(quaternion); rt.previousSpeed = speed;
            if (reactivated && this.mode === "Freecam") {
                rt.freePosition.x = camera.position.x; rt.freePosition.y = camera.position.y; rt.freePosition.z = camera.position.z;
                camera.rotation.setFromQuaternion(camera.quaternion, "YXZ");
                rt.freeEuler.x = camera.rotation.x; rt.freeEuler.y = camera.rotation.y;
            }
        }

        this.ui.activeRuntime = rt;
        this.ui.lastCamera = camera;
        rt.fov = this.baseFov;
        rt.side = this.side;
        rt.mount = this.mount;

        let restoringBookmark = false;
        if (this.pendingBookmark && rt.restoreSerial !== this.restoreSerial) {
            restoringBookmark = true;
            const mark = this.pendingBookmark;
            rt.freePosition.x = mark.position.x; rt.freePosition.y = mark.position.y; rt.freePosition.z = mark.position.z;
            const q = mark.quaternion;
            rt.freeEuler.y = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.x * q.x + q.y * q.y));
            rt.freeEuler.x = Math.asin(clamp(2 * (q.w * q.x - q.z * q.y), -1, 1));
            rt.fov = mark.fov;
            this.baseFov = mark.fov;
            rt.restoreSerial = this.restoreSerial;
        }

        const previousSpeed = rt.previousSpeed;
        rt.acceleration = step > 0 ? (speed - rt.previousSpeed) / step : 0;
        rt.previousSpeed = speed;
        context.previousSpeed = previousSpeed;
        context.acceleration = rt.acceleration;
        rt.shotTime += step;
        this.advanceTimeline(step);
        rt.shotChanged = false;
        if (this.montage && !this.timelineState.playing) this.directMontage(rt, context);
        else rt.montageShot = null;

        const rig = this.rigs[this.modeIndex];
        // Carry the smoothed frame by the car's actual displacement. Damping
        // then applies to relative framing, so speed cannot accumulate a gap.
        if (!rebased && rt.followedVehicle && rig.followsVehicle) {
            translateFrame(rt.smoothPosition, carDx, carDy, carDz);
            translateFrame(rt.smoothTarget, carDx, carDy, carDz);
            translateFrame(rt.renderPosition, carDx, carDy, carDz);
            if (rt.transition) { rt.transition.fromX += carDx; rt.transition.fromY += carDy; rt.transition.fromZ += carDz; }
        }

        if (rt.lastMode !== this.modeIndex || rt.shotChanged) {
            const from = rt.renderPosition || camera.position;
            const dx = from.x - rt.smoothPosition.x, dy = from.y - rt.smoothPosition.y, dz = from.z - rt.smoothPosition.z;
            const transition = rt.montageShot?.transition || this.transitionMode;
            rt.transition = !rig.locked && transition === "BLEND" && dx * dx + dy * dy + dz * dz <= 2500
                ? { fromX: from.x, fromY: from.y, fromZ: from.z, elapsed: 0 }
                : null;
            if (!rt.transition) {
                rt.cutPending = true;
                rt.smoothPosition.x = camera.position.x; rt.smoothPosition.y = camera.position.y; rt.smoothPosition.z = camera.position.z;
            }
            rt.lastMode = this.modeIndex;
            rt.flybyAnchor = null;
            rt.passPlacement = null; rt.passElapsed = 0;
            if (this.mode === "Freecam" && !restoringBookmark) {
                rt.freePosition.x = from.x; rt.freePosition.y = from.y; rt.freePosition.z = from.z;
                camera.rotation.setFromQuaternion(rt.priorQuaternion, "YXZ");
                rt.freeEuler.x = camera.rotation.x; rt.freeEuler.y = camera.rotation.y;
            }
        }

        if (this.mode === "Freecam") this.input.stepFreecam(rt, step);
        const out = rig.compose(context, rt, rt.output);
        if (rt.transition && Math.hypot(out.position.x - rt.transition.fromX, out.position.y - rt.transition.fromY, out.position.z - rt.transition.fromZ) > 25) {
            rt.transition = null; rt.cutPending = true;
        }
        const cutCamera = rt.cutPending;
        if (rt.cutPending || rig.locked) {
            rt.smoothPosition.x = out.position.x; rt.smoothPosition.y = out.position.y; rt.smoothPosition.z = out.position.z;
            rt.smoothTarget.x = out.target.x; rt.smoothTarget.y = out.target.y; rt.smoothTarget.z = out.target.z;
            rt.cutPending = false;
        }
        if (this.mode === "Freecam" && rt.restoreSerial === this.restoreSerial && this.pendingBookmark) {
            out.position.x = rt.freePosition.x; out.position.y = rt.freePosition.y; out.position.z = rt.freePosition.z;
        }
        const alphaPos = 1 - Math.exp(-out.positionSharpness * step);
        const alphaTarget = 1 - Math.exp(-out.targetSharpness * step);
        rt.smoothPosition.x += (out.position.x - rt.smoothPosition.x) * alphaPos;
        rt.smoothPosition.y += (out.position.y - rt.smoothPosition.y) * alphaPos;
        rt.smoothPosition.z += (out.position.z - rt.smoothPosition.z) * alphaPos;
        rt.smoothTarget.x += (out.target.x - rt.smoothTarget.x) * alphaTarget;
        rt.smoothTarget.y += (out.target.y - rt.smoothTarget.y) * alphaTarget;
        rt.smoothTarget.z += (out.target.z - rt.smoothTarget.z) * alphaTarget;
        if (rig.followsVehicle) {
            const dx = rt.smoothPosition.x - out.position.x, dy = rt.smoothPosition.y - out.position.y, dz = rt.smoothPosition.z - out.position.z;
            const error = Math.hypot(dx, dy, dz);
            const maximum = this.modeIndex === 8 ? 1 : this.modeIndex === 5 ? 4 : 3;
            if (error > maximum) {
                rt.smoothPosition.x = out.position.x + dx * maximum / error;
                rt.smoothPosition.y = out.position.y + dy * maximum / error;
                rt.smoothPosition.z = out.position.z + dz * maximum / error;
            }
        }
        if (!finiteVector(rt.smoothPosition) || !finiteVector(rt.smoothTarget)) return;

        if (rt.transition) {
            rt.transition.elapsed += step;
            const t = smoothstep(clamp(rt.transition.elapsed / 0.45, 0, 1));
            camera.position.set(rt.transition.fromX + (rt.smoothPosition.x - rt.transition.fromX) * t, rt.transition.fromY + (rt.smoothPosition.y - rt.transition.fromY) * t, rt.transition.fromZ + (rt.smoothPosition.z - rt.transition.fromZ) * t);
            if (t >= 1) rt.transition = null;
        } else camera.position.set(rt.smoothPosition.x, rt.smoothPosition.y, rt.smoothPosition.z);

        camera.lookAt(rt.smoothTarget.x, rt.smoothTarget.y, rt.smoothTarget.z);
        rt.goalQuaternion.copy(camera.quaternion);
        const rotationSharpness = rig.followsVehicle ? Math.max(out.rotationSharpness, 10 + clamp(speed / 60, 0, 5)) : out.rotationSharpness;
        const alphaRot = 1 - Math.exp(-rotationSharpness * step);
        if (cutCamera || rig.locked) rt.priorQuaternion.copy(rt.goalQuaternion);
        else rt.priorQuaternion.slerp(rt.goalQuaternion, alphaRot);
        camera.quaternion.copy(rt.priorQuaternion);
        const fov = clamp(out.fov, 25, 110);
        rt.currentFov = cutCamera || rig.locked ? fov : rt.currentFov + (fov - rt.currentFov) * (1 - Math.exp(-2.5 * step));
        camera.fov = rt.currentFov;
        // The native update rebuilt its projection before this hook. Rebuild ours
        // even when our smoothed FOV is unchanged from the preceding frame.
        camera.updateProjectionMatrix();
        rt.lastFov = camera.fov;
        camera.updateMatrix();
        if (!rt.renderPosition) rt.renderPosition = camera.position.clone();
        else rt.renderPosition.copy(camera.position);

        const cockpit = car.cameraCockpit;
        if (cockpit && cockpit !== camera) {
            cockpit.position.copy(camera.position);
            cockpit.quaternion.copy(camera.quaternion);
            cockpit.fov = camera.fov;
            cockpit.updateProjectionMatrix();
            cockpit.updateMatrix();
        }
        rt.previousQuaternion.copy(quaternion);
        rt.followedVehicle = rig.followsVehicle;
        rt.previousPosition.x = position.x; rt.previousPosition.y = position.y; rt.previousPosition.z = position.z;
        this.ui.lastCamera = camera;
        this.ui.activeRuntime = rt;

    }

    directMontage(rt, context) {
        if (rt.montageSerial !== this.montageSerial) {
            rt.directorState = null; rt.montageShot = null;
            rt.montageSerial = this.montageSerial;
        }
        const shot = this.director.update(rt, context, { mode: this.modeIndex, pace: this.montagePace });
        const changed = shot !== rt.montageShot;
        rt.montageShot = shot;
        rt.fov = clamp(this.baseFov + shot.fovOffset, 30, 100);
        rt.side = shot.side;
        rt.mount = shot.mount || this.mount;
        if (changed) {
            rt.shotChanged = true;
            this.setMode(shot.mode, { directed: true });
            this.persist();
        }
    }

    advanceTimeline(dt) {
        if (!this.timelineState.playing || !this.timeline.length) return;
        this.timelineState.time += dt;
        while (this.timelineState.index < this.timeline.length && this.timeline[this.timelineState.index].time <= this.timelineState.time) {
            const item = this.timeline[this.timelineState.index++];
            if (Number.isInteger(item.mode)) this.setMode(item.mode);
            else { const i = MODES.findIndex((name) => name.toLowerCase() === String(item.mode).toLowerCase()); if (i >= 0) this.setMode(i); }
        }
        if (this.timelineState.index >= this.timeline.length) {
            if (this.timelineState.loop) { this.timelineState.time = 0; this.timelineState.index = 0; }
            else { this.timelineState.playing = false; this.ui.refresh(); }
        }
    }

    toggleTimeline() {
        if (!this.timeline.length) return;
        if (this.timelineState.index >= this.timeline.length) this.resetTimeline();
        this.timelineState.playing = !this.timelineState.playing;
        if (this.timelineState.playing) { this.montage = false; if (!this.enabled) this.toggleEnabled(); }
        this.ui.refresh();
    }
    resetTimeline() { this.timelineState.time = 0; this.timelineState.index = 0; }
    loadTimeline(json) {
        const parsed = JSON.parse(json);
        if (!Array.isArray(parsed)) throw new Error("Timeline must be a JSON array.");
        this.timeline = parsed.map((item) => {
            if (!item || !Number.isFinite(item.time) || item.time < 0) throw new Error("Each shot needs a non-negative time in seconds.");
            const mode = Number.isInteger(item.mode) ? item.mode : MODES.findIndex(name => name.toLowerCase() === String(item.mode).toLowerCase());
            if (mode < 0 || mode >= MODES.length) throw new Error(`Unknown camera mode: ${item.mode}`);
            return { time: item.time, mode };
        }).sort((a, b) => a.time - b.time);
        this.resetTimeline();
    }

    saveBookmark(name = `Camera ${this.bookmarks.length + 1}`) {
        const record = this.ui.lastCamera;
        if (!record) return;
        this.bookmarks.push({ name, mode: this.mode, position: { x: record.position.x, y: record.position.y, z: record.position.z }, quaternion: { x: record.quaternion.x, y: record.quaternion.y, z: record.quaternion.z, w: record.quaternion.w }, fov: record.fov });
        this.persist(); this.ui.refresh();
    }

    restoreBookmark(index) {
        const mark = this.bookmarks[index]; if (!mark) return;
        this.pendingBookmark = mark;
        this.restoreSerial++;
        if (!this.enabled) this.toggleEnabled();
        this.montage = false;
        this.timelineState.playing = false;
        this.setMode(9);
    }

    persist() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ bookmarks: this.bookmarks, seed: this.directorSeed, pace: this.montagePace })); } catch { /* storage may be blocked */ }
    }

    dispose() {
        this.enabled = false; this.cleanCapture = false;
        this.restoreNativeCameras();
        if (globalThis.__polyCamControllerV1 === this) delete globalThis.__polyCamControllerV1;
        this.input.dispose(); this.ui.dispose(); this.persist();
    }
}
