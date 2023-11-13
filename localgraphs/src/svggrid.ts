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
    cellSize: number
    onClick?: (i: number, j: number) => any

    ballPathParent: SVGGElement
    ballVisible: boolean

    // path around all cells within radius on the grid
    _createBallPath(radius: number, cellSize: number): SVGElement {
        let d = `M 0 ${-cellSize * radius} `
        let steps = [[1, 1], [-1, 1], [-1, -1], [1, -1]]
        let directions = "hv"
        let t = 0
        for (let step of steps) {
            for (let i = 0; i < radius*2+1; i++) {
                d += `${directions[t%2]} ${cellSize * step[t%2]} `
                t++
            }
        }
        d += "z"

        let group = createSvgNode(null, "g")
        createSvgNode(group, "path", {
            d: d,
            fill: "white",
            "fill-opacity": 0.1,
            "stroke-opacity": 0.5,
            stroke: "white",
            "stroke-width": 2,
            "pointer-events": "none"
        })
        createSvgNode(group, "path", {
            d: d,
            fill: "transparent",
            stroke: "black",
            "stroke-opacity": 0.3,
            "stroke-width": 2,
            "stroke-dasharray": 4,
            "pointer-events": "none"
        })
        return group
    }

    constructor(parent: Element, rows: number, columns: number, cellSize: number) {
        let svg = createSvgNode(parent, "svg", {
            width: rows * cellSize,
            height: columns * cellSize,
        })
        let backGroup = createSvgNode(svg, "g")
        let borderGroup = createSvgNode(svg, "g")
        let cellGroup = createSvgNode(svg, "g")
        let textGroup = createSvgNode(svg, "g")
        this.ballPathParent = createSvgNode(null, "g")
        this.ballVisible = false
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
                z: 0,
            })
            let clickListener = (event: MouseEvent) => {
                if (event.buttons == 1 && this.onClick) {
                    this.onClick(i, j)
                }
            }
            rect.addEventListener("mousemove", clickListener)
            rect.addEventListener("mousedown", clickListener)
            rect.addEventListener("mouseenter", (event) => {
                this.moveBall(i, j)
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
        svg.addEventListener("mouseenter", () => {
            if (this.ballVisible) {
                this.svg.appendChild(this.ballPathParent)
            }
        })
        svg.addEventListener("mouseleave", () => {
            this.ballPathParent.remove()
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


    setBallRadius(radius: number) {
        this.ballPathParent.replaceChildren(
            this._createBallPath(radius, this.cellSize)
        )
    }

    moveBall(x: number, y: number) {
        this.ballPathParent.setAttribute("transform", `translate(${x * this.cellSize}, ${y * this.cellSize})`)
    }

    setBallVisible(visible: boolean) {
        this.ballVisible = visible
        if (visible == false) {
            this.ballPathParent.remove()
        }
        // added back only on mouseenter
    }
}

export function renderColoredGrid(grid: PartialGrid<NodeColor>, svg: ColoredGridSvg, parities: boolean) {
    let colors = [
        "#CDFAD5",
        "#F6FDC3",
        "#F3B67A",
        "#D10043",
        "gold",
        "purple",
        "yellow",
        "orange",
    ]

    let alternativeColors = [
        "#B2C5FF",
        "#D6E4FF",
        "#BF91FB",
    ]

    grid.forEach((i, j, nodeColor) => {
        if (nodeColor !== null) {
            let c = colors[nodeColor]
            if (parities && (i+j+nodeColor) % 2 == 1) {
                c = alternativeColors[nodeColor] ?? c
            }
            let text = (nodeColor + 1).toString()
            svg.cellColor(i, j, c)
            svg.cellLabel(i, j, text)
            svg.cellBorder(i, j, "#121")
        } else {
            svg.clearCell(i, j)
        }
    })
}