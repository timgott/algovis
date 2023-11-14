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