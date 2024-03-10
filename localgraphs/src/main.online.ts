import { DragNodeInteraction, GraphInteractionMode, GraphPainter, GraphPhysicsSimulator, LayoutConfig, distanceToPointSqr, findClosestNode, offsetNodes } from "./interaction/graphlayout.js";
import { drawArrowTip, initFullscreenCanvas } from "../../shared/canvas.js"
import { InteractionController, UiStack as UiStack } from "./interaction/renderer.js";
import { Graph, GraphEdge, GraphNode, createEdge, createEmptyGraph, createNode, mapSubgraphTo } from "./graph.js";
import { assert, hasStaticType } from "../../shared/utils.js";
import { UndoHistory } from "./interaction/undo.js";
import { BuildGraphInteraction, ClickNodeInteraction, MoveComponentInteraction } from "./interaction/tools.js";
import { SearchState, bfs, computeDistances, findDistanceTo } from "./graphalgos.js";
import { Vector } from "../../shared/vector.js";
import { InputNode, OperatorNode, OutputNode, createOperatorNode, createOperatorWindow, getInputs, getOutputs } from "./interaction/operators.js";

// "Online" refers to the online local computation model, unrelated to networking

let localityInput = document.getElementById("locality") as HTMLInputElement
let undoButton = document.getElementById("undo") as HTMLButtonElement
let redoButton = document.getElementById("redo") as HTMLButtonElement
let resetButton = document.getElementById("reset") as HTMLButtonElement
const canvas = document.getElementById('graph_canvas') as HTMLCanvasElement;
initFullscreenCanvas(canvas)

const layoutStyle: LayoutConfig = {
    nodeRadius: 10,
    pushDistance: 50,
    minEdgeLength: 50,
    pushForce: 30.0,
    edgeForce: 100.0,
    centeringForce: 0.0,
    dampening: 5.0,
    sleepVelocity: 0.5,
}
hasStaticType<LayoutConfig>(layoutStyle)

type NodeData = {
    pinned: boolean,
    label: string,
    impliedFrom: Node | null, // transferred node
    transferFrom: Node | null // TODO: multiple from disjoint paths
    transferTo: Set<Node> // must not go to disjoint paths (only decision nodes create disjoint paths)
}

type MainGraph = Graph<NodeData>
type Node = GraphNode<NodeData>

// Everything that can be undone, possibly derived data to save recomputation
type State = {
    graph: MainGraph,
    operators: OperatorNode[],
}

function makeInitialState(): State {
    let state: State = {
        graph: createEmptyGraph(),
        operators: [ /*createOperatorNode("equality", 100, 100)*/ ]
    }
    return state
}

function putNewNode(graph: MainGraph, x: number, y: number): Node {
    const data: NodeData = {
        pinned: false,
        label: "",
        impliedFrom: null,
        transferFrom: null,
        transferTo: new Set(),
    }
    return createNode(graph, data, x, y)
}

function toggleNodePin(node: Node) {
    node.data.pinned = !node.data.pinned
}

/* Transfer */

function isIndependent(node: Node, locality: number, pinDistance: number): boolean {
    // Whether the node can be pinned at distance, independent of other nodes
    // s.t. new pinned nodes are (radius+1)*2 away from old pinned nodes
    assert(pinDistance >= 0 && pinDistance <= locality, "Invalid pin distance")
    const oldDist = findDistanceTo(node, n => n != node && n.data.pinned) ?? Infinity
    return oldDist+pinDistance >= (locality+1)*2
}

function canDuplicateTransfer(from: Node, to: Node, locality: number): boolean {
    // Conditions:
    // - `from` must be constrained (visible to the algorithm)
    let pinDist = findDistanceTo(from, n => n.data.pinned) ?? Infinity
    if (pinDist > locality + 1) {
        return false // unconstrained
    }

    // - TODO: if transfer points already exist:
    //   + must be disjoint
    //   + must have same pin distance
    if (to.data.transferFrom !== null) {
        // only support single transfer for now
        return false
    }

    // - `to` must be independent at the pin distance of from
    return isIndependent(to, locality, pinDist)
}

