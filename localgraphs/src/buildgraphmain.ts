import { NodeColor, minimalGreedy, neighborhoodGreedy, parityBorderColoring, borderComponentColoring, randomColoring, isGlobalColoring, antiCollisionColoring } from "./coloring.js";
import { DragNodeInteraction, GraphInteractionMode, GraphPainter, GraphPhysicsSimulator, LayoutConfig, findClosestNode, dragNodes, offsetNodes } from "./graphlayout.js";
import { initFullscreenCanvas } from "../../shared/canvas.js"
import { Graph, GraphEdge, GraphNode, copyGraph, copyGraphTo, createEdge, createEmptyGraph, createNode, extractSubgraph, filteredGraphView, mapGraph } from "./graph.js";
import { assert, assertExists, ensured, invertMap } from "../../shared/utils.js";
import { collectNeighborhood } from "./graphalgos.js";

let algorithmSelect = document.getElementById("select_algorithm") as HTMLSelectElement
let localityInput = document.getElementById("locality") as HTMLInputElement
let undoButton = document.getElementById("undo") as HTMLButtonElement
let resetButton = document.getElementById("reset") as HTMLButtonElement
let pruneButton = document.getElementById("prune") as HTMLButtonElement
let undoHistory: Graph<NodeData>[] = []
const historyLimit = 100

const layoutStyle: LayoutConfig = {
    nodeRadius: 14,
    pushDistance: 30,
    minEdgeLength: 30,
    pushForce: 30.0,
    edgeForce: 100.0,
    centeringForce: 0.0,
    dampening: 5.0,
    sleepVelocity: 0.5,
}

type NodeData = {
    color: NodeColor
    marked: boolean
    collapsed: boolean
}

function algoStep(graph: Graph<NodeData>, pointOfChange: GraphNode<NodeData>) {
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

    // get graph with NodeColor type
    let [rawGraph, rawNodes] = mapGraph(graph, (data) => data.color)
    let originalNodes = invertMap(rawNodes)

    // run algorithm to get changed nodes
    let updates = algo.step(rawGraph, ensured(rawNodes.get(pointOfChange)))

    // apply updates both to actual graph and the mapped graph
    for (let [node, color] of updates) {
        node.data = color
        ensured(originalNodes.get(node)).data.color = color
    }
    console.assert(isGlobalColoring(rawGraph), "correctness check failed")
}

function pushToHistory(graph: Graph<NodeData>) {
    undoHistory.push(structuredClone(graph))
    undoHistory = undoHistory.slice(-historyLimit)
}

function moveSlightly(node: GraphNode<NodeData>) {
    // prevents nodes on same position and wakes them from sleep
    let strength = 3
    assert(strength > layoutStyle.sleepVelocity, "push strength cannot overcome sleep threshold")
    node.vx += (Math.random()*2.-1.) * strength
    node.vy += (Math.random()*2.-1.) * strength
}

function putNewNode(graph: Graph<NodeData>, x: number, y: number) {
    let node = createNode(graph, {
        color: undefined as any,
        marked: false,
        collapsed: false
    }, x, y)
    moveSlightly(node)
    algoStep(graph, node)
    assertExists(node.data.color)
}

function putNewEdge(graph: Graph<NodeData>, a: GraphNode<NodeData>, b: GraphNode<NodeData>) {
    createEdge(graph, a, b)
    algoStep(graph, b)
    algoStep(graph, a)
}

class BuildGraphInteraction<T> implements GraphInteractionMode<NodeData> {
    edgeThreshold: number = 20

    startNode: GraphNode<NodeData> | null = null
    startX: number = 0
    startY: number = 0

