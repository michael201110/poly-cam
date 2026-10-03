import { clamp, smoothstep } from "./math.js";
import { createPassPlacement, passProgress } from "./pass-shots.js";

export const MONTAGE_PACES = {
    Cinematic: { minimum: 1.8, duration: 3.7 },
    Balanced: { minimum: 1.35, duration: 2.9 },
    Energetic: { minimum: 0.9, duration: 2.1 }
};

const family = mode => [0, 1].includes(mode) ? "rear" : [6, 7, 10, 11].includes(mode) ? "pass"
    : mode === 4 ? "orbit" : mode === 5 ? "aerial" : mode === 8 ? "detail" : mode === 2 ? "front" : "side";
const heading = q => Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
const angleDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// Choreograph each moving shot in car-relative space. Most of the travel is
// linear, with a little easing at the ends so the camera never parks mid-shot.
function animateShot(state) {
    const shot = state.shot;
    const progress = clamp(state.age / shot.duration, 0, 1);
    const travel = progress * 0.7 + smoothstep(progress) * 0.3;
    for (const [key, [start, end]] of shot.motion) {
        shot[key] = start + (end - start) * travel;
    }
    return shot;
}

// The director reads presentation data only. Each vehicle owns its shot state;
// durations use the camera clock, and turn measurements are rates, not per-frame deltas.
export class ShotDirector {
    constructor(random) { this.random = random; }

    createState() {
        return { time: 0, age: 0, turnRate: 0, verticalSpeed: 0, acceleration: 0,
            situation: "cruise", situationAge: 0, riseTime: 0, airborne: false, descending: false,
            airTime: 0, landingUntil: 0, history: [], shot: null };
    }

