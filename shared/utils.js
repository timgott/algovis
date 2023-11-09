export function createEmptyGrid(rows, columns) {
    return createGrid(rows, columns, (i, j) => null);
}
export function createGrid(rows, columns, init) {
    let arr = [];
    for (let i = 0; i < rows; i++) {
        arr.push([]);
        for (let j = 0; j < columns; j++) {
            arr[i].push(init(i, j));
        }
    }
    return arr;
}
