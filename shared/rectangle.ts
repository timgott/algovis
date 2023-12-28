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

    static readonly Empty = new Rect(Infinity, Infinity, -Infinity, -Infinity)

    get width(): number {
        return this.right - this.left
    }

    get height(): number {
        return this.bottom - this.top
    }

    extend(other: Rect): Rect {
        let left = Math.min(this.left, other.left)
        let top = Math.min(this.top, other.top)
        let right = Math.max(this.right, other.right)
        let bottom = Math.max(this.bottom, other.bottom)
        return new Rect(left, top, right, bottom)
    }
}