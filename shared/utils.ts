export function createEmptyGrid<T>(rows: number, columns: number): (T|null)[][] {
    return createGrid<T|null>(rows, columns, (i, j) => null)
}

export function createGrid<T>(rows: number, columns: number, init: (i: number, j: number) => T): T[][] {
    let arr: T[][] = []
    for (let i=0; i < rows; i++) {
        arr.push([])
        for (let j=0; j < columns; j++) {
            arr[i].push(init(i, j))
        }
    }
    return arr
}

export function randInt(limit: number): number {
    return Math.floor(Math.random() * limit)
}

// in place shuffle
export function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i >= 0; i--) {
        let j = randInt(i + 1)
        let temp = arr[i]
        arr[i] = arr[j]
        arr[j] = temp
    }
    return arr
}

export function randomChoice<T>(arr: readonly T[]): T {
    return arr[randInt(arr.length)]
}

export function popRandomUnordered<T>(arr: T[]): T {
    let index = randInt(arr.length)
    let result = arr[index]
    arr[index] = arr[arr.length - 1]
    arr.pop()
    return result
}

export function assert(condition: boolean, message: string): asserts condition {
    if (!condition) {
        throw message
    }
}

export function assertExists<T>(value: T | null | undefined, message: string = "value should not be undefined"): asserts value is T {
    if (value === undefined || value === null) {
        throw message
    }
}

export function min<T>(items: Iterable<T>, key: (item: T) => number): T | undefined {
    let minItem: T | undefined = undefined
    let minValue = Infinity
    for (let item of items) {
        let value = key(item)
        if (value < minValue) {
            minValue = value
            minItem = item
        }
    }
    return minItem
}

export function range(limit: number): Iterable<number> {
    return Array(limit).keys()
}

declare global {
    interface Set<T> {
        map<U>(f: (item: T) => U): Set<U>
        find(predicate: (item: T) => boolean): T | undefined
    }
}

Set.prototype.map = function<T, U>(this: Set<T>, f: (item: T) => U): Set<U> {
    let result = new Set<U>()
    for (let item of this) {
        result.add(f(item))
    }
    return result
}

Set.prototype.find = function<T>(this: Set<T>, predicate: (item: T) => boolean): T | undefined {
    for (let item of this) {
        if (predicate(item)) {
            return item
        }
    }
    return undefined
}

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}