import { clamp, finiteVector, rotateVector } from "./math.js";

// Copy public wheel contacts; never retain or change simulation state objects.
export function readRoadSurface(carState, surface) {
    const contacts = carState?.wheelContact;
    if (!Array.isArray(contacts)) return -1;
    let count = 0;
    surface.position.x = surface.position.y = surface.position.z = 0;
    surface.normal.x = surface.normal.y = surface.normal.z = 0;
    for (const contact of contacts) {
        if (!contact || !finiteVector(contact.position) || !finiteVector(contact.normal)) continue;
        count++;
        surface.position.x += contact.position.x; surface.position.y += contact.position.y; surface.position.z += contact.position.z;
        surface.normal.x += contact.normal.x; surface.normal.y += contact.normal.y; surface.normal.z += contact.normal.z;
    }
    if (!count) return 0;
    surface.position.x /= count; surface.position.y /= count; surface.position.z /= count;
    const length = Math.hypot(surface.normal.x, surface.normal.y, surface.normal.z);
    if (length < 0.01) { surface.normal.x = 0; surface.normal.y = 1; surface.normal.z = 0; }
    else { surface.normal.x /= length; surface.normal.y /= length; surface.normal.z /= length; }
    return count;
}

export function createPassPlacement(context, runtime, mode, { side = 1, lead = 1, lateral, height } = {}) {
    const ground = context.contactCount > 0 && context.surface;
    const normal = ground ? { ...context.surface.normal } : { x: 0, y: 1, z: 0 };
    const forward = { x: 0, y: 0, z: 0 };
    rotateVector(forward, 0, 0, 1, context.quaternion);
    const dx = context.position.x - runtime.previousPosition.x;
    const dy = context.position.y - runtime.previousPosition.y;
    const dz = context.position.z - runtime.previousPosition.z;
    if (Math.hypot(dx, dy, dz) > 0.02 && context.speed > 30) { forward.x = dx; forward.y = dy; forward.z = dz; }
    const dot = forward.x * normal.x + forward.y * normal.y + forward.z * normal.z;
    forward.x -= normal.x * dot; forward.y -= normal.y * dot; forward.z -= normal.z * dot;
    const length = Math.hypot(forward.x, forward.y, forward.z);
    if (length < 0.01) { forward.x = 0; forward.y = 0; forward.z = 1; }
    else { forward.x /= length; forward.y /= length; forward.z /= length; }
    const right = { x: normal.y * forward.z - normal.z * forward.y,
        y: normal.z * forward.x - normal.x * forward.z, z: normal.x * forward.y - normal.y * forward.x };
    const groundPass = mode === 11;
    const flash = mode === 10;
    const distance = clamp(context.speed / 3.6 * lead, groundPass ? 10 : 15, groundPass ? 42 : flash ? 55 : 75);
    const centre = { x: context.position.x + forward.x * distance,
        y: context.position.y + forward.y * distance, z: context.position.z + forward.z * distance };
    if (ground) {
        const p = context.surface.position;
        const above = (centre.x - p.x) * normal.x + (centre.y - p.y) * normal.y + (centre.z - p.z) * normal.z;
        centre.x -= normal.x * above; centre.y -= normal.y * above; centre.z -= normal.z * above;
    }
    const offset = lateral ?? (groundPass ? 0 : flash ? 3 : mode === 6 ? 10 : 6);
    const altitude = height ?? (groundPass ? 0.06 : flash ? 1.4 : mode === 6 ? 4 : 2.8);
    const anchor = { x: centre.x + right.x * side * offset + normal.x * altitude,
        y: centre.y + right.y * side * offset + normal.y * altitude,
        z: centre.z + right.z * side * offset + normal.z * altitude };
    // Flash looks across the road; Drive-Over looks toward the approaching car
    // and up through its path. Both targets are fixed for the entire shot.
    const lookTarget = groundPass
        ? { x: anchor.x - forward.x * 6 + normal.x * 5,
            y: anchor.y - forward.y * 6 + normal.y * 5,
            z: anchor.z - forward.z * 6 + normal.z * 5 }
        : { x: centre.x + normal.x * 0.8, y: centre.y + normal.y * 0.8, z: centre.z + normal.z * 0.8 };
    return { mode, anchor, lookTarget, forward, right, distance, lateralOffset: side * offset,
        approachTime: distance / Math.max(8, context.speed / 3.6) };
}

export function passProgress(placement, position) {
    const dx = placement.anchor.x - position.x, dy = placement.anchor.y - position.y, dz = placement.anchor.z - position.z;
    return { remaining: dx * placement.forward.x + dy * placement.forward.y + dz * placement.forward.z,
        lateral: -(dx * placement.right.x + dy * placement.right.y + dz * placement.right.z) + placement.lateralOffset,
        distance: Math.hypot(dx, dy, dz) };
}
