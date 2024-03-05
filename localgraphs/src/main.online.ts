import { DragNodeInteraction, GraphInteractionMode, GraphPainter, GraphPhysicsSimulator, LayoutConfig, SimpleGraphPainter, createGridGraph, createRandomGraph, findClosestNode, offsetNodes, shuffleGraphPositions } from "./interaction/graphlayout.js";
import { drawArrowTip, initFullscreenCanvas } from "../../shared/canvas.js"
import { InteractionController } from "./interaction/renderer.js";
import { Graph, GraphEdge, GraphNode, copySubgraphTo, createEdge, createEmptyGraph, createNode, mapGraph, mapSubgraphTo } from "./graph.js";
import { assert, hasStaticType } from "../../shared/utils.js";
import { UndoHistory } from "./interaction/undo.js";
import { BuildGraphInteraction, ClickNodeInteraction, MoveComponentInteraction } from "./interaction/tools.js";
import { SearchState, bfs, collectNeighborhood, computeDistances, findDistanceTo } from "./graphalgos.js";
import { Vector } from "../../shared/vector.js";
import { Window, WindowContents, drawWindowTitle } from "./interaction/windows.js";
import { Rect } from "../../shared/rectangle.js";

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
    impliedFrom: Node | null, // transferred node
    transferFrom: Node | null // TODO: multiple from disjoint paths
    transferTo: Set<Node> // must not go to disjoint paths (only decision nodes create disjoint paths)
}

type MainGraph = Graph<NodeData>
type Node = GraphNode<NodeData>

// Everything that can be undone, possibly derived data to save recomputation
type State = {
    graph: MainGraph
}

function makeInitialState(): State {
    let state: State = {
        graph: createEmptyGraph(),
    }
    return state
}

