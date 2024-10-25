import { MultiRule, Rule } from "./metagame";
import { PartialGrid } from "./partialgrid";

export function ruleRotations<T>(rule: MultiRule<T>): MultiRule<T>[] {
    let result: MultiRule<T>[] = [];
    for (let i = 0; i < 4; i++) {
        result.push(rule)
        rule = rule.map(subrule => {
           return {
                pattern: subrule.pattern.rotate(),
                after: subrule.after.rotate()
            }
        })
    }
    return result
}

export function ruleSymmetriesH<T>(rule: MultiRule<T>): MultiRule<T>[] {
    let result: MultiRule<T>[] = [];
    for (let i = 0; i < 2; i++) {
        result.push(rule)
        rule = rule.map(subrule => {
            return {
                pattern: subrule.pattern.mirror(),
                after: subrule.after.mirror()
            }
        })
    }
    return result
}

function makeDiagonalGrid<T>(diagonal: T[]): PartialGrid<T> {
    let grid = new PartialGrid<T>(diagonal.length, diagonal.length)
    for (let i = 0; i < diagonal.length; i++) {
        grid.put(i, i, diagonal[i])
    }
    return grid
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

export function makeDiagonalRule(before: string, after: string): Rule<PartialGrid<string>> {
    return {
        pattern: makeDiagonalGrid(before.split("")),
        after: makeDiagonalGrid(after.split("")),
    }
}

export function makeCharRule(before: string[], after: string[]): Rule<PartialGrid<string>> {
    const pattern = makeCharGrid(before)
    const delta = makeCharGrid(after).differenceTo(pattern)
    return {
        pattern: makeCharGrid(before),
        after: delta,
    }
}
