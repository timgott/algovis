import { randomChoice, sleep } from "../../shared/utils";
import { makeFoxGame, makeBlocksWorld, Stone } from "./games";
import { IHumanPlayInterface, IBoardUserInterface, runGame, Player, GridPos } from "./metagame";
import { PartialGrid } from "./partialgrid";
import { clearGridHighlight, ColoredGridSvg, highlightGrid, renderColoredGrid } from "./svggrid";

class BoardUi implements IBoardUserInterface<Stone> {
    constructor(private svgGrid: ColoredGridSvg, private stoneColors: {[key: Stone]: string}) {
    }

    drawBoard(board: PartialGrid<Stone>): void {
        const colorGrid = board.map(stone => stone === "_" ? null : this.stoneColors[stone] ?? "magenta")
        renderColoredGrid(this.svgGrid, colorGrid)
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
    constructor(private delay: number) { }
    selectCell(board: PartialGrid<string>, selectable: PartialGrid<boolean>, path: GridPos[]): Promise<GridPos> {
        return new Promise((resolve, reject) => {
            let cells: GridPos[] = []
            selectable.forNonEmpty((i, j, value) => {
                if (value) {
                    cells.push([i, j])
                }
            })
            let result = randomChoice(cells)
            if (this.delay > 0) {
                setTimeout(() => resolve(result), this.delay)
            } else {
                resolve(result)
            }
        })
    }
}

function main() {
    let game = makeBlocksWorld()
    let svgRoot = document.getElementById("grid_root")!
    let svg = new ColoredGridSvg(svgRoot, game.initialBoard.rows, game.initialBoard.columns, 30)
    let ui = new BoardUi(svg, game.stones)

    let players = game.players.map(
        ({name, color, rules}, index) => {
            let controller = index == 0 ? new SelectionUi(svg, color) : new RandomController(200)
            return new Player(name, controller, rules)
        }
    )
    let nature = new Player("nature", new RandomController(0), game.nature)
    runGame(game.initialBoard, ui, players, nature)
}

main()