function collectUsefulNeighbors(node: Node): Node[] {
    // Bfs neighborhood bounded by pinned nodes
    // Does NOT include node itself
    let nodes: Node[] = []
    bfs(node, (n, distance) => {
        if (n === node) {
            return SearchState.Continue
        }
        nodes.push(n)
        if (n.data.pinned) {
            return SearchState.Skip
        } else {
            return SearchState.Continue
        }
    })
    return nodes
}

function addTransferEdge(from: Node, to: Node) {
    from.data.transferTo.add(to)
    to.data.transferFrom = from
}

function applyDataTransfer(from: Node, to: Node) {
    // TODO: propagate automatically
    to.data.pinned = from.data.pinned
    to.data.label = from.data.label
}

function copyImpliedNeighbors(oldRoot: Node, newRoot: Node, neighbors: Iterable<Node>, graph: MainGraph): void {
    const mapping = mapSubgraphTo(neighbors, graph, (oldData) => {
        const data: NodeData = {
            impliedFrom: newRoot,
            pinned: oldData.pinned,
            label: oldData.label,
            transferFrom: null,
            transferTo: new Set(),
        }
        return data
    })
    offsetNodes(mapping.values(), newRoot.x - oldRoot.x, newRoot.y - oldRoot.y)
    for (let neighbor of oldRoot.neighbors) {
        let newNeighbor = mapping.get(neighbor)
        if (newNeighbor) {
            createEdge(graph, newRoot, newNeighbor)
        }
    }
    for (let [from, to] of mapping.entries()) {
        addTransferEdge(from, to)
    }
}

function transferNode(source: Node, target: Node, graph: MainGraph): void {
    // TODO: only copy implied nodes when target is a single node. Or only on direct transfer
    const nodesToTransfer = collectUsefulNeighbors(source)
    copyImpliedNeighbors(source, target, nodesToTransfer, graph)
    addTransferEdge(source, target)
    applyDataTransfer(source, target)
}

class TransferTool implements GraphInteractionMode<NodeData> {
    state: {
        mode: "duplicate"
        startNode: GraphNode<NodeData>,
        candidates: GraphNode<NodeData>[],
    } | {
        mode: "output"
        startNode: OutputNode,
        candidates: GraphNode<NodeData>[],
    } | null = null

    constructor(
        private pushUndoPoint: (graph: Graph<NodeData>) => void,
        private getInputNodes: () => InputNode[],
        private getOutputNodes: () => OutputNode[],
    ) {
    }

    onMouseDown(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number): void {
        let node = findClosestNode(mouseX, mouseY, visible)
        let opOutput = findClosestNode(mouseX, mouseY, this.getOutputNodes())
        const distNode = node !== null ? distanceToPointSqr(mouseX, mouseY, node) : Infinity
        const distOp = opOutput !== null ? distanceToPointSqr(mouseX, mouseY, opOutput) : Infinity
        const locality = localityInput.valueAsNumber
        if (opOutput !== null && distOp < distNode) {
            const source = opOutput
            // TODO! follow aliases back to next real node, then do canDuplicateTransfer
            // Or better: do not only check while transferring but mark bad transfers in red
            const candidates = [...visible]
            this.state = {
                mode: "output",
                startNode: source,
                candidates
            }
        } else if (node !== null) {
            const source = node
            //const candidates = [...visible].filter(n => canDuplicateTransfer(source, n, locality))
            const candidates = [...visible]
            this.state = {
                mode: "duplicate",
                startNode: source,
                candidates: candidates,
            }
        }
    }
    onDragStep(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, dt: number): void {
        const state = this.state
        if (state !== null) {
            const startNode = state.startNode
            const endNode = findClosestNode(mouseX, mouseY, state.candidates)
            if (endNode !== null && startNode !== endNode) {
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
        }
    }
    onMouseUp(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number): void {
        let state = this.state
        if (state !== null) {
            if (state.mode === "duplicate") {
                const startNode = state.startNode
                const endNode = findClosestNode(mouseX, mouseY, state.candidates)
                if (endNode !== null && startNode !== endNode) {
                    this.pushUndoPoint(graph)
                    transferNode(startNode, endNode, graph)
                }
            } else if (state.mode === "output") {
                console.error("Connecting output nodes is not implemented")
            }
        }
    }
}

/* Renderer */

function computePinLevel(nodes: Node[], radius: number): Map<Node, number> {
    const pinned = nodes.filter(n => n.data.pinned)
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
    const dir = b.sub(a).normalize()
    const newA = a.add(dir.scale(radiusA))
    const newB = b.sub(dir.scale(radiusB))
    ctx.beginPath()
    ctx.moveTo(newA.x, newA.y)
    ctx.lineTo(newB.x, newB.y)
}

export class OurGraphPainter implements GraphPainter<NodeData> {
    strokeWidth: number = this.nodeRadius / 3
    arrowWidth: number = 1
    constructor(private nodeRadius: number) {}

