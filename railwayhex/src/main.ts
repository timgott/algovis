import { HexGridSvg } from "./svghex.js";
import { HexCoordinate, HexDirection, HexGrid, getHexNeighbors } from "./hexgrid.js";
import { assert, randomChoice } from "../../shared/utils.js";
import { findPath, getPathEdges as splitPathEdges } from "./pathfinding.js";
import { generateMap } from "./mapgen.js";
import { GroundType, IGameUserInterface, IPlayer, RailwayGame, RailwayMap } from "./game.js";
import { generateCityName } from "./citynames.js";


const GroundColors: {[ground in GroundType]: string} = {
    [GroundType.Plains]: "lightgreen",
    [GroundType.Forest]: "darkgreen",
    [GroundType.City]: "lightgreen",
    [GroundType.Mountain]: "sienna"
}

class RailBuilder {
    map: RailwayMap
    mapSvg: HexGridSvg
    
    currentPlayer: IPlayer | null = null
    hoverStart: HexCoordinate | null = null
    hoverPath: SVGElement | null = null

    path: HexCoordinate[] = []
    onFinish: (path: HexCoordinate[]) => void = () => {}

    constructor(map: RailwayMap, mapSvg: HexGridSvg) {
        this.map = map
        this.mapSvg = mapSvg

        mapSvg.addCellListener("mousedown", (coord) => {
            if (this.hoverStart == null) {
                this.startHover(coord)
            } else {
                this.endHover()
                this.onFinish(this.path)
            }
        })
        mapSvg.addCellListener("mouseover", (coord) => {
            this.hover(coord)
        })
    }

    async performBuild(player: IPlayer): Promise<HexCoordinate[]> {
        this.currentPlayer = player
        let result: HexCoordinate[] = await new Promise((resolve, reject) => {
            this.onFinish = resolve
        })
        this.currentPlayer = null
        return result
    }

    startHover(coord: HexCoordinate) {
        if (this.currentPlayer) {
            this.hoverStart = coord
        }
    }

    hover(coord: HexCoordinate) {
        assert(this.currentPlayer !== null, "should only hover when player is active")
        if (this.hoverStart !== null) {
            // do not pass current player so that we can build new connections between existing tracks
            const path = this.map.findPath(null, this.hoverStart, coord)
            this.hoverPath?.remove()
            if (path !== null) {
                this.hoverPath = this.mapSvg.createTrackPath(path, "gray")
            }
            this.path = path ?? []
        }
    }

    endHover() {
        this.hoverPath?.remove()
        this.hoverStart = null
        this.hoverPath = null
    }
}

class GameSvgRenderer implements IGameUserInterface {
    constructor(private mapSvg: HexGridSvg, private playerColors: Map<IPlayer, string>) {
    }

    drawTrack(player: IPlayer, path: HexCoordinate[]): void {
        this.mapSvg.createTrackPath(path, this.playerColors.get(player)!)
    }
    updateBudget(player: IPlayer, value: number): void {
        console.log("update budget", player, value)
    }
}

class HumanPlayer implements IPlayer {
    constructor(private builder: RailBuilder) {}

    async performBuildTurn(budget: number): Promise<[HexCoordinate, HexCoordinate][]> {
        return splitPathEdges(await this.builder.performBuild(this))
    }

}

function main() {
    const railMap = generateMap()

    let root = document.getElementById("grid_root")!

    const colorMap = railMap.terrain.map((ground) => GroundColors[ground])
    let hexSvg = new HexGridSvg(root, colorMap, "100%", "100%")
    hexSvg.svg.setAttribute("style", "background: navy")

    for (let cell of railMap.cities.cells) {
        let city = railMap.cities.get(cell)
        hexSvg.createCityMarker(cell, city.name, city.capital)
    }

    let railBuilder = new RailBuilder(railMap, hexSvg)
    let player1 = new HumanPlayer(railBuilder)
    let player2 = new HumanPlayer(railBuilder)
    let playerColors = new Map([
        [player1, "darkred"],
        [player2, "orange"]
    ])
    let renderer = new GameSvgRenderer(hexSvg, playerColors)
    let game = new RailwayGame(railMap, [player1], renderer)
    game.run()
}

main()