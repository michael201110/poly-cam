import { clamp } from "./math.js";

export const MONTAGE_PACES = {
    Cinematic: { minimum: 2.8, duration: 5.5 },
    Balanced: { minimum: 2.1, duration: 4.3 },
    Energetic: { minimum: 1.4, duration: 3.1 }
};

const family = mode => mode === 6 || mode === 7 ? "trackside" : mode === 4 || mode === 5 ? "wide" : mode === 8 ? "detail" : "follow";
const heading = q => Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
const angleDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// The director reads presentation data only. Each vehicle owns its shot state;
// durations use the camera clock, and turn measurements are rates, not per-frame deltas.
export class ShotDirector {
    constructor(random) { this.random = random; }

    createState() {
        return { time: 0, age: 0, turnRate: 0, verticalSpeed: 0, acceleration: 0,
            situation: "cruise", situationAge: 0, riseTime: 0, airborne: false, descending: false,
            landingUntil: 0, history: [], shot: null };
    }

    update(rt, context, { mode, pace }) {
        const state = rt.directorState ||= this.createState();
        const dt = context.dt;
        state.time += dt; state.age += dt;
        const alpha = 1 - Math.exp(-5 * dt);
        const turn = dt > 0 && rt.previousQuaternion
            ? angleDifference(heading(context.quaternion), heading(rt.previousQuaternion)) / dt : 0;
        const vertical = dt > 0 ? (context.position.y - rt.previousPosition.y) / dt : 0;
        state.turnRate += (clamp(turn, -4, 4) - state.turnRate) * alpha;
        state.verticalSpeed += (clamp(vertical, -80, 80) - state.verticalSpeed) * alpha;
        state.acceleration += (clamp(context.acceleration, -300, 300) - state.acceleration) * alpha;

        // Compare vertical motion with the car's pitch to avoid treating every hill
        // as a jump. These cues remain estimates; the car API has no contact flags.
        const q = context.quaternion;
        const expectedVertical = context.speed / 3.6 * 2 * (q.y * q.z - q.w * q.x);
        const rising = context.speed > 55 && state.verticalSpeed > 5 && state.verticalSpeed - expectedVertical > 3;
        state.riseTime = rising ? state.riseTime + dt : Math.max(0, state.riseTime - dt * 2);
        if (state.riseTime > 0.15) state.airborne = true;
        if (state.airborne && state.verticalSpeed < -3) state.descending = true;
        if (state.airborne && state.descending && state.verticalSpeed > -1) {
            state.airborne = false; state.descending = false; state.riseTime = 0;
            state.landingUntil = state.time + 0.65;
        }

        const banked = 1 - 2 * (q.x * q.x + q.z * q.z) < 0.35;
        const situation = banked ? "roll" : state.time < state.landingUntil ? "landing"
            : state.airborne ? "airborne" : context.speed < 12 ? "idle"
            : Math.abs(state.turnRate) > 0.28 && context.speed > 45 ? "corner"
            : state.acceleration > 24 && context.speed > 70 ? "acceleration"
            : context.speed > 155 ? "fast-straight" : "cruise";
        if (situation === state.situation) state.situationAge += dt;
        else { state.situation = situation; state.situationAge = 0; }

        const timing = MONTAGE_PACES[pace] || MONTAGE_PACES.Cinematic;
        if (!state.shot) return this.beginShot(state, rt, context, mode === 9 ? 0 : mode, timing);

        // Let a roadside shot show the approach and pass before cutting away.
        const shot = state.shot;
        if (situation === "roll" && shot.mode === 5) return shot;
        let passed = false;
        let lostFraming = false;
        if (shot.anchor) {
            const dx = shot.anchor.x - context.position.x, dz = shot.anchor.z - context.position.z;
            const remaining = dx * shot.forward.x + dz * shot.forward.z;
            passed = remaining < -Math.max(10, context.speed / 3.6 * 0.65);
            lostFraming = Math.hypot(dx, dz) > shot.distance + 85;
        }
        const recover = situation === "roll" && shot.mode !== 5 && state.situationAge > 0.12 && state.age > 0.8;
        const changedAction = situation !== shot.reason && state.situationAge > 0.3
            && ["corner", "airborne", "landing", "acceleration"].includes(situation);
        if (!recover && !lostFraming && (state.age < timing.minimum
            || (!passed && !changedAction && state.age < shot.duration))) return shot;

        const next = recover ? 5 : this.chooseMode(state, context.speed);
        return this.beginShot(state, rt, context, next, timing);
    }

