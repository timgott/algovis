import { HexGridSvg } from "./svghex.js";
import { HexCoordinate, HexGrid, getHexNeighbors } from "./hexgrid.js";
import { randomChoice } from "../../shared/utils.js";
import { findPath } from "./pathfinding.js";

enum GroundType {
    Plains,
    Forest,
    City,
    Mountain
}

const GroundColors: {[ground in GroundType]: string} = {
    [GroundType.Plains]: "lightgreen",
    [GroundType.Forest]: "darkgreen",
    [GroundType.City]: "lightgreen",
    [GroundType.Mountain]: "sienna"
}

class RailBuilder {
    map: HexGrid<GroundType>
    mapSvg: HexGridSvg

    hoverStart: HexCoordinate | null = null
    hoverPath: SVGElement | null = null

    startHover(coord: HexCoordinate) {
        this.hoverStart = coord
    }

    hover(coord: HexCoordinate) {
        if (this.hoverStart !== null) {
            this.hoverPath?.remove()
            let uniqueCoords = this.map.map((_, coord) => coord)
            let start = uniqueCoords.get(this.hoverStart)
            let end = uniqueCoords.get(coord)
            if (start === undefined || end === undefined) {
                return
            }
            let neighbors = (node: HexCoordinate) => {
                return getHexNeighbors(node)
                    .filter(c => uniqueCoords.has(c))
                    .map(c => uniqueCoords.get(c))
            }
            let path = findPath(
                start, end,
                neighbors,
                (a, b) => this.getEdgeCost(a, b)
            )
            this.hoverPath = this.mapSvg.createPath(this.mapSvg.lineGroup, path, {
                stroke: "black",
                "stroke-width": 4,
                "box-shadow": "0 0 10px red",
                fill: "transparent"
            })
        }
    }

    endHover() {
        this.hoverStart = null
        this.hoverPath = null
    }

    getEdgeCost(coordA: HexCoordinate, coordB: HexCoordinate) {
        if (this.map.get(coordA) === GroundType.Mountain
         || this.map.get(coordB) === GroundType.Mountain) {
            return 3
        } else {
            return 1
        }
    }

    constructor(map: HexGrid<GroundType>, mapSvg: HexGridSvg) {
        this.map = map
        this.mapSvg = mapSvg

        mapSvg.addCellListener("mousedown", (coord) => {
            if (this.hoverStart == null) {
                this.startHover(coord)
            } else {
                this.endHover()
            }
        })
        mapSvg.addCellListener("mouseover", (coord) => {
            this.hover(coord)
        })
    }
}

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

function generateMap(): HexGrid<GroundType> {
    let map = new HexGrid<GroundType>()

    map.set([0,0,0], GroundType.Plains)
    for (let i = 0; i < 100; i++) {
        let startPos = randomChoice(map.cells)
        map.drawRandomWalk(startPos, 20, GroundType.Plains)
    }
    for (let i = 0; i < 40; i++) {
        let startPos = randomChoice(map.cells)
        map.drawRandomWalk(startPos, 5, GroundType.Mountain)
    }

    // place cities
    for (let cell of map.cells) {
        if (map.get(cell) === GroundType.Plains) {
            let prob = 0.03
            if (isAtCoast(map, cell)) {
                prob = 0.1
            }
            if (isNear(map, cell, GroundType.Mountain)) {
                prob = 0.05
            }
            if (isNear(map, cell, GroundType.City)) {
                prob = 0.001
            }
            if (Math.random() < prob) {
                map.set(cell, GroundType.City)
            }
        }
    }

    return map
}

function main() {
    const map = generateMap()

    let root = document.getElementById("grid_root")!

    const colorMap = map.map((ground) => GroundColors[ground])
    let hexSvg = new HexGridSvg(root, colorMap, "100%", "100%")
    hexSvg.svg.setAttribute("style", "background: navy")

    for (let cell of map.cells) {
        if (map.get(cell) === GroundType.City) {
            hexSvg.createCircle(hexSvg.mapGroup, cell, 5, {
                fill: "black",
            })
        }
    }

    let railBuilder = new RailBuilder(map, hexSvg)
}

main()