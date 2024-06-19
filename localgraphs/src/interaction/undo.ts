import { ensured } from "../../../shared/utils"

export class UndoHistory<T> {
    private history: T[] = []
    private index: number = 0

    constructor(private limit: number = Infinity, private clone: (state: T) => T = s => structuredClone(s)) {
    }

    push(state: T) {
        const newEnd = this.index
        this.history = this.history.slice(-this.limit, newEnd)
        const copy = this.clone(state)
        this.history.push(copy)
        this.index = this.history.length
    }
    undo(currentState: T): T | null {
        if (this.index == this.history.length) {
            this.push(currentState)
            this.index--
        }
        if (this.index > 0) {
            this.index--
            return ensured(this.history[this.index])
        }
        return null
    }
    redo(): T | null {
        if (this.index < this.history.length - 1) {
            this.index++
            return ensured(this.history[this.index])
        }
        return null
    }
}
