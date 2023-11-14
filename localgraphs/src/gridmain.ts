import { NodeColor, minimalGreedy, neighborhoodGreedy, parityBorderColoring, principledParityBorderColoring, randomColoring } from "./coloring.js";
import { PartialGrid, randomAdversary } from "./partialgrid.js";
import { ColoredGridSvg, renderColoredGrid } from "./svggrid.js";

let root = document.getElementById("grid_root")!
let algorithmSelect = document.getElementById("algorithm") as HTMLSelectElement
let localityInput = document.getElementById("locality") as HTMLInputElement
let animateCheckbox = document.getElementById("animate") as HTMLInputElement
let paritiesCheckbox = document.getElementById("show_parities") as HTMLInputElement
let radiusCheckbox = document.getElementById("show_radius") as HTMLInputElement

let undoButton = document.getElementById("undo") as HTMLButtonElement

let rows = 20
let columns = 20
let svgGrid = new ColoredGridSvg(root, rows, columns, 30)

// locality path around cursor
localityInput.addEventListener("input", () => {
    svgGrid.setBallRadius(localityInput.valueAsNumber)
})
svgGrid.setBallRadius(localityInput.valueAsNumber)
radiusCheckbox.addEventListener("input", (ev) => {
    svgGrid.setBallVisible(radiusCheckbox.checked)
})
svgGrid.setBallVisible(radiusCheckbox.checked)


let adversary = randomAdversary

function step(grid: PartialGrid<NodeColor>, i: number, j: number) {
    let algo
    if (algorithmSelect.value == "greedy") {
        algo = neighborhoodGreedy(localityInput.valueAsNumber)
    } else if (algorithmSelect.value == "minimal") {
        algo = minimalGreedy(localityInput.valueAsNumber)
    } else if (algorithmSelect.value == "random") {
        algo = randomColoring(localityInput.valueAsNumber)
    } else if (algorithmSelect.value == "parityaware") {
        algo = parityBorderColoring(localityInput.valueAsNumber)
    } else if (algorithmSelect.value == "tunneling") {
        algo = principledParityBorderColoring(localityInput.valueAsNumber)
    } else {
        throw "Unknown algorithm"
    }
    grid.dynamicAlgorithmStep(i, j, algo)
}

function render(grid: PartialGrid<NodeColor>) {
    renderColoredGrid(grid, svgGrid, paritiesCheckbox.checked)
}

function run() {
    let grid = new PartialGrid<NodeColor>(rows, columns)
    let undoHistory: PartialGrid<NodeColor>[] = []
    render(grid)
    svgGrid.onClick = (i, j) => {
        if (grid.get(i, j) == null) {
            undoHistory.push(grid.copy())
            step(grid, i, j)
            render(grid)
        }
    }
    undoButton.onclick = () => {
        let last = undoHistory.pop()
        if (last) {
            grid = last
            render(grid)
        }
    }
    paritiesCheckbox.onchange = () => {
        render(grid)
    }
    return grid
}

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAutoAdversary() {
    let grid = run()

    for (let t = 0; t < grid.rows * grid.columns; t++) {
        let [i, j] = adversary(grid)
        step(grid, i, j)
        if (animateCheckbox.checked) {
            await sleep(1)
            render(grid)
        }
    }
    render(grid)
}

run()

document.getElementById("reset")!.addEventListener("click", run)
document.getElementById("adversary")!.addEventListener("click", runAutoAdversary)