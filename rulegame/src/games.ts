import { GridRule, MultiRule } from "./metagame";
import { PartialGrid } from "./partialgrid";
import {
    make2dRule,
    makeCharGrid,
    makeCharRule,
    ruleRotations,
} from "./rulehelpers";

export type Stone = string;
export type Color = string;

export type PlayerMoves = {
    name: string;
    color: string;
    rules: MultiRule<Stone>[];
};

export type GameRules = {
    stones: { [key: Stone]: Color };
    initialBoard: PartialGrid<Stone>;
    players: PlayerMoves[];
    nature: MultiRule<Stone>[];
};

export function makeFoxGame(): GameRules {
    return {
        stones: {
            f: "maroon",
            g: "green",
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
                rules: ruleRotations(makeCharRule(["g_"], ["_g"])).map((r) => [
                    r,
                ]),
            },
            {
                name: "Fox",
                color: "chocolate",
                rules: [
                    ...ruleRotations(makeCharRule(["f_"], ["_f"])).map((r) => [
                        r,
                    ]),
                    ...ruleRotations(makeCharRule(["fg_"], ["__f"])).map(
                        (r) => [r],
                    ),
                ],
            },
        ],
        nature: [],
    };
}

export function makeBlocksWorld(): GameRules {
    return {
        stones: {
            b: "gray",
            "#": "black",
        },
        initialBoard: makeCharGrid([
            "____bbb#",
            "_____bb#",
            "_______#",
            "_______#",
            "_______#",
            "_______#",
        ]),
        players: [
            {
                name: "human",
                color: "lightblue",
                rules: [
                    [
                        makeCharRule(["b"], ["_"]),
                        makeCharRule(["_"], ["b"]),
                    ],
                ],
            },
        ],
        nature: [
            [
                makeCharRule(["b_"], ["_b"])
            ],
        ],
    };
}

export function makeGlueWorld(): GameRules {
    return {
        stones: {
            b: "gray",
            B: "red",
            k: "white",
            "#": "black",
        },
        initialBoard: makeCharGrid([
            "____bbb#",
            "_____bb#",
            "_______#",
            "_______#",
            "_______#",
            "_______#",
            "_kkkkkkk",
        ]),
        players: [
            {
                name: "human",
                color: "lightblue",
                rules: [
                    [
                        makeCharRule(["b"], ["_"]),
                        makeCharRule(["_"], ["b"]),
                    ],
                ],
            },
        ],
        nature: [
            [
                makeCharRule(["bb"], ["bB"]),
            ],
        ],
    };
}
// simplified draughts
// TODO: multiple jumps (requires nonlocal rules for turn order)
// TODO: mandatory captures (requires nature rules that automatically apply)