    chooseMode(state, speed) {
        const candidates = state.situation === "idle" ? [[4, 5], [5, 3], [2, 2], [0, 1]]
            : state.situation === "roll" || state.situation === "airborne" ? [[5, 8], [3, 2], [0, 2]]
            : state.situation === "landing" ? [[0, 5], [1, 4], [3, 2]]
            : state.situation === "corner" ? [[3, 6], [5, 4], [0, 3], [2, 1]]
            : state.situation === "acceleration" ? [[1, 5], [3, 4], [7, 4], [8, 2], [0, 2]]
            : speed > 155 ? [[1, 5], [7, 5], [6, 4], [3, 3], [8, 2], [5, 2], [0, 2], [2, 1]]
            : [[0, 4], [3, 4], [2, 3], [5, 3], [4, 2], [6, speed > 65 ? 2 : 0]];
        const recent = state.history.slice(-3);
        const lastFamilies = state.history.slice(-2).map(family);
        const weighted = candidates.filter(([mode, weight]) => weight > 0 && mode !== state.shot.mode)
            .map(([mode, weight]) => [mode, weight * (recent.includes(mode) ? 0.16 : 1)
                * (lastFamilies.length === 2 && lastFamilies.every(f => f === family(mode)) ? 0.2 : 1)]);
        let choice = this.random() * weighted.reduce((sum, [, weight]) => sum + weight, 0);
        for (const [mode, weight] of weighted) { choice -= weight; if (choice <= 0) return mode; }
        return weighted.at(-1)?.[0] ?? 0;
    }

    beginShot(state, rt, context, mode, timing) {
        const random = (min, max) => min + this.random() * (max - min);
        const previous = state.shot;
        const side = Math.abs(state.turnRate) > 0.28 ? (state.turnRate > 0 ? -1 : 1)
            : previous ? -previous.side : this.random() < 0.5 ? -1 : 1;
        const shot = { mode, side, reason: state.situation,
            duration: Math.max(timing.minimum + 0.5, timing.duration * random(0.8, 1.2)),
            transition: previous && [0, 1].includes(previous.mode) && [0, 1].includes(mode) ? "BLEND" : "CUT",
            fovOffset: [ -5, 2, -13, -15, -8, -10, -30, -16, 3 ][mode] ?? 0 };
        if (state.situation === "idle") shot.duration *= 1.4;
        if (mode === 0 || mode === 1) {
            shot.distance = mode === 1 ? random(7, 8.5) : random(8.5, 11);
            shot.height = mode === 1 ? random(0.85, 1.1) : random(2.2, 3.1);
            shot.lateral = side * random(0.2, 0.65); shot.lookAhead = random(3.5, 5);
        }
        if (mode === 2) { shot.distance = random(10, 13); shot.height = random(2.3, 3.3); }
        if (mode === 3) { shot.distance = random(8, 11); shot.height = random(2, 3); shot.longitudinal = random(-2, 2); }
        if (mode === 4) { shot.radius = random(11, 15); shot.height = random(3, 4.5); shot.orbitSpeed = random(0.16, 0.25); rt.orbitAngle = Math.PI + side * 0.45; }
        if (mode === 5) { shot.altitude = random(11, 16); shot.trail = random(6, 10); }
        if (mode === 8) {
            const mounts = context.speed > 120 ? ["Bonnet", "Front-left wheel", "Front-right wheel", "Roof"] : ["Bonnet", "Roof"];
            shot.mount = mounts[Math.floor(this.random() * mounts.length)];
            shot.duration = Math.max(timing.minimum, shot.duration * 0.7);
        }
        if (mode === 6 || mode === 7) {
            const yaw = heading(context.quaternion);
            let x = Math.sin(yaw), z = Math.cos(yaw);
            const dx = context.position.x - rt.previousPosition.x, dz = context.position.z - rt.previousPosition.z;
            const length = Math.hypot(dx, dz);
            if (length > 0.02 && context.speed > 30) { x = dx / length; z = dz / length; }
            shot.forward = { x, z };
            shot.distance = clamp(context.speed / 3.6 * random(1.1, 1.5), 22, 85);
            const lateral = side * (mode === 6 ? random(9, 13) : random(5, 8));
            shot.anchor = { x: context.position.x + x * shot.distance + z * lateral,
                y: context.position.y + (mode === 6 ? random(3.5, 5) : random(2.6, 3.6)),
                z: context.position.z + z * shot.distance - x * lateral };
            // Maximum duration remains a fallback if the driver slows or turns away.
            shot.duration = Math.max(timing.minimum + 0.5, Math.min(shot.duration, shot.distance / Math.max(8, context.speed / 3.6) + 1.8));
        }
        state.shot = shot; state.age = 0;
        state.history.push(mode); if (state.history.length > 6) state.history.shift();
        return shot;
    }
}
