export class Queue<T> {
    // invariants:
    // : start <= capacity
    // : start <= i < capacity => array[i] != null
    private array: T[]
    private capacity: number
    private head: number

    constructor() {
        this.array = []
        this.capacity = 0
        this.head = 0
    }

    private rebuild(size: number) {
        let newArray = Array(size)
        for (let i = this.head; i < this.array.length; i++) {
            newArray[i] = this.array[this.head + i]
        }
    }
    private needsRebuild() {
        return this.array.length >= this.capacity
    }

    push(x: T) {
        if (this.needsRebuild()) {
            this.rebuild(this.length() * 2 + 1)
        }
        this.array[this.array.length] = x
    }
    shift(): T | undefined {
        if (this.head < this.array.length) {
            let value = this.array[this.head]
            this.head += 1
            return value
        } else {
            return undefined
        }
    }
    length(): number {
        return this.array.length - this.head
    }
    empty(): boolean {
        return this.length() === 0
    }
}
