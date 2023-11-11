import { createEmptyGrid, createGrid } from "../../shared/utils.js"
import { PartialGrid } from "./partialgrid.js"
import { NodeColor } from "./coloring.js"
import { createSvgNode } from "../../shared/svg.js"

export class ColoredGridSvg {
    neutralColor = "#dddddd"
    rectPadding = 0
    backPadding = 2
    borderPadding = -4

    svg: SVGSVGElement
    cells: ({
        rect: SVGRectElement,
        border: SVGRectElement,
        back: SVGRectElement,
        label: SVGTextElement
    })[][]
    onClick?: (i: number, j: number) => any

    constructor(parent: Element, rows: number, columns: number, cellSize: number) {
        let svg = createSvgNode(parent, "svg", {
            width: rows * cellSize,
            height: columns * cellSize,
        })
        let backGroup = createSvgNode(svg, "g")
        let borderGroup = createSvgNode(svg, "g")
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
            })
            let back = createSvgNode(backGroup, "rect", {
                width: cellSize - this.backPadding * 2,
                height: cellSize - this.backPadding * 2,
                x: x + this.backPadding,
                y: y + this.backPadding,
                fill: this.neutralColor,
                z: 0,
            })
            let rect = createSvgNode(svg, "rect", {
                width: cellSize - this.rectPadding * 2,
                height: cellSize - this.rectPadding * 2,
                x: x + this.rectPadding,
                y: y + this.rectPadding,
                fill: "transparent",
                z: 0,
            })
            rect.addEventListener("mousedown", () => {
                if (this.onClick) {
                    this.onClick(i, j)
                }
            })
            let label = createSvgNode(svg, "text", {
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
        this.cellLabel(i, j, "")
    }

    cellColor(x: number, y: number, color: string) {
        this.cells[x][y].rect.setAttribute("fill", color)
    }

    cellBorder(x: number, y: number, color: string) {
        this.cells[x][y].border.setAttribute("fill", color)
    }

    cellLabel(x: number, y: number, text: string) {
        this.cells[x][y].label.textContent = text
    }
}

export function renderColoredGrid(grid: PartialGrid<NodeColor>, svg: ColoredGridSvg) {
    let colors = [
        "#CDFAD5",
        "#F6FDC3",
        "#FFCF96",
        "#FF8080",
        "gold",
        "purple",
        "yellow",
        "orange",
    ]

    grid.forEach((i, j, nodeColor) => {
        if (nodeColor !== null) {
            let c = colors[nodeColor]
            let text = (nodeColor + 1).toString()
            svg.cellColor(i, j, c)
            svg.cellLabel(i, j, text)
            svg.cellBorder(i, j, "#121")
        } else {
            svg.clearCell(i, j)
        }
    })
}