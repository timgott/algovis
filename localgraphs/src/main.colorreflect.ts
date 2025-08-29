//#region Imports
import { DragNodeInteraction, GraphInteraction, GraphPainter, GraphPhysicsSimulator, distanceToPointSqr, findClosestNode, moveSlightly } from "./interaction/graphsim.js";
import { drawArrowTip, getCursorPosition, initFullscreenCanvas } from "../../shared/canvas.js"
import { AnimationFrame, InteractionController, UiStack } from "./interaction/controller.js";
import { Graph, GraphEdge, GraphNode, clearAllEdges, clearNeighbors, copyGraph, copyGraphTo, copySubgraphTo, createEdge, createEmptyGraph, createNode, deleteEdge, deleteNode, mapSubgraphTo } from "./graph.js";
import { assert, ensured, hasStaticType, mapFromFunction, unreachable } from "../../shared/utils.js";
import { UndoHistory } from "./interaction/undo.js";
import { BuildGraphInteraction, ClickNodeInteraction, DeleteInteraction, DuplicateInteraction, MoveComponentInteraction, SpanWindowTool } from "./interaction/tools.js";
import { bfsSimple, collectNeighborhood, computeDistances, findConnectedComponentsSimple } from "./graphalgos.js";
import { normalize, Positioned, vec, vecadd, vecdir, vecscale, vecset, vecsub, Vector } from "../../shared/vector.js";
import { GraphLayoutPhysics, LayoutConfig } from "./interaction/physics.js";
import { drawWindowTitle, WindowBounds, WindowController, satisfyMinBounds } from "./interaction/windows.js";
import { Rect } from "../../shared/rectangle.js";
import { mkRelation, mkMutRelation, Relation, relationUnionLazy, relationProduct, relationDifference, relationOneWay, relationDedup } from "../../shared/relation.js";
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

type NodeData = {
    pin: { label: string } | null,
    annotation: string
    marked: boolean
}

type MainGraph = Graph<NodeData>
type Node = GraphNode<NodeData>


// Everything that can be undone, possibly derived data to save recomputation
type State = {
    graph: MainGraph,
}


function makeInitialState(): State {
    let state: State = {
        graph: makeConflictGraph(200, 200),
    }
    return state
}

function makeConflictGraph(x: number, y: number): MainGraph {
    let graph = createEmptyGraph<NodeData>()
    const branches = 3
    let centerNode = putNewNode(graph, x, y)
    for (let i = 0; i < branches; i++) {
        let node = putNewNode(graph, x, y)
        node.data.pin = {label: (i+1).toString()}
        createEdge(graph, centerNode, node, 80)
    }
    return graph
}

function putNewNode(graph: MainGraph, x: number, y: number): Node {
    const data: NodeData = {
        pin: null,
        annotation: "",
        marked: false
    }
    let node = createNode(graph, data, x, y)
    moveSlightly(node)
    return node
}

