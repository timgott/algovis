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
let svgGrid = new ColoredGridSvg(root, rows, columns, 24)

// locality path around cursor
localityInput.addEventListener("input", () => {
    svgGrid.setBallRadius(localityInput.valueAsNumber)
})
svgGrid.setBallRadius(localityInput.valueAsNumber)
radiusCheckbox.addEventListener("input", (ev) => {
    svgGrid.setBallVisible(radiusCheckbox.checked)
})
svgGrid.setBallVisible(radiusCheckbox.checked)

type State<S=unknown> = {
    grid: PartialGrid<NodeColor>,
    algo: DynamicLocal<NodeColor,S>
    algoState: S
}
let undoHistory: State<unknown>[] = []

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

function copyState(state: State) {
    return {
        grid: state.grid.copy(),
        algo: state.algo,
        algoState: structuredClone(state.algo.state),
    }
}

function step(state: State, i: number, j: number, delay: number = 0) {
    undoHistory.push(copyState(state))

    if (delay == 0) {
        state.grid.dynamicAlgorithmStep(i, j, state.algo)
        console.assert(isGlobalColoring(state.grid.getGraph()[0]), "correctness check failed")
    } else {
        dynamicAlgorithmStepAnimated(state.grid, i, j, state.algo, delay)
    }
}

function putRectangle(state: State, i: number, j: number, width: number, height: number) {
    for (let i2 = i; i2 < i + width; i2++) {
        for (let j2 = j; j2 < j + height; j2++) {
            if (i2 < state.grid.rows && j2 < state.grid.columns) {
                step(state, i2, j2, 0)
            }
        }
    }
}

function render(grid: PartialGrid<NodeColor>) {
    renderColoredGrid(grid, svgGrid, paritiesCheckbox.checked, borderSidesCheckbox.checked)
}

function makeAlgo(): DynamicLocal<number, unknown> {
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

function makeState(): State {
    const algo = makeAlgo()
    return {
        grid: new PartialGrid<NodeColor>(rows, columns),
        algo,
        algoState: algo.state,
    }
}

function run(): State {
    let state = makeState()
    render(state.grid)

    svgGrid.onClick = (i, j) => {
        if (state.grid.get(i, j) == null) {
            state.algo = makeAlgo()
            state.algo.state = state.algoState
            step(state, i, j, animateStepCheckbox.checked ? 200 : 0)
            render(state.grid)
        }
    }
    undoButton.onclick = () => {
        let last = undoHistory.pop()
        if (last) {
            state = last
            state.algo.state = state.algoState
            render(state.grid)
        }
    }
    paritiesCheckbox.onchange = () => {
        render(state.grid)
    }
    borderSidesCheckbox.onchange = () => {
        render(state.grid)
    }
    buildBoxesButton.onclick = () => {
        let size = localityInput.valueAsNumber + 3
        let stride = size + 1
        let offset = 1
        for (let i = 0; i < 5; i++) {
            for (let j = 0; j < 5; j++) {
                let i_parity = i % 2
                let j_parity = j % 2
                putRectangle(state, offset + stride * i + j_parity, offset + stride * j, size, size)
            }
        }
        render(state.grid)
    }
    return state
}

async function runAutoAdversary() {
    let state = run()

    for (let t = 0; t < state.grid.rows * state.grid.columns; t++) {
        let [i, j] = adversary(state.grid)
        step(state, i, j)
        if (animateAdvCheckbox.checked) {
            await sleep(1)
            render(state.grid)
        }
    }
    render(state.grid)
}

run()

document.getElementById("reset")!.addEventListener("click", run)
document.getElementById("adversary")!.addEventListener("click", runAutoAdversary)
