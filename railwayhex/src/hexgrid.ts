import { assert, randomChoice } from "../../shared/utils"

export type HexCoordinate = [number, number, number]

const HexDirections: HexCoordinate[] = [
    [1, 0, -1],
    [0, 1, -1],
    [-1, 1, 0],
    [-1, 0, 1],
    [0, -1, 1],
    [1, -1, 0],
]


function hexAdd([a,b,c]: HexCoordinate, [u,v,w]: HexCoordinate): HexCoordinate {
    return [a+u, b+v, c+w]
}

export function getHexNeighbors(coord: HexCoordinate): HexCoordinate[] {
    return HexDirections.map((dir) => hexAdd(coord, dir))
}

export class HexGrid<T> {
    data: T[][] = []
    cells: HexCoordinate[] = []

    set([x, y, z]: HexCoordinate, value: T) {
        if (this.data[x] === undefined) {
            this.data[x] = []
        }
        if (this.data[x][y] === undefined) {
            this.cells.push([x,y,z])
        }
        this.data[x][y] = value
    }

    get([x, y, _]: HexCoordinate): T {
        assert(this.has([x, y, _]), "need to check if cell exists before getting it")
        return this.data[x][y]
    }

    has([x, y, _]: HexCoordinate): boolean {
        return this.data[x] !== undefined && this.data[x][y] !== undefined
    }

    drawRandomWalk(start: HexCoordinate, length: number, value: T) {
        let current = start
        for (let i = 0; i < length; i++) {
            this.set(current, value)
            const dir = randomChoice(HexDirections)
            current = hexAdd(current, dir)
        }
    }

    map<U>(f: (value: T, coord: HexCoordinate) => U): HexGrid<U> {
        let newGrid = new HexGrid<U>()
        for (let coord of this.cells) {
            newGrid.set(coord, f(this.get(coord), coord))
        }
        return newGrid
    }
}