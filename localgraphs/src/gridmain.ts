import { NodeColor, minimalGreedy, neighborhoodGreedy, parityBorderColoring, tunnellingColoring, randomColoring } from "./coloring.js";
import { DynamicLocal, PartialGrid, randomAdversary } from "./partialgrid.js";
import { ColoredGridSvg, renderColoredGrid } from "./svggrid.js";

let root = document.getElementById("grid_root")!
let algorithmSelect = document.getElementById("algorithm") as HTMLSelectElement
let localityInput = document.getElementById("locality") as HTMLInputElement
let animateAdvCheckbox = document.getElementById("animate_adv") as HTMLInputElement
let animateStepCheckbox = document.getElementById("animate_step") as HTMLInputElement
let paritiesCheckbox = document.getElementById("show_parities") as HTMLInputElement
let radiusCheckbox = document.getElementById("show_radius") as HTMLInputElement

let undoButton = document.getElementById("undo") as HTMLButtonElement
let buildBoxesButton = document.getElementById("build_boxes") as HTMLButtonElement

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

async function dynamicAlgorithmStepAnimated(grid: PartialGrid<NodeColor>, i: number, j: number, algo: DynamicLocal<NodeColor>, delay: number = 0) {
    let [graph, nodeGrid] = grid.getGraph([i, j])
    let pointOfChange = nodeGrid.get(i, j)!

    let changes = algo.step(graph, pointOfChange)

    // clear neighborhood so changes are visible
    for (let [node, value] of changes) {
        nodeGrid.forNonEmpty((i2, j2, gridNode) => {
            if (node == gridNode) {
                grid.put(i2, j2, -1)
            }
        })
    }

    let locality = algo.locality(graph.nodes.length)
    for (let [node, value] of changes) {
        nodeGrid.forNonEmpty((i2, j2, gridNode) => {
            if (node == gridNode) {
                let distance = Math.abs(i2 - i) + Math.abs(j2 - j)
                if (distance <= locality) {
                    grid.put(i2, j2, value)
                } else {
                    console.error(`Dynamic algorithm violates locality ${locality} around ${i}, ${j}, touching ${i2}, ${j2}`)
                }
            }
        })
        render(grid)
        await sleep(delay)
    }

    console.assert(grid.get(i, j) !== undefined && grid.get(i, j) !== null)
}

function step(grid: PartialGrid<NodeColor>, i: number, j: number, delay: number = 0) {
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
        algo = tunnellingColoring(localityInput.valueAsNumber)
    } else {
        throw "Unknown algorithm"
    }
    if (delay == 0) {
        grid.dynamicAlgorithmStep(i, j, algo)
    } else {
        dynamicAlgorithmStepAnimated(grid, i, j, algo, delay)
    }
}

function putRectangle(grid: PartialGrid<NodeColor>, i: number, j: number, width: number, height: number) {
    for (let i2 = i; i2 < i + width; i2++) {
        for (let j2 = j; j2 < j + height; j2++) {
            step(grid, i2, j2, 0)
        }
    }
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
            step(grid, i, j, animateStepCheckbox.checked ? 200 : 0)
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
    buildBoxesButton.onclick = () => {
        let size = localityInput.valueAsNumber + 3
        let offset = 2
        putRectangle(grid, offset, offset, size, size)
        putRectangle(grid, offset + size + 2, offset, size, size)
        putRectangle(grid, offset, offset + size + 1, size, size)
        putRectangle(grid, offset + size + 2, offset + size + 1, size, size)
        putRectangle(grid, offset + size + 1, offset, offset - 1, size)
        putRectangle(grid, offset + size, offset + size + 1, offset - 1, size)
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
        if (animateAdvCheckbox.checked) {
            await sleep(1)
            render(grid)
        }
    }
    render(grid)
}

run()

document.getElementById("reset")!.addEventListener("click", run)
document.getElementById("adversary")!.addEventListener("click", runAutoAdversary)