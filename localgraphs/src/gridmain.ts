import { NodeColor, greedyColoring } from "./coloring.js";
import { PartialGrid } from "./partialgrid.js";
import { ColoredGridSvg, renderColoredGrid } from "./svggrid.js";

let rows = 10
let columns = 10
let svgGrid = new ColoredGridSvg(10, 10, 50)
svgGrid.svg.addTo("#grid_root")

function run() {
    let grid = new PartialGrid<NodeColor>(10, 10)
    let algo = greedyColoring
    svgGrid.onClick = (i, j) => {
        grid.dynamicLocalStep(i, j, algo)
        renderColoredGrid(grid, svgGrid)
    }
}

run()