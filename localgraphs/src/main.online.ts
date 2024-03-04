import { DragNodeInteraction, GraphInteractionMode, GraphPainter, GraphPhysicsSimulator, LayoutConfig, SimpleGraphPainter, createGridGraph, createRandomGraph, shuffleGraphPositions } from "./interaction/graphlayout.js";
import { initFullscreenCanvas } from "../../shared/canvas.js"
import { InteractionController } from "./interaction/renderer.js";
import { Graph, GraphEdge, GraphNode, createEdge, createEmptyGraph, createNode, mapGraph } from "./graph.js";
import { hasStaticType } from "../../shared/utils.js";
import { UndoHistory } from "./interaction/undo.js";
import { BuildGraphInteraction, ClickNodeInteraction, MoveComponentInteraction } from "./interaction/tools.js";
import { computeDistances } from "./graphalgos.js";

// "Online" refers to the online local computation model, unrelated to networking

let localityInput = document.getElementById("locality") as HTMLInputElement
let undoButton = document.getElementById("undo") as HTMLButtonElement
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
}

type MainGraph = Graph<NodeData>
type Node = GraphNode<NodeData>

// Everything that can be undone, possibly derived data to save recomputation
type State = {
    graph: MainGraph
}

function makeInitialState(): State {
    const graph = mapGraph<null, NodeData>(createRandomGraph(50, 1), n => ({pinned: false}))[0]
    shuffleGraphPositions(graph, 300, 300)
    let state: State = {
        graph: graph,
    }
    return state
}

function putNewNode(graph: MainGraph, x: number, y: number): Node {
    const data: NodeData = {
        pinned: false,
    }
    return createNode(graph, data, x, y)
}

function toggleNodePin(node: Node) {
    node.data.pinned = !node.data.pinned
}

function findPinned(graph: MainGraph) {
    return graph.nodes.filter(n => n.data.pinned)
}

function computePinLevel(graph: MainGraph, radius: number): Map<Node, number> {
    const pinned = findPinned(graph)
    const pinnedDistances = computeDistances(pinned, graph.nodes)
    return new Map<Node, number>(
        graph.nodes.map(n => {
            const d = pinnedDistances.get(n) ?? Infinity
            const level = Math.max(radius + 1 - d, 0)
            return [n, level]
        })
    )
}

/* Renderer */

export class OurGraphPainter implements GraphPainter<NodeData> {
    strokeWidth: number = this.nodeRadius / 3
    constructor(private nodeRadius: number) {}

    public drawGraph(ctx: CanvasRenderingContext2D, graph: Graph<NodeData>) {
        const pinLevel = computePinLevel(graph, localityInput.valueAsNumber)

        // edges
        for (let edge of graph.edges) {
            const levelA = pinLevel.get(edge.a)!
            const levelB = pinLevel.get(edge.b)!
            const free = levelA === 0 || levelB === 0
            this.drawEdge(ctx, edge, free)
        }
        // nodes
        for (let node of graph.nodes) {
            this.drawNode(ctx, node, pinLevel.get(node)!)
        }
    }

    protected drawNode(ctx: CanvasRenderingContext2D, node: GraphNode<NodeData>, level: number) {
        const pinned = node.data.pinned
        const lineWidth = this.strokeWidth * 0.75
        const free = level === 0
        let radius = this.nodeRadius + (pinned? lineWidth*2 : 0)
        ctx.lineWidth = lineWidth
        for (let i = level; i > 0; i--) {
            const offset = lineWidth * 2 * i
            const alpha = 1/i
            ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`
            ctx.circle(node.x, node.y, radius + offset)
            ctx.stroke()
        }
        if (free) {
            // empty circle
            ctx.fillStyle = "transparent"
            ctx.strokeStyle = "black"
            ctx.lineWidth = this.strokeWidth * 0.5
        } else if (pinned) {
            // filled circle
            ctx.strokeStyle = "black"
            ctx.fillStyle = "pink"
        } else {
            // black circle
            ctx.fillStyle = "black"
            ctx.strokeStyle = "black"
            radius -= lineWidth / 2
        }
        ctx.circle(node.x, node.y, radius)
        ctx.fill()
        ctx.stroke()
        if (pinned) {
            ctx.fillStyle = "black"
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

    protected drawEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge<NodeData>, free: boolean) {
        ctx.lineWidth = free? this.strokeWidth * 0.5 : this.strokeWidth
        ctx.strokeStyle = "black"
        ctx.beginPath()
        ctx.moveTo(edge.a.x, edge.a.y)
        ctx.lineTo(edge.b.x, edge.b.y)
        ctx.stroke()
    }
}


/* Global procedures */

function toolButton(id: string, tool: GraphInteractionMode<NodeData>) {
    document.getElementById(id)!.addEventListener("click", () => {
        globalSim.setInteractionMode(tool)
    })
}

function makeUndoable<T extends (...args: any) => any>(f: T): T {
    return function(this: any, ...args: Parameters<T>): ReturnType<T> {
        history.push(globalState)
        return f.apply(this, args)
    } as T
}

const buildInteraction = new BuildGraphInteraction<NodeData>(makeUndoable(putNewNode), makeUndoable(createEdge))
const pinInteraction = new ClickNodeInteraction<NodeData>(makeUndoable(toggleNodePin))

toolButton("tool_move", new MoveComponentInteraction())
toolButton("tool_drag", new DragNodeInteraction())
toolButton("tool_build", buildInteraction)
toolButton("tool_pin", pinInteraction)


/* Global init */
const history = new UndoHistory<State>()
let globalState = makeInitialState()

const globalSim = new GraphPhysicsSimulator<NodeData>(globalState.graph, layoutStyle, new OurGraphPainter(layoutStyle.nodeRadius))
globalSim.setInteractionMode(buildInteraction)

const controller = new InteractionController(canvas, [globalSim])
controller.requestFrame()