    public drawGraph(ctx: CanvasRenderingContext2D, graph: Graph<NodeData>) {
        const pinLevel = computePinLevel(graph.nodes, localityInput.valueAsNumber)

        // transfers
        for (let node of graph.nodes) {
            for (let to of node.data.transferTo) {
                this.drawArrow(ctx, node, to)
            }
        }
        // edges
        for (let edge of graph.edges) {
            const levelA = pinLevel.get(edge.a)!
            const levelB = pinLevel.get(edge.b)!
            const free = levelA === 0 || levelB === 0
            // TODO: fade implied edges
            const implied =
                (edge.a.data.impliedFrom !== null && edge.a.data.impliedFrom === edge.b.data.impliedFrom) ||
                edge.a.data.impliedFrom === edge.b || edge.b.data.impliedFrom === edge.a
            this.drawEdge(ctx, edge, free, implied)
        }
        // nodes
        for (let node of graph.nodes) {
            this.drawNode(ctx, node, pinLevel.get(node)!)
        }
    }

    private calcLineWidth(node: Node): number {
        return this.strokeWidth * 0.75
    }

    private calcRadius(node: Node): number {
        return this.nodeRadius + (node.data.pinned? this.calcLineWidth(node)*2 : 0)
    }

    private isImpliedNode(node: Node): boolean {
        return node.data.transferFrom !== null && node.data.transferFrom.data.pinned === node.data.pinned
    }
    
