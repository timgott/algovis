import { ensured } from "../../../shared/utils"

export class UndoHistory<T> {
    private history: T[] = []
    private index: number = 0

    constructor(private limit: number = Infinity, public clone: (state: T) => T = s => structuredClone(s)) {
    }

    push(state: T) {
        const copy = this.clone(state)
        this.pushAlreadyCloned(copy)
    }
    pushAlreadyCloned(copy: T) {
        const newEnd = this.index
        this.history = this.history.slice(-this.limit, newEnd)
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
