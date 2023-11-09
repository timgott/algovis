import { Rect, SVG, Svg, Text, create } from "@svgdotjs/svg.js"
import { createEmptyGrid, createGrid } from "../../shared/utils.js"
import { PartialGrid } from "./partialgrid.js"
import { NodeColor } from "./coloring.js"

export class ColoredGridSvg {
    svg: Svg
    cells: ({ rect: Rect, label: Text })[][]
    onClick?: (i: number, j: number) => any

    constructor(rows: number, columns: number, cellSize: number) {
        let svg = SVG()
        this.cells = createGrid(rows, columns, (i, j) => {
            let group = svg
                .group()
                .size(cellSize, cellSize)
                .move(i*cellSize, j*cellSize)
            return {
                rect: group
                    .rect("100%" as any, "100%" as any)
                    .fill("white")
                    .stroke({color: "black", opacity: 0.5})
                    .click(() => {
                        if (this.onClick) {
                            this.onClick(i, j)
                        }
                    }),
                label: group
                    .plain("")
                    .center("50%" as any, "50%" as any),
            }
        })
        this.svg = svg
    }

    cellColor(x: number, y: number, color: string) {
        this.cells[x][y].rect.fill(color)
    }

    cellLabel(x: number, y: number, text: string) {
        this.cells[x][y].label.plain(text)
    }
}

export function renderColoredGrid(grid: PartialGrid<NodeColor>, svg: ColoredGridSvg) {
    let colors = [
        "red",
        "green",
        "blue",
        "yellow",
        "purple",
        "orange",
    ]

    grid.forEach((i, j, nodeColor) => {
        let c = nodeColor ? colors[nodeColor] : "white"
        svg.cellColor(i, j, c)
        svg.cellLabel(i, j, nodeColor?.toString() ?? "")
    })
}