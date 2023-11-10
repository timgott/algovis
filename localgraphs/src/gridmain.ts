import { NodeColor, greedyColoring, neighborhoodRecoloring } from "./coloring.js";
import { PartialGrid, randomAdversary } from "./partialgrid.js";
import { ColoredGridSvg, renderColoredGrid } from "./svggrid.js";

let root = document.getElementById("grid_root")!
let algorithmSelect = document.getElementById("algorithm") as HTMLSelectElement
let rows = 30
let columns = 15
let svgGrid = new ColoredGridSvg(root, rows, columns, 30)

let adversary = randomAdversary

function step(grid: PartialGrid<NodeColor>, i: number, j: number) {
    if (algorithmSelect.value == "greedy") {
        grid.onlineAlgorithmStep(i, j, greedyColoring)
    } else if (algorithmSelect.value == "neighborhood") {
        grid.dynamicAlgorithmStep(i, j, neighborhoodRecoloring)
    } else {
        throw "Unknown algorithm"
    }
}

function run() {
    let grid = new PartialGrid<NodeColor>(rows, columns)
    renderColoredGrid(grid, svgGrid)
    svgGrid.onClick = (i, j) => {
        step(grid, i, j)
        renderColoredGrid(grid, svgGrid)
    }
}

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAutoAdversary() {
    let grid = new PartialGrid<NodeColor>(rows, columns)
    renderColoredGrid(grid, svgGrid)
    svgGrid.onClick = undefined

    for (let t = 0; t < grid.rows*grid.columns; t++) {
        //await sleep(10)
        let [i,j] = adversary(grid)
        step(grid, i, j)
    }
    renderColoredGrid(grid, svgGrid)
}

run()

document.getElementById("manual")!.addEventListener("click", run)
document.getElementById("adversary")!.addEventListener("click", runAutoAdversary)