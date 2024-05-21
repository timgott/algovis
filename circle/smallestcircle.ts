import { ensured, randomChoice, shuffle } from "../shared/utils";
import { Positioned } from "../shared/vector";
import { HashSet } from "../shared/hashset";

function solveLinearEq2(x1: number, y1: number, c1: number, x2: number, y2: number, c2: number): [number, number] {
    // copilot better be right about this one!
    const det = x1 * y2 - x2 * y1
    return [(c1 * y2 - c2 * y1) / det, (x1 * c2 - x2 * c1) / det]
}

export type Circle = { x: number, y: number, r: number }

function threePointCircle(a: Positioned, b: Positioned, c: Positioned) {
    const [cx, cy] = solveLinearEq2(
        2 * (a.x - b.x), 2 * (a.y - b.y), a.x * a.x - b.x * b.x + a.y * a.y - b.y * b.y,
        2 * (a.x - c.x), 2 * (a.y - c.y), a.x * a.x - c.x * c.x + a.y * a.y - c.y * c.y
    )
    const r = Math.hypot(a.x - cx, a.y - cy)
    return { x: cx, y: cy, r }
}

function twoPointCircle(a: Positioned, b: Positioned) {
    return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        r: Math.hypot(a.x - b.x, a.y - b.y) / 2
    }
}

function onePointCircle(a: Positioned) {
    return { x: a.x, y: a.y, r: 0 }
}

// roughly linear time
export function filterUniqueIntPoints<T extends Positioned>(points: T[]): T[] {
    let seen = new HashSet<T>(
        (pt) => Math.abs(Math.floor((7*pt.x) + (13*pt.y))),
        (a, b) => a.x == b.x && a.y == b.y,
        points.length
    )
    for (let pt of points) {
        seen.add(pt)
    }
    return Array.from(seen)
}

function trivialCircle(points: Positioned[]) {
    if (points.length == 0) {
        return { x: 0, y: 0, r: 0}
    } else if (points.length == 1) {
        return onePointCircle(points[0])
    } else if (points.length == 2) {
        return twoPointCircle(points[0], points[1])
    } else if (points.length == 3) {
        return threePointCircle(points[0], points[1], points[2])
    } else {
        throw new Error("Too many points")
    }
}

const defaultEpsilon = 1e-5
function isInside(point: Positioned, circle: Circle, epsilon: number = defaultEpsilon) {
    const dx = point.x - circle.x
    const dy = point.y - circle.y
    const r = circle.r + epsilon
    return dx*dx+dy*dy <= r*r
}

export function findSmallestCircleRec(points: Positioned[], anchors: Positioned[], epsilon: number = defaultEpsilon): Circle {
    if (points.length == 0 || anchors.length == 3) {
        return trivialCircle(anchors)
    }
    let p = points[0]
    let remaining = points.slice(1)
    let circle = findSmallestCircleRec(remaining, anchors)
    if (isInside(p, circle, epsilon)) {
        return circle
    }
    shuffle(points)
    return findSmallestCircleRec(remaining, [...anchors, p])
}

// Add one point and return the new smallest circle
export function expandSmallestCircle(
    oldCircle: Circle,
    oldPoints: Positioned[],
    newPoint: Positioned,
    outerAnchors: Positioned[] = [],
    epsilon: number = defaultEpsilon
): Circle {
    if (isInside(newPoint, oldCircle, epsilon)) {
        // the minimal circle contains this point too, it is still the minimal circle
        return oldCircle
    } else {
        // the minimal circle of all points so far must touch this point too
        return findSmallestCircleIncremental(oldPoints, [...outerAnchors, newPoint])
    }
}

export function findSmallestCircleIncremental(
    points: Positioned[],
    outerAnchors: Positioned[],
    epsilon: number = defaultEpsilon
): Circle {
    // start from existing circle
    // add one point
    // if inside: return old circle
    // if not inside: add anchor and find new circle with old points but only add new point to outer anchors
    let anchors = outerAnchors.slice()
    let circle = trivialCircle(outerAnchors)
    if (points.length == 0 || outerAnchors.length == 3) {
        return circle
    }

    // shuffle avoids worst case in expectation
    // (loop below is linear anyways)
    points = points.slice()
    shuffle(points)

    // invariant: circle is the smallest point containing points[0:i] and touching the outerAnchors
    for (let i = 0; i < points.length; i++) {
        const p = points[i]
        if (isInside(p, circle, epsilon)) {
            continue
        } else {
            circle = findSmallestCircleIncremental(points.slice(0, i), [...outerAnchors, p])
        }
        //circle = expandSmallestCircle(circle, points.slice(0, i), points[i], outerAnchors)
    }
    return circle
}

// assumes unique points
export function findSmallestCircle(points: Positioned[], epsilon: number = defaultEpsilon): Circle {
    return findSmallestCircleIncremental(points, [], epsilon)
}