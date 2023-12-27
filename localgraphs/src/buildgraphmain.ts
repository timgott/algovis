import { NodeColor, minimalGreedy, neighborhoodGreedy, parityBorderColoring, borderComponentColoring, randomColoring, isGlobalColoring, antiCollisionColoring, isLocalColoring } from "./coloring.js";
import { DragNodeInteraction, GraphInteractionMode, GraphPhysicsSimulator, LayoutConfig, createGridGraph, createRandomGraph, findClosestNode, shuffleGraphPositions } from "./graphlayout.js";
import { initFullscreenCanvas } from "../../shared/canvas.js"
import { Graph, GraphEdge, GraphNode, copyGraph, createEdge, createEmptyGraph, createNode } from "./graph.js";
import { assertExists } from "../../shared/utils.js";

let algorithmSelect = document.getElementById("select_algorithm") as HTMLSelectElement
let localityInput = document.getElementById("locality") as HTMLInputElement
let undoButton = document.getElementById("undo") as HTMLButtonElement
let resetButton = document.getElementById("reset") as HTMLButtonElement
let undoHistory: Graph<NodeColor>[] = []

const layoutStyle: LayoutConfig = {
    nodeRadius: 14,
    targetDistance: 50,
    edgeLength: 40,
    pushForce: 10.0,
    edgeForce: 0.0,
    centeringForce: 0.0,
    dampening: 5.0,
}


function algoStep(graph: Graph<NodeColor>, pointOfChange: GraphNode<NodeColor>) {
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
        algo = borderComponentColoring(localityInput.valueAsNumber)
    } else if (algorithmSelect.value == "walls") {
        algo = antiCollisionColoring(localityInput.valueAsNumber)
    } else {
        throw "Unknown algorithm"
    }

    let updates = algo.step(graph, pointOfChange)
    for (let [node, color] of updates) {
        node.data = color
    }
    console.assert(isGlobalColoring(graph), "correctness check failed")
}

function pushToHistory(graph: Graph<NodeColor>) {
    undoHistory.push(copyGraph(graph))
}

class BuildGraphInteraction<T> implements GraphInteractionMode<NodeColor> {
    edgeThreshold: number = 5

    startNode: GraphNode<NodeColor> | null = null
    startX: number = 0
    startY: number = 0

    onMouseDown(graph: Graph<NodeColor>, mouseX: number, mouseY: number): void {
        this.startX = mouseX
        this.startY = mouseY
        this.startNode = findClosestNode(mouseX, mouseY, graph)
    }
    shouldCreateEdge(mouseX: number, mouseY: number): boolean {
        let distance = Math.hypot(mouseX - this.startX, mouseY - this.startY)
        return distance >= this.edgeThreshold
    }
    onDragStep(graph: Graph<NodeColor>, mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D): void {
        // TODO: draw edge
        if (this.startNode !== null && this.shouldCreateEdge(mouseX, mouseY)) {
            drawCtx.lineWidth = 2
            drawCtx.beginPath()
            let endNode = findClosestNode(mouseX, mouseY, graph)
            if (endNode !== null && this.startNode !== endNode) {
                drawCtx.moveTo(endNode.x, endNode.y)
                drawCtx.quadraticCurveTo(mouseX, mouseY, this.startNode.x, this.startNode.y)
            } else {
                drawCtx.setLineDash([6, 5])
                drawCtx.moveTo(mouseX, mouseY)
                drawCtx.lineTo(this.startNode.x, this.startNode.y)
            }
            drawCtx.stroke()
            drawCtx.closePath()
            drawCtx.setLineDash([]) 
        }
    }
    onMouseUp(graph: Graph<NodeColor>, endX: number, endY: number): void {
        const defaultColor = undefined as any

        if (this.shouldCreateEdge(endX, endY)) {
            let endNode = findClosestNode(endX, endY, graph)
            if (this.startNode !== null && endNode !== null && this.startNode !== endNode && !this.startNode.neighbors.has(endNode)) {
                // create new edge
                console.log("Create node")
                pushToHistory(graph)
                createEdge(graph, this.startNode, endNode)
                algoStep(graph, endNode)
                algoStep(graph, this.startNode)
            }
        }
        else {
            // create new node
            pushToHistory(graph)
            const newNode = createNode(graph, defaultColor, endX, endY)
            newNode.vx = (Math.random()*2.-1.) * 30
            newNode.vy = (Math.random()*2.-1.) * 30
            algoStep(graph, newNode)
        }

    }
}


function getSvgColorForNode(node: GraphNode<NodeColor>): string {
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

    const errorColor = "red"
    if (!isLocalColoring(node)) {
        return errorColor
    }

    return colors[node.data] ?? "gray"
}

class ColoredGraphSimulator extends GraphPhysicsSimulator<NodeColor> {
    override drawNode(ctx: CanvasRenderingContext2D, node: GraphNode<NodeColor>) {
        ctx.fillStyle = getSvgColorForNode(node)
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(node.x, node.y, layoutStyle.nodeRadius, 0, 2 * Math.PI)
        ctx.fill()
        ctx.stroke()
        ctx.closePath()

        // label
        ctx.fillStyle = "black"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.font = "12pt sans-serif"
        ctx.fillText(node.data.toString(), node.x, node.y)
    }
}


const canvas = document.getElementById('graph_canvas') as HTMLCanvasElement;
initFullscreenCanvas(canvas)

let sim = new ColoredGraphSimulator(canvas, createEmptyGraph(), layoutStyle)
function reset() {
    pushToHistory(sim.graph)
    sim.graph = createEmptyGraph()
}

undoButton.addEventListener("click", () => {
    let last = undoHistory.pop()
    if (last) {
        sim.graph = last
    } else {
        console.error("End of undo history")
    }
})

function toolButton(id: string, tool: GraphInteractionMode<NodeColor>) {
    document.getElementById(id)!.addEventListener("click", () => {
        sim.setInteractionMode(tool)
    })
}

toolButton("tool_move", new DragNodeInteraction())
toolButton("tool_build", new BuildGraphInteraction())

sim.setInteractionMode(new BuildGraphInteraction())
sim.run()

resetButton.addEventListener("click", reset)