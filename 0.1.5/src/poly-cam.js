import { clamp, finiteVector, smoothstep } from "./math.js";
import { MODES, createRigs } from "./rigs.js";
import { InputController } from "./input.js";
import { UIController } from "./ui.js";

const STORAGE_KEY = "poly-cam.v1";

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
        history: [], pendingDirectorEvent: null, lastDirectorEvent: null, airborne: false, descending: false,
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
        this.timelineLastUpdateAt = 0;
        this.directorSeed = 0x51f15e;
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

    setMode(index) {
        this.modeIndex = index;
        this.lastShotAt = performance.now();
        this.ui.refresh();
    }

    nextMode(direction = 1) { this.setMode(this.modeIndex + direction); }
    toggleEnabled() { this.enabled = !this.enabled; if (this.enabled) this.activationSerial++; this.ui.refresh(); }
    toggleMontage() { this.montage = !this.montage; this.ui.refresh(); }
    toggleCleanCapture() { this.cleanCapture = !this.cleanCapture; this.ui.setClean(this.cleanCapture); }

    handleCameraUpdate(car, dt) {
        if (!this.cameraHookSeen) {
            this.cameraHookSeen = true;
            this.ui.setHookStatus("Hook: active");
        }
        if (!this.enabled) return;
        if (!car?.cameraOrbit || typeof car.getPosition !== "function") {
            this.ui.setHookStatus("Hook: wrong target");
            return;
        }
        try {
            this.updateVehicleCamera(car, dt);
        } catch (error) {
            this.ui.setHookStatus("Hook: error");
            if (!this.cameraHookErrorLogged) {
                this.cameraHookErrorLogged = true;
                console.error("[Poly-Cam] Camera update failed:", error);
            }
        }
    }

    updateVehicleCamera(car, dt) {
        if (!this.enabled) return;
        const camera = car.cameraOrbit;
        if (!camera || typeof car.getPosition !== "function") return;
        let rt = this.runtimes.get(car);
        if (!rt) { rt = runtimeState(); this.runtimes.set(car, rt); }
        const position = car.getPosition();
        const quaternion = car.getQuaternion();
        const speed = Number(car.getSpeedKmh()) || 0;
        const step = clamp(Number(dt) || 0, 0, 0.1);
        const context = rt.context;
        context.position = position; context.quaternion = quaternion; context.speed = speed; context.dt = step;

        if (!rt.initialized) {
            rt.initialized = true;
            rt.lastFov = camera.fov;
            rt.smoothPosition.x = camera.position.x; rt.smoothPosition.y = camera.position.y; rt.smoothPosition.z = camera.position.z;
            rt.smoothTarget.x = position.x; rt.smoothTarget.y = position.y; rt.smoothTarget.z = position.z;
            rt.goalQuaternion = camera.quaternion.clone(); rt.priorQuaternion = camera.quaternion.clone();
            rt.previousPosition.x = position.x; rt.previousPosition.y = position.y; rt.previousPosition.z = position.z;
            rt.previousQuaternion = quaternion.clone();
        }

        const carDx = position.x - rt.previousPosition.x, carDy = position.y - rt.previousPosition.y, carDz = position.z - rt.previousPosition.z;
        if (rt.activationSerial !== this.activationSerial || carDx * carDx + carDy * carDy + carDz * carDz > 400) {
            const reactivated = rt.activationSerial !== this.activationSerial;
            rt.smoothPosition.x = camera.position.x; rt.smoothPosition.y = camera.position.y; rt.smoothPosition.z = camera.position.z;
            rt.smoothTarget.x = position.x; rt.smoothTarget.y = position.y; rt.smoothTarget.z = position.z;
            rt.transition = null; rt.lastMode = this.modeIndex; rt.flybyAnchor = null;
            rt.activationSerial = this.activationSerial;
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
            rt.freeEuler.y = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
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
        const now = performance.now();
        if (now - this.timelineLastUpdateAt >= step * 500) {
            this.timelineLastUpdateAt = now;
            this.advanceTimeline(step);
        }
        if (this.montage && !this.timelineState.playing) this.directMontage(rt, context, now);

        if (rt.lastMode !== this.modeIndex) {
            const dx = camera.position.x - rt.smoothPosition.x, dy = camera.position.y - rt.smoothPosition.y, dz = camera.position.z - rt.smoothPosition.z;
            rt.transition = this.transitionMode === "BLEND" && dx * dx + dy * dy + dz * dz <= 2500
                ? { fromX: camera.position.x, fromY: camera.position.y, fromZ: camera.position.z, elapsed: 0 }
                : null;
            if (!rt.transition) {
                rt.cutPending = true;
                rt.smoothPosition.x = camera.position.x; rt.smoothPosition.y = camera.position.y; rt.smoothPosition.z = camera.position.z;
            }
            rt.lastMode = this.modeIndex;
            rt.flybyAnchor = null;
            if (this.mode === "Freecam" && !restoringBookmark) {
                rt.freePosition.x = camera.position.x; rt.freePosition.y = camera.position.y; rt.freePosition.z = camera.position.z;
                camera.rotation.setFromQuaternion(camera.quaternion, "YXZ");
                rt.freeEuler.x = camera.rotation.x; rt.freeEuler.y = camera.rotation.y;
            }
        }

        const rig = this.rigs[this.modeIndex];
        const out = rig.compose(context, rt, rt.output);
        if (rt.cutPending) {
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
        if (!finiteVector(rt.smoothPosition) || !finiteVector(rt.smoothTarget)) return;

        if (rt.transition) {
            rt.transition.elapsed += step;
            const t = smoothstep(clamp(rt.transition.elapsed / 0.45, 0, 1));
            camera.position.set(rt.transition.fromX + (rt.smoothPosition.x - rt.transition.fromX) * t, rt.transition.fromY + (rt.smoothPosition.y - rt.transition.fromY) * t, rt.transition.fromZ + (rt.smoothPosition.z - rt.transition.fromZ) * t);
            if (t >= 1) rt.transition = null;
        } else camera.position.set(rt.smoothPosition.x, rt.smoothPosition.y, rt.smoothPosition.z);

        rt.priorQuaternion.copy(camera.quaternion);
        camera.lookAt(rt.smoothTarget.x, rt.smoothTarget.y, rt.smoothTarget.z);
        rt.goalQuaternion.copy(camera.quaternion);
        const alphaRot = 1 - Math.exp(-out.rotationSharpness * step);
        camera.quaternion.copy(rt.priorQuaternion).slerp(rt.goalQuaternion, alphaRot);
        const fov = clamp(out.fov, 25, 110);
        camera.fov += (fov - camera.fov) * (1 - Math.exp(-2.5 * step));
        if (Math.abs(camera.fov - rt.lastFov) > 0.01) { camera.updateProjectionMatrix(); rt.lastFov = camera.fov; }
        camera.updateMatrix();

        const cockpit = car.cameraCockpit;
        if (cockpit && cockpit !== camera) {
            cockpit.position.copy(camera.position);
            cockpit.quaternion.copy(camera.quaternion);
            cockpit.fov = camera.fov;
            cockpit.updateProjectionMatrix();
            cockpit.updateMatrix();
        }
        rt.previousQuaternion.copy(quaternion);
        rt.previousPosition.x = position.x; rt.previousPosition.y = position.y; rt.previousPosition.z = position.z;
        this.ui.lastCamera = camera;
        this.ui.activeRuntime = rt;

        if (this.mode === "Freecam") this.input.stepFreecam(rt, step);
        if (rt.transition) this.ui.setTransitionMode("BLEND");
    }

    directMontage(rt, context, now) {
        const speed = context.speed;
        const yawDelta = rt.previousQuaternion ? Math.abs(context.quaternion.y - rt.previousQuaternion.y) : 0;
        const verticalSpeed = context.dt > 0 ? (context.position.y - rt.previousPosition.y) / context.dt : 0;
        let event = null;
        if (rt.airborne && rt.descending && verticalSpeed > -1) {
            event = "landing"; rt.airborne = false; rt.descending = false;
        } else if (!rt.airborne && verticalSpeed > 4) {
            event = "jump"; rt.airborne = true;
        } else if (rt.airborne && verticalSpeed < -2) {
            rt.descending = true;
        }
        if (!event && speed > 230 && context.previousSpeed <= 230) event = "pass";
        if (!event && speed > 140 && context.acceleration > 35) event = "acceleration";
        if (!event && yawDelta > 0.025) event = "corner";
        if (!event && speed > 170 && yawDelta < 0.004) event = "fast-straight";
        if (!event && speed < 70 && context.previousSpeed >= 70) event = "slow-section";
        if (!event && rt.shotTime >= 5) event = "maximum-duration";
        if (event) rt.pendingDirectorEvent = event;
        else event = rt.pendingDirectorEvent;
        if (!event) { rt.lastDirectorEvent = null; return; }
        if (event === rt.lastDirectorEvent) { rt.pendingDirectorEvent = null; return; }
        if (now - this.lastShotAt < 1500) return;

        const candidates = event === "landing" ? [1, 0]
            : event === "jump" ? [5, 6]
            : event === "pass" || event === "acceleration" ? [7, 6]
            : event === "corner" ? [6, 3]
            : event === "fast-straight" ? [1, 2]
            : event === "slow-section" ? [4, 0]
            : [3, 5, 6, 7];
        const filtered = candidates.filter((i) => i !== this.modeIndex && !rt.history.includes(i));
        const options = filtered.length ? filtered : candidates.filter((i) => i !== this.modeIndex);
        const next = options[Math.floor(this.random() * Math.max(1, options.length))] ?? 0;
        rt.history.push(next); if (rt.history.length > 2) rt.history.shift();
        this.setMode(next);
        rt.lastDirectorEvent = event;
        rt.pendingDirectorEvent = null;
        rt.shotTime = 0;
        this.lastShotAt = now;
        this.persist();
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
            else this.timelineState.playing = false;
        }
    }

    toggleTimeline() { this.timelineState.playing = !this.timelineState.playing; }
    resetTimeline() { this.timelineState.time = 0; this.timelineState.index = 0; }
    loadTimeline(json) {
        const parsed = JSON.parse(json);
        if (!Array.isArray(parsed)) throw new Error("Timeline must be a JSON array.");
        this.timeline = parsed.map((item) => ({ time: Math.max(0, Number(item.time) || 0), mode: item.mode })).sort((a, b) => a.time - b.time);
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
        this.setMode(9);
    }

    persist() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ bookmarks: this.bookmarks, seed: this.directorSeed })); } catch { /* storage may be blocked */ }
    }

    dispose() {
        this.enabled = false; this.cleanCapture = false;
        if (globalThis.__polyCamControllerV1 === this) delete globalThis.__polyCamControllerV1;
        this.input.dispose(); this.ui.dispose(); this.persist();
    }
}
