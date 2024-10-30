//#region Imports
import { DragNodeInteraction, GraphInteraction, GraphPainter, GraphPhysicsSimulator, distanceToPointSqr, findClosestNode, moveSlightly } from "./interaction/graphsim.js";
import { drawArrowTip, getCursorPosition, initFullscreenCanvas } from "../../shared/canvas.js"
import { AnimationFrame, InteractionController, UiStack } from "./interaction/controller.js";
import { Graph, GraphEdge, GraphNode, clearAllEdges, clearNeighbors, copySubgraphTo, createEdge, createEmptyGraph, createNode, deleteNode, mapSubgraphTo } from "./graph.js";
import { assert, ensured, hasStaticType, unreachable } from "../../shared/utils.js";
import { UndoHistory } from "./interaction/undo.js";
import { BuildGraphInteraction, ClickNodeInteraction, MoveComponentInteraction } from "./interaction/tools.js";
import { bfsSimple, computeDistances } from "./graphalgos.js";
import { normalize, Positioned, vec, vecadd, vecdir, vecscale, vecset, vecsub, Vector } from "../../shared/vector.js";
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
    nodeRadius: 5,
    pushDistance: 50,
    minEdgeLength: 50,
    pushForce: 50.0,
    edgeForce: 200.0,
    centeringForce: 0.0,
    dampening: 5.0,
    sleepVelocity: 2.0,
}
hasStaticType<LayoutConfig>(layoutStyle)

const windowPushForce = 2000.0
const windowPushMargin = 0.1
const windowPushMarginConst = 30

const varnodeRadius = layoutStyle.nodeRadius * 2

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
    connectors: Node[]
}

type NodeData = NormalNodeData | VariableNodeData
type MainGraph = Graph<NodeData>
type Node = GraphNode<NodeData>

type WindowState = BoundedWindow & ({
    kind: "box" | "output" | "either"
} | {
    kind: "forall"
    bindings: string[]
})

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

function putNewWindow(state: State, window: WindowState): WindowState {
    pushUndoPoint()
    satisfyMinBounds(window)
    state.windows.push(window)
    return window
}
//#endregion

function isNormalNode(node: Node): node is GraphNode<NormalNodeData> {
    return node.data.kind === "normal"
}

function isVarNode(node: Node): node is GraphNode<VariableNodeData> {
    return node.data.kind === "variable"
}

function createConnector(graph: MainGraph, varnode: GraphNode<VariableNodeData>): Node {
    let connector = putNewNode(graph, varnode.x, varnode.y)
    varnode.data.connectors.push(connector)
    placeConnectors(varnode, 0)
    return connector
}

function makeEdgeOrConnector(graph: Graph<NodeData>, a: Node, b: Node): GraphEdge<NodeData> {
    if (isVarNode(a)) {
        a = createConnector(graph, a)
    }
    if (isVarNode(b)) {
        b = createConnector(graph, b)
    }
    return createEdge(graph, a, b)
}

function placeConnectors(varnode: GraphNode<VariableNodeData>, dt: number) {
    // place all connectors in circle around varnode
    let center = vec(0, 0);
    for (let connector of varnode.data.connectors) {
        center.x += connector.x
        center.y += connector.y
    }
    let n = varnode.data.connectors.length
    let r = varnodeRadius+layoutStyle.nodeRadius
    let vel = vec(0, 0)
    let averagevel = vec(varnode.vx, varnode.vy)
    for (let i = 0; i < n; i++) {
        let angle = i / n * 2 * Math.PI
        let targetPos = vecadd(varnode, Vector.fromAngle(angle, r))
        let connector = varnode.data.connectors[i]
        averagevel = vecadd(averagevel, vec(connector.vx, connector.vy))
        connector.vx = 0
        connector.vy = 0
        if (dt == 0) {
            vecset(connector, targetPos)
        } else {
            let deltav = vecscale(1 / dt, vecsub(targetPos, connector))
            connector.vx += deltav.x * 2
            connector.vy += deltav.y * 2
            vel = vecsub(vel, deltav)
        }
    }
    vel = vecadd(vel, vecscale(1 / (n+1), averagevel))
    varnode.vx = vel.x
    varnode.vy = vel.y
    for (let connector of varnode.data.connectors) {
        connector.vx += vel.x
        connector.vy += vel.y
        //connector.x += vel.x * dt
        //connector.y += vel.y * dt
    }
}

function applyCustomPhysics(dt: number, graph: MainGraph) {
    for (let node of graph.nodes) {
        if (isVarNode(node)) {
            placeConnectors(node, dt)
        }
    }
}

function isPinned(n: GraphNode<NodeData>) {
    return n.data.kind === "normal" && n.data.pin;
}

//#region Rotation Symmetry

