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

export function makeDiagonalGrid<T>(diagonal: T[]): PartialGrid<T> {
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

enum Direction {
    Up = 0,
    Right = 1,
    Down = 2,
    Left = 3,
}

function transformPointToAxes(point: [number, number], axes: [Direction, Direction], size: [number, number]): [number, number] {
    let output: [number, number] = [0, 0]
    for (let i = 0; i < 2; i++) {
        if (axes[i] === Direction.Right) {
            output[0] = point[i]
        } else if (axes[i] === Direction.Left) {
            output[0] = size[0]-point[i]-1
        }
        if (axes[i] === Direction.Down) {
            output[1] = point[i]
        } else if (axes[i] === Direction.Up) {
            output[1] = size[1]-point[i]-1
        }
    }
    return output
}

function transformShapeToAxes(shape: [number, number], axes: [Direction, Direction]) {
    let ax0 = axes[0]
    if (ax0 === Direction.Right || ax0 === Direction.Left) {
        return shape
    } else {
        return [shape[1], shape[0]]
    }
}

export function transformGridToAxes<T>(grid: PartialGrid<T>, axes: [Direction, Direction]) {
    let shape = transformShapeToAxes([grid.rows, grid.columns], axes)
    let result = new PartialGrid<T>(shape[0], shape[1])
    grid.forNonEmpty((i, j, value) => {
        let p = transformPointToAxes([i, j], axes, [grid.rows, grid.columns])
        result.put(p[0], p[1], value)
    })
    return result
}
