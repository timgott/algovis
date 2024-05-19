import { DragNodeInteraction, GraphInteraction, GraphPainter, GraphPhysicsSimulator, LayoutConfig, SimpleGraphPainter, findClosestNode } from "../interaction/graphlayout.js";
import { drawArrowTip, initFullscreenCanvas } from "../../../shared/canvas.js"
import { Graph, GraphEdge, GraphNode, createEdge, createEmptyGraph, createNode } from "../graph.js";
import { computeDistances, findConnectedComponents, getNodesByComponent } from "../graphalgos.js";
import { InteractionController } from "../interaction/renderer.js";
import { UndoHistory } from "../interaction/undo.js";
import { ClickEdgeInteraction, ClickNodeInteraction } from "../interaction/tools.js";
import { randomSubset } from "../../../shared/utils.js";

let stepButton = document.getElementById("finish_step") as HTMLButtonElement
let localityInput = document.getElementById("locality") as HTMLInputElement
let undoButton = document.getElementById("undo") as HTMLButtonElement
let resetButton = document.getElementById("reset") as HTMLButtonElement
let undoHistory = new UndoHistory<State>(100, cloneState)

const layoutStyle: LayoutConfig = {
    nodeRadius: 5,
    pushDistance: 100,
    minEdgeLength: 80,
    pushForce: 30.0,
    edgeForce: 80.0,
    centeringForce: 0.0,
    dampening: 6.0,
    sleepVelocity: 0.5,
}

type NodeData = {
    outgoing: Set<GraphNode<NodeData>>,
    id: number
}

// Everything that can be undone, reference should only be held for history
type State = {
    graph: Graph<NodeData>,
}

// Can be stored, holds reference to replacable state
type Context = {
    state: State,
    redraw: () => unknown
}

function cloneState(state: State): State {
    return structuredClone(state)
}

function pushToHistory(state: State) {
    undoHistory.push(state)
}

function verifyNodeOrientation(node: GraphNode<NodeData>): boolean {
    for (let neighbor of node.data.outgoing) {
        if (!node.neighbors.has(neighbor)) {
            throw "Outgoing node must be a neighbor"
        }
        if (neighbor.data.outgoing.has(node)) {
            throw "Edge may only point in one direction"
        }
    }
    return true
}

function isSink(node: GraphNode<NodeData>): boolean {
    return node.neighbors.size >= 3 && node.data.outgoing.size === 0
}

function isSinklessOrientation(graph: Graph<NodeData>): boolean {
    for (let node of graph.nodes) {
        if (!isSink(node) && !verifyNodeOrientation(node)) {
            return false
        }
    }
    return true
}

function putNewNode(graph: Graph<NodeData>): GraphNode<NodeData> {
    const offset = 10
    const x = canvas.width/2 + (Math.random()*2-1)*offset
    const y = canvas.height/2 + (Math.random()*2-1)*offset
    let node = createNode<NodeData>(graph, {
        outgoing: new Set(),
        id: graph.nodes.length
    }, x, y)
    return node
}

function putNewEdge(graph: Graph<NodeData>, a: GraphNode<NodeData>, b: GraphNode<NodeData>): GraphEdge<NodeData> {
    const edge = createEdge(graph, a, b)
    edge.length = layoutStyle.minEdgeLength * 3
    return edge
}

function advStep(state: State) {
    const graph = state.graph
    const edgeCount = 2
    const neighbors = randomSubset(graph.nodes, edgeCount)
    const node = putNewNode(graph)
    for (let other of neighbors) {
        putNewEdge(graph, node, other)
    }
}

// Painter

function getSvgColorForNode(node: GraphNode<NodeData>): string {
    if (isSink(node)) {
        // invalid
        return "red"
    }

    return "black"
}

class DirectedGraphPainter implements GraphPainter<NodeData> {
    nodeRadius: number = 4
    edgeWidth: number = 4
    arrowSize: number = 15

    drawGraph(ctx: CanvasRenderingContext2D, graph: Graph<NodeData>): void {
        // edges
        for (let edge of graph.edges) {
            this.drawEdge(ctx, edge)
        }
        // nodes
        for (let node of graph.nodes) {
            this.drawNode(ctx, node)
        }
    }

    protected drawNode(ctx: CanvasRenderingContext2D, node: GraphNode<NodeData>) {
        ctx.circle(node.x, node.y, this.nodeRadius)
        ctx.fillStyle = getSvgColorForNode(node)
        ctx.fill()
    }

    protected drawEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge<NodeData>) {
        const directedToA = edge.b.data.outgoing.has(edge.a)
        const directedToB = edge.a.data.outgoing.has(edge.b)
        const undirected = directedToA === directedToB

        ctx.lineWidth = this.edgeWidth * (undirected ? 0.5 : 1)

        ctx.beginPath()
        ctx.moveTo(edge.a.x, edge.a.y)
        ctx.lineTo(edge.b.x, edge.b.y)

        const cx = (edge.a.x + edge.b.x) / 2
        const cy = (edge.a.y + edge.b.y) / 2
        if (directedToA) {
            drawArrowTip(edge.b.x, edge.b.y, cx, cy, this.arrowSize, ctx)
        }
        if (directedToB) {
            drawArrowTip(edge.a.x, edge.a.y, cx, cy, this.arrowSize, ctx)
        }

        ctx.strokeStyle = "black"
        ctx.stroke()
    }
}

// UI Main

function makeInitialState(): State {
    let state: State = {
        graph: createEmptyGraph(),
    }
    return state
}

const canvas = document.getElementById('graph_canvas') as HTMLCanvasElement;
initFullscreenCanvas(canvas)

const painter = new DirectedGraphPainter()
const sim = new GraphPhysicsSimulator<NodeData>(createEmptyGraph<NodeData>(), layoutStyle, painter)

const controller = new InteractionController(canvas, sim)
const globalCtx: Context = {
    state: makeInitialState(),
    redraw: () => {
        sim.changeGraph(globalCtx.state.graph)
        controller.requestFrame()
    }
}

// Buttons

undoButton.addEventListener("click", () => {
    let last = undoHistory.undo(globalCtx.state)
    if (last) {
        globalCtx.state = last
        globalCtx.redraw()
    } else {
        console.error("End of undo history")
    }
})

function reset() {
    pushToHistory(globalCtx.state)
    globalCtx.state = makeInitialState()
    globalCtx.redraw()
}
resetButton.addEventListener("click", reset)

stepButton.addEventListener("click", () => {
    advStep(globalCtx.state)
    globalCtx.redraw()
})


// Tools
function toolButton(id: string, tool: () => GraphInteraction<NodeData>) {
    document.getElementById(id)!.addEventListener("click", () => {
        sim.setInteractionMode(tool)
    })
}

const flipTool = () => new ClickEdgeInteraction<NodeData>(edge => {
    const a = edge.a
    const b = edge.b
    if (a.data.outgoing.has(b)) {
        a.data.outgoing.delete(b)
        b.data.outgoing.add(a)
    } else {
        b.data.outgoing.delete(a)
        a.data.outgoing.add(b)
    }
    verifyNodeOrientation(a)
    verifyNodeOrientation(b)
})

toolButton("tool_drag", () => new DragNodeInteraction())
toolButton("tool_flip", flipTool)
sim.setInteractionMode(flipTool) // default tool

globalCtx.redraw()