import { createEmptyGrid } from "../../shared/utils";

// partially colored grid
export class PartialGrid<T> {
    cells: (T | null)[][];
    rows: number;
    columns: number;

    constructor(rows: number, columns: number) {
        this.rows = rows
        this.columns = columns
        this.cells = createEmptyGrid(this.rows, this.columns)
    }

    static fromArray<T>(array: (T|null)[][]): PartialGrid<T> {
        let rows = array.length
        let columns = array[0].length
        let grid = new PartialGrid<T>(rows, columns)
        grid.cells = array
        return grid
    }

    static emptyLike<S,T>(grid: PartialGrid<T>): PartialGrid<S> {
        return new PartialGrid<S>(grid.rows, grid.columns)
    }

    copy(): PartialGrid<T> {
        let result = new PartialGrid<T>(this.rows, this.columns)
        this.forEach((i, j) => {
            result.put(i, j, this.get(i, j)!)
        })
        return result
    }

    get(x: number, y: number): T | null {
        if (!this.isInside(x,y)) {
            return null
        }
        return this.cells[x][y]
    }

    put(x: number, y: number, value: T) {
        this.cells[x][y] = value
    }

    isInside(x: number, y: number) {
        return !(x < 0 || y < 0 || x >= this.rows || y >= this.columns)
    }

    has(x: number, y: number) {
        return this.isInside(x, y) && this.cells[x][y] !== null
    }

    forEach<S>(callback: (i: number, j: number, value: T | null) => S | null | undefined): S | null {
        for (let i = 0; i < this.cells.length; i++) {
            for (let j = 0; j < this.cells[i].length; j++) {
                let value = this.cells[i][j]
                let result = callback(i, j, value)
                if (result) {
                    return result
                }
            }
        }
        return null
    }

    forEmpty(callback: (i: number, j: number) => unknown) {
        this.forEach((i, j, value) => {
            if (value === null) {
                return callback(i, j)
            }
        })
    }

    forNonEmpty<S>(callback: (i: number, j: number, value: T) => S | null | undefined): S | null {
        return this.forEach((i, j, value) => {
            if (value !== null) {
                return callback(i, j, value)
            }
        })
    }

    emptyCells(): [number, number][] {
        let result: [number, number][] = []
        this.forEmpty((i, j) => {
            result.push([i, j])
        })
        return result
    }

    // rotate by 90 degrees
    rotate(): PartialGrid<T> {
        let result = new PartialGrid<T>(this.columns, this.rows)
        this.forEach((i, j, value) => {
            result.put(j, this.rows - i - 1, value!)
        })
        return result
    }

    // mirror in 2nd axis
    mirror(): PartialGrid<T> {
        let result = new PartialGrid<T>(this.rows, this.columns)
        this.forEach((i, j, value) => {
            result.put(i, this.columns - j - 1, value!)
        })
        return result
    }

    map<S>(f: (v: T, i: number, j: number) => S): PartialGrid<S> {
        let result = PartialGrid.emptyLike<S,T>(this)
        this.forNonEmpty((i: number, j: number, value) => {
            result.put(i, j, f(value, i, j))
        })
        return result
    }

    count(predicate: (v: T, i: number, j: number) => boolean): number {
        let count = 0
        this.forNonEmpty((i, j, value) => {
            if (predicate(value, i, j)) {
                count++
            }
        })
        return count
    }
}
