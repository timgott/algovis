export type Positioned = {
    x: number;
    y: number;
}
export type Vector = Positioned;

export function vecadd(a: Positioned, b: Positioned) {
    return { x: a.x + b.x, y: a.y + b.y };
}

export function vecsub(a: Positioned, b: Positioned) {
    return { x: a.x - b.x, y: a.y - b.y };
}

export function vecscale(factor: number, v: Positioned) {
    return { x: v.x * factor, y: v.y * factor };
}

export function veclength(v: Positioned) {
    return Math.hypot(v.x, v.y);
}

export function normalize(v: Positioned) {
    let len = veclength(v);
    return { x: v.x / len, y: v.y / len };
}

export function vec(x: number, y: number): Positioned {
    return { x, y };
}

export function vecdir(a: Positioned, b: Positioned): Positioned {
    return normalize(vecsub(b, a));
}

export function vecdot(a: Positioned, b: Positioned): number {
    return a.x * b.x + a.y * b.y
}

export const Vector = {
    new: vec,
    add: vecadd,
    sub: vecsub,
    scale: vecscale,
    length: veclength,
    Zero: { x: 0, y: 0 },
    fromAngle(angle: number, length: number = 1) {
        return Vector.new(length * Math.sin(angle), length * -Math.cos(angle));
    },
    rotate(point: Positioned, angle: number, around: Positioned): Positioned {
        let dx = point.x - around.x;
        let dy = point.y - around.y;
        let cos = Math.cos(angle);
        let sin = Math.sin(angle);
        return {
            x: around.x + dx * cos - dy * sin,
            y: around.y + dx * sin + dy * cos,
        };
    },
    dot: vecdot,
    normalize: normalize
}

export function distance(a: Positioned, b: Positioned): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distanceSqr(a: Positioned, b: Positioned): number {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    return dx * dx + dy * dy;
}

export function isDistanceLess(a: Positioned, b: Positioned, limit: number): boolean {
    return distanceSqr(a, b) < limit * limit;
}

export function vecset(v: Positioned, to: Vector) {
    v.x = to.x;
    v.y = to.y;
}
