import { assert, assertExists } from "../../shared/utils";
import { HexCoordinate, HexDirection, HexGrid, hexDirections, isNeighbor } from "./hexgrid";
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

    getEdgeCost(player: IPlayer | null, coordA: HexCoordinate, coordB: HexCoordinate) {
        assert(isNeighbor(coordA, coordB), "can only compute cost between neighbors")
        if (player !== null && this.hasPlayerConnection(player, coordA, coordB)) {
            return 0
        }
        if (this.terrain.get(coordA) === GroundType.Mountain
         || this.terrain.get(coordB) === GroundType.Mountain) {
            return 3
        } else {
            return 1
        }
    }

    findPath(player: IPlayer | null, start: HexCoordinate, end: HexCoordinate): HexCoordinate[] | null {
        if (!this.terrain.has(start) || !this.terrain.has(end)) {
            return null
        }
        start = this.terrain.getUniqueCoord(start)
        end = this.terrain.getUniqueCoord(end)

        return findPath(
            start, end,
            (c: HexCoordinate) => this.terrain.getNeighbors(c),
            (a, b) => this.getEdgeCost(player, a, b)
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

    async run() {
        while (true) {
            let budget = 10
            for (let player of this.players) {
                let buildActions = await player.performBuildTurn(budget)
                let cost = 0
                for (let [start, end] of buildActions) {
                    cost += this.map.getEdgeCost(player, start, end)
                    if (cost > budget) {
                        console.log("Player spent more than budget")
                        break;
                    }
                    this.map.buildConnection(player, start, end)
                    this.graphics.drawTrack(player, [start, end])
                }
            }
        }
    }
}