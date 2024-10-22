import { makeFoxInitialBoard, makeFoxRules, makeGeeseRules } from "./foxgame";
import { IHumanPlayInterface, IBoardUserInterface, runGame, HumanPlayer } from "./metagame";
import { PartialGrid } from "./partialgrid";
import { ColoredGridSvg, highlightGrid, renderColoredGrid } from "./svggrid";

class BoardUi implements IBoardUserInterface<number> {
    constructor(private svgGrid: ColoredGridSvg, private stoneColors: string[]) {
    }

    drawBoard(board: PartialGrid<number>): void {
        renderColoredGrid(this.svgGrid, board, this.stoneColors)
    }
}

class SelectionUi implements IHumanPlayInterface<number> {
    constructor(private svgGrid: ColoredGridSvg, private playerColor: string) {
    }

    selectCell(board: PartialGrid<number>, selectable: PartialGrid<boolean>, path: [number, number][]): Promise<[number, number]> {
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
    let initialBoard = makeFoxInitialBoard()
    let svgRoot = document.getElementById("grid_root")!
    let svg = new ColoredGridSvg(svgRoot, initialBoard.rows, initialBoard.columns, 30)
    let stoneColors = ["lightgreen", "red"]
    let ui = new BoardUi(svg, stoneColors)

    let player1 = new HumanPlayer("fox", new SelectionUi(svg, "red"), makeFoxRules())
    let player2 = new HumanPlayer("geese", new SelectionUi(svg, "green"), makeGeeseRules())
    runGame(initialBoard, ui, [player1, player2])
}

main()
