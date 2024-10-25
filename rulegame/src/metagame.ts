import { assert, mapFromFunction } from "../../shared/utils";
import { PartialGrid } from "./partialgrid";

//
export type Rule<S> = {
    pattern: S
    after: S
}

// S: subpattern type, e.g. subgrid or partial subgrid
// L: location type, e.g. 2D position
interface State<S, L> {
    matches(pattern: S): L[];
    apply(location: L, rule: Rule<S>): unknown;
}

export type GridPos = [number, number]

export type GridRule<T> = Rule<PartialGrid<T>>

type RuleMatch<T> = {
    offset: GridPos
    rule: GridRule<T>
}

export type MultiRule<T> = GridRule<T>[]
export type MultiRuleMatch<T> = RuleMatch<T>[]

export function checkMatchSubgrid<T>(grid: PartialGrid<T>, pattern: PartialGrid<T>, [i, j]: GridPos) {
    let isMatch = true
    pattern.forNonEmpty((u, v, patternValue) => {
        if (grid.get(i + u, j + v) !== patternValue) {
            isMatch = false
            return "break"
        }
    })
    return isMatch
}

export function findSubgridMatches<T>(grid: PartialGrid<T>, pattern: PartialGrid<T>): GridPos[] {
    // not most efficient, but good enough now
    let matches: GridPos[] = []
    grid.forNonEmpty((i, j, _) => {
        const pos: GridPos = [i,j]
        if (checkMatchSubgrid(grid, pattern, pos)) {
            matches.push(pos)
        }
    })
    return matches
}

function findRuleMatches<T>(grid: PartialGrid<T>, rules: Iterable<GridRule<T>>): RuleMatch<T>[] {
    let matches: RuleMatch<T>[] = []
    for (let rule of rules) {
        const pattern = rule.pattern
        for (let offset of findSubgridMatches(grid, pattern)) {
            matches.push({offset, rule})
        }
    }
    return matches
}

export function cartesianProduct<T>(arrays: T[][]): T[][] {
    if (arrays.length === 0) {
        return [[]]
    }
    const [first, ...rest] = arrays
    const restProduct = cartesianProduct(rest)
    return first.flatMap((x) => restProduct.map((xs) => [x, ...xs]))
}

function haveIndependentDelta<T>(grid: PartialGrid<T>, matches: RuleMatch<T>[]) {
    // no rule in a set may change the grid to violate precondition of other rules
    let jointPattern = grid.map(() => new Map<T, Set<RuleMatch<T>>>())
    for (let match of matches) {
        let pattern = match.rule.pattern
        let [i,j] = match.offset
        pattern.forNonEmpty((u,v, value) => {
            let map = jointPattern.get(i+u, j+v)!
            let set = map.get(value) ?? new Set()
            set.add(match)
            map.set(value, set)
        })
    }
    for (let match of matches) {
        let [i,j] = match.offset
        let overlaps = match.rule.after.forNonEmpty((u, v, value) => {
            for (let [otherValue, otherMatches] of jointPattern.get(i + u, j + v)!) {
                if (otherValue !== value && (!otherMatches.has(match) || otherMatches.size > 1)) {
                    return true
                }
            }
        })
        if (overlaps) {
            return false
        }
    }
    return true
}

export function findMultiRuleMatches<T>(grid: PartialGrid<T>, multiRules: MultiRule<T>[]): RuleMatch<T>[][] {
    const rules = new Set(multiRules.flat())
    const ruleMatches = mapFromFunction(rules, (rule) => findRuleMatches(grid, [rule]))
    // generate cartesian product of rule matches
    const multiMatches = multiRules.flatMap(
        (rules) => cartesianProduct(rules.map((rule) => ruleMatches.get(rule)!))
    )
    // return the ones that are sequentially independent
    return multiMatches.filter((matches) => haveIndependentDelta(grid, matches))
}

function putSubgrid<T>(grid: PartialGrid<T>, [i, j]: GridPos, subgrid: PartialGrid<T>) {
    subgrid.forNonEmpty((u, v, value) => {
        grid.put(i + u, j + v, value)
    })
}

function applyGridRule<T>(grid: PartialGrid<T>, match: RuleMatch<T>) {
    return putSubgrid(grid, match.offset, match.rule.after)
}

type RuleMatchGrid<T> = PartialGrid<Set<MultiRuleMatch<T>>>

function binAtAllChanges<T>(matchGrid: RuleMatchGrid<T>, matches: MultiRuleMatch<T>) {
    // write rule match at all cells that it would change
    for (let match of matches) {
        const [i,j] = match.offset
        const area = match.rule.pattern.or(match.rule.after)
        area.forNonEmpty((u,v) => {
            matchGrid.get(i+u, j+v)!.add(matches)
        })
    }
}

function makeChangeGrid<T>(grid: PartialGrid<T>, ruleMatches: Iterable<MultiRuleMatch<T>>): RuleMatchGrid<T> {
    let changeGrid = grid.map(() => new Set<MultiRuleMatch<T>>())
    for (const match of ruleMatches) {
        binAtAllChanges(changeGrid, match)
    }
    return changeGrid
}

export interface IPlayer<T> {
    chooseMove(board: PartialGrid<T>): Promise<MultiRuleMatch<T> | null>
}

export interface IBoardUserInterface<T> {
    drawBoard(board: PartialGrid<T>): void
}

export interface IHumanPlayInterface<T> {
    selectCell(board: PartialGrid<T>, selectable: PartialGrid<boolean>, path: GridPos[]): Promise<GridPos>
}

export class Player<T> implements IPlayer<T> {
    constructor(private name: string, private ui: IHumanPlayInterface<T>, private allowedRules: MultiRule<T>[]) {}

    async chooseMove(board: PartialGrid<T>): Promise<MultiRuleMatch<T> | null> {
        let matches = findMultiRuleMatches(board, this.allowedRules)
        if (matches.length === 0) {
            console.log("No possible moves found for", this.name)
            return null
        }
        do {
            console.log("Player", this.name, "chooses move.")
            let changeGrid = makeChangeGrid(board, matches)
            //changeGrid = filterToCanonicalCell(matches, changeGrid)
            let selectable = changeGrid.map((set) => set.size > 0 && (set.size < matches.length || matches.length === 1))
            let pos = await this.ui.selectCell(board, selectable, [])
            let newMatches = Array.from(changeGrid.get(...pos)!)
            assert(newMatches.length > 0, "should only select occupied cells")
            matches = newMatches
            console.log(matches.length, "matches left")
        } while (matches.length > 1)
        return matches[0]
    }
}

async function runNature<T>(board: PartialGrid<T>, nature: IPlayer<T>) {
    while(true) {
        let move = await nature.chooseMove(board)
        if (!move) {
            return
        }
        for (let patch of move) {
            applyGridRule(board, patch)
        }
    }
}

export async function runGame<T>(initialBoard: PartialGrid<T>, ui: IBoardUserInterface<T>, players: IPlayer<T>[], nature: IPlayer<T>) {
    let board = initialBoard
    let terminated = false
    while(!terminated) {
        terminated = true
        for (let player of players) {
            // nature
            await runNature(board, nature)

            ui.drawBoard(board)
            let move = await player.chooseMove(board)
            if (move !== null) {
                terminated = false
                for (let patch of move) {
                    applyGridRule(board, patch)
                }
            }
        }
    }
    ui.drawBoard(board)
}
