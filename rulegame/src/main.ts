import { parseLispy } from "../../localgraphs/src/prover/sparser";
import { assert, assertExists, randomChoice, sleep } from "../../shared/utils";
import { evalGameLisp } from "./gameparser";
import { Stone, GameRules, StoneStyle } from "./games";
import { IHumanPlayInterface, IBoardUserInterface, runGame, Player, GridPos } from "./metagame";
import { PartialGrid } from "./partialgrid";
import { clearGridHighlight, ColoredGridSvg, highlightGrid, renderColoredGrid } from "./svggrid";

class BoardUi implements IBoardUserInterface<Stone> {
    constructor(private svgGrid: ColoredGridSvg, private stoneColors: {[key: Stone]: StoneStyle}) {
    }

    drawBoard(board: PartialGrid<Stone>): void {
        const colorGrid = board.map(stone => stone === "_" ? null : this.stoneColors[stone] ?? null)
        const labels = board.map(stone => (stone === "_" || this.stoneColors[stone]) ? "" : stone)
        renderColoredGrid(this.svgGrid, colorGrid, labels)
    }
}

class SelectionUi implements IHumanPlayInterface<Stone> {
    constructor(private svgGrid: ColoredGridSvg, private playerColor: string) {
    }

    selectCell(board: PartialGrid<Stone>, selectable: PartialGrid<boolean>, path: [number, number][]): Promise<[number, number]> {
        highlightGrid(this.svgGrid, selectable, this.playerColor)
        return new Promise((resolve, reject) => {
            this.svgGrid.onClick = (i, j) => {
                if (selectable.get(i, j)) {
                    this.svgGrid.onClick = undefined
                    clearGridHighlight(this.svgGrid, selectable)
                    resolve([i, j])
                }
            }
        })
    }
}

class RandomController implements IHumanPlayInterface<Stone> {
    constructor(private delay: number, private playerColor: string, private svg?: ColoredGridSvg) { }
    selectCell(board: PartialGrid<string>, selectable: PartialGrid<boolean>, path: GridPos[]): Promise<GridPos> {
        return new Promise((resolve, reject) => {
            let cells: GridPos[] = []
            selectable.forNonEmpty((i, j, value) => {
                if (value) {
                    cells.push([i, j])
                }
            })
            assert(cells.length > 0, "no selectable cells")
            let result = randomChoice(cells)
            if (this.delay > 0) {
                if (this.svg) {
                    highlightGrid(this.svg, selectable, this.playerColor)
                }
                setTimeout(() => {
                    if (this.svg) {
                        clearGridHighlight(this.svg, selectable)
                    }
                    resolve(result)
                }, this.delay)
            } else {
                resolve(result)
            }
        })
    }
}

async function loadGames() {
    let url = new URL("games.lisp", import.meta.url)
    const response = await fetch(url.toString())
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
    }
    let text = await response.text()
    return evalGameLisp(text)
}

async function main() {
    console.log("Hello")
    let allGames = await loadGames()
    let game = allGames.get("checkers")
    //let game = makeFoxGame()
    assertExists(game, "game not found")
    console.log("Game loaded")
    let svgRoot = document.getElementById("grid_root")!
    let svg = new ColoredGridSvg(svgRoot, game.initialBoard.rows, game.initialBoard.columns, 30)
    let ui = new BoardUi(svg, game.stones)

    let players = game.players.map(
        ({name, color, role, rules}, index: number) => {
            let controller: IHumanPlayInterface<Stone>
            if (role === "nature") {
                controller = new RandomController(0, color)
            } else if (role === "robot") {
                controller = new RandomController(300, color, svg)
            } else {
                // human
                controller = new SelectionUi(svg, color)
            }

            return new Player(name, controller, rules)
        }
    )
    runGame(game.initialBoard, ui, players)
}

console.log
main()