// copy connected component 3x around node
function rotationSymmetrize(count: number, locality: number, center: Node, graph: Graph<NodeData>) {
    if (center.neighbors.size !== 1) {
        console.warn("Mirrored node must have exactly one neighbor")
        return
    }

    let [neighbor] = center.neighbors

    // find connected component
    let otherNodes: Node[] = []
    let pinLevels = computePinLevel(graph.nodes, locality)
    bfsSimple(neighbor, n => {
        if (n === center) return [];
        otherNodes.push(n)
        let next = []
        for (let neighbor of n.neighbors) {
            if (pinLevels.get(neighbor)! > 1 || pinLevels.get(n)! > 1){
                next.push(neighbor)
            }
        }
        return next
    })

    // make new copies so that we have the subgraph count times
    let maps: Map<Node, Node>[] = [];
    let centerAnnotation = center.data.annotation
    let prefix = "";
    for (let i=1; i<count; i++) {
        if (centerAnnotation.length > 1) {
            prefix += "(" + centerAnnotation + ")"
        } else {
            prefix += centerAnnotation
        }
        maps.push(mapSubgraphTo(otherNodes, graph, (data) => ({
            ...data,
            annotation: data.annotation? prefix + data.annotation : data.annotation,
        })))
    }

    // fix labels and variable connectors
    for (let map of maps) {
        function mapNode(n: Node) {
            return n === center ? center : ensured(map.get(n))
        }
        for (let [n, m] of map) {
            if (isNormalNode(n) && n.data.pin) {
                assert(isNormalNode(m), "m has same data as n, mr typechecker")
                let label = n.data.pin.label
                m.data.pin = { label: mapNode(label) }
            } else if (isVarNode(n)) {
                assert(isVarNode(m), "m has same data as n, mr typechecker")
                m.data.connectors = n.data.connectors.map(mapNode)
            }
        }
    }

    // rotate the copies around center
    for (let i=1; i<count; i++) {
        let map = maps[i-1]
        for (let [_, node] of map) {
            vecset(node, Vector.rotate(node, i * 2 * Math.PI / count, center))
            moveSlightly(node)
        }
    }

    // connect to center
    for (let map of maps) {
        createEdge(graph, center, map.get(neighbor)!)
    }

    // clear center label
    if (isNormalNode(center)) {
        clearArrow(center)
    }
}

//#endregion


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

export class OurGraphPainter implements GraphPainter<NodeData> {
    strokeWidth: number = this.nodeRadius / 3
    arrowWidth: number = 1
    committedColor: string = "darkmagenta"
    hoverPosition: Vector | null = null

    constructor(private nodeRadius: number) {}

    public drawGraph(ctx: CanvasRenderingContext2D, graph: Graph<NodeData>) {
        ctx.save()
        const pinLevel = computePinLevel(graph.nodes, localityInput.valueAsNumber)

        // edges
        for (let edge of graph.edges) {
            const levelA = pinLevel.get(edge.a)!
            const levelB = pinLevel.get(edge.b)!
            const free = levelA <= 1 && levelB <= 1
            this.drawEdge(ctx, edge, free)
        }

        // arrows
        for (let node of graph.nodes) {
            let data = node.data
            if (data.kind === "normal" && data.pin) {
                this.drawArrow(ctx, node, data.pin.label)
            }
        }

        // nodes
        for (let node of graph.nodes) {
            let data = node.data
            if (data.kind === "normal") {
                this.drawNormalNode(ctx, node, pinLevel.get(node)!)
            } else {
                this.drawVariableNode(ctx, node, data)
            }
        }

        // annotation
        if (graph.nodes.length < 20) {
            for (let node of graph.nodes) {
                if (node.data.annotation) {
                    this.drawHint(ctx, node)
                }
            }
        } else {
            if (this.hoverPosition) {
                let hoveredNode = findClosestNode(this.hoverPosition.x, this.hoverPosition.y, graph.nodes)
                if (hoveredNode && hoveredNode.data.annotation) {
                    this.drawHint(ctx, hoveredNode)
                }
            }
        }

        ctx.restore()
    }

    private calcLineWidth(node: Node): number {
        return this.strokeWidth * 0.75
    }

    private calcRadius(node: Node): number {
        return this.nodeRadius + (isPinned(node)? this.calcLineWidth(node)*2 : 0)
    }

    protected drawVariableNode(ctx: CanvasRenderingContext2D, node: GraphNode<unknown>, data: VariableNodeData) {
        // gray circle with variable name in center
        const radius = this.nodeRadius * 2
        ctx.fillStyle = "white"
        ctx.strokeStyle = "black"
        ctx.lineWidth = this.strokeWidth
        ctx.circle(node.x, node.y, radius)
        ctx.fill()
        ctx.stroke()
        // label
        ctx.fillStyle = "black"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        const fontWeight = "bold"
        const fontSize = this.nodeRadius * 1.5
        ctx.font = `${fontWeight} ${fontSize}px sans-serif`
        ctx.fillText(data.name, node.x, node.y)
    }

    protected drawNormalNode(ctx: CanvasRenderingContext2D, node: GraphNode<NodeData>, level: number) {
        const pinned = isPinned(node)
        const free = level === 0
        const hasHint = node.data.annotation.length > 0
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
    }

