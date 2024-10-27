import { assert, mapFromFunction } from "../../shared/utils";
import { PartialGrid } from "./partialgrid";

//
export type Rule<S> = {
    pattern: S
    update: S
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
        let overlaps = match.rule.update.forNonEmpty((u, v, value) => {
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
    return putSubgrid(grid, match.offset, match.rule.update)
}

function applyMultiRule<T>(grid: PartialGrid<T>, match: MultiRuleMatch<T>) {
    for (let patch of match) {
        applyGridRule(grid, patch)
    }
}

type RuleMatchGrid<T> = PartialGrid<Set<MultiRuleMatch<T>>>

function binAtAllChanges<T>(matchGrid: RuleMatchGrid<T>, matches: MultiRuleMatch<T>) {
    // write rule match at all cells that it would change
    for (let match of matches) {
        const [i,j] = match.offset
        const delta = match.rule.update
        const area = match.rule.update.or(match.rule.pattern)
        delta.forNonEmpty((u,v) => {
            matchGrid.get(i+u, j+v)!.add(matches)
        })
    }
}

function makeChangeGrid<T>(grid: PartialGrid<T>, ruleMatches: Iterable<MultiRuleMatch<T>>): RuleMatchGrid<T> {
    let changeGrid = grid.map(() => new Set<MultiRuleMatch<T>>())
    for (const match of ruleMatches) {
        binAtAllChanges(changeGrid, match)
    }
    return changeGrid.filter((set) => set.size > 0)
}

function makeNthChangeGrid<T>(grid: PartialGrid<T>, index: number, ruleMatches: Iterable<MultiRuleMatch<T>>): RuleMatchGrid<T> {
    let changeGrid = grid.map(() => new Set<MultiRuleMatch<T>>())
    for (const patches of ruleMatches) {
        let cells = patches.flatMap(({offset, rule}) => {
            let [i,j] = offset
            let delta = rule.update
            return delta.nonEmptyCells.map(([u,v]) => [i+u, j+v])
        })
        console.log(index)
        if (index < cells.length) {
            let [i,j] = cells[index]
            console.log("index", index, "i", i, "j", j)
            changeGrid.get(i,j)!.add(patches)
        }
    }
    return changeGrid.filter((set) => set.size > 0)
}

export interface IPlayer<T> {
    chooseMove(board: PartialGrid<T>): Promise<MultiRuleMatch<T> | null>
}

export interface IBoardUserInterface<T> {
    drawBoard(board: PartialGrid<T>): void
}

export interface IHumanPlayInterface<T> {
    selectCell(board: PartialGrid<T>, selectable: PartialGrid<CellMatchType>, path: GridPos[]): Promise<GridPos>
}

function isUniqueChangeSet<T>(grid: PartialGrid<T>, matches: MultiRuleMatch<T>[]) {
    if (matches.length === 1) {
        return true
    }
    let delta: PartialGrid<T> = PartialGrid.emptyLike(grid)
    let [first, ...rest] = matches
    applyMultiRule(delta, first)
    let count = delta.count((i,j,v) => true)
    for (let match of rest) {
        let otherDelta: PartialGrid<T> = PartialGrid.emptyLike(delta)
        applyMultiRule(otherDelta, match)
        if (!delta.equals(otherDelta)) {
            return false
        }
    }
    return true
}

export type CellMatchType = "primary" | "area"

export class Player<T> implements IPlayer<T> {
    constructor(private name: string, private ui: IHumanPlayInterface<T>, private allowedRules: MultiRule<T>[]) {}

    async chooseMove(board: PartialGrid<T>): Promise<MultiRuleMatch<T> | null> {
        let matches = findMultiRuleMatches(board, this.allowedRules)
        if (matches.length === 0) {
            console.log("No possible moves found for", this.name)
            return null
        }
        let uniqueChoice = isUniqueChangeSet(board, matches)
        let index = 0
        do {
            console.log("Player", this.name, "chooses move from", matches.length, "possible moves")
            // TODO: Nth change for disambiguation with special highlight
            let indexGrid = makeNthChangeGrid(board, index, matches)
            let changeGrid = makeChangeGrid(board, matches)
            if (!uniqueChoice) {
                changeGrid = changeGrid.filter(set => (set.size < matches.length))
            }
            let selectGrid = indexGrid.or(changeGrid)
            let selectable = selectGrid.map((set,i,j) => {
                if (indexGrid.has(i, j)) {
                    return "primary"
                } else {
                    return "area"
                }
            })
            let pos = await this.ui.selectCell(board, selectable, [])
            if (indexGrid.has(...pos)) {
                index++
            }
            let newMatches = Array.from(selectGrid.get(...pos)!)
            assert(newMatches.length > 0, "should only select occupied cells")
            matches = newMatches
            uniqueChoice = isUniqueChangeSet(board, matches)
        } while (!uniqueChoice)
        return matches[0]
    }
}

// let player make moves until no more moves are possible
async function exhaustPlayer<T>(board: PartialGrid<T>, player: IPlayer<T>, ui: IBoardUserInterface<T>): Promise<boolean> {
    let didSomething = false
    while(true) {
        ui.drawBoard(board)
        let move = await player.chooseMove(board)
        if (!move) {
            return didSomething
        }
        didSomething = true
        for (let patch of move) {
            applyGridRule(board, patch)
        }
    }
}

export async function runGame<T>(initialBoard: PartialGrid<T>, ui: IBoardUserInterface<T>, players: IPlayer<T>[]) {
    let board = initialBoard
    let terminated = false
    while(!terminated) {
        terminated = true
        for (let player of players) {
            let moved = await exhaustPlayer(board, player, ui)
            if (moved) {
                terminated = false
            }
        }
    }
    ui.drawBoard(board)
}
