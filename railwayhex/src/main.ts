import { HexGridSvg } from "./svghex.js";
import { HexCoordinate, HexGrid } from "./hexgrid.js";
import { assertExists, randomChoice, sleep } from "../../shared/utils.js";
import { limitPathBudget, getPathEdges as splitPathEdges } from "./pathfinding.js";
import { generateMap } from "./mapgen.js";
import { GroundType, IGameUserInterface, IPlayer, RailwayGame, RailwayMap } from "./game.js";
import { Vector } from "../../shared/vector.js";



const GroundColors: {[ground in GroundType]: string} = {
    [GroundType.Plains]: "lightgreen",
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
        if (this.hoverStart !== null) {
            // high operating ratio so that we can build new connections between existing tracks
            assertExists(this.currentPlayer)
            const path = this.map.findPath(this.currentPlayer, this.hoverStart, coord, 5)
            this.hoverPath?.remove()
            if (path !== null) {
                let offsets = path.map(c => new Vector(0, 0))
                this.hoverPath = this.mapSvg.createPath(this.mapSvg.lineGroup, path, offsets, {
                    "stroke-width": 2,
                    "stroke-dasharray": "5,5",
                    fill: "transparent",
                    stroke: "gray",
                })
                this.path = path
            } else {
                this.path = []
                this.hoverPath = null
            }
        }
    }

    endHover() {
        this.hoverPath?.remove()
        this.hoverStart = null
        this.hoverPath = null
    }
}

class GameSvgRenderer implements IGameUserInterface {
    offsetMap: HexGrid<Map<IPlayer, Vector>> = this.map.terrain.map((c) => new Map<IPlayer, Vector>())

    constructor(private mapSvg: HexGridSvg, private map: RailwayMap, private playerColors: Map<IPlayer, string>) {
    }

    drawTrack(player: IPlayer, path: HexCoordinate[]): void {
        let offsets = path.map((c) => {
            if (this.map.cities.has(c)) {
                return Vector.Zero
            }
            let cellOffsets = this.offsetMap.get(c)
            if (cellOffsets.has(player)) {
                return cellOffsets.get(player)!
            }
            let i = cellOffsets.size
            let sign = i % 2 === 0 ? 1 : -1
            let d = Math.ceil(i/2)*3*sign
            let offset = new Vector(d, d)
            cellOffsets.set(player, offset)
            return offset
        })
        this.mapSvg.createTrackPath(path, offsets, this.playerColors.get(player)!)
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

class AIPlayer implements IPlayer {
    constructor(private map: RailwayMap) {}

    async performBuildTurn(budget: number): Promise<[HexCoordinate, HexCoordinate][]> {
        await sleep(200)
        let buildCommands: [HexCoordinate, HexCoordinate][] = []
        let cities = this.map.cities.cells
        let connected = cities.filter((city) => this.map.connections.get(city).has(this))
        if (connected.length === 0) {
            // random start city
            connected = [randomChoice(cities)]
        }
        // do not attempt connecting cities with 2 existing connections except capitals
        let unconnected = cities.filter((city) => {
            if (this.map.connections.get(city).has(this)) {
                return false
            }
            return this.map.cities.get(city).capital || this.map.connections.get(city).size <= 1
        })
        if (unconnected.length === 0) {
            // no cities left
            return []
        }

        let start = randomChoice(connected)
        let end = randomChoice(unconnected)

        const operatingRatio = 0.5
        let [path, cost] = limitPathBudget(
            this.map.findPath(this, start, end, operatingRatio),
            (a,b) => this.map.getEdgeBuildCost(this,a,b),
            budget
        )
        budget -= cost
        buildCommands.push(...splitPathEdges(path))
        console.log("AI remaining budget: ", budget, buildCommands)
        return buildCommands
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
    let humanPlayer1 = new HumanPlayer(railBuilder)
    let player1 = new AIPlayer(railMap)
    let player2 = new AIPlayer(railMap)
    let player3 = new AIPlayer(railMap)
    let player4 = new AIPlayer(railMap)
    let playerColors = new Map<IPlayer, string>([
        [player1, "darkred"],
        [player2, "darkblue"],
        [player3, "darkorange"],
        [player4, "purple"],
        [humanPlayer1, "darkgreen"]
    ])
    let renderer = new GameSvgRenderer(hexSvg, railMap, playerColors)
    let game = new RailwayGame(railMap, [player1, player2, player3], renderer)
    game.run()
}

main()