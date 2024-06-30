import { NodeColor } from "./coloring.js";
import { DragNodeInteraction, GraphInteraction, GraphPainter, GraphPhysicsSimulator, findClosestNode } from "./interaction/graphsim.js";
import { initFullscreenCanvas } from "../../shared/canvas.js"
import { Graph, GraphEdge, GraphNode, createEmptyGraph, createNode } from "./graph.js";
import { computeDistances, findConnectedComponents, getNodesByComponent } from "./graphalgos.js";
import { Adversary, CommandTree, CommandTreeAdversary, executeEdgeCommand, make3Tree, pathAdv2 } from "./adversary.js";
import { InteractionController } from "./interaction/controller.js";
import { UndoHistory } from "./interaction/undo.js";
import { GraphLayoutPhysics, LayoutConfig } from "./interaction/physics.js";

let adversarySelect = document.getElementById("select_adversary") as HTMLSelectElement
let localityInput = document.getElementById("locality") as HTMLInputElement
let colorInput = document.getElementById("color_input") as HTMLInputElement
let undoButton = document.getElementById("undo") as HTMLButtonElement
let resetButton = document.getElementById("reset") as HTMLButtonElement
let undoHistory = new UndoHistory<State>(100, cloneState)

const UnsetColor = -1

const layoutStyle: LayoutConfig = {
    nodeRadius: 14,
    pushDistance: 50,
    minEdgeLength: 50,
    pushForce: 30.0,
    edgeForce: 80.0,
    centeringForce: 0.0,
    dampening: 6.0,
    sleepVelocity: 0.5,
}

type NodeData = {
    color: NodeColor
    available: boolean
    id: number
}

// Everything that can be undone, reference should only be held for history
type State = {
    adversary: Adversary<NodeData>,
    graph: Graph<NodeData>,
    selectedNode: GraphNode<NodeData> | null
}

// Can be stored, holds reference to replacable state
type Context = {
    state: State,
    redraw: () => unknown
}

function cloneState(state: State): State {
    let adversary = state.adversary.clone() // contains functions so structuredClone doesn't work
    let [graph, selectedNode] = structuredClone([state.graph, state.selectedNode])
    let newState: State = {
        adversary: adversary,
        graph: graph,
        selectedNode: selectedNode
    }
    return newState
}

function pushToHistory(state: State) {
    undoHistory.push(state)
}

function isLocalColoring(node: GraphNode<NodeData>): boolean {
    for (let neighbor of node.neighbors) {
        if (neighbor.data.color == node.data.color) {
            return false
        }
    }
    return true
}

function isGlobalColoring(graph: Graph<NodeData>): boolean {
    for (let node of graph.nodes) {
        if (!isLocalColoring(node)) {
            return false
        }
    }
    return true
}

function getSvgColorForNode(node: GraphNode<NodeData>, altColor: boolean): string {
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

    const alternativeColors = [
        "#B2C5FF",
        "#D6E4FF",
        "#BF91FB",
    ]

    let colors = altColor? alternativeColors : normalColors

    const errorColor = "red"
    if (!isLocalColoring(node)) {
        return errorColor
    }

    return colors[node.data.color] ?? "gray"
}

class ColoredGraphPainter implements GraphPainter<NodeData> {
    constructor(private nodeRadius: number, public showParities: boolean = false) { }

    public drawGraph(ctx: CanvasRenderingContext2D, graph: Graph<NodeData>): void {
        for (let edge of graph.edges) {
            this.drawEdge(ctx, edge)
        }
        let [componentCount, components] = findConnectedComponents(graph.nodes, (node) => false)
        let nodesByComponent = getNodesByComponent(components, graph.nodes)
        for (let [component, nodes] of nodesByComponent) {
            let distances = computeDistances(nodes[0], nodes)
            for (let node of nodes) {
                let dist = distances.get(node)!
                let altColor = this.showParities && (dist + node.data.color) % 2 === 1
                this.drawNode(ctx, node, altColor)
            }
        }
    }

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
        return !node.data.available
    }

    drawEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge<NodeData>) {
        const thin = this.isSmaller(edge.a) || this.isSmaller(edge.b)
        ctx.beginPath()
        ctx.lineWidth = this.getStrokeWidth(thin, false)*1.25
        ctx.strokeStyle = thin ? "gray" : "black"
        ctx.moveTo(edge.a.x, edge.a.y)
        ctx.lineTo(edge.b.x, edge.b.y)
        ctx.stroke()
    }

    drawNode(ctx: CanvasRenderingContext2D, node: GraphNode<NodeData>, altColor: boolean) {
        const smaller = this.isSmaller(node)
        const selected = node === globalCtx.state.selectedNode
        const unassigned = isUnset(node)
        const radius = this.getNodeRadius(smaller)
        ctx.fillStyle = unassigned? "gray" : getSvgColorForNode(node, altColor)
        ctx.strokeStyle = smaller ? "gray" : "black"
        ctx.lineWidth = this.getStrokeWidth(smaller, selected)
        ctx.beginPath()
        ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI)
        ctx.fill()
        ctx.stroke()

        // label
        ctx.fillStyle = ctx.strokeStyle // text in same color as outline
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        const fontWeight = selected? "bold" : "normal"
        const fontSize = smaller? "10pt" : "12pt"
        ctx.font = `${fontWeight} ${fontSize} sans-serif`
        let label = unassigned? "?" : (node.data.color+1).toString()
        ctx.fillText(label, node.x, node.y)

        // id
        ctx.font = `italic 8pt monospace`
        ctx.fillText(node.data.id.toString(), node.x + radius, node.y + radius)
    }
}

undoButton.addEventListener("click", () => {
    let last = undoHistory.undo(globalCtx.state)
    if (last) {
        globalCtx.state = last
        globalCtx.redraw()
    } else {
        console.error("End of undo history")
    }
})

