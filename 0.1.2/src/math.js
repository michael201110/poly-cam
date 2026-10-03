export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const damp = (current, target, sharpness, dt) => current + (target - current) * (1 - Math.exp(-sharpness * Math.min(0.1, Math.max(0, dt))));
export const smoothstep = (t) => t * t * (3 - 2 * t);

export function rotateVector(out, x, y, z, q) {
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    out.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    out.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    out.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return out;
}

export function localPoint(out, position, quaternion, x, y, z) {
    rotateVector(out, x, y, z, quaternion);
    out.x += position.x; out.y += position.y; out.z += position.z;
    return out;
}

export function finiteVector(v) {
    return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}