function putNewNode(graph: MainGraph, x: number, y: number): Node {
    const data: NodeData = {
        pinned: false,
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

function canTransfer(from: Node, to: Node, locality: number): boolean {
    // Conditions:
    // - `from` must be constrained
    let pinDist = findDistanceTo(from, n => n.data.pinned) ?? Infinity
    if (pinDist > locality) {
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
}

function copyImpliedNeighbors(oldRoot: Node, newRoot: Node, neighbors: Iterable<Node>, graph: MainGraph): void {
    const mapping = mapSubgraphTo(neighbors, graph, (oldData) => {
        return <NodeData>{
            impliedFrom: newRoot,
            pinned: oldData.pinned,
            transferFrom: null,
            transferTo: new Set(),
        }
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
    const nodesToTransfer = collectUsefulNeighbors(source)
    copyImpliedNeighbors(source, target, nodesToTransfer, graph)
    addTransferEdge(source, target)
    applyDataTransfer(source, target)
}

class TransferTool implements GraphInteractionMode<NodeData> {
    state: {
        startNode: GraphNode<NodeData>,
        candidates: GraphNode<NodeData>[],
    } | null = null

    constructor(private pushUndoPoint: (graph: Graph<NodeData>) => void) {
    }

    onMouseDown(graph: Graph<NodeData>, visible: Iterable<GraphNode<NodeData>>, mouseX: number, mouseY: number): void {
        let node = findClosestNode(mouseX, mouseY, visible)
        if (node !== null) {
            const source = node
            const locality = localityInput.valueAsNumber
            const candidates = [...visible].filter(n => canTransfer(source, n, locality))
            this.state = {
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
            const startNode = state.startNode
            const endNode = findClosestNode(mouseX, mouseY, state.candidates)
            if (endNode !== null && startNode !== endNode) {
                this.pushUndoPoint(graph)
                transferNode(startNode, endNode, graph)
            }
        }
    }
}

/* Decision operator */

type AttachmentPoint = {
    node: GraphNode<NodeData>,
}

function createInputPoint(): AttachmentPoint {
    return {
        node: {
            data: {
                pinned: false,
                impliedFrom: null,
                transferFrom: null,
                transferTo: new Set()
            },
            x: 0, y: 0, vx: 0, vy: 0,
            neighbors: new Set(),
        }
    }
}

class EqualityOperatorWindow implements WindowContents {
    width: number = 200;
    height: number = 80;

    radius = 10
    opOffset = 25
    argOffset = 30

    argA: AttachmentPoint = createInputPoint()
    argB: AttachmentPoint = createInputPoint()

    drawAttachPoint(ctx: CanvasRenderingContext2D, x: number, y: number) {
        ctx.fillStyle = "black"
        ctx.circle(x, y, this.radius)
        ctx.fill()
    }

    drawBinOp(ctx: CanvasRenderingContext2D, x: number, y: number, operator: string, offset: number) {
        this.drawAttachPoint(ctx, x + offset, y)
        this.drawAttachPoint(ctx, x - offset, y)
        ctx.fillText(operator, x, y)
    }
    
    draw(ctx: CanvasRenderingContext2D, bounds: Rect, titleArea: Rect): void {
        ctx.font = "bold 12pt monospace"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"

        this.drawBinOp(ctx, titleArea.center.x, titleArea.center.y, "?", this.argOffset)

        const [trueBox, falseBox] = bounds.splitHorizontal(0.5)

        ctx.beginPath()
        ctx.strokeStyle = `rgba(0,0,0,0.3)`
        ctx.fillStyle = "black"
        ctx.lineWidth = 1
        ctx.moveTo(falseBox.left, falseBox.top)
        ctx.lineTo(falseBox.left, falseBox.bottom)
        ctx.stroke()
        this.drawBinOp(ctx, trueBox.center.x, trueBox.center.y, "=", this.opOffset)
        this.drawBinOp(ctx, falseBox.center.x, falseBox.center.y, "≠", this.opOffset)
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
    
    protected drawNode(ctx: CanvasRenderingContext2D, node: GraphNode<NodeData>, level: number) {
        const pinned = node.data.pinned
        const free = level === 0
        const implied = node.data.impliedFrom !== null
        const lineWidth = this.strokeWidth * 0.75
        const blackV = implied ? 160 : 0
        const whiteV = implied ? 240 : 255
        const black = `rgba(${blackV}, ${blackV}, ${blackV}, 1)`
        const white = `rgba(${whiteV}, ${whiteV}, ${whiteV}, 1)`
        let radius = this.nodeRadius + (pinned? lineWidth*2 : 0)
        ctx.lineWidth = lineWidth
        for (let i = level; i > 0; i--) {
            const offset = lineWidth * 2 * i + 0.5*lineWidth
            const alpha = 0.5
            ctx.strokeStyle = `rgba(${blackV}, ${blackV}, ${blackV}, ${alpha})`
            ctx.circle(node.x, node.y, radius + offset)
            ctx.stroke()
        }
        if (free) {
            // empty circle
            ctx.fillStyle = "transparent"
            ctx.strokeStyle = black
            //ctx.lineWidth = this.strokeWidth * 0.5
        } else if (pinned) {
            // filled circle
            ctx.strokeStyle = black
            ctx.fillStyle = white
        } else {
            // black circle
            ctx.fillStyle = black
            ctx.strokeStyle = black
        }
        ctx.circle(node.x, node.y, radius)
        ctx.fill()
        ctx.stroke()
        if (pinned) {
            ctx.fillStyle = black
            this.drawLabel(ctx, node)
        }
    }

    protected drawLabel(ctx: CanvasRenderingContext2D, node: GraphNode<NodeData>) {
        // label
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        const fontWeight = "normal"
        const fontSize = "12pt"
        ctx.font = `${fontWeight} ${fontSize} sans-serif`
        let label = "1"
        ctx.fillText(label, node.x, node.y)
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
        ctx.beginPath()
        ctx.moveTo(edge.a.x, edge.a.y)
        ctx.lineTo(edge.b.x, edge.b.y)
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

const buildInteraction = new BuildGraphInteraction<NodeData>(makeUndoable(putNewNode), makeUndoable(createEdge))
const pinInteraction = new ClickNodeInteraction<NodeData>(makeUndoable(toggleNodePin))

toolButton("tool_move", new MoveComponentInteraction())
toolButton("tool_drag", new DragNodeInteraction())
toolButton("tool_build", buildInteraction)
toolButton("tool_pin", pinInteraction)
toolButton("tool_transfer", new TransferTool(pushUndoPoint))

function replaceGlobalState(newState: State) {
    globalState = newState
    globalSim.changeGraph(newState.graph)
    controller.requestFrame()
}

undoButton.addEventListener("click", () => {
    const last = history.undo(globalState)
    if (last !== null) {
        replaceGlobalState(last)
    } else {
        throw "End of history"
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

const controller = new InteractionController(canvas,
    [
        globalSim, new Window(100, 100, new EqualityOperatorWindow())
    ]
)
controller.requestFrame()
