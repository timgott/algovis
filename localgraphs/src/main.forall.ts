//#region Imports
import { DragNodeInteraction, GraphInteraction, GraphPainter, GraphPhysicsSimulator, distanceToPointSqr, findClosestNode, moveSlightly } from "./interaction/graphsim.js";
import { drawArrowTip, initFullscreenCanvas } from "../../shared/canvas.js"
import { AnimationFrame, InteractionController, UiStack } from "./interaction/controller.js";
import { Graph, GraphEdge, GraphNode, createEdge, createEmptyGraph, createNode } from "./graph.js";
import { assert, hasStaticType } from "../../shared/utils.js";
import { UndoHistory } from "./interaction/undo.js";
import { BuildGraphInteraction, ClickNodeInteraction, MoveComponentInteraction } from "./interaction/tools.js";
import { computeDistances } from "./graphalgos.js";
import { normalize, vec, vecadd, vecdir, vecscale, vecsub, Vector } from "../../shared/vector.js";
import { GraphLayoutPhysics, LayoutConfig } from "./interaction/physics.js";
import { drawWindowTitle, WindowBounds as BoundedWindow, WindowController, satisfyMinBounds } from "./interaction/windows.js";
import { Rect } from "../../shared/rectangle.js";
//#endregion

// Forall quantified construction calculus

//#region Declare UI elements
let localityInput = document.getElementById("locality") as HTMLInputElement
let undoButton = document.getElementById("undo") as HTMLButtonElement
let redoButton = document.getElementById("redo") as HTMLButtonElement
let resetButton = document.getElementById("reset") as HTMLButtonElement
const canvas = document.getElementById('graph_canvas') as HTMLCanvasElement;
//#endregion

//#region Layout Config
const layoutStyle: LayoutConfig = {
    nodeRadius: 10,
    pushDistance: 50,
    minEdgeLength: 50,
    pushForce: 50.0,
    edgeForce: 100.0,
    centeringForce: 0.0,
    dampening: 5.0,
    sleepVelocity: 0.5,
}
hasStaticType<LayoutConfig>(layoutStyle)

const windowPushForce = 2000.0
const windowPushMargin = 200.0

//#endregion

//#region State types

type BaseNodeData = {
    annotation: string
}

type NormalNodeData = BaseNodeData & {
    kind: "normal"
    pin: { label: Node } | null,
}

type VariableNodeData = BaseNodeData & {
    kind: "variable"
    name: string
}

type NodeData = NormalNodeData | VariableNodeData
type MainGraph = Graph<NodeData>
type Node = GraphNode<NodeData>

type WindowState = BoundedWindow & {
    kind: "box"
}

// Everything that can be undone, possibly derived data to save recomputation
type State = {
    graph: MainGraph,
    windows: WindowState[],
}


function makeInitialState(): State {
    let state: State = {
        graph: createEmptyGraph(),
        windows: []
    }
    return state
}

function putNewNode(graph: MainGraph, x: number, y: number): Node {
    const data: NodeData = {
        kind: "normal",
        pin: null,
        annotation: "",
    }
    let node = createNode(graph, data, x, y)
    moveSlightly(node)
    return node
}

function putNewWindow(state: State, window: WindowState) {
    pushUndoPoint()
    state.windows.push(window)
}
//#endregion


function isPinned(n: GraphNode<NodeData>) {
    return n.data.kind === "normal" && n.data.pin;
}

//#region Renderer

function computePinLevel(nodes: Node[], radius: number): Map<Node, number> {
    const pinned = nodes.filter(isPinned)
    const pinnedDistances = computeDistances(pinned, nodes)
    return new Map<Node, number>(
        nodes.map(n => {
            const d = pinnedDistances.get(n) ?? Infinity
            const level = Math.max(radius + 1 - d, 0)
            return [n, level]
        })
    )
}

function drawLineBetweenCircles(ctx: CanvasRenderingContext2D, a: Vector, b: Vector, radiusA: number, radiusB: number = radiusA) {
    const dir = vecdir(a, b)
    const newA = vecadd(a, vecscale(radiusA, dir))
    const newB = vecsub(b, vecscale(radiusB, dir))
    ctx.beginPath()
    ctx.moveTo(newA.x, newA.y)
    ctx.lineTo(newB.x, newB.y)
}

function getEdgeOrientation(edge: GraphEdge<NodeData>): [Node, Node] | null {
    if (edge.a.data.kind === "normal" && edge.b.data.kind === "normal") {
        if (edge.a.data.pin?.label === edge.b) {
            console.assert(edge.b.data.pin === null, "inconsistent orientation")
            return [edge.a, edge.b]
        } else if (edge.b.data.pin?.label === edge.a) {
            console.assert(edge.a.data.pin === null, "inconsistent orientation")
            return [edge.b, edge.a]
        }
    }
    return null
}

