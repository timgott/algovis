import { DragNodeInteraction, GraphInteraction, GraphPainter, GraphPhysicsSimulator, findClosestNode, offsetNodes, moveSlightly } from "../../localgraphs/src/interaction/graphsim.js";
import { drawArrowTip, initFullscreenCanvas } from "../../shared/canvas.js"
import { Graph, GraphEdge, GraphNode, MappedNode, copySubgraphTo, createEdge, createEmptyGraph, createNode, deleteNode, extractSubgraph, filteredGraphView, mapGraph, mapGraphLazy } from "../../localgraphs/src/graph.js";
import { assertExists, ensured, invertBijectiveMap, randomChoice } from "../../shared/utils.js";
import { collectNeighborhood, computeDistances, findConnectedComponents, findConnectedComponentsSimple, getNodesByComponent } from "../../localgraphs/src/graphalgos.js";
import { AnimationFrame, InteractionController, UiStack } from "../../localgraphs/src/interaction/controller.js";
import { ClickNodeInteraction, BuildGraphInteraction, MoveComponentInteraction, DuplicateInteraction, SpanWindowTool } from "../../localgraphs/src/interaction/tools.js";
import { UndoHistory } from "../../localgraphs/src/interaction/undo.js";
import { GraphLayoutPhysics, LayoutConfig } from "../../localgraphs/src/interaction/physics.js";
import { drawWindowTitle, satisfyMinBounds, WindowBounds, WindowController,  } from "../../localgraphs/src/interaction/windows.js";
import { Rect } from "../../shared/rectangle.js";
import { vec, vecscale } from "../../shared/vector.js";
import { findSubgraphMatches } from "./subgraph.js";
import { applyRule, makeTestExplodeRule } from "./reduction.js";
import { makeUnlabeledGraphFromEdges } from "./pathgraph.js";

let undoButton = document.getElementById("undo") as HTMLButtonElement
let redoButton = document.getElementById("redo") as HTMLButtonElement
let resetButton = document.getElementById("reset") as HTMLButtonElement

const undoHistorySize = 100

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
    kind: "normal",
    label: string
}

type MainGraph = Graph<NodeData>
type Node = GraphNode<NodeData>

type WindowState = WindowBounds

// Everything that can be undone, possibly cached derived data to save recomputation
type State = {
    graph: MainGraph,
    windows: WindowState[],
    selected: Set<GraphNode<NodeData>>,
}

function makeInitialState(): State {
    return {
        graph: createEmptyGraph(),
        windows: [],
        selected: new Set<GraphNode<NodeData>>(),
    }
}

function pushToHistory() {
    undoHistory.push(globalState)
}

function putNewWindow(bounds: Rect) {
    pushToHistory()
    let color = `hsl(${Math.random() * 360}, 70%, 40%)`
    let window = {
        bounds,
        borderColor: color,
        resizing: {
            minWidth: 50,
            minHeight: 30,
        }
    }
    satisfyMinBounds(window)
    globalState.windows.push(window)
    controller.requestFrame()
}

class ColoredGraphPainter implements GraphPainter<NodeData> {
    constructor(private nodeRadius: number, public showParities: boolean = false) { }

    public drawGraph(ctx: CanvasRenderingContext2D, graph: Graph<NodeData>): void {
        let highlightedNodes = new Set()
        for (let window of globalState.windows) {
            let [containedSubgraph, _map] = extractSubgraph(
                graph.nodes.filter(v => Rect.containsPos(window.bounds, v))
            )
            let [componentCount, _componentMap] = findConnectedComponentsSimple(containedSubgraph);
            if (componentCount === 1) {
                let matches = findSubgraphMatches(graph, containedSubgraph, (a, b) => a.kind === b.kind && a.label === b.label)
                console.log("Matches:", matches.length)
                for (let match of matches) {
                    for (let [_, node] of match) {
                        highlightedNodes.add(node)
                    }
                }
            }
        }
        for (let edge of graph.edges) {
            this.drawEdge(ctx, edge)
        }
        let selectedNodes = globalState.selected
        for (let node of graph.nodes) {
            this.drawNode(ctx, node, highlightedNodes.has(node), selectedNodes.has(node))
        }
    }

    drawEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge<NodeData>) {
        ctx.beginPath()
        ctx.lineWidth = 3
        ctx.strokeStyle = "black"
        if (edge.a == edge.b) {
            // self loop
            ctx.lineWidth = 1
            let cx = edge.a.x + this.nodeRadius;
            let cy = edge.a.y - this.nodeRadius;
            ctx.arc(cx, cy, this.nodeRadius, -Math.PI, Math.PI / 2, false);
            //drawArrowTip(edge.a.x + this.nodeRadius * 8, edge.a.y - this.nodeRadius, edge.a.x + this.nodeRadius, edge.a.y, this.nodeRadius / 2, ctx)
        } else {
            ctx.moveTo(edge.a.x, edge.a.y)
            ctx.lineTo(edge.b.x, edge.b.y)
        }
        ctx.stroke()
    }

    drawNode(ctx: CanvasRenderingContext2D, node: GraphNode<NodeData>, highlight: boolean, selected: boolean) {
        // circle
        ctx.fillStyle = highlight ? "red" : "white"
        ctx.strokeStyle = highlight ? "darkred" : "black"
        ctx.lineWidth = 3
        ctx.circle(node.x, node.y, this.nodeRadius)
        ctx.fill()
        ctx.stroke()

        // selection outline
        if (selected) {
            ctx.lineWidth = 2
            ctx.strokeStyle = "blue"
            ctx.setLineDash([5, 5])
            ctx.circle(node.x, node.y, this.nodeRadius * 1.5)
            ctx.stroke()
            ctx.setLineDash([])
        }

        // label
        if (node.data.kind === "normal") {
            ctx.strokeStyle = "black"
            ctx.fillStyle = ctx.strokeStyle // text in same color as outline
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            const fontWeight = "normal"
            const fontSize = "12pt"
            ctx.font = `${fontWeight} ${fontSize} sans-serif`
            let label = node.data.label ?? ""
            ctx.fillText(label, node.x, node.y)
        }
    }

}


function drawWindowContent(frame: AnimationFrame, window: WindowState, titleArea: Rect) {
    let getWindowTitle = (window: WindowState): string => {
        return "Rule"
    }
    drawWindowTitle(frame.ctx, titleArea, getWindowTitle(window), window.borderColor)
}

function moveWindow(window: WindowState, dx: number, dy: number) {
    for (let node of globalState.graph.nodes) {
        if (Rect.contains(window.bounds, node.x, node.y)) {
            node.x += dx
            node.y += dy
        }
    }
}

function pushNodesIntoWindow(dt: number, window: WindowBounds, nodes: GraphNode<unknown>[]) {
    const windowPushForce = 2000.0
    const windowPushMargin = 0.1
    const windowPushMarginConst = 30

    for (let node of nodes) {
        if (Rect.contains(window.bounds, node.x, node.y)) {
            // push away from borders
            let marginX = Rect.width(window.bounds) * windowPushMargin + windowPushMarginConst
            let marginY = Rect.height(window.bounds) * windowPushMargin + windowPushMarginConst
            let power = 3

            let left = Math.pow(Math.max(marginX - (node.x - window.bounds.left), 0) / marginX, power)
            let right = Math.pow(Math.max(marginX - (window.bounds.right - node.x), 0) / marginX, power)
            let top = Math.pow(Math.max(marginY - (node.y - window.bounds.top), 0) / marginY, power)
            let bottom = Math.pow(Math.max(marginY - (window.bounds.bottom - node.y), 0) / marginY, power)

            let force = vecscale(windowPushForce, vec(left - right, top - bottom))
            node.vx += force.x * dt
            node.vy += force.y * dt
        }
    }
}

let windowForces = (dt: number, graph: Graph<unknown>) => {
    for (let window of globalState.windows) {
        pushNodesIntoWindow(dt, window, graph.nodes)
    }
}

function replaceGlobalState(newState: State) {
    globalState = newState
    globalSim.changeGraph(newState.graph)
    globalWindows.windows = newState.windows
    controller.requestFrame()
}