    onMouseDown(graph: Graph<NodeData>, visible: GraphNode<NodeData>[], mouseX: number, mouseY: number): void {
        this.startX = mouseX
        this.startY = mouseY
        this.startNode = findClosestNode(mouseX, mouseY, visible)
    }
    shouldCreateEdge(mouseX: number, mouseY: number): boolean {
        let distance = Math.hypot(mouseX - this.startX, mouseY - this.startY)
        return distance >= this.edgeThreshold
    }
    onDragStep(graph: Graph<NodeData>, visible: Iterable<GraphNode<unknown>>, mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D): void {
        // TODO: draw edge
        if (this.startNode !== null && this.shouldCreateEdge(mouseX, mouseY)) {
            drawCtx.lineWidth = 2
            drawCtx.beginPath()
            let endNode = findClosestNode(mouseX, mouseY, visible)
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
    onMouseUp(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, endX: number, endY: number): void {
        if (this.shouldCreateEdge(endX, endY)) {
            let endNode = findClosestNode(endX, endY, visible)
            if (this.startNode !== null && endNode !== null && this.startNode !== endNode && !this.startNode.neighbors.has(endNode)) {
                // create new edge
                pushToHistory(graph)
                putNewEdge(graph, this.startNode, endNode)
            }
        }
        else {
            // create new node
            pushToHistory(graph)
            putNewNode(graph, endX, endY)
        }

    }
}

class DuplicateInteraction implements GraphInteractionMode<NodeData> {
    state: {
        subgraph: Graph<NodeData>,
        startX: number,
        startY: number,
        root: GraphNode<NodeData>,
        visibleSubgraph: Graph<NodeData>
    } | null = null
    painter = new ColoredGraphPainter(layoutStyle.nodeRadius)

    onMouseDown(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number): void {
        let rootNode = findClosestNode(mouseX, mouseY, visible)
        if (rootNode !== null) {
            let radius = Infinity
            let [subgraph, nodeMap] = extractSubgraph(collectNeighborhood(rootNode, radius))
            this.state = {
                startX: rootNode.x,
                startY: rootNode.y,
                subgraph: subgraph,
                root: ensured(nodeMap.get(rootNode)),
                visibleSubgraph: filteredGraphView(subgraph, (node) => !node.data.collapsed)
            }
        }
    }
    onDragStep(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, dt: number): void {
        // draw preview?
        let state = this.state
        if (state !== null) {
            offsetNodes(state.subgraph.nodes, mouseX - state.root.x, mouseY - state.root.y)
            this.painter.drawGraph(drawCtx, state.visibleSubgraph)
        }
    }
    onMouseUp(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number): void {
        let state = this.state
        if (state !== null) {
            pushToHistory(graph)
            for (let node of state.subgraph.nodes) {
                moveSlightly(node)
            }
            copyGraphTo(state.subgraph, graph)
            this.state = null
        }
    }
}

export class MoveComponentInteraction<T> implements GraphInteractionMode<T> {
    draggedNode: GraphNode<T> | null = null

    onMouseDown(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number) {
        this.draggedNode = findClosestNode(mouseX, mouseY, visible)
    }

    onDragStep(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number, ctx: unknown, dt: number) {
        if (this.draggedNode) {
            let nodes = collectNeighborhood(this.draggedNode, Infinity)
            dragNodes(nodes, mouseX - this.draggedNode.x, mouseY - this.draggedNode.y, dt)
            console.log("Move dt", dt)
        }
    }

    onMouseUp() {
        this.draggedNode = null
    }
}

export class MarkInteraction implements GraphInteractionMode<NodeData> {
    onMouseDown(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number) {
        let node = findClosestNode(mouseX, mouseY, visible)
        if (node !== null) {
            pushToHistory(graph)
            node.data.marked = !node.data.marked
        }
    }
    onDragStep() {}
    onMouseUp() {}
}

export class CollapseInteraction implements GraphInteractionMode<NodeData> {
    onMouseDown(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number) {
        let node = findClosestNode(mouseX, mouseY, visible)
        if (node !== null) {
            pushToHistory(graph)
            const radius = localityInput.valueAsNumber + 1
            const neighborhood = collectNeighborhood(node, radius)
            const allConnected = [...collectNeighborhood(node, Infinity)]
            const remaining = allConnected.filter(n => !neighborhood.has(n))
            const shouldCollapse = remaining.some(n => !n.data.collapsed) || [...neighborhood].some(n => n.data.collapsed)
            if (shouldCollapse) {
                for (let n of remaining) {
                    n.data.collapsed = true
                }
                for (let n of neighborhood) {
                    n.data.collapsed = false
                }
            } else {
                if (allConnected.length > 500) {
                    if (!confirm(`This will uncollapse ${allConnected.length} nodes. Are you sure?`)) {
                        return
                    }
                }
                for (let n of allConnected) {
                    n.data.collapsed = false
                }
            }
        }
    }
    onDragStep() {}
    onMouseUp() {}
}


function getSvgColorForNode(node: GraphNode<NodeData>): string {
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
    for (let neighbor of node.neighbors) {
        if (neighbor.data.color == node.data.color) {
            return errorColor
        }
    }

    return colors[node.data.color] ?? "gray"
}

class ColoredGraphPainter extends GraphPainter<NodeData> {
    getNodeRadius(small: boolean) {
        return small? this.nodeRadius*0.75 : this.nodeRadius
    }

    getStrokeWidth(small: boolean, fat: boolean) {
        let w = small? 2 : 3
        if (fat) {
            w *= 2
        }
        return w
    }

    isSmaller(node: GraphNode<NodeData>): boolean {
        const hasCollapsedNeighbors = [...node.neighbors].some(n => n.data.collapsed)
        return node.data.marked || node.data.collapsed || hasCollapsedNeighbors
    }

    override drawEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge<NodeData>) {
        const thin = this.isSmaller(edge.a) || this.isSmaller(edge.b)
        ctx.beginPath()
        ctx.lineWidth = this.getStrokeWidth(thin, false)*1.25
        ctx.strokeStyle = thin ? "gray" : "black"
        ctx.moveTo(edge.a.x, edge.a.y)
        ctx.lineTo(edge.b.x, edge.b.y)
        ctx.stroke()
        ctx.closePath()
    }

    override drawNode(ctx: CanvasRenderingContext2D, node: GraphNode<NodeData>) {
        const smaller = this.isSmaller(node)
        const highlight = false
        ctx.fillStyle = getSvgColorForNode(node)
        ctx.strokeStyle = smaller ? "gray" : "black"
        ctx.lineWidth = this.getStrokeWidth(smaller, highlight)
        ctx.beginPath()
        ctx.arc(node.x, node.y, this.getNodeRadius(smaller), 0, 2 * Math.PI)
        ctx.fill()
        ctx.stroke()
        ctx.closePath()

        // label
        ctx.fillStyle = ctx.strokeStyle // text in same color as outline
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        const fontWeight = highlight? "bold" : "normal"
        const fontSize = smaller? "10pt" : "12pt"
        ctx.font = `${fontWeight} ${fontSize} sans-serif`
        let label = (node.data.color+1).toString()
        ctx.fillText(label, node.x, node.y)
    }
}


const canvas = document.getElementById('graph_canvas') as HTMLCanvasElement;
initFullscreenCanvas(canvas)

const painter = new ColoredGraphPainter(layoutStyle.nodeRadius)
const sim = new GraphPhysicsSimulator(canvas, createEmptyGraph<NodeData>(), layoutStyle, painter)
sim.visibleFilter = (node) => !node.data.collapsed

function reset() {
    pushToHistory(sim.getGraph())
    sim.changeGraph(createEmptyGraph())
}

undoButton.addEventListener("click", () => {
    let last = undoHistory.pop()
    if (last) {
        sim.changeGraph(last)
    } else {
        console.error("End of undo history")
    }
})

pruneButton.addEventListener("click", () => {
    pushToHistory(sim.getGraph())
    const visibleGraphView = filteredGraphView(sim.getGraph(), (node) => !node.data.collapsed)
    const prunedGraph = structuredClone(visibleGraphView)
    const nodeSet = new Set(prunedGraph.nodes)
    for (const node of nodeSet) {
        node.neighbors = new Set([...node.neighbors].filter(n => nodeSet.has(n)))
    }
    sim.changeGraph(prunedGraph)
})

function toolButton(id: string, tool: GraphInteractionMode<NodeData>) {
    document.getElementById(id)!.addEventListener("click", () => {
        sim.setInteractionMode(tool)
    })
}

toolButton("tool_move", new MoveComponentInteraction())
toolButton("tool_drag", new DragNodeInteraction())
toolButton("tool_build", new BuildGraphInteraction())
toolButton("tool_duplicate", new DuplicateInteraction())
toolButton("tool_collapse", new CollapseInteraction())
toolButton("tool_mark", new MarkInteraction())

sim.setInteractionMode(new BuildGraphInteraction())
sim.run()

resetButton.addEventListener("click", reset)