export class OurGraphPainter implements GraphPainter<NodeData> {
    strokeWidth: number = this.nodeRadius / 3
    arrowWidth: number = 1
    committedColor: string = "darkmagenta"
    constructor(private nodeRadius: number) {}

    public drawGraph(ctx: CanvasRenderingContext2D, graph: Graph<NodeData>) {
        const pinLevel = computePinLevel(graph.nodes, localityInput.valueAsNumber)

        // nodes
        for (let node of graph.nodes) {
            this.drawNode(ctx, node, pinLevel.get(node)!)
        }
        // edges
        for (let edge of graph.edges) {
            let orientation = getEdgeOrientation(edge)
            if (orientation) {
                let [a, b] = orientation
                this.drawArrow(ctx, a, b)
            } else {
                const levelA = pinLevel.get(edge.a)!
                const levelB = pinLevel.get(edge.b)!
                const free = levelA <= 1 && levelB <= 1
                this.drawEdge(ctx, edge, free)
            }
        }
    }

    private calcLineWidth(node: Node): number {
        return this.strokeWidth * 0.75
    }

    private calcRadius(node: Node): number {
        return this.nodeRadius + (isPinned(node)? this.calcLineWidth(node)*2 : 0)
    }

    protected drawNode(ctx: CanvasRenderingContext2D, node: GraphNode<NodeData>, level: number) {
        const pinned = isPinned(node)
        const free = level === 0
        const hasHint = node.data.annotation.length > 0 && !pinned
        const blackV = 0
        const whiteV = 255
        const black = `rgba(${blackV}, ${blackV}, ${blackV}, 1)`
        const white = `rgba(${whiteV}, ${whiteV}, ${whiteV}, 1)`

        const lineWidth = this.calcLineWidth(node)
        const radius = this.calcRadius(node)

        ctx.lineWidth = lineWidth
        if (pinned) {
            // filled circle
            ctx.strokeStyle = this.committedColor
            ctx.fillStyle = this.committedColor
        } else if (!free) {
            // black circle
            ctx.fillStyle = black
            ctx.strokeStyle = black
        } else {
            // empty circle
            ctx.fillStyle = "transparent"
            ctx.strokeStyle = black
            //ctx.lineWidth = this.strokeWidth * 0.5
        }
        ctx.circle(node.x, node.y, radius)
        ctx.fill()
        ctx.stroke()

        // pin level rings
        for (let i = level - 1; i > 0; i--) {
            const offset = lineWidth * 2 * i// + 0.5*lineWidth
            const alpha = 0.5
            //ctx.strokeStyle = `rgba(${blackV}, ${blackV}, ${blackV}, ${alpha})`
            ctx.globalAlpha = alpha
            ctx.circle(node.x, node.y, radius + offset)
            ctx.stroke()
        }
        ctx.globalAlpha = 1

        if (pinned) {
            ctx.fillStyle = black
            this.drawLabel(ctx, node)
        } else if (hasHint) {
            this.drawHint(ctx, node)
        }
    }

    protected drawLabel(ctx: CanvasRenderingContext2D, node: GraphNode<NodeData>) {
        // label
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        const fontWeight = "normal"
        const fontSize = this.nodeRadius * 1.5
        ctx.font = `${fontWeight} ${fontSize}px sans-serif`
        let label = node.data.annotation
        ctx.fillText(label, node.x, node.y)
    }

    protected drawHint(ctx: CanvasRenderingContext2D, node: GraphNode<NodeData>) {
        // label
        ctx.textAlign = "left"
        ctx.textBaseline = "top"
        const fontWeight = "normal"
        const fontSize = this.nodeRadius * 1.5
        ctx.font = `${fontWeight} ${fontSize}px sans-serif`
        let label = node.data.annotation
        const textX = node.x + this.nodeRadius * 0.2
        const textY = node.y + this.nodeRadius * 0.2
        const textWidth = ctx.measureText(label).width
        const pad = 2
        ctx.fillStyle = "black"
        ctx.fillRect(textX - pad, textY - pad, textWidth + 2*pad, fontSize + 2*pad)
        ctx.fillStyle = "white"
        ctx.fillText(label, textX, textY)
    }