    update(rt, context, { pace }) {
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

        // Prefer the public wheel-contact data, with motion inference as a fallback.
        const q = context.quaternion;
        const expectedVertical = context.speed / 3.6 * 2 * (q.y * q.z - q.w * q.x);
        if (context.contactCount >= 0) {
            state.airTime = context.contactCount === 0 && context.speed > 45 ? state.airTime + dt : 0;
            if (state.airTime > 0.15) state.airborne = true;
            if (state.airborne && context.contactCount > 0) {
                state.airborne = false; state.landingUntil = state.time + 0.8;
            }
        } else {
            const rising = context.speed > 55 && state.verticalSpeed > 5 && state.verticalSpeed - expectedVertical > 3;
            state.riseTime = rising ? state.riseTime + dt : Math.max(0, state.riseTime - dt * 2);
            if (state.riseTime > 0.15) state.airborne = true;
            if (state.airborne && state.verticalSpeed < -3) state.descending = true;
            if (state.airborne && state.descending && state.verticalSpeed > -1) {
                state.airborne = false; state.descending = false; state.riseTime = 0;
                state.landingUntil = state.time + 0.8;
            }
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
        if (!state.shot) return this.beginShot(state, rt, context, situation === "roll" ? 5 : this.chooseMode(state, context), timing);

        // Let a roadside shot show the approach and pass before cutting away.
        const shot = state.shot;
        if (situation === "roll" && shot.mode === 5) {
            return state.age < shot.duration ? animateShot(state) : this.beginShot(state, rt, context, 5, timing);
        }
        let passed = false;
        let lostFraming = false;
        if (shot.anchor) {
            const progress = passProgress(shot, context.position);
            passed = progress.remaining < -Math.max(4, context.speed / 3.6 * 0.28);
            lostFraming = progress.distance > shot.distance + 45
                || (shot.mode === 11 && Math.abs(progress.lateral) > 1.4 && state.age > 0.3)
                || (shot.mode === 10 && Math.abs(progress.lateral) > 5 && state.age > 0.3);
        }
        const recover = situation === "roll" && shot.mode !== 5 && state.situationAge > 0.12 && state.age > 0.8;
        const changedAction = situation !== shot.reason && state.situationAge > 0.18
            && ["corner", "airborne", "landing", "acceleration"].includes(situation);
        const urgent = changedAction && ["airborne", "landing"].includes(situation) && state.age > 0.65;
        const minimum = shot.anchor ? (passed ? 0.35 : Math.min(timing.minimum, shot.approachTime + 0.15))
            : Math.min(timing.minimum, shot.duration);
        if (!recover && !urgent && !lostFraming && (state.age < minimum
            || (!passed && !changedAction && state.age < shot.duration))) return animateShot(state);

        const next = recover ? 5 : this.chooseMode(state, context);
        return this.beginShot(state, rt, context, next, timing);
    }

    chooseMode(state, context) {
        const { speed } = context;
        const straight = speed > 50 && Math.abs(state.turnRate) < 0.15 && Math.abs(context.steering || 0) < 0.06 && !state.airborne;
        const groundPass = straight && context.contactCount >= 3 && context.surface.normal.y > 0.85
            && Math.abs(expectedSlope(context.quaternion)) < 0.18;
        const candidates = state.situation === "idle" ? [[4, 8], [5, 3], [2, 3], [3, 3]]
            : state.situation === "roll" ? [[5, 8], [3, 3], [2, 2]]
            : state.situation === "airborne" ? [[3, 7], [2, 5], [4, 5], [5, 4]]
            : state.situation === "landing" ? [[3, 5], [2, 4], [5, 3], [1, 1], [0, 1]]
            : state.situation === "corner" ? [[3, 6], [2, 5], [4, 4], [5, 4], [8, 1], [0, 1]]
            : [[3, 7], [2, 5], [4, 7], [5, 5], [8, 1.5],
                [6, straight ? 2 : 0], [7, straight ? 2 : 0], [10, straight ? 1.5 : 0], [11, groundPass ? 1.5 : 0],
                [0, 1], [1, speed > 100 ? 1.5 : 0.5]];
        const recent = state.history.slice(-3);
        const lastFamily = state.shot && family(state.shot.mode);
        // Rear chase is an occasional linking shot, never the opening shot and
        // never more than once in a rolling window of four shots.
        const eligible = candidates.filter(([mode, weight]) => weight > 0 && mode !== state.shot?.mode
            && (!([0, 1].includes(mode)) || (state.shot && !recent.some(previous => [0, 1].includes(previous))))
            && (family(mode) !== "pass" || !state.history.slice(-2).some(previous => family(previous) === "pass"))
            && family(mode) !== lastFamily);
        const fresh = eligible.filter(([mode]) => !state.history.slice(-2).includes(mode));
        const previousWide = state.shot && [4, 5, 6, 7, 10, 11].includes(state.shot.mode);
        const weighted = (fresh.length ? fresh : eligible)
            .map(([mode, weight]) => [mode, weight * (recent.includes(mode) ? 0.2 : 1)
                * (state.shot && previousWide !== [4, 5, 6, 7, 10, 11].includes(mode) ? 1.7 : 1)]);
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
            fovOffset: { 0: -5, 1: -5, 2: -13, 3: -15, 4: -8, 5: -8, 6: -20, 7: -12, 8: 3, 10: 4, 11: 0 }[mode] ?? 0 };
        const motion = {};
        const rising = this.random() < 0.5;
        if (state.situation === "idle") shot.duration *= 1.15;
        if (mode === 0 || mode === 1) {
            motion.distance = mode === 1 ? [7.5, 5.8] : [9, 6.8];
            motion.height = mode === 1 ? [1.8, 1.55] : rising ? [2.1, 4.2] : [4.2, 2.1];
            motion.lateral = [side * 3.2, side * 0.5];
            shot.lookAhead = 1.5;
            shot.duration = Math.max(timing.minimum, shot.duration * 0.75);
        }
        if (mode === 2) {
            // A front-quarter push or pull, rather than a parked front chase.
            const pushing = this.random() < 0.5;
            motion.distance = pushing ? [11, 6.2] : [6.2, 11];
            motion.lateral = [side * 4.5, side * 1.1];
            motion.height = rising ? [1.9, 3.6] : [3.6, 1.9];
            motion.fovOffset = pushing ? [-20, -9] : [-9, -20];
        }
        if (mode === 3) {
            // Travel alongside from rear quarter to front quarter (or reverse).
            const overtaking = this.random() < 0.65;
            motion.longitudinal = overtaking ? [-6, 6] : [6, -6];
            motion.distance = rising ? [6.5, 5.4] : [5.4, 6.5];
            motion.height = rising ? [1.7, 3.6] : [3.6, 1.7];
            motion.fovOffset = [-15, -10];
        }
        if (mode === 4) {
            const start = side * random(0.55, 1.1);
            motion.angle = [start, start + side * random(1.9, 2.6)];
            motion.radius = rising ? [8.5, 6.3] : [6.3, 8.5];
            motion.height = rising ? [2.2, 5.2] : [5.2, 2.2];
            motion.fovOffset = [-14, -6];
        }
        if (mode === 5) {
            const crossing = this.random() < 0.5;
            motion.altitude = crossing ? [10, 8] : [15, 7];
            motion.lateral = crossing ? [side * 7, -side * 5] : [side * 5, side * 2];
            motion.trail = crossing ? [-4, 4] : [7, -3];
            motion.fovOffset = [-18, -6];
        }
        if (mode === 8) {
            const mounts = context.speed > 120 ? ["Bonnet", "Front-left wheel", "Front-right wheel", "Roof"] : ["Bonnet", "Roof"];
            shot.mount = mounts[Math.floor(this.random() * mounts.length)];
            shot.duration = random(0.8, 1.25) * timing.duration / MONTAGE_PACES.Cinematic.duration;
        }
        if ([6, 7, 10, 11].includes(mode)) {
            const lead = mode === 11 ? random(0.65, 0.85) : mode === 10 ? random(0.75, 1) : random(0.9, 1.2);
            Object.assign(shot, createPassPlacement(context, rt, mode, { side, lead,
                lateral: mode === 11 ? 0 : mode === 10 ? random(2.5, 4) : mode === 6 ? random(8, 11) : random(5, 7),
                height: mode === 11 ? 0.06 : mode === 10 ? random(1.2, 1.7) : mode === 6 ? random(3, 4) : random(2.5, 3.3) }));
            shot.duration = shot.approachTime + (mode === 10 || mode === 11 ? 0.7 : 1);
        }
        shot.motion = Object.entries(motion);
        state.shot = shot; state.age = 0;
        state.history.push(mode); if (state.history.length > 6) state.history.shift();
        return animateShot(state);
    }
}

const expectedSlope = q => 2 * (q.y * q.z - q.w * q.x);
