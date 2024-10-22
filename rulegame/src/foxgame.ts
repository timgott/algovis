import { PartialGrid } from "./partialgrid";
import { mk2dRule } from "./rulehelpers";

export function makeFoxInitialBoard() {
    return PartialGrid.fromArray(
        [
            [1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1],
            [0, 0, 2, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
        ]
    )
}

export const makeFoxRules = () => [
    ...mk2dRule([2,0], [0,2]),
    ...mk2dRule([2,1,0], [0,1,2])
]

export const makeGeeseRules = () => [
    ...mk2dRule([1,0], [0,1]),
]
