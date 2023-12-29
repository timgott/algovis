import { assert, randomChoice } from "../../shared/utils"

export type HexCoordinate = readonly [number, number, number]

export const hexDirections = [
    [1, 0, -1],
    [0, 1, -1],
    [-1, 1, 0],
    [-1, 0, 1],
    [0, -1, 1],
    [1, -1, 0],
] as const

export type HexDirection = typeof hexDirections[number]

export function hexAdd([a,b,c]: HexCoordinate, [u,v,w]: HexCoordinate): HexCoordinate {
    return [a+u, b+v, c+w]
}

export function getHexDirection([a,b,c]: HexCoordinate, [u,v,w]: HexCoordinate): HexDirection | undefined {
    return hexDirections.find(([du,dv,dw]) => du === u-a && dv === v-b && dw === w-c)
}

export function isNeighbor(a: HexCoordinate, b: HexCoordinate): boolean {
    return getHexDirection(a, b) !== undefined
}

export function getHexNeighbors(coord: HexCoordinate): HexCoordinate[] {
    return hexDirections.map((dir) => hexAdd(coord, dir))
}

export class HexGrid<T> {
    data: T[][] = []
    uniqueCells: HexCoordinate[][] = []
    cells: HexCoordinate[] = []

    set(coord: HexCoordinate, value: T) {
        let [x, y, z] = coord
        if (this.data[x] === undefined) {
            this.data[x] = []
            this.uniqueCells[x] = []
        }
        if (this.data[x][y] === undefined) {
            this.cells.push(coord)
            this.uniqueCells[x][y] = coord
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

    getUniqueCoord([x, y, _]: HexCoordinate): HexCoordinate {
        assert(this.has([x, y, _]), "need to check if cell exists before getting it")
        return this.uniqueCells[x][y]
    }

    getNeighbors([x, y, z]: HexCoordinate): HexCoordinate[] {
        return hexDirections.map((dir) => hexAdd([x, y, z], dir))
            .filter((coord) => this.has(coord))
            .map((coord) => this.getUniqueCoord(coord))
    }

    map<U>(f: (value: T, coord: HexCoordinate) => U): HexGrid<U> {
        let newGrid = new HexGrid<U>()
        for (let coord of this.cells) {
            newGrid.set(coord, f(this.get(coord), coord))
        }
        return newGrid
    }
}