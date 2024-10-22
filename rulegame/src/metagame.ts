import { assert } from "../../shared/utils";
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
    rule: Rule<PartialGrid<T>>
}

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

function findRuleMatches<T>(grid: PartialGrid<T>, rules: Iterable<GridRule<T>>) {
    let matches: RuleMatch<T>[] = []
    for (let rule of rules) {
        const pattern = rule.pattern
        for (let offset of findSubgridMatches(grid, pattern)) {
            matches.push({offset, rule})
        }
    }
    return matches
}

function applyGridRule<T>(grid: PartialGrid<T>, [i,j]: GridPos, rule: Rule<PartialGrid<T>>) {
    rule.update.forNonEmpty((u, v, value) => {
        grid.put(i+u, j+v, value)
    })
}

function findApplicableRules<T>(grid: PartialGrid<T>, [i,j]: GridPos, rules: Rule<PartialGrid<T>>[]) {
    let ruleMatches: RuleMatch<T>[] = []
    for (let rule of rules) {
        // check rule pattern around the target location
        const pattern = rule.pattern
        pattern.forNonEmpty((u, v, value) => {
            const offset: GridPos = [i-u, j-v]
            if (checkMatchSubgrid(grid, pattern, offset)) {
                ruleMatches.push({offset, rule})
            }
        })
    }
    return ruleMatches
}

type RuleMatchGrid<T> = PartialGrid<Set<RuleMatch<T>>>
function findChangeGrid<T>(grid: PartialGrid<T>, rules: Rule<PartialGrid<T>>[]): RuleMatchGrid<T> {
    let matchGrid: RuleMatchGrid<T> = grid.map(() => new Set<RuleMatch<T>>())
    // not most efficient, but good enough now
    grid.forNonEmpty((i, j, _) => {
        const pos: GridPos = [i,j]
        for (const rule of rules) {
            const pattern = rule.pattern
            if (checkMatchSubgrid(grid, pattern, pos)) {
                const match = {
                    offset: pos,
                    rule: rule
                }
                // write rule match at all cells that it would change
                rule.update.forNonEmpty((u,v) => {
                    matchGrid.get(i+u, j+v)!.add(match)
                })
            }
        }
    })
    return matchGrid
}

function binAtAllChanges<T>(matchGrid: RuleMatchGrid<T>, match: RuleMatch<T>) {
    // write rule match at all cells that it would change
    const [i,j] = match.offset
    match.rule.update.forNonEmpty((u,v) => {
        matchGrid.get(i+u, j+v)!.add(match)
    })
}



function makeChangeGrid<T>(grid: PartialGrid<T>, ruleMatches: Iterable<RuleMatch<T>>): RuleMatchGrid<T> {
    let changeGrid: RuleMatchGrid<T> = grid.map(() => new Set<RuleMatch<T>>())
    for (const match of ruleMatches) {
        binAtAllChanges(changeGrid, match)
    }
    return changeGrid
}

// if one cell changes multiple cells, but 1 cell is only changed by this rule, then use only that cell
function filterToCanonicalCell<T>(matches: Iterable<RuleMatch<T>>, matchGrid: RuleMatchGrid<T>): RuleMatchGrid<T> {
    let canonicalGrid = matchGrid.map(() => new Set<RuleMatch<T>>())
    for (const match of matches) {
        let [i, j] = match.offset
        let canon: GridPos | null = match.rule.update.forNonEmpty((u,v) => {
            let cellMatches = matchGrid.get(i+u, j+v)!
            if (cellMatches.size === 1) {
                return [i+u, j+v]
            }
        })
        if (canon) {
            canonicalGrid.get(...canon)!.add(match)
        } else {
            binAtAllChanges(canonicalGrid, match)
        }
    }
    return canonicalGrid
}

export interface IPlayer<T> {
    chooseMove(board: PartialGrid<T>): Promise<RuleMatch<T> | null>
}

export interface IBoardUserInterface<T> {
    drawBoard(board: PartialGrid<T>): void
}

export interface IHumanPlayInterface<T> {
    selectCell(board: PartialGrid<T>, selectable: PartialGrid<boolean>, path: GridPos[]): Promise<GridPos>
}

export class HumanPlayer<T> implements IPlayer<T> {
    constructor(private name: string, private ui: IHumanPlayInterface<T>, private allowedRules: GridRule<T>[]) {}

    async chooseMove(board: PartialGrid<T>): Promise<RuleMatch<T> | null> {
        let matches = findRuleMatches(board, this.allowedRules)
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
        } while (matches.length > 1)
        return matches[0]
    }
}

export async function runGame<T>(initialBoard: PartialGrid<T>, ui: IBoardUserInterface<T>, players: IPlayer<T>[]) {
    let board = initialBoard
    while(true) {
        for (let player of players) {
            ui.drawBoard(board)
            let move = await player.chooseMove(board)
            if (move === null) {
                return
            }
            applyGridRule(board, move.offset, move.rule)
        }
    }
}
