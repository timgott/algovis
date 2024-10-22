import { GridRule } from "./metagame";
import { PartialGrid } from "./partialgrid";
import { make2dRule, makeCharGrid, makeCharRule, ruleRotations } from "./rulehelpers";

export type Stone = string
export type Color = string

export type PlayerMoves = {
    name: string
    color: string
    rules: GridRule<Stone>[]
}

export type GameRules = {
    stones: { [key: Stone]: Color }
    initialBoard: PartialGrid<Stone>
    players: PlayerMoves[]
}

export function makeFoxGame(): GameRules {
    return {
        stones: {
            "f": "maroon",
            "g": "green",
            "#": "black",
        },
        initialBoard: makeCharGrid([
            "##ggg##",
            "##ggg##",
            "ggggggg",
            "___f___",
            "_______",
            "##___##",
            "##___##",
        ]),
        players: [
            {
                name: "Geese",
                color: "lightgreen",
                rules: [
                    ...ruleRotations(makeCharRule(["g_"], ["_g"]))
                ]
            },
            {
                name: "Fox",
                color: "chocolate",
                rules: [
                    ...ruleRotations(makeCharRule(["f_"], ["_f"])),
                    ...ruleRotations(makeCharRule(["fg_"], ["__f"]))
                ]
            },
        ]
    }
}