function putNewNode(graph: Graph<NodeData>) {
    const offset = 10
    const x = canvas.clientWidth/2 + (Math.random()*2-1)*offset
    const y = canvas.clientHeight/2 + (Math.random()*2-1)*offset
    let node = createNode(graph, {
        color: UnsetColor,
        available: false,
        id: graph.nodes.length
    }, x, y)
    return node
}

function updateAvailableNodes(graph: Graph<NodeData>, changes: GraphNode<NodeData>[]) {
    const distances = computeDistances(changes, graph.nodes)
    const radius = localityInput.valueAsNumber
    for (let node of graph.nodes) {
        let dist = distances.get(node)!
        node.data.available = dist <= radius
    }
}

function advStep(state: State) {
    let cmd = state.adversary.step(state.graph)
    if (cmd !== "exit") {
        let newEdge = executeEdgeCommand(cmd, state.graph, putNewNode)
        newEdge.length = layoutStyle.minEdgeLength
        updateAvailableNodes(state.graph, [newEdge.a, newEdge.b])
    }
}

class SelectNodeInteraction implements GraphInteraction<NodeData> {
    constructor(
        private onSelect: (node: GraphNode<NodeData>) => unknown,
        private onUnselect: () => unknown,
    ) { }

    onMouseDown(graph: Graph<NodeData>, visibleNodes: GraphNode<NodeData>[], mouseX: number, mouseY: number): void {
    }
    onDragStep(graph: Graph<NodeData>, visibleNodes: GraphNode<NodeData>[], mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, deltaTime: number): void {
    }
    onMouseUp(graph: Graph<NodeData>, visibleNodes: GraphNode<NodeData>[], mouseX: number, mouseY: number): void {
        const selectDistance = 50
        const node = findClosestNode(mouseX, mouseY, visibleNodes, selectDistance)
        if (node) {
            this.onSelect(node)
        } else {
            this.onUnselect()
        }
    }
}

function isUnset(node: GraphNode<NodeData>): boolean {
    return node.data.color === UnsetColor
}

function allNodesSet(state: State) {
    for (let node of state.graph.nodes) {
        if (isUnset(node)) {
            return false
        }
    }
    return true
}

function findUnsetNode(state: State): GraphNode<NodeData> | undefined {
    return state.graph.nodes.findLast(isUnset)
}

function findErrorNode(state: State): GraphNode<NodeData> | undefined {
    return state.graph.nodes.findLast((node) => !isLocalColoring(node))
}

class ColoringController {
    selectInteraction = () => new SelectNodeInteraction(
        (node) => this.selectNode(node),
        () => this.unselect()
    )

    constructor(private inputField: HTMLInputElement, private context: Context) {
        inputField.addEventListener("input", () => {
            let color = parseInt(inputField.value) - 1
            if (color >= 0 && color < 8) {
                this.setColor(color)
            }
            inputField.value = ""
        })
    }

    selectNode(node: GraphNode<NodeData>) {
        this.unselect()
        this.context.state.selectedNode = node
        this.inputField.focus() // to allow entering a color immediately
    }

    unselect() {
        this.context.state.selectedNode = null
    }

    setColor(color: NodeColor) {
        let node = this.context.state.selectedNode
        if (node) {
            let state = this.context.state
            pushToHistory(state)

            node.data.color = color

            if (allNodesSet(state) && isGlobalColoring(state.graph)) {
                advStep(state)
            }
            this.context.redraw()

            let nextSelected = findUnsetNode(state) ?? findErrorNode(state)
            if (nextSelected === undefined) {
                this.unselect()
            } else {
                this.selectNode(nextSelected)
            }
        }
    }
}

function registerKeyboardInput() {
    document.addEventListener("keydown", (event) => {
        if (event.key === "z" && (event.ctrlKey || event.metaKey)) {
            undoButton.click()
        }
    })
}


// Tool selectors
function toolButton(id: string, tool: () => GraphInteraction<NodeData>) {
    document.getElementById(id)!.addEventListener("click", () => {
        sim.setInteractionMode(tool)
    })
}

function createSelectedAdversary(): Adversary<NodeData> {
    let tree: CommandTree<NodeData>
    if (adversarySelect.value == "path") {
        tree = pathAdv2
    } else if (adversarySelect.value == "tree3") {
        tree = make3Tree(2)
    } else {
        throw "Unknown adversary type"
    }
    return new CommandTreeAdversary(tree)
}

function makeInitialState(): State {
    let state: State = {
        adversary: createSelectedAdversary(),
        graph: createEmptyGraph(),
        selectedNode: null
    }
    advStep(state) // adversary has to make first step
    return state
}

function reset() {
    pushToHistory(globalCtx.state)
    globalCtx.state = makeInitialState()
    globalCtx.redraw()
}
resetButton.addEventListener("click", reset)


const canvas = document.getElementById('graph_canvas') as HTMLCanvasElement;
initFullscreenCanvas(canvas)

const painter = new ColoredGraphPainter(layoutStyle.nodeRadius)
const layoutPhysics = new GraphLayoutPhysics(layoutStyle)
const sim = new GraphPhysicsSimulator(createEmptyGraph<NodeData>(), layoutPhysics, painter)

const renderer = new InteractionController(canvas, sim)
const globalCtx: Context = {
    state: makeInitialState(),
    redraw: () => {
        sim.changeGraph(globalCtx.state.graph)
        renderer.requestFrame()
    }
}

let colorController = new ColoringController(colorInput, globalCtx)
toolButton("tool_drag", () => new DragNodeInteraction())
toolButton("tool_select", colorController.selectInteraction)
sim.setInteractionMode(colorController.selectInteraction) // default tool

globalCtx.redraw()
