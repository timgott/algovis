import { Vector } from "./vector"

export class Rect {
    constructor(
        public readonly left: number,
        public readonly top: number,
        public readonly right: number,
        public readonly bottom: number,
    ) {}

    static fromSize(left: number, top: number, width: number, height: number) {
        return new Rect(left, top, left + width, top + height)
    }

    static fromCenter(x: number, y: number, width: number, height: number) {
        return new Rect(x - width/2, y - height/2, x + width/2, y + height/2)
    }

    static fromPoints(points: Iterable<Vector>) {
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
        return new Rect(left, top, right, bottom)
    }

    static readonly Empty = new Rect(Infinity, Infinity, -Infinity, -Infinity)

    get width(): number {
        return this.right - this.left
    }

    get height(): number {
        return this.bottom - this.top
    }

    get center(): Vector {
        return new Vector((this.left + this.right) / 2, (this.top + this.bottom) / 2)
    }

    extend(other: Rect): Rect {
        let left = Math.min(this.left, other.left)
        let top = Math.min(this.top, other.top)
        let right = Math.max(this.right, other.right)
        let bottom = Math.max(this.bottom, other.bottom)
        return new Rect(left, top, right, bottom)
    }

    addOffset(dx: number, dy: number) {
        return new Rect(this.left + dx, this.top + dy, this.right + dx, this.bottom + dy)
    }

    contains(x: number, y: number): boolean {
        return x >= this.left && x <= this.right && y >= this.top && y <= this.bottom
    }

    splitVertical(percent: number): [Rect, Rect] {
        let splitY = this.top + this.height * percent
        return [
            new Rect(this.left, this.top, this.right, splitY),
            new Rect(this.left, splitY, this.right, this.bottom)
        ]
    }

    splitHorizontal(percent: number): [Rect, Rect] {
        let splitX = this.left + this.width * percent
        return [
            new Rect(this.left, this.top, splitX, this.bottom),
            new Rect(splitX, this.top, this.right, this.bottom)
        ]
    }
}