    protected drawHint(ctx: CanvasRenderingContext2D, node: GraphNode<NodeData>) {
        // label
        ctx.textAlign = "left"
        ctx.textBaseline = "top"
        const fontWeight = "bold"
        const fontSize = 12
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

function getWindowTitle(window: WindowState): string {
    switch (window.kind) {
        case "box": return "Box"
        case "output": return "Output"
        case "forall": return `Forall(${window.bindings.join(", ")})`
        case "either": return "Either"
        default: unreachable(window)
    }
}

function animateWindowContent(frame: AnimationFrame, window: WindowState, titleArea: Rect) {
    let graph = globalState.graph
    drawWindowTitle(frame.ctx, titleArea, getWindowTitle(window), window.borderColor)
    // todo: move to custom physics
    for (let node of graph.nodes) {
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
            node.vx += force.x * frame.dt
            node.vy += force.y * frame.dt
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
            this.pushUndoPoint(graph)
            if (endNode !== null) {
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
        private createWindow: (bounds: Rect) => unknown,
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
            drawCtx.beginPath()
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

function createSimpleWindow(bounds: Rect, kind: "box" | "output" | "either", color: string): WindowState {
    let window: WindowState = {
        kind,
        bounds,
        borderColor: color,
        resizing: {
            minWidth: 50,
            minHeight: 30,
        }
    }
    return putNewWindow(globalState, window)
}

function createBoxWindow(bounds: Rect): WindowState {
    return createSimpleWindow(bounds, "box", "darkblue")
}

function createOutputWindow(bounds: Rect): WindowState {
    return createSimpleWindow(bounds, "output", "darkgreen")
}

function createEitherWindow(bounds: Rect): WindowState {
    return createSimpleWindow(bounds, "either", "black")
}

function createForallWindow(bounds: Rect): void {
    let bindings = prompt("Parameter names split by comma")?.split(",")?.map(s => s.trim()) ?? []
    if (bindings.length === 0) {
        return
    }
    let window: WindowState = {
        kind: "forall",
        borderColor: "purple",
        bounds,
        resizing: {
            minWidth: 150,
            minHeight: 50,
        },
        bindings: bindings
    }
    putNewWindow(globalState, window)
}

function ourDeleteNode(node: Node) {
    for (let neighbor of node.neighbors) {
        if (isNormalNode(neighbor) && neighbor.data.pin?.label === node) {
            clearArrow(neighbor)
        }
        if (isVarNode(neighbor)) {
            neighbor.data.connectors = neighbor.data.connectors.filter(c => c !== node)
        }
    }
    deleteNode(globalState.graph, node)
}

function toggleNodeVariable(node: GraphNode<NodeData>) {
    if (node.data.kind === "normal") {
        let variableName = prompt("Variable name")
        if (variableName == null) {
            return
        }
        clearNeighbors(globalState.graph, node)
        node.data = {
            kind: "variable",
            name: variableName,
            annotation: node.data.annotation,
            connectors: []
        }
    } else {
        for (let connector of node.data.connectors) {
            ourDeleteNode(connector)
        }
        node.data = {
            kind: "normal",
            pin: null,
            annotation: node.data.annotation
        }
    }
}

const buildInteraction = () => new BuildGraphInteraction<NodeData>(makeUndoable(putNewNode), makeUndoable(makeEdgeOrConnector))
const arrowInteraction = () => new ArrowTool(pushUndoPoint)
const labelInteraction = () => new ClickNodeInteraction<NodeData>(makeUndoable(askNodeLabel))

toolButton("tool_move", () => new MoveComponentInteraction())
toolButton("tool_drag", () => new DragNodeInteraction())
toolButton("tool_build", buildInteraction)
toolButton("tool_arrow", arrowInteraction)
toolButton("tool_label", labelInteraction)

toolButton("tool_box", () => new SpanWindowTool(createBoxWindow))
toolButton("tool_outputbox", () => new SpanWindowTool(createOutputWindow))
toolButton("tool_eitherbox", () => new SpanWindowTool(createEitherWindow))
toolButton("tool_forallbox", () => new SpanWindowTool(createForallWindow))

toolButton("tool_varnode", () => new ClickNodeInteraction(makeUndoable(toggleNodeVariable)))

toolButton("tool_symmetrize", () => new ClickNodeInteraction(
    makeUndoable((n,g) => rotationSymmetrize(3, localityInput.valueAsNumber, n, g))))
toolButton("tool_symmetrize2", () => new ClickNodeInteraction(
    makeUndoable((n,g) => rotationSymmetrize(2, localityInput.valueAsNumber, n, g))))
toolButton("tool_delete", () => new ClickNodeInteraction(makeUndoable(ourDeleteNode)))

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

canvas.addEventListener("pointermove", (ev) => {
    const [x,y] = getCursorPosition(canvas, ev)
    painter.hoverPosition = { x, y }
    controller.requestFrame()
})

/* Global init */

const history = new UndoHistory<State>()
let globalState = makeInitialState()

const layoutPhysics = new GraphLayoutPhysics(layoutStyle, [applyCustomPhysics])
const painter = new OurGraphPainter(layoutStyle.nodeRadius)
const globalSim = new GraphPhysicsSimulator<NodeData>(globalState.graph, layoutPhysics, painter)
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
