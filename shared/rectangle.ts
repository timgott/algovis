import { Vector } from "./vector"

export type Rect = {
    readonly left: number,
    readonly top: number,
    readonly right: number,
    readonly bottom: number,
}

export const Rect = {
    new(
        left: number,
        top: number,
        right: number,
        bottom: number,
    ) {
        return { left, top, right, bottom }
    },

    fromSize(left: number, top: number, width: number, height: number) {
        return { left, top, right: left + width, bottom: top + height }
    },

    fromCenter(x: number, y: number, width: number, height: number) {
        return { left: x - width / 2, top: y - height / 2, right: x + width / 2, bottom: y + height / 2 }
    },

    fromPoints(points: Iterable<Vector>) {
        let left = Infinity
        let top = Infinity
        let right = -Infinity
        let bottom = -Infinity
        for (let point of points) {
            left = Math.min(left, point.x)
            top = Math.min(top, point.y)
            right = Math.max(right, point.x)
            bottom = Math.max(bottom, point.y)
        }
        return { left, top, right, bottom }
    },

    Empty: { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },

    width(rect: Rect): number {
        return rect.right - rect.left
    },

    height(rect: Rect): number {
        return rect.bottom - rect.top
    },

    center(rect: Rect): Vector {
        return Vector.new((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2)
    },

    extend(rect: Rect, other: Rect): Rect {
        let left = Math.min(rect.left, other.left)
        let top = Math.min(rect.top, other.top)
        let right = Math.max(rect.right, other.right)
        let bottom = Math.max(rect.bottom, other.bottom)
        return { left, top, right, bottom }
    },

    addOffset(rect: Rect, dx: number, dy: number) {
        return { left: rect.left + dx, top: rect.top + dy, right: rect.right + dx, bottom: rect.bottom + dy }
    },

    contains(rect: Rect, x: number, y: number): boolean {
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    },

    splitVertical(rect: Rect, percent: number): [Rect, Rect] {
        let splitY = rect.top + (rect.bottom - rect.top) * percent
        return [
            { left: rect.left, top: rect.top, right: rect.right, bottom: splitY },
            { left: rect.left, top: splitY, right: rect.right, bottom: rect.bottom }
        ]
    },

    splitHorizontal(rect: Rect, percent: number): [Rect, Rect] {
        let splitX = rect.left + (rect.right - rect.left) * percent
        return [
            { left: rect.left, top: rect.top, right: splitX, bottom: rect.bottom },
            { left: splitX, top: rect.top, right: rect.right, bottom: rect.bottom }
        ]
    }
}
