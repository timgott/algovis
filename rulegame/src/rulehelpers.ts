import { Rule } from "./metagame";
import { PartialGrid } from "./partialgrid";

export function ruleRotations<T>(rule: Rule<PartialGrid<T>>): Rule<PartialGrid<T>>[] {
    let result: Rule<PartialGrid<T>>[] = [];
    for (let i = 0; i < 4; i++) {
        result.push(rule)
        rule = {
            pattern: rule.pattern.rotate(),
            update: rule.update.rotate()
        }
    }
    return result
}

export function mk2dRule<T>(before: T[], after: T[]): Rule<PartialGrid<T>>[] {
    return ruleRotations({
        pattern: PartialGrid.fromArray([before]),
        update: PartialGrid.fromArray([after]),
    })
}

function mkDiagonalGrid<T>(diagonal: T[]): PartialGrid<T> {
    let grid = new PartialGrid<T>(diagonal.length, diagonal.length)
    for (let i = 0; i < diagonal.length; i++) {
        grid.put(i, i, diagonal[i])
    }
    return grid
}

export function mkDiagonalRule<T>(before: T[], after: T[]): Rule<PartialGrid<T>>[] {
    return ruleRotations({
        pattern: mkDiagonalGrid(before),
        update: mkDiagonalGrid(after),
    })
}
