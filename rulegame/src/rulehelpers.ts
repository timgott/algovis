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

export function make2dRule<T>(before: T[], after: T[]): Rule<PartialGrid<T>>[] {
    return ruleRotations({
        pattern: PartialGrid.fromArray([before]),
        update: PartialGrid.fromArray([after]),
    })
}

function makeDiagonalGrid<T>(diagonal: T[]): PartialGrid<T> {
    let grid = new PartialGrid<T>(diagonal.length, diagonal.length)
    for (let i = 0; i < diagonal.length; i++) {
        grid.put(i, i, diagonal[i])
    }
    return grid
}

export function makeDiagonalRule<T>(before: T[], after: T[]): Rule<PartialGrid<T>>[] {
    return ruleRotations({
        pattern: makeDiagonalGrid(before),
        update: makeDiagonalGrid(after),
    })
}

// special characters: " "==wildcard
export function makeCharGrid(strings: string[]): PartialGrid<string> {
    let grid = new PartialGrid<string>(strings.length, strings[0].length)
    for (let i = 0; i < strings.length; i++) {
        for (let j = 0; j < strings[i].length; j++) {
            const char = strings[i][j]
            if (char !== " ") {
                grid.put(i, j, char)
            }
        }
    }
    return grid
}

export function makeCharRule(before: string[], after: string[]): Rule<PartialGrid<string>> {
    return {
        pattern: makeCharGrid(before),
        update: makeCharGrid(after),
    }
}
