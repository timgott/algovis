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
            if (!this.map.has(this.hoverStart) || !this.map.has(coord)) {
                return
            }
            let start = this.map.getUniqueCoord(this.hoverStart)
            let end = this.map.getUniqueCoord(coord)

            let path = findPath(
                start, end,
                (c: HexCoordinate) => this.map.getNeighbors(c),
                (a, b) => this.getEdgeCost(a, b)
            )

            this.hoverPath?.remove()
            this.hoverPath = this.mapSvg.createPath(this.mapSvg.lineGroup, path, {
                stroke: "darkred",
                "stroke-width": 4,
                fill: "transparent",
                "stroke-linejoin": "round",
                "stroke-linecap": "round",
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

function generateCityName() {
    const prefixes = [
        "New ",
        "Old ",
        "Bad ",
        "Los ",
        "Las ",
        "St. ",
    ]

    const firstParts = [
        "Lon",
        "New",
        "Old",
        "York",
        "Ham",
        "Birm",
        "South",
        "North",
        "East",
        "West",
        "Hemp",
        "Bright",
        "Stein",
        "Berg",
        "Klein",
        "Groß",
        "Bad",
        "Schön",
        "Schwarz",
        "Stras",
        "Darm",
        "Dürk",
        "Ber",
        "Dres",
        "Ober",
        "Unter",
        "Ve",
        "Veg",
        "Mün",
        "Lei",
        "Eppel",
        "Man",
        "Wash",
        "Mos",
        "Dub",
        "Peter",
        "Kan",
        "San",
        "Zwick",
        "Wein",
        "Heid",
    ]

    const middleParts = [
        "ing",
        "wester",
        "che",
        "brook",
        "brück",
        "as",
        "wald",
        "er",
        "unter",
        "e",
        "i",
        "o",
        "s",
        "t",
        "li",
        "bo",
        "sen",
        "kirch",
        "orz",
        "el",
    ]

    const secondParts = [
        "don",
        "ville",
        "burg",
        "town",
        "hausen",
        "heim",
        "lingen",
        "berg",
        "furt",
        "kirchen",
        "ton",
        "ham",
        "wick",
        "wich",
        "stadt",
        "lin",
        "zig",
        "dorf",
        "bach",
        "lyn",
        "brück",
        "ster",
        "gow",
        "chen",
        "born",
        "ford",
        "as",
        "ow",
        "au",
    ]

    let prefix = ""
    let middle = ""
    if (Math.random() < 0.1) {
        prefix = randomChoice(prefixes)
    }
    if (Math.random() < 0.3) {
        middle = randomChoice(middleParts)
    }

    return prefix + randomChoice(firstParts) + middle + randomChoice(secondParts)
}

function main() {
    const map = generateMap()

    let root = document.getElementById("grid_root")!

    const colorMap = map.map((ground) => GroundColors[ground])
    let hexSvg = new HexGridSvg(root, colorMap, "100%", "100%")
    hexSvg.svg.setAttribute("style", "background: navy")

    for (let cell of map.cells) {
        if (map.get(cell) === GroundType.City) {
            const capital = Math.random() < 0.1
            hexSvg.createCityMarker(cell, generateCityName(), capital)
        }
    }

    let railBuilder = new RailBuilder(map, hexSvg)
}

main()