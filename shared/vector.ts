export class Vector {
    constructor(public x: number, public y: number) {}

    // 0 is up, clockwise rotation in radians
    static fromAngle(angle: number, length: number = 1) {
        return new Vector(length * Math.sin(angle), length * -Math.cos(angle));
    }

    static Zero = new Vector(0, 0);

    add(other: Vector): Vector {
        return new Vector(this.x + other.x, this.y + other.y);
    }

    sub(other: Vector): Vector {
        return new Vector(this.x - other.x, this.y - other.y);
    }

    static add = Vector.prototype.add;
    static sub = Vector.prototype.sub;

    scale(factor: number): Vector {
        return new Vector(this.x * factor, this.y * factor);
    }

    length(): number {
        return Math.hypot(this.x, this.y);
    }
}