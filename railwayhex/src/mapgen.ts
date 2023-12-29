import { randInt, randomChoice } from "../../shared/utils"
import { generateCityName } from "./citynames"
import { City, GroundType, RailwayMap } from "./game"
import { HexCoordinate, HexDirection, HexGrid, getHexNeighbors, hexAdd, hexDirections } from "./hexgrid"

function isAtCoast(map: HexGrid<GroundType>, coord: HexCoordinate): boolean {
    for (let neighbor of getHexNeighbors(coord)) {
        if (!map.has(neighbor)) {
            return true
        }
    }
    return false
}

function isNear(map: HexGrid<GroundType>, coord: HexCoordinate, ground: GroundType): boolean {
    for (let neighbor of getHexNeighbors(coord)) {
        if (map.has(neighbor) && map.get(neighbor) === ground) {
            return true
        }
    }
    return false
}

function isNearCity(map: HexGrid<City>, coord: HexCoordinate): boolean {
    for (let neighbor of getHexNeighbors(coord)) {
        if (map.has(neighbor)) {
            return true
        }
    }
    return false
}

function drawRandomWalk<T>(map: HexGrid<T>, start: HexCoordinate, length: number, value: T) {
    let current = start
    for (let i = 0; i < length; i++) {
        map.set(current, value)
        const dir: HexDirection = randomChoice(hexDirections)
        current = hexAdd(current, dir)
    }
}

function generateTerrain(): HexGrid<GroundType> {
    let map = new HexGrid<GroundType>()

    map.set([0,0,0], GroundType.Plains)
    for (let i = 0; i < 100; i++) {
        let startPos = randomChoice(map.cells)
        drawRandomWalk(map, startPos, 20, GroundType.Plains)
    }
    for (let i = 0; i < 40; i++) {
        let startPos = randomChoice(map.cells)
        drawRandomWalk(map, startPos, 5, GroundType.Mountain)
    }
    return map
}

export function generateMap(): RailwayMap {
    let terrain = generateTerrain()
    let cities = new HexGrid<City>()
    // place cities
    for (let cell of terrain.cells) {
        if (terrain.get(cell) === GroundType.Plains) {
            let prob = 0.03
            if (isAtCoast(terrain, cell)) {
                prob = 0.1
            }
            if (isNear(terrain, cell, GroundType.Mountain)) {
                prob = 0.05
            }
            if (isNearCity(cities, cell)) {
                prob = 0.001
            }
            if (Math.random() < prob) {
                const isCapital = Math.random() < 0.1
                const name = generateCityName(isCapital)
                cities.set(cell, {
                    name: name,
                    capital: isCapital
                })
            }
        }
    }

    return new RailwayMap(terrain, cities)
}
