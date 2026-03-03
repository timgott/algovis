import { sleep } from "../../shared/utils.js";
import { NodeColor, minimalGreedy, neighborhoodGreedy, parityBorderColoring, borderComponentColoring, randomColoring, isGlobalColoring, antiCollisionColoring, niceColoring } from "./coloring.js";
import { DynamicLocal, PartialGrid, randomAdversary } from "./partialgrid.js";
import { ColoredGridSvg, renderColoredGrid } from "./svggrid.js";

let root = document.getElementById("grid_root")!
let algorithmSelect = document.getElementById("algorithm") as HTMLSelectElement
let localityInput = document.getElementById("locality") as HTMLInputElement
let animateAdvCheckbox = document.getElementById("animate_adv") as HTMLInputElement
let animateStepCheckbox = document.getElementById("animate_step") as HTMLInputElement
let paritiesCheckbox = document.getElementById("show_parities") as HTMLInputElement
let borderSidesCheckbox = document.getElementById("show_border_side") as HTMLInputElement
let radiusCheckbox = document.getElementById("show_radius") as HTMLInputElement

let undoButton = document.getElementById("undo") as HTMLButtonElement
let buildBoxesButton = document.getElementById("build_boxes") as HTMLButtonElement

let rows = 30
let columns = 30
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

let undoHistory: PartialGrid<NodeColor>[] = []

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

function step(algo: DynamicLocal<number>, grid: PartialGrid<NodeColor>, i: number, j: number, delay: number = 0) {
    undoHistory.push(grid.copy())

    if (delay == 0) {
        grid.dynamicAlgorithmStep(i, j, algo)
        console.assert(isGlobalColoring(grid.getGraph()[0]), "correctness check failed")
    } else {
        dynamicAlgorithmStepAnimated(grid, i, j, algo, delay)
    }
}

function putRectangle(algo: DynamicLocal<number>, grid: PartialGrid<NodeColor>, i: number, j: number, width: number, height: number) {
    for (let i2 = i; i2 < i + width; i2++) {
        for (let j2 = j; j2 < j + height; j2++) {
            step(algo, grid, i2, j2, 0)
        }
    }
}

function render(grid: PartialGrid<NodeColor>) {
    renderColoredGrid(grid, svgGrid, paritiesCheckbox.checked, borderSidesCheckbox.checked)
}

function makeAlgo(): DynamicLocal<number> {
    console.log("reinitializing algo")
    if (algorithmSelect.value == "greedy") {
        return neighborhoodGreedy(localityInput.valueAsNumber)
    } else if (algorithmSelect.value == "minimal") {
        return minimalGreedy(localityInput.valueAsNumber)
    } else if (algorithmSelect.value == "random") {
        return randomColoring(localityInput.valueAsNumber)
    } else if (algorithmSelect.value == "parityaware") {
        return parityBorderColoring(localityInput.valueAsNumber)
    } else if (algorithmSelect.value == "tunneling") {
        return borderComponentColoring(localityInput.valueAsNumber)
    } else if (algorithmSelect.value == "walls") {
        return antiCollisionColoring(localityInput.valueAsNumber)
    } else if (algorithmSelect.value == "nice") {
        return niceColoring(localityInput.valueAsNumber)
    } else {
        throw "Unknown algorithm"
    }
}

function run(): [PartialGrid<number>, DynamicLocal<number>] {
    let grid = new PartialGrid<NodeColor>(rows, columns)
    render(grid)

    let algo = makeAlgo()
    svgGrid.onClick = (i, j) => {
        if (grid.get(i, j) == null) {
            step(algo, grid, i, j, animateStepCheckbox.checked ? 200 : 0)
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
    borderSidesCheckbox.onchange = () => {
        render(grid)
    }
    buildBoxesButton.onclick = () => {
        let size = localityInput.valueAsNumber + 3
        let offset = 2
        putRectangle(algo, grid, offset, offset, size, size)
        putRectangle(algo, grid, offset + size + 2, offset, size, size)
        putRectangle(algo, grid, offset, offset + size + 1, size, size)
        putRectangle(algo, grid, offset + size + 2, offset + size + 1, size, size)
        putRectangle(algo, grid, offset + size + 1, offset, offset - 1, size)
        putRectangle(algo, grid, offset + size, offset + size + 1, offset - 1, size)
        render(grid)
    }
    return [grid, algo]
}

async function runAutoAdversary() {
    let [grid, algo] = run()

    for (let t = 0; t < grid.rows * grid.columns; t++) {
        let [i, j] = adversary(grid)
        step(algo, grid, i, j)
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