    protected drawEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge<NodeData>, free: boolean) {
        const alpha = free? 0.5 : 1
        let linewidth = this.strokeWidth
        if (free) {
            linewidth *= 0.5
        }
        ctx.lineWidth = linewidth
        ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`
        drawLineBetweenCircles(ctx, edge.a, edge.b, this.calcRadius(edge.a), this.calcRadius(edge.b))
        ctx.stroke()
    }

    protected drawArrow(ctx: CanvasRenderingContext2D, from: GraphNode<NodeData>, to: GraphNode<NodeData>) {
        ctx.lineWidth = this.arrowWidth
        ctx.strokeStyle = this.committedColor
        ctx.lineWidth = 6
        ctx.beginPath()
        const offset = vecscale(this.nodeRadius * 1.5, vecdir(from, to))
        let a = vecadd(from, offset)
        let b = vecsub(to, offset)
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        drawArrowTip(a.x, a.y, b.x, b.y, 16, ctx)
        ctx.stroke()
    }
}

function setArrow(node: GraphNode<NormalNodeData>, label: Node) {
    node.data.pin = {
        label: label
    }
}

function clearArrow(node: GraphNode<NormalNodeData>) {
    node.data.pin = null
}

/* #endregion */

function animateWindowContent(frame: AnimationFrame, window: WindowState, titleArea: Rect) {
    let graph = globalState.graph
    if (window.kind === "box") {
        drawWindowTitle(frame.ctx, titleArea, "Box")
        let center = Rect.center(window.bounds)
        for (let node of graph.nodes) {
            if (Rect.contains(window.bounds, node.x, node.y)) {
                // push away from borders
                let margin = windowPushMargin
                let power = 3

                let left = Math.pow(Math.max(margin - (node.x - window.bounds.left), 0) / margin, power)
                let right = Math.pow(Math.max(margin - (window.bounds.right - node.x), 0) / margin, power)
                let top = Math.pow(Math.max(margin - (node.y - window.bounds.top), 0) / margin, power)
                let bottom = Math.pow(Math.max(margin - (window.bounds.bottom - node.y), 0) / margin, power)

                let force = vecscale(windowPushForce, vec(left - right, top - bottom))
                node.vx += force.x * frame.dt
                node.vy += force.y * frame.dt

            }
        }
    }
}

//#region Custom tools: Arrow and window spanning

// Orient edge for sinkless orientation
class ArrowTool implements GraphInteraction<NodeData> {
    state: {
        startNode: GraphNode<NormalNodeData>,
    } | null = null

    constructor(
        private pushUndoPoint: (graph: Graph<NodeData>) => void,
    ) {
    }

    onMouseDown(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number): void {
        let normalNodes = [...graph.nodes].filter((n): n is GraphNode<NormalNodeData> => n.data.kind === "normal")
        let node = findClosestNode(mouseX, mouseY, normalNodes)
        if (node !== null) {
            const source = node
            this.state = {
                startNode: source,
            }
        }
    }

    findEndNode(mouseX: number, mouseY: number, startNode: GraphNode<NodeData>): GraphNode<NodeData> | null {
        const candidates = [...startNode.neighbors].filter(n => n.data.kind === "normal")
        const endNode = findClosestNode(mouseX, mouseY, candidates)

        if (endNode === null) {
            return null
        }

        const startDist = distanceToPointSqr(mouseX, mouseY, startNode)
        const endDist = distanceToPointSqr(mouseX, mouseY, endNode)
        if (startDist < endDist) {
            return null
        }
        return endNode
    }

    onDragStep(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, dt: number): void {
        const state = this.state
        if (state !== null) {
            const startNode = state.startNode
            const endNode = this.findEndNode(mouseX, mouseY, startNode)
            if (endNode !== null) {
                drawCtx.lineWidth = 2
                drawCtx.strokeStyle = "black"
                drawCtx.beginPath()
                let ax = startNode.x
                let ay = startNode.y
                let bx = (mouseX + endNode.x) * 0.5
                let by = (mouseY + endNode.y) * 0.5
                drawCtx.moveTo(ax, ay)
                drawCtx.quadraticCurveTo(mouseX, mouseY, bx, by)
                drawArrowTip(mouseX, mouseY, bx, by, 20, drawCtx)
                drawCtx.stroke()
                drawCtx.fillStyle = `rgba(0, 0, 0, 0.5)`
                drawCtx.circle(endNode.x, endNode.y, layoutStyle.nodeRadius * 2)
                drawCtx.fill()
            }
            else {
                drawCtx.lineWidth = 2
                drawCtx.strokeStyle = "red"
                drawCtx.beginPath()
                drawCtx.moveTo(startNode.x, startNode.y)
                drawCtx.lineTo(mouseX, mouseY)
                drawArrowTip(startNode.x, startNode.y, mouseX, mouseY, 20, drawCtx)
                drawCtx.stroke()
            }
        }
    }

    onMouseUp(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number): void {
        let state = this.state
        if (state !== null) {
            const startNode = state.startNode
            const endNode = this.findEndNode(mouseX, mouseY, startNode)
            if (endNode !== null) {
                this.pushUndoPoint(graph)
                setArrow(startNode, endNode)
            } else {
                clearArrow(startNode)
            }
        }
    }
}

class SpanWindowTool implements GraphInteraction<NodeData> {
    state: {
        startPos: Vector,
    } | null = null

    constructor(
        private createWindow: (bounds: Rect) => WindowState,
    ) {
    }

    onMouseDown(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number): void {
        this.state = {
            startPos : vec(mouseX, mouseY),
        }
    }

    onDragStep(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, dt: number): void {
        let state = this.state
        if (state !== null) {
            let bounds = Rect.fromPoints([state.startPos, vec(mouseX, mouseY)])
            // dashed gray rectangle
            drawCtx.save()
            drawCtx.strokeStyle = "gray"
            drawCtx.setLineDash([5, 5])
            drawCtx.lineWidth = 1
            drawCtx.strokeRect(bounds.left, bounds.top, Rect.width(bounds), Rect.height(bounds))
            drawCtx.restore()
        }
    }

    onMouseUp(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number): void {
        if (this.state === null) {
            return
        }
        let bounds = Rect.fromPoints([this.state.startPos, vec(mouseX, mouseY)])
        this.createWindow(bounds)
    }
}
//#endregion

//#region Tool buttons

function toolButton(id: string, tool: () => GraphInteraction<NodeData>) {
    document.getElementById(id)!.addEventListener("click", () => {
        globalSim.setInteractionMode(tool)
    })
}

function pushUndoPoint(): void {
    history.push(globalState)
}

function makeUndoable<T extends (...args: any) => any>(f: T): T {
    return function(this: any, ...args: Parameters<T>): ReturnType<T> {
        pushUndoPoint()
        return f.apply(this, args)
    } as T
}

function askNodeLabel(node: Node): void {
    const newLabel = prompt("Node label")
    if (newLabel !== null) {
        node.data.annotation = newLabel
    }
}

function createBoxWindow(bounds: Rect) {
    let window: WindowState = {
        kind: "box",
        bounds,
        resizing: {
            minWidth: 150,
            minHeight: 50,
        }
    }
    satisfyMinBounds(window)
    putNewWindow(globalState, window)
    return window
}

const buildInteraction = () => new BuildGraphInteraction<NodeData>(makeUndoable(putNewNode), makeUndoable(createEdge))
const arrowInteraction = () => new ArrowTool(pushUndoPoint)
const labelInteraction = () => new ClickNodeInteraction<NodeData>(makeUndoable(askNodeLabel))

toolButton("tool_move", () => new MoveComponentInteraction())
toolButton("tool_drag", () => new DragNodeInteraction())
toolButton("tool_build", buildInteraction)
toolButton("tool_arrow", arrowInteraction)
toolButton("tool_label", labelInteraction)

toolButton("tool_boxwindow", () => new SpanWindowTool(createBoxWindow))

undoButton.addEventListener("click", () => {
    const last = history.undo(globalState)
    if (last !== null) {
        replaceGlobalState(last)
    } else {
        console.error("End of history")
    }
})
redoButton.addEventListener("click", () => {
    replaceGlobalState(history.redo() ?? globalState)
})
resetButton.addEventListener("click", () => {
    replaceGlobalState(makeInitialState())
})

localityInput.addEventListener("input", () => {
    controller.requestFrame()
})
//#endregion

function replaceGlobalState(newState: State) {
    globalState = newState
    globalSim.changeGraph(newState.graph)
    globalWindows.windows = newState.windows
    controller.requestFrame()
}

/* Global init */

const history = new UndoHistory<State>()
let globalState = makeInitialState()

const layoutPhysics = new GraphLayoutPhysics(layoutStyle)
const globalSim = new GraphPhysicsSimulator<NodeData>(globalState.graph, layoutPhysics, new OurGraphPainter(layoutStyle.nodeRadius))
globalSim.setInteractionMode(buildInteraction)

const globalWindows = new WindowController(globalState.windows, animateWindowContent)

initFullscreenCanvas(canvas)
const controller = new InteractionController(canvas,
    new UiStack([
        globalSim,
        globalWindows,
    ])
)
controller.requestFrame()
