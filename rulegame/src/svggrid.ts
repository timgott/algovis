import { createEmptyGrid, createGrid } from "../../shared/utils.js"
import { PartialGrid } from "./partialgrid.js"
import { createSvgNode } from "../../shared/svg.js"

export class ColoredGridSvg {
    neutralColor = "#dddddd"
    rectPadding = 8
    backPadding = 2
    borderPadding = 6
    rectStroke = 4

    svg: SVGSVGElement
    cells: ({
        rect: SVGRectElement,
        border: SVGRectElement,
        back: SVGRectElement,
        label: SVGTextElement
    })[][]
    cellSize: number
    onClick?: (i: number, j: number) => any

    coordinateText: SVGTextElement

    constructor(parent: Element, rows: number, columns: number, cellSize: number) {
        let width = rows * cellSize
        let height = columns * cellSize
        let svg = createSvgNode(parent, "svg", {
            width: width,
            height: height,
        })
        let backGroup = createSvgNode(svg, "g")
        let borderGroup = createSvgNode(svg, "g")
        let cellGroup = createSvgNode(svg, "g")
        let textGroup = createSvgNode(svg, "g")
        let overlayTextGroup = createSvgNode(svg, "g")

        this.coordinateText = createSvgNode(overlayTextGroup, "text", {
            x: width - 5,
            y: height - 5,
            "text-anchor": "end",
            "font-family": "sans-serif",
            "font-size": 12,
            // outline
            stroke: "white",
            "stroke-width": 3,
            "stroke-opacity": 0.8,
            "paint-order": "stroke",
        })

        this.cellSize = cellSize
        this.cells = createGrid(rows, columns, (i, j) => {
            let x = i * cellSize
            let y = j * cellSize
            let border = createSvgNode(borderGroup, "rect", {
                width: cellSize - this.borderPadding * 2,
                height: cellSize - this.borderPadding * 2,
                x: x + this.borderPadding,
                y: y + this.borderPadding,
                fill: "transparent",
                z: -1,
                "pointer-events": "none",
            })
            let back = createSvgNode(backGroup, "rect", {
                width: cellSize - this.backPadding * 2,
                height: cellSize - this.backPadding * 2,
                x: x + this.backPadding,
                y: y + this.backPadding,
                fill: this.neutralColor,
                z: 0,
            })
            let rect = createSvgNode(cellGroup, "rect", {
                width: cellSize - this.rectPadding * 2,
                height: cellSize - this.rectPadding * 2,
                x: x + this.rectPadding,
                y: y + this.rectPadding,
                fill: "transparent",
                "stroke-width": this.rectStroke,
                z: 0,
                "pointer-events": "none",
            })
            let clickListener = (event: MouseEvent) => {
                if (event.buttons == 1 && this.onClick) {
                    this.onClick(i, j)
                }
            }
            //back.addEventListener("mousemove", clickListener)
            back.addEventListener("mousedown", clickListener)
            back.addEventListener("mouseover", (event) => {
                this.hover(i, j)
            })
            let label = createSvgNode(textGroup, "text", {
                x: x + cellSize / 2,
                y: y + cellSize / 2,
                "text-anchor": "middle",
                "dominant-baseline": "middle",
                "font-size": cellSize / 2,
                "fill": "black",
                "opacity": "0.8",
                "font-family": "sans-serif",
            })
            return {
                rect: rect,
                label: label,
                border: border,
                back: back,
            }
        })
        this.svg = svg
    }

    clearCell(i: number, j: number) {
        this.cellColor(i, j, "transparent")
        this.cellBorder(i, j, "transparent")
        this.cellBorder(i, j, "transparent")
        this.clearBackgroundCell(i, j)
        this.cellLabel(i, j, "")
    }

    cellColor(x: number, y: number, color: string) {
        this.cells[x][y].rect.setAttribute("fill", color)
    }

    cellBorder(x: number, y: number, color: string) {
        this.cells[x][y].border.setAttribute("fill", color)
    }

    backgroundCellColor(x: number, y: number, color: string) {
        this.cells[x][y].back.setAttribute("fill", color)
    }

    clearBackgroundCell(x: number, y: number) {
        this.backgroundCellColor(x, y, this.neutralColor)
    }

    cellLabel(x: number, y: number, text: string) {
        this.cells[x][y].label.textContent = text
    }

    hover(x: number, y: number) {
        this.coordinateText.textContent = `${x}, ${y}`
    }
}

export function renderColoredGrid(svg: ColoredGridSvg, colorGrid: PartialGrid<string | null>) {
    colorGrid.forEach((i, j, color) => {
        if (color !== null) {
            svg.cellColor(i, j, color)
            svg.cellBorder(i, j, "#121")
        } else {
            svg.clearCell(i, j)
        }
    })
}

export function highlightGrid(svg: ColoredGridSvg, highlight: PartialGrid<boolean>, color: string) {
    highlight.forEach((i, j, value) => {
        if (value) {
            svg.backgroundCellColor(i, j, color)
        } else {
            svg.clearBackgroundCell(i, j)
        }
    })
}

export function clearGridHighlight(svg: ColoredGridSvg, highlight: PartialGrid<unknown>) {
    highlight.forEach((i, j, value) => {
        svg.clearBackgroundCell(i, j)
    })
}
