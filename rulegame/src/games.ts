import { GridRule, MultiRule } from "./metagame";
import { PartialGrid } from "./partialgrid";
import {
    makeCharGrid,
    makeCharRule,
    makeDiagonalRule,
    ruleRotations,
    ruleSymmetriesH,
} from "./rulehelpers";

export type Stone = string;
export type Color = string;

export type PlayerRole = "nature" | "human" | "robot"
export type PlayerDescription = {
    name: string;
    color: string;
    role: PlayerRole;
}

export type PlayerMoves = PlayerDescription & {
    rules: MultiRule<Stone>[];
};

export type StoneStyle = {
    type: "nothing"
} | {
    type: "circle" | "block",
    color: Color
}

export type GameRules = {
    stones: { [key: Stone]: StoneStyle };
    initialBoard: PartialGrid<Stone>;
    players: PlayerMoves[];
    title: string;
    description: string;
};

function circleStone(color: Color): StoneStyle {
    return { type: "circle", color };
}

/*
export function makeFoxGame(): GameRules {
    return {
        stones: {
            f: circleStone("maroon"),
            g: circleStone("green"),
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
                rules: ruleRotations([makeCharRule(["g_"], ["_g"])]),
            },
            {
                name: "Fox",
                color: "chocolate",
                rules: [
                    ...ruleRotations([makeCharRule(["f_"], ["_f"])]),
                    ...ruleRotations([makeCharRule(["fg_"], ["__f"])]),
                ],
            },
        ],
    };
}

export function makeBlocksWorld(): GameRules {
    return {
        stones: {
            b: circleStone("gray"),
            "#": circleStone("black"),
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
            {
                name: "nature",
                color: "green",
                rules:
                    [
                        [
                            makeCharRule(["b_"], ["_b"])
                        ],
                    ],
            }
        ],
    }
}

// somewhat broken
// TODO: add stacks/multiset cells
export function makeGlueWorld(): GameRules {
    return {
        stones: {
            b: circleStone("gray"),
            f: circleStone("orange"),
            u: circleStone("darkred"),
            x: circleStone("red"),
            y: circleStone("blue"),
            z: circleStone("green"),
            w: circleStone("darkred"),
            k: circleStone("white"),
            "#": circleStone("black"),
        },
        initialBoard: makeCharGrid([
            "S0__bbb#",
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
                    ...ruleRotations([
                        makeCharRule(["b"], ["u"]),
                        makeCharRule(["b_"], ["bb"]),
                    ]),
                ],
            },
            {
                name: "fake_nature",
                color: "green",
                rules: [
                    [
                        makeCharRule(["u"], ["x"]),
                        makeCharRule(["0"], ["1"]),
                    ],
                    ...ruleRotations([
                        makeCharRule(["bx"], ["yx"]),
                    ]),
                    ...ruleRotations([
                        makeCharRule(["by"], ["yy"]),
                    ]),
                    [makeCharRule(["y#"], ["z#"])],
                    ...ruleRotations([
                        makeCharRule(["yz"], ["zz"]),
                    ]),
                    ...ruleRotations([
                        makeCharRule(["zx"], ["z_"]),
                        makeCharRule(["1"], ["0"]),
                    ]),
                    [
                        makeCharRule(["0"], ["0"]),
                        makeCharRule(["y"], ["f"]),
                    ],
                    [
                        makeCharRule(["0"], ["0"]),
                        makeCharRule(["z"], ["b"]),
                    ],
                    [
                        makeCharRule(["f_"], ["_f"]),
                    ],
                    [
                        makeCharRule(["f#"], ["b#"]),
                    ],
                    [
                        makeCharRule(["fb"], ["bb"]),
                    ],
                ],
            }
        ],
    };
}

// simplified draughts
// TODO: multiple jumps (requires nonlocal rules for turn order)
// TODO: mandatory captures (requires nature rules that automatically apply)
export function makeDraughts(): GameRules {
    return {
        stones: {
            b: circleStone("gray"),
            w: circleStone("white")
        },
        initialBoard: makeCharGrid([
            "b_b_b_b_",
            "_b_b_b_b",
            "b_b_b_b_",
            "________",
            "________",
            "_w_w_w_w",
            "w_w_w_w_",
            "_w_w_w_w",
            "########",
            "########",
        ]),
        players: [
            {
                name: "black",
                color: "lightblue",

                rules: [
                    ...ruleSymmetriesH([
                        makeDiagonalRule("b_", "_b"),
                    ]),
                    ...ruleSymmetriesH([
                        makeDiagonalRule("bw_", "__b"),
                    ]),
                ]
            },
            {
                name: "white",
                color: "lightgreen",

                rules: [
                    ...ruleSymmetriesH([
                        makeDiagonalRule("_w", "w_"),
                    ]),
                    ...ruleSymmetriesH([
                        makeDiagonalRule("_bw", "w__"),
                    ]),
                ]
            },
        ],
    }
}
*/
