import { makeFoxGame, Stone } from "./games";
import { IHumanPlayInterface, IBoardUserInterface, runGame, HumanPlayer } from "./metagame";
import { PartialGrid } from "./partialgrid";
import { ColoredGridSvg, highlightGrid, renderColoredGrid } from "./svggrid";

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
                    resolve([i, j])
                }
            }
        })
    }
}

function main() {
    let game = makeFoxGame()
    let svgRoot = document.getElementById("grid_root")!
    let svg = new ColoredGridSvg(svgRoot, game.initialBoard.rows, game.initialBoard.columns, 30)
    let ui = new BoardUi(svg, game.stones)

    let players = game.players.map(
        ({name, color, rules}) => {
            return new HumanPlayer(name, new SelectionUi(svg, color), rules)
        }
    )
    runGame(game.initialBoard, ui, players)
}

main()