// special buttons

document.getElementById("btn_test")!.addEventListener("click", () => {
    let testRule = makeTestExplodeRule(makeUnlabeledGraphFromEdges([[1,2], [2,3], [1,3]]))
    applyRule(globalState.graph, testRule)
    controller.requestFrame()
})

// generic buttons

function reset() {
    pushToHistory()
    replaceGlobalState(makeInitialState())
}
resetButton.addEventListener("click", reset)


undoButton.addEventListener("click", () => {
    let last = undoHistory.undo(globalState)
    if (last) {
        replaceGlobalState(last)
    } else {
        console.error("End of undo history")
    }
})
redoButton.addEventListener("click", () => {
    let last = undoHistory.redo()
    if (last) {
        replaceGlobalState(last)
    } else {
        console.error("End of redo history")
    }
})

// tools

function toolButton(id: string, tool: () => GraphInteraction<NodeData>) {
    document.getElementById(id)!.addEventListener("click", () => {
        globalState.selected.clear()
        globalSim.setInteractionMode(tool)
        controller.requestFrame()
    })
}

function makeUndoable<T extends (...args: any) => any>(f: T): T {
    return function(this: any, ...args: Parameters<T>): ReturnType<T> {
        pushToHistory()
        return f.apply(this, args)
    } as T
}

function putNewNode(graph: Graph<NodeData>, x: number, y: number): GraphNode<NodeData> {
    let node = createNode<NodeData>(graph, {
        kind: "normal",
        label: "",
    }, x, y)
    moveSlightly(node)
    globalState.selected = new Set([node])
    return node
}

function putNewEdge(graph: Graph<NodeData>, a: GraphNode<NodeData>, b: GraphNode<NodeData>) {
    return createEdge(graph, a, b)
}

function selectNode(node: GraphNode<NodeData>) {
    if (globalState.selected.has(node)) {
        globalState.selected.delete(node)
    } else {
        globalState.selected = new Set([node])
    }
    controller.requestFrame()
}

const buildInteraction = () => new BuildGraphInteraction(makeUndoable(putNewNode), makeUndoable(putNewEdge)).withSelfLoops().withClickAction(selectNode)

toolButton("tool_move", () => new MoveComponentInteraction())
toolButton("tool_drag", () => new DragNodeInteraction())
toolButton("tool_build", buildInteraction)
toolButton("tool_duplicate", () => new DuplicateInteraction(new ColoredGraphPainter(layoutStyle.nodeRadius), pushToHistory, (data) => structuredClone(data)))
toolButton("tool_rulebox", () => new SpanWindowTool(putNewWindow))
toolButton("tool_delete", () => new ClickNodeInteraction(makeUndoable((node, graph) => deleteNode(graph, node))))
//toolButton("tool_insertion", () => _)
//toolButton("tool_modification", () => _)

const canvas = document.getElementById('graph_canvas') as HTMLCanvasElement;
initFullscreenCanvas(canvas)

function setSelectedLabel(label: string) {
    pushToHistory()
    for (let node of globalState.selected) {
        if (node.data.kind === "normal" || node.data.kind === "insert") {
            node.data.label = label
        }
    }
    controller.requestFrame()
}

document.addEventListener("keypress", (e) => {
    // set label of selected nodes
    setSelectedLabel(e.key.trim())
})

let globalState = makeInitialState()
let undoHistory = new UndoHistory<State>(undoHistorySize)
const painter = new ColoredGraphPainter(layoutStyle.nodeRadius)
const physics = new GraphLayoutPhysics(layoutStyle, ) //[windowForces])
const globalSim = new GraphPhysicsSimulator<NodeData>(globalState.graph, physics, painter)
globalSim.setInteractionMode(buildInteraction)

const globalWindows = new WindowController(globalState.windows, drawWindowContent, moveWindow)

initFullscreenCanvas(canvas)
const controller = new InteractionController(canvas,
    new UiStack([
        globalSim,
        globalWindows,
    ])
)
controller.requestFrame()
