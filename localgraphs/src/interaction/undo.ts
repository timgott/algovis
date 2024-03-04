export class UndoHistory<T> {
    private history: T[] = []
    private index: number = 0

    constructor(private limit: number = Infinity, private clone: (state: T) => T = s => structuredClone(s)) {
    }

    push(state: T) {
        this.history = this.history.slice(this.index - this.limit, this.index)
        this.history.push(this.clone(state))
        this.index = this.history.length
    }
    undo(): T | undefined {
        if (this.index > 0) {
            this.index--
            return this.history[this.index]
        }
        return undefined
    }
    redo(): T | undefined {
        if (this.index < this.history.length - 1) {
            this.index++
            return this.history[this.index]
        }
        return undefined
    }
}