function isPinned(n: GraphNode<NodeData>) {
    return n.data.pin;
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
    for (let i=1; i<count; i++) {
        maps.push(mapSubgraphTo(otherNodes, graph, (data) => ({
            ...data,
        })))
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
    center.data.pin = null
}

function edgeSymmetrize(locality: number, centerLeaf: Node, graph: Graph<NodeData>) {
    if (centerLeaf.neighbors.size !== 1) {
        console.warn("Mirrored node must have exactly one neighbor")
        return
    }

    let [centerNeighbor] = centerLeaf.neighbors

    // clear other end label
    centerNeighbor.data.pin = null

    // find connected component
    let otherNodes: Node[] = []
    let pinLevels = computePinLevel(graph.nodes, locality)
    bfsSimple(centerNeighbor, n => {
        if (n === centerLeaf) return [];
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
    let map: Map<Node, Node> = mapSubgraphTo(otherNodes, graph, (data) => ({ ...data, }))

    // rotate the copies around center
    let edgeMidpoint = Vector.scale(0.5, Vector.add(centerLeaf, centerNeighbor))
    for (let [_, node] of map) {
        vecset(node, Vector.rotate(node, Math.PI, edgeMidpoint))
        moveSlightly(node)
    }

    // delete leaf end of edge
    deleteNode(graph, centerLeaf)

    // connect copies
    createEdge(graph, centerNeighbor, map.get(centerNeighbor)!)
}

function copyNodeData(data: NodeData, map: Map<GraphNode<NodeData>, GraphNode<NodeData>>): NodeData {
    return structuredClone(data)
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

function graphUndirectedSquare<T>(graph: Graph<T>): Graph<T> {
    let newgraph = createEmptyGraph<T>()
    let nodeMap = copyGraphTo(graph, newgraph)
    let newEdges: GraphEdge<T>[] = []
    for (let node of graph.nodes) {
        for (let neighbor of node.neighbors) {
            for (let neighborsneighbor of neighbor.neighbors) {
                let a = ensured(nodeMap.get(node))
                let b = ensured(nodeMap.get(neighborsneighbor))
                if (!a.neighbors.has(b)) {
                    createEdge(newgraph, a, b)
                }
            }
        }
    }
    return newgraph
}

function graphIteratedSquare<T>(graph: Graph<T>, count: number): Graph<T>[] {
    let results = []
    for (let i = 0; i < count; i++) {
        let newgraph = graphUndirectedSquare(graph)
        results.push(newgraph)
        graph = newgraph
    }
    return results
}

type GraphRelation<T> = Relation<GraphNode<T>, GraphNode<T>>

function graphAdjacency<T>(graph: Graph<T>): GraphRelation<T> {
    return mkRelation({
        get: (a) => a.neighbors,
        keys: () => graph.nodes,
    })
}

function graphIteratedSquareEdges<T>(graph: Graph<T>, count: number): GraphRelation<T>[] {
    let results: GraphRelation<T>[] = []
    let lastAdj = graphAdjacency(graph)
    let transAdj = lastAdj
    for (let i = 0; i < count; i++) {
        let newAdj = mkMutRelation<GraphNode<T>,GraphNode<T>>()
        for (let [a, b] of lastAdj) {
            for (let c of lastAdj.get(b)) {
                if (!transAdj.has(a,c)) {
                    newAdj.add(a,c)
                }
            }
        }
        lastAdj = newAdj
        transAdj = relationUnionLazy(transAdj, newAdj)
        results.push(newAdj)
    }
    return results
}

function graphIteratedProduct<T>(graph: Graph<T>, maxDepth: number): Relation<GraphNode<T>,GraphNode<T>>[] {
    let results: Relation<GraphNode<T>,GraphNode<T>>[] = []
    let adj = graphAdjacency(graph)
    let transAdj = adj
    let lastAdj = adj
    results.push(adj)
    for (let i = 0; i < maxDepth-1; i++) {
        lastAdj = relationProduct(lastAdj, adj)
        let delta = relationDifference(lastAdj, transAdj)
        if (delta.size == 0) {
            return results
        }
        transAdj = relationUnionLazy(transAdj, lastAdj)
        results.push(delta)
    }
    return results
}

function drawLineBetweenCircles(ctx: CanvasRenderingContext2D, a: Vector, b: Vector, radiusA: number, radiusB: number = radiusA) {
    const dir = vecdir(a, b)
    const newA = vecadd(a, vecscale(radiusA, dir))
    const newB = vecsub(b, vecscale(radiusB, dir))
    ctx.beginPath()
    ctx.moveTo(newA.x, newA.y)
    ctx.lineTo(newB.x, newB.y)
}

function colorForLabel(label: string) {
    const normalColors = [
        "#CDFAD5",
        "#F6FDC3",
        "#F3B67A",
        "#D10043",
        "gold",
        "purple",
        "yellow",
        "orange",
    ]

    let i = parseInt(label) - 1
    return normalColors[i] ?? "white"
}

function getSingletonValue<T>(set: Set<T>): T | null {
    if (set.size !== 1) {
        return null
    }
    let [item] = [...set]
    return item
}

function propagateUnpinnedColors(graph: Graph<NodeData>): Map<Node, Set<string>> {
    let allColors = new Set(["1", "2", "3"])
    let pinnedNodes = graph.nodes.filter(n => n.data.pin)
    let changed = [...pinnedNodes]
    let colorMap: Map<Node, Set<string>> = mapFromFunction(pinnedNodes, n => new Set([n.data.pin!.label]))
    while (true) {
        let node = changed.shift()
        if (node === undefined) {
            return colorMap
        }
        let color = getSingletonValue(colorMap.get(node)!)
        if (color !== null) {
            for (let other of node.neighbors) {
                let othersColors = colorMap.get(other)
                if (othersColors !== undefined) {
                    if (othersColors.has(color)) {
                        othersColors.delete(color)
                        changed.push(other)
                    }
                } else {
                    colorMap.set(other, allColors.difference(new Set([color])))
                    changed.push(other)
                }
            }
        }
    }
}

export class OurGraphPainter implements GraphPainter<NodeData> {
    strokeWidth: number = this.nodeRadius / 3
    committedColor: string = "white"
    ringsEnabled = false
    powerEdgesEnabled = false

    constructor(private nodeRadius: number) {}

    public drawGraph(ctx: CanvasRenderingContext2D, graph: Graph<NodeData>) {
        ctx.save()
        const pinLevel = computePinLevel(graph.nodes, localityInput.valueAsNumber)

        // power edges
        if (this.powerEdgesEnabled) {
            let maxPower = (localityInput.valueAsNumber+1)*2-1
            let powerRels = graphIteratedProduct(graph, maxPower)
            for (let i = powerRels.length; i > 0; i--) {
                let rel = powerRels[i-1]
                this.drawPowerRel(ctx, rel, i)
            }
        }

        // node markings
        for (let node of graph.nodes) {
            this.drawNodeMarkUnderlay(ctx, node)
        }

        // edges
        for (let edge of graph.edges) {
            const levelA = pinLevel.get(edge.a)!
            const levelB = pinLevel.get(edge.b)!
            const free = levelA <= 1 && levelB <= 1
            this.drawEdge(ctx, edge, free)
        }

        // nodes
        for (let node of graph.nodes) {
            let data = node.data
            this.drawNode(ctx, node, pinLevel.get(node)!)
        }

        // inferred colors
        let inferredColors = propagateUnpinnedColors(graph)
        for (let node of graph.nodes) {
            let colors = inferredColors.get(node)
            if (colors !== undefined && !node.data.pin) {
                let hint: string
                if (colors.size > 0) {
                    hint = [...colors].join(", ")
                    this.drawHint(ctx, node, hint, "black")
                } else {
                    hint = "???"
                    this.drawHint(ctx, node, hint, "darkred")
                }
            }
            if (node.data.pin) {
                assert(getSingletonValue(ensured(colors)) === node.data.pin.label, "the propagation should start from the pinned node")
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

    protected drawNodeMarkUnderlay(ctx: CanvasRenderingContext2D, node: GraphNode<NodeData>) {
        const marked = node.data.marked
        if (marked) {
            ctx.fillStyle = "lightblue"
            ctx.circle(node.x, node.y, this.calcRadius(node) * 2)
            ctx.fill()
        }
    }

    protected drawNode(ctx: CanvasRenderingContext2D, node: GraphNode<NodeData>, level: number) {
        const free = level === 0
        const implied = false
        const blackV = implied ? 160 : 0
        const whiteV = implied ? 240 : 255
        const black = `rgba(${blackV}, ${blackV}, ${blackV}, 1)`
        const white = `rgba(${whiteV}, ${whiteV}, ${whiteV}, 1)`
        
        const lineWidth = this.calcLineWidth(node)
        const radius = this.calcRadius(node)

        ctx.lineWidth = lineWidth
        if (this.ringsEnabled) {
            for (let i = level; i > 0; i--) {
                const offset = lineWidth * 2 * i + 0.5*lineWidth
                const alpha = 0.5
                ctx.strokeStyle = `rgba(${blackV}, ${blackV}, ${blackV}, ${alpha})`
                ctx.circle(node.x, node.y, radius + offset)
                ctx.stroke()
            }
        }
        if (node.data.pin) {
            // filled circle
            ctx.strokeStyle = black
            ctx.fillStyle = colorForLabel(node.data.pin.label)
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
        if (node.data.pin) {
            ctx.fillStyle = black
            this.drawLabel(ctx, node)
        }
    }

    protected drawLabel(ctx: CanvasRenderingContext2D, node: GraphNode<NodeData>) {
        // label
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        const fontWeight = "normal"
        const fontSize = this.nodeRadius * 1.5
        ctx.font = `${fontWeight} ${fontSize}px sans-serif`
        let label = node.data.pin?.label ?? ""
        ctx.fillText(label, node.x, node.y)
    }

    protected drawHint(ctx: CanvasRenderingContext2D, node: GraphNode<NodeData>, hint: string, boxColor: string) {
        // annotation
        ctx.textAlign = "left"
        ctx.textBaseline = "top"
        const fontWeight = "bold"
        const fontSize = 12
        ctx.font = `${fontWeight} ${fontSize}px sans-serif`
        const textX = node.x + this.nodeRadius * 0.2
        const textY = node.y + this.nodeRadius * 0.2
        const textWidth = ctx.measureText(hint).width
        const pad = 2
        ctx.fillStyle = boxColor
        ctx.fillRect(textX - pad, textY - pad, textWidth + 2*pad, fontSize + 2*pad)
        ctx.fillStyle = "white"
        ctx.fillText(hint, textX, textY)
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

    protected drawPowerRel(ctx: CanvasRenderingContext2D, rel: GraphRelation<NodeData>, level: number) {
        //const t = 1 / ((level)/4 + 1)
        const t = Math.exp(-level/6)
        const alpha = 1.0
        ctx.strokeStyle = `hsla(${((level-2)/2)*47}, 90%, ${10+80*t}%, ${alpha})`
        ctx.lineWidth = this.nodeRadius * 2
        ctx.beginPath()
        for (let [a,b] of relationOneWay(rel)) {
            if (isPinned(a) && isPinned(b)) {
                ctx.moveTo(a.x, a.y)
                ctx.lineTo(b.x, b.y)
            }
        }
        ctx.stroke()
    }
}

/* #endregion */

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

function promptNodeLabel(): string | null {
    return prompt("Node label")
}

function askNodeAnnotation(node: Node): void {
    const newLabel = prompt("Annotation")
    node.data.annotation = newLabel ?? ""
}

function toggleNodePinned(n: GraphNode<NodeData>) {
    if (n.data.pin) {
        n.data.pin = null
    } else {
        let label = promptNodeLabel()
        if (label !== null) {
            n.data.pin = { label }
        }
    }
}

function toggleNodeMarked(n: GraphNode<NodeData>) {
    n.data.marked = !n.data.marked
}

function deleteConnectedComponent(n: GraphNode<NodeData>, graph: MainGraph) {
    let connected = collectNeighborhood(n, Infinity)
    for (let v of connected) {
        deleteNode(graph, v)
    }
}


const buildInteraction = () => new BuildGraphInteraction<NodeData>(makeUndoable(putNewNode), makeUndoable(createEdge))
const labelInteraction = () => new ClickNodeInteraction<NodeData>(makeUndoable(askNodeAnnotation))
const pinInteraction = () => new ClickNodeInteraction<NodeData>(makeUndoable(toggleNodePinned))
const deleteInteraction = () => new DeleteInteraction(makeUndoable(deleteNode), makeUndoable(deleteEdge))
const deleteComponentInteraction = () => new ClickNodeInteraction<NodeData>(makeUndoable(deleteConnectedComponent))
const reflectNodeInteraction = () => new ClickNodeInteraction<NodeData>(
    makeUndoable((n,g) => rotationSymmetrize(3, Infinity, n, g))
)
const reflectEdgeInteraction = () => new ClickNodeInteraction<NodeData>(
    makeUndoable((n,g) => edgeSymmetrize(Infinity, n, g))
)
const markInteraction = () => new ClickNodeInteraction<NodeData>(makeUndoable(toggleNodeMarked))

toolButton("tool_move", () => new MoveComponentInteraction())
toolButton("tool_drag", () => new DragNodeInteraction())
toolButton("tool_build", buildInteraction)
toolButton("tool_pin", pinInteraction)
toolButton("tool_label", labelInteraction)
toolButton("tool_mark", markInteraction)

toolButton("tool_symmetrize", reflectNodeInteraction)
toolButton("tool_symmetrize2", reflectEdgeInteraction)
toolButton("tool_duplicate", () => new DuplicateInteraction(painter, pushUndoPoint, copyNodeData))
toolButton("tool_delete", deleteInteraction)
toolButton("tool_deletecomponent", deleteComponentInteraction)

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

function useCheckbox(id: string, action: (value: boolean) => unknown) {
    let element = document.getElementById(id) as HTMLInputElement
    element?.addEventListener("change", () => {
        action(element.checked)
        controller.requestFrame()
    })
    action(element.checked)
}

function replaceGlobalState(newState: State) {
    globalState = newState
    globalSim.changeGraph(newState.graph)
    controller.requestFrame()
}

/* Global init */

const history = new UndoHistory<State>()
let globalState = makeInitialState()

const layoutPhysics = new GraphLayoutPhysics(layoutStyle)
const painter = new OurGraphPainter(layoutStyle.nodeRadius)
const globalSim = new GraphPhysicsSimulator<NodeData>(globalState.graph, layoutPhysics, painter)
globalSim.setInteractionMode(reflectEdgeInteraction)

initFullscreenCanvas(canvas)

const controller = new InteractionController(canvas,
    globalSim,
)
controller.requestFrame()

useCheckbox("show_rings", val => painter.ringsEnabled = val)
useCheckbox("show_powerdists", val => painter.powerEdgesEnabled = val)
