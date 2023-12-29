import { assert, randInt } from "../../shared/utils";
import { HexCoordinate, HexGrid, isNeighbor } from "./hexgrid";
import { findPath } from "./pathfinding";

export enum GroundType {
    Plains,
    Mountain
}

export interface IPlayer {
    performBuildTurn(budget: number): Promise<[HexCoordinate, HexCoordinate][]>;
}

export type City = {
    name: string
    capital: boolean
}

export class RailwayMap {
    terrain: HexGrid<GroundType>
    cities: HexGrid<City>
    connections: HexGrid<Map<IPlayer,Set<HexCoordinate>>>

    constructor(terrain: HexGrid<GroundType>, cities: HexGrid<City>) {
        this.terrain = terrain
        this.connections = terrain.map(() => new Map())
        this.cities = cities
    }

    hasPlayerConnection(player: IPlayer, coordA: HexCoordinate, coordB: HexCoordinate): boolean {
        return this.connections.get(coordA).get(player)?.has(coordB) ?? false
    }

    getEdgeTerrainCost(coordA: HexCoordinate, coordB: HexCoordinate) {
        if (this.terrain.get(coordA) === GroundType.Mountain
        || this.terrain.get(coordB) === GroundType.Mountain) {
           return 3
        } else {
            return 1
        }
    }

    getConnectionCost(player: IPlayer, coord: HexCoordinate) {
        const connectionCost = 1
        let cellConnections = this.connections.get(coord)
        if (cellConnections.has(player)) {
            return 0
        } else {
            return cellConnections.size * connectionCost // 1 cost for each connected network
        }
    }

    getParallelBuildCost(player: IPlayer, coordA: HexCoordinate, coordB: HexCoordinate) {
        const parallelBuildCost = 2 // per half edge
        // assuming not yet connected by player
        // half edges on cities do not count
        let costingHalfEdges = [coordA, coordB].filter(c => !this.cities.has(c)).length
        let connectionsA = this.connections.get(coordA)
        let cost = 0
        for (let [player, connections] of connectionsA) {
            if (connections.has(coordB)) {
                cost += parallelBuildCost*costingHalfEdges
            }
        }
        return cost
    }
    
    getEdgePlayerCost(player: IPlayer, coordA: HexCoordinate, coordB: HexCoordinate) {
        // assuming coordA is already connected
        return this.getConnectionCost(player, coordB) + this.getParallelBuildCost(player, coordA, coordB)
    }
    
    getEdgeBuildCost(player: IPlayer, coordA: HexCoordinate, coordB: HexCoordinate) {
        assert(isNeighbor(coordA, coordB), "can only compute cost between neighbors")
        if (this.hasPlayerConnection(player, coordA, coordB)) {
            return 0
        }
        return this.getEdgeTerrainCost(coordA, coordB) + this.getEdgePlayerCost(player, coordA, coordB)
    }

    estimateEdgeOperatingCost(player: IPlayer, coordA: HexCoordinate, coordB: HexCoordinate) {
        if (this.terrain.get(coordA) === GroundType.Mountain || this.terrain.get(coordB) === GroundType.Mountain) {
            return 1.5
        }
        return 1
    }

    findPath(player: IPlayer, start: HexCoordinate, end: HexCoordinate, operatingRatio: number): HexCoordinate[] | null {
        if (!this.terrain.has(start) || !this.terrain.has(end)) {
            return null
        }
        start = this.terrain.getUniqueCoord(start)
        end = this.terrain.getUniqueCoord(end)

        return findPath(
            start, end,
            (c: HexCoordinate) => this.terrain.getNeighbors(c),
            (a, b) => this.getEdgeBuildCost(player, a, b) + this.estimateEdgeOperatingCost(player, a, b)*operatingRatio
        )
    }

    private connectOneDirection(player: IPlayer, from: HexCoordinate, to: HexCoordinate) {
        if (!this.connections.get(from).has(player)) {
            this.connections.get(from).set(player, new Set([to]))
        } else {
            this.connections.get(from).get(player)!.add(to)
        }
    }

    buildConnection(player: IPlayer, start: HexCoordinate, neighbor: HexCoordinate): void {
        assert(isNeighbor(start, neighbor), "can only build direct connections between neighbors")
        this.connectOneDirection(player, start, neighbor)
        this.connectOneDirection(player, neighbor, start)
    }
}

export interface IGameUserInterface {
    drawTrack(player: IPlayer, path: HexCoordinate[]): void
    updateBudget(player: IPlayer, value: number): void
}

export class RailwayGame {
    map: RailwayMap
    players: IPlayer[]
    accounts: Map<IPlayer, number> = new Map()

    graphics: IGameUserInterface

    constructor(map: RailwayMap, players: IPlayer[], graphics: IGameUserInterface) {
        this.map = map
        this.players = players
        this.graphics = graphics

        for (let player of players) {
            this.setBudget(player, 20)
        }
    }

    setBudget(player: IPlayer, value: number) {
        this.accounts.set(player, value)
        this.graphics.updateBudget(player, value)
    }

    subtractBudget(player: IPlayer, amount: number) {
        return this.setBudget(player, this.accounts.get(player)! - amount)
    }

    executeBuildActions(player: IPlayer, buildActions: [HexCoordinate, HexCoordinate][], budget: number) {
        let cost = 0
        for (let [start, end] of buildActions) {
            if (!this.map.connections.get(start).get(player)?.has(end)) {
                cost += this.map.getEdgeBuildCost(player, start, end)
                if (cost > budget) {
                    console.log("Player spent more than budget")
                    break;
                }
                this.map.buildConnection(player, start, end)
                this.graphics.drawTrack(player, [start, end])
                console.log(`Player ${player} built ${start}, ${end}`)
            }
        }
        return cost
    }

    async run() {
        while (true) {
            let budget = 10 + randInt(10)
            for (let player of this.players) {
                let cost = 0
                while (cost < budget) {
                    let remainingBudget = budget - cost
                    console.log("Player", player, "has", remainingBudget, "budget")
                    let buildActions = await player.performBuildTurn(remainingBudget)
                    let stepCost = this.executeBuildActions(player, buildActions, remainingBudget)
                    cost += stepCost
                    if (stepCost === 0) {
                        break
                    }
                }
                console.log("Player", player, "spent", cost)
            }
        }
    }
}