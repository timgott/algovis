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