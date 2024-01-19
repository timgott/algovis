import { NodeColor, minimalGreedy, neighborhoodGreedy, parityBorderColoring, borderComponentColoring, randomColoring, isGlobalColoring, antiCollisionColoring } from "./coloring.js";
import { DragNodeInteraction, GraphInteractionMode, GraphPainter, GraphPhysicsSimulator, LayoutConfig, findClosestNode, dragNodes, offsetNodes } from "./graphlayout.js";
import { initFullscreenCanvas } from "../../shared/canvas.js"
import { Graph, GraphEdge, GraphNode, MappedNode, copyGraph, copyGraphTo, copySubgraphTo, createEdge, createEmptyGraph, createNode, extractSubgraph, filteredGraphView, mapGraph, mapGraphLazy } from "./graph.js";
import { assert, assertExists, degToRad, ensured, invertMap, min } from "../../shared/utils.js";
import { collectNeighborhood } from "./graphalgos.js";
import { Vector } from "../../shared/vector.js";
import { Rect } from "../../shared/rectangle.js";
import { DynamicLocal } from "./partialgrid.js";

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

function getAlgorithm(): DynamicLocal<NodeColor> {
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
    } else {
        throw "Unknown algorithm"
    }
}

function algoStep(graph: Graph<NodeData>, pointOfChange: GraphNode<NodeData>): void {
    if (graph.nodes.length > 1000) {
        return algoStepFast(graph, pointOfChange)
    }

    let algo = getAlgorithm()

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

// skips checks and cuts corners such that the entire graph doesn't have to be looped over
function algoStepFast(graph: Graph<NodeData>, pointOfChange: GraphNode<NodeData>): void {
    let algo = getAlgorithm()

    // get graph with NodeColor type
    let [rawGraph, getRawNode] = mapGraphLazy(graph, (data) => data.color)

    // run algorithm to get changed nodes
    let updates = algo.step(rawGraph, ensured(getRawNode(pointOfChange)))

    // apply updates both to actual graph and the mapped graph
    for (let [node, color] of updates) {
        node.data = color;
        let originalNode = (node as MappedNode<NodeData, NodeColor>).originalNode
        originalNode.data.color = color
    }
}

function pushToHistory(graph: Graph<NodeData>) {
    undoHistory.push(structuredClone(graph))
    undoHistory = undoHistory.slice(-historyLimit)
}

function moveSlightly(node: GraphNode<unknown>) {
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

function duplicateSubgraph<T>(rootNode: GraphNode<T>): [Graph<T>, GraphNode<T>] {
    let radius = Infinity
    let [subgraph, nodeMap] = extractSubgraph(collectNeighborhood(rootNode, radius))
    return [subgraph, ensured(nodeMap.get(rootNode))]
}

class DuplicateInteraction implements GraphInteractionMode<NodeData> {
    state: {
        subgraph: Graph<NodeData>,
        root: GraphNode<NodeData>,
        visibleSubgraph: Graph<NodeData>
    } | null = null
    painter = new ColoredGraphPainter(layoutStyle.nodeRadius)

    onMouseDown(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number): void {
        let rootNode = findClosestNode(mouseX, mouseY, visible)
        if (rootNode !== null) {
            let [subgraph, newRoot] = duplicateSubgraph(rootNode)
            this.state = {
                subgraph: subgraph,
                root: newRoot,
                visibleSubgraph: filteredGraphView(subgraph, (node) => !node.data.collapsed)
            }
        }
    }
    onDragStep(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, dt: number): void {
        // draw preview
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

function drawArrowTip(cpx: number, cpy: number, x: number, y: number, size: number, ctx: CanvasRenderingContext2D) {
    let angle = Math.atan2(y - cpy, x - cpx)
    let spread = degToRad(35)
    let left = angle - spread
    let right = angle + spread
    ctx.moveTo(x, y)
    ctx.lineTo(x - size * Math.cos(left), y - size * Math.sin(left))
    ctx.moveTo(x, y)
    ctx.lineTo(x - size * Math.cos(right), y - size * Math.sin(right))
}

function nodePos(node: GraphNode<NodeData>) {
    return new Vector(node.x, node.y)
}

// duplicates the neighborhood around blueprintNode in the order of orderedNodes and creates edges between them in the order of orderedEdges
// effectively maps every node of orderedNodes to a copy of the blueprint
// targetReferenceNode is the node in orderedNodes where blueprintNode should be placed
// the resulting graph is put into targetGraph
function macroDuplicate(nodeOrder: GraphNode<NodeData>[], edgeOrder: GraphEdge<NodeData>[], blueprintNode: GraphNode<NodeData>, referenceNode: GraphNode<NodeData>, targetGraph: Graph<NodeData>): void {
    let nodeMap = new Map<GraphNode<NodeData>, GraphNode<NodeData>>()
    let blueprint = collectNeighborhood(blueprintNode, Infinity)

    for (let node of nodeOrder) {
        if (node !== referenceNode) {
            // create copy of blueprint
            let copiedNodes = copySubgraphTo(blueprint, targetGraph)

            // move to position of pattern node
            let dx = (node.x - referenceNode.x)
            let dy = (node.y - referenceNode.y)
            offsetNodes(copiedNodes.values(), dx, dy)

            // store root of blueprint copy to connect edges later
            let copiedRoot = ensured(copiedNodes.get(blueprintNode))
            nodeMap.set(node, copiedRoot)

            for (let copiedNode of copiedNodes.values()) {
                if (node.data.collapsed) {
                    copiedNode.data.collapsed = true
                }
                if (node.data.marked) {
                    copiedNode.data.marked = true
                }
                if (hasCollapsedNeighbors(node) && copiedNode != copiedRoot) {
                    copiedNode.data.collapsed = true
                }
                moveSlightly(copiedNode)
            }
        } else {
            nodeMap.set(node, blueprintNode)
        }
    }
    for (let edge of edgeOrder) {
        let a = nodeMap.get(edge.a)
        let b = nodeMap.get(edge.b)
        if (a !== undefined && b !== undefined) {
            // connect roots according to pattern
            putNewEdge(targetGraph, a, b)
        }
    }
}

class MacroDuplicateInteraction implements GraphInteractionMode<NodeData> {
    state: {
        startNode: GraphNode<NodeData>,
    } | null = null
    painter = new ColoredGraphPainter(layoutStyle.nodeRadius)

    onMouseDown(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number): void {
        let rootNode = findClosestNode(mouseX, mouseY, visible)
        if (rootNode !== null) {
            this.state = {
                startNode: rootNode,
            }
        }
    }
    onDragStep(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, dt: number): void {
        // draw preview?
        if (this.state !== null) {
            const startNode = this.state.startNode
            const endNode = findClosestNode(mouseX, mouseY, visible)
            if (endNode !== null && startNode !== endNode) {
                drawCtx.lineWidth = 2
                drawCtx.beginPath()
                let ax = startNode.x
                let ay = startNode.y
                let bx = (mouseX + endNode.x) * 0.5
                let by = (mouseY + endNode.y) * 0.5
                drawCtx.moveTo(ax, ay)
                drawCtx.quadraticCurveTo(mouseX, mouseY, bx, by)
                drawArrowTip(mouseX, mouseY, bx, by, 20, drawCtx)
                drawCtx.stroke()
            }
        }
    }
    onMouseUp(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number): void {
        let state = this.state
        if (state !== null) {
            const startNode = state.startNode
            const endNode = findClosestNode(mouseX, mouseY, visible)
            if (endNode !== null && startNode !== endNode) {
                pushToHistory(graph)
                let patternNode = startNode
                let blueprintNode = endNode
                let pattern = collectNeighborhood(patternNode, Infinity)
                if (pattern.has(blueprintNode)) {
                    console.warn("pattern node is part of blueprint, explosion imminent")
                    return
                }
                let orderedNodes = graph.nodes.filter(n => pattern.has(n))
                let orderedEdges = graph.edges.filter(e => pattern.has(e.a) && pattern.has(e.b))
                macroDuplicate(orderedNodes, orderedEdges, blueprintNode, patternNode, graph)
            }
        }
    }
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

function hasCollapsedNeighbors(node: GraphNode<NodeData>): boolean {
    return [...node.neighbors].some(n => n.data.collapsed)
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
        return node.data.marked || node.data.collapsed || hasCollapsedNeighbors(node)
    }

    override drawEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge<NodeData>) {
        const thin = this.isSmaller(edge.a) || this.isSmaller(edge.b)
        ctx.beginPath()
        ctx.lineWidth = this.getStrokeWidth(thin, false)*1.25
        ctx.strokeStyle = thin ? "gray" : "black"
        ctx.moveTo(edge.a.x, edge.a.y)
        ctx.lineTo(edge.b.x, edge.b.y)
        ctx.stroke()
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
toolButton("tool_macro", new MacroDuplicateInteraction())

sim.setInteractionMode(new BuildGraphInteraction())
sim.run()

resetButton.addEventListener("click", reset)