    protected drawNode(ctx: CanvasRenderingContext2D, node: GraphNode<NodeData>, level: number) {
        const pinned = node.data.pinned
        const free = level === 0
        const hasHint = node.data.label.length > 0 && !pinned
        const implied = this.isImpliedNode(node)
        const blackV = implied ? 160 : 0
        const whiteV = implied ? 240 : 255
        const black = `rgba(${blackV}, ${blackV}, ${blackV}, 1)`
        const white = `rgba(${whiteV}, ${whiteV}, ${whiteV}, 1)`

        const lineWidth = this.calcLineWidth(node)
        const radius = this.calcRadius(node)

        ctx.lineWidth = lineWidth
        for (let i = level; i > 0; i--) {
            const offset = lineWidth * 2 * i + 0.5*lineWidth
            const alpha = 0.5
            ctx.strokeStyle = `rgba(${blackV}, ${blackV}, ${blackV}, ${alpha})`
            ctx.circle(node.x, node.y, radius + offset)
            ctx.stroke()
        }
        if (pinned) {
            // filled circle
            ctx.strokeStyle = black
            ctx.fillStyle = white
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
        let label = node.data.label
        ctx.fillText(label, node.x, node.y)
    }

    protected drawHint(ctx: CanvasRenderingContext2D, node: GraphNode<NodeData>) {
        // label
        ctx.textAlign = "left"
        ctx.textBaseline = "top"
        const fontWeight = "normal"
        const fontSize = this.nodeRadius * 1.5
        ctx.font = `${fontWeight} ${fontSize}px sans-serif`
        let label = node.data.label
        const textX = node.x + this.nodeRadius * 0.2
        const textY = node.y + this.nodeRadius * 0.2
        const textWidth = ctx.measureText(label).width
        const pad = 2
        ctx.fillStyle = "black"
        ctx.fillRect(textX - pad, textY - pad, textWidth + 2*pad, fontSize + 2*pad)
        ctx.fillStyle = "white"
        ctx.fillText(label, textX, textY)
    }

    protected drawEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge<NodeData>, free: boolean, implied: boolean) {
        const alpha = implied ? 0.5 : 1
        let linewidth = this.strokeWidth
        if (free) {
            linewidth *= 0.5
        }
        if (!implied) {
            linewidth *= 2
        }
        ctx.lineWidth = linewidth
        ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`
        const posA = new Vector(edge.a.x, edge.a.y)
        const posB = new Vector(edge.b.x, edge.b.y)
        drawLineBetweenCircles(ctx, posA, posB, this.calcRadius(edge.a), this.calcRadius(edge.b))
        ctx.stroke()
    }

    protected drawArrow(ctx: CanvasRenderingContext2D, from: GraphNode<NodeData>, to: GraphNode<NodeData>) {
        // fade implied arrows
        const implied = to.data.impliedFrom !== null
        const alpha = implied ? 0.1 : 1
        ctx.lineWidth = this.arrowWidth
        ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`
        ctx.lineWidth = 2
        ctx.beginPath()
        let a = new Vector(from.x, from.y)
        let b = new Vector(to.x, to.y)
        const offset = b.sub(a).normalize().scale(this.nodeRadius * 2)
        a = a.add(offset)
        b = b.sub(offset)
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        drawArrowTip(a.x, a.y, b.x, b.y, 20, ctx)
        ctx.stroke()
    }
}


/* Global procedures */

function toolButton(id: string, tool: GraphInteractionMode<NodeData>) {
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

function collectGlobalInputs(): InputNode[] {
    return globalState.operators.flatMap(getInputs)
}

function collectGlobalOutputs(): OutputNode[] {
    return globalState.operators.flatMap(getOutputs)
}

function askNodeLabel(node: Node): void {
    const newLabel = prompt("Node label")
    if (newLabel !== null) {
        node.data.label = newLabel
    }
}

const buildInteraction = new BuildGraphInteraction<NodeData>(makeUndoable(putNewNode), makeUndoable(createEdge))
const pinInteraction = new ClickNodeInteraction<NodeData>(makeUndoable(node => {
    toggleNodePin(node)
    if (node.data.pinned)
        askNodeLabel(node)
    else
        node.data.label = ""
}))
const labelInteraction = new ClickNodeInteraction<NodeData>(makeUndoable(askNodeLabel))

toolButton("tool_move", new MoveComponentInteraction())
toolButton("tool_drag", new DragNodeInteraction())
toolButton("tool_build", buildInteraction)
toolButton("tool_pin", pinInteraction)
toolButton("tool_label", labelInteraction)
toolButton("tool_transfer", new TransferTool(pushUndoPoint, collectGlobalInputs, collectGlobalOutputs))

function replaceGlobalState(newState: State) {
    globalState = newState
    globalSim.changeGraph(newState.graph)
    globalWindows.systems = newState.operators.map(createOperatorWindow)
    controller.requestFrame()
}

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

/* Global init */
const history = new UndoHistory<State>()
let globalState = makeInitialState()

const globalSim = new GraphPhysicsSimulator<NodeData>(globalState.graph, layoutStyle, new OurGraphPainter(layoutStyle.nodeRadius))
globalSim.setInteractionMode(buildInteraction)

const globalWindows = new UiStack(globalState.operators.map(createOperatorWindow))

const controller = new InteractionController(canvas,
    new UiStack([
        globalSim, 
        globalWindows,
    ])
)
controller.requestFrame()
