import { Rect } from "../../../shared/rectangle"
import { ensured } from "../../../shared/utils"
import { Positioned, Vector, distance, vec } from "../../../shared/vector"
import { adjacentEdges, copyGraphTo, extractSubgraph, filteredGraphView, Graph, GraphEdge, GraphNode, NodeDataTransfer } from "../graph"
import { collectNeighborhood } from "../graphalgos"
import { GraphInteraction, GraphPainter, dragNodes, findClosestEdge, findClosestNode, moveSlightly, offsetNodes } from "./graphsim"
import { stretchEdgesToFit, stretchEdgesToRelax } from "./physics"

export class BuildGraphInteraction<T> implements GraphInteraction<T> {
    moveThreshold: number = 20
    connectDistFactor: number = 0.7 // weight factor for connecting existing nodes instead of adding a new node

    selfLoopsAllowed: boolean = false
    selfLoopDistance: number = 30 // max distance to node when building self-loop or clicking node

    nodeClickAction: ((node: GraphNode<T>, graph: Graph<T>) => void) | null = null
    clickDistance: number = 30

    startNode: GraphNode<T> | null = null
    startX: number = 0
    startY: number = 0
    hasMoved: boolean = false

    constructor(private buildNode: (graph: Graph<T>, x: number, y: number) => GraphNode<T>, private buildEdge: (graph: Graph<T>, a: GraphNode<T>, b: GraphNode<T>) => unknown) {
    }

    withSelfLoops() {
        this.selfLoopsAllowed = true;
        return this
    }

    withClickAction(action: (node: GraphNode<T>, graph: Graph<T>) => void) {
        this.nodeClickAction = action;
        return this
    }

    findNode(x: number, y: number, visible: Iterable<GraphNode<T>>): GraphNode<T> | null {
        return findClosestNode(x, y, visible)
    }

    mouseDown(graph: Graph<T>, visible: GraphNode<T>[], mouseX: number, mouseY: number): void {
        this.startX = mouseX
        this.startY = mouseY
        this.startNode = this.findNode(mouseX, mouseY, visible)
        this.hasMoved = false
    }
    checkHasMoved(mouseX: number, mouseY: number): boolean {
        let distance = Math.hypot(mouseX - this.startX, mouseY - this.startY)
        return distance >= this.moveThreshold
    }
    shouldCreateNewEndpoint(mouseX: number, mouseY: number, closestNode: GraphNode<T>): boolean {
        if (!this.selfLoopsAllowed && this.startNode === closestNode) {
            // no self loop
            return true
        }
        if (this.startNode?.neighbors.has(closestNode)) {
            // don't build edge twice
            return true
        }
        const mouse = { x: mouseX, y: mouseY }
        const start = { x: this.startX, y: this.startY}
        if (this.selfLoopsAllowed && this.startNode === closestNode) {
            // self loop
            return distance(mouse, closestNode) > this.selfLoopDistance
        }
        // build edge if closest node is closer than start
        return distance(start, mouse)*this.connectDistFactor < distance(mouse, closestNode)
    }
    dragStep(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number): void {
        if (!this.hasMoved && this.checkHasMoved(mouseX, mouseY)) {
            this.hasMoved = true
        }
    }
    dragDraw(graph: Graph<T>, visible: GraphNode<T>[], mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, deltaTime: number): void {
        if (this.startNode !== null && this.hasMoved) {
            drawCtx.strokeStyle = "black"
            drawCtx.lineWidth = 1
            drawCtx.beginPath()
            let endNode = this.findNode(mouseX, mouseY, visible)
            if (endNode !== null && !this.shouldCreateNewEndpoint(mouseX, mouseY, endNode)) {
                drawCtx.moveTo(endNode.x, endNode.y)
                drawCtx.quadraticCurveTo(mouseX, mouseY, this.startNode.x, this.startNode.y)
                drawCtx.stroke()
            } else {
                drawCtx.setLineDash([6, 5])
                drawCtx.moveTo(mouseX, mouseY)
                drawCtx.lineTo(this.startNode.x, this.startNode.y)
                drawCtx.stroke()
                drawCtx.setLineDash([])
                drawCtx.circle(mouseX, mouseY, 5)
                drawCtx.stroke()
            }
        }
    }
    mouseUp(graph: Graph<T>, visible: Iterable<GraphNode<T>>, endX: number, endY: number): void {
        if (this.startNode !== null && this.hasMoved) {
            let endNode = this.findNode(endX, endY, visible)
            if (endNode === null || this.shouldCreateNewEndpoint(endX, endY, endNode)) {
                endNode = this.buildNode(graph, endX, endY)
            }
            // create new edge
            this.buildEdge(graph, this.startNode, endNode)
        }
        else {
            if (this.startNode && this.nodeClickAction && distance({ x: endX, y: endY }, this.startNode) < this.clickDistance) {
                // click
                this.nodeClickAction(this.startNode, graph)
            } else {
                // create new node
                this.buildNode(graph, endX, endY)
            }
        }

    }
}

export class DeleteInteraction<T> implements GraphInteraction<T> {
    moveThreshold: number = 20
    connectDistFactor: number = 0.7 // weight factor for connecting existing nodes instead of adding a new node
    selfLoopDistance: number = 30 // max distance to node when building self-loop or clicking node

    startNode: GraphNode<T> | null = null
    startX: number = 0
    startY: number = 0
    hasMoved: boolean = false

    constructor(private deleteNode: (graph: Graph<T>, node: GraphNode<T>) => unknown, private deleteEdge: (graph: Graph<T>, a: GraphNode<T>, b: GraphNode<T>) => unknown) {
    }

    findNode(x: number, y: number, visible: Iterable<GraphNode<T>>): GraphNode<T> | null {
        return findClosestNode(x, y, visible)
    }

    mouseDown(graph: Graph<T>, visible: GraphNode<T>[], mouseX: number, mouseY: number): void {
        this.startX = mouseX
        this.startY = mouseY
        this.startNode = this.findNode(mouseX, mouseY, visible)
        this.hasMoved = false
    }
    checkHasMoved(mouseX: number, mouseY: number): boolean {
        let distance = Math.hypot(mouseX - this.startX, mouseY - this.startY)
        return distance >= this.moveThreshold
    }
    shouldDeleteEdge(mouseX: number, mouseY: number, closestNode: GraphNode<T>): boolean {
        if (!this.startNode?.neighbors.has(closestNode)) {
            // no edge to delete
            return false
        }
        const mouse = { x: mouseX, y: mouseY }
        const start = { x: this.startX, y: this.startY}
        // delete edge if closest node is closer than start
        return distance(mouse, closestNode) < distance(start, mouse)*this.connectDistFactor
    }
    dragStep(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number): void {
        if (!this.hasMoved && this.checkHasMoved(mouseX, mouseY)) {
            this.hasMoved = true
        }
    }
    dragDraw(graph: Graph<T>, visible: GraphNode<T>[], mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, deltaTime: number): void {
        if (this.startNode !== null && this.hasMoved) {
            drawCtx.save()
            drawCtx.strokeStyle = "darkred"
            drawCtx.lineWidth = 1
            drawCtx.beginPath()
            let endNode = this.findNode(mouseX, mouseY, visible)
            if (endNode !== null && this.shouldDeleteEdge(mouseX, mouseY, endNode)) {
                drawCtx.setLineDash([6, 5])
                drawCtx.moveTo(endNode.x, endNode.y)
                drawCtx.quadraticCurveTo(mouseX, mouseY, this.startNode.x, this.startNode.y)
                drawCtx.stroke()
            } else {
                drawCtx.moveTo(mouseX, mouseY)
                drawCtx.lineTo(this.startNode.x, this.startNode.y)
                drawCtx.stroke()
            }
            drawCtx.restore()
        }
    }
    mouseUp(graph: Graph<T>, visible: Iterable<GraphNode<T>>, endX: number, endY: number): void {
        let endNode = this.findNode(endX, endY, visible)
        if (endNode !== null) {
            if (this.startNode !== null && this.hasMoved) {
                if (this.shouldDeleteEdge(endX, endY, endNode)) {
                    this.deleteEdge(graph, this.startNode, endNode)
                }
            }
            else {
                // delete node
                this.deleteNode(graph, endNode)
            }
        }

    }
}

export class MoveComponentInteraction<T> implements GraphInteraction<T> {
    draggedNode: GraphNode<T> | null = null

    mouseDown(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number) {
        this.draggedNode = findClosestNode(mouseX, mouseY, visible)
    }

    dragStep(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number, dt: number) {
        if (this.draggedNode) {
            let nodes = collectNeighborhood(this.draggedNode, Infinity)
            dragNodes(nodes, mouseX - this.draggedNode.x, mouseY - this.draggedNode.y, dt)
        }
    }

    mouseUp() {
        this.draggedNode = null
    }
}

export class ClickNodeInteraction<T> implements GraphInteraction<T> {
    constructor(private callback: (node: GraphNode<T>, graph: Graph<T>) => void) {}

    mouseDown(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number) {
        let node = findClosestNode(mouseX, mouseY, visible)
        if (node !== null) {
            this.callback(node, graph)
        }
    }
    dragStep() {}
    mouseUp() {}
}

export class ClickEdgeInteraction<T> implements GraphInteraction<T> {
    constructor(private callback: (node: GraphEdge<T>, graph: Graph<T>) => void) {}

    mouseDown(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number) {
        let edge = findClosestEdge(mouseX, mouseY, graph.edges)
        if (edge !== null) {
            this.callback(edge, graph)
        }
    }
    dragStep() {}
    mouseUp() {}
}

function duplicateSubgraph<T>(rootNode: GraphNode<T>, cloneData?: NodeDataTransfer<T,T>): [Graph<T>, GraphNode<T>, Map<GraphNode<T>, GraphNode<T>>] {
    let radius = Infinity
    let [subgraph, nodeMap] = extractSubgraph(collectNeighborhood(rootNode, radius), cloneData)
    return [subgraph, ensured(nodeMap.get(rootNode)), nodeMap]
}

export class DuplicateInteraction<T> implements GraphInteraction<T> {
    state: {
        subgraph: Graph<T>,
        root: GraphNode<T>,
        visibleSubgraph: Graph<T>
    } | null = null
    constructor (private painter: GraphPainter<T>, private pushToHistory: (graph: Graph<T>) => unknown, private cloneData: (data: T, nodeMap: Map<GraphNode<T>, GraphNode<T>>) => T = x => x) {}

    mouseDown(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number): void {
        let rootNode = findClosestNode(mouseX, mouseY, visible)
        if (rootNode !== null) {
            let [subgraph, newRoot, nodeMap] = duplicateSubgraph(rootNode, this.cloneData)
            let visibleSet = new Set(visible).map(node => nodeMap.get(node))
            this.state = {
                subgraph: subgraph,
                root: newRoot,
                visibleSubgraph: filteredGraphView(subgraph, (node) => visibleSet.has(node))
            }
        }
    }
    dragStep(graph: Graph<T>, visible: unknown, mouseX: number, mouseY: number, dt: number): void {
        // draw preview
        let state = this.state
        if (state !== null) {
            offsetNodes(state.subgraph.nodes, mouseX - state.root.x, mouseY - state.root.y)
        }
    }
    dragDraw(graph: Graph<T>, visibleNodes: GraphNode<T>[], mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, deltaTime: number): void {
        let state = this.state
        if (state !== null) {
            this.painter.drawGraph(drawCtx, state.visibleSubgraph)
        }
    }
    mouseUp(graph: Graph<T>, visible: unknown, mouseX: number, mouseY: number): void {
        let state = this.state
        if (state !== null) {
            this.pushToHistory(graph)
            for (let node of state.subgraph.nodes) {
                moveSlightly(node)
            }
            copyGraphTo(state.subgraph, graph, this.cloneData)
            this.state = null
        }
    }
}


export class SpanWindowTool<T> implements GraphInteraction<T> {
    state: {
        startPos: Vector,
    } | null = null

    constructor(
        private createWindow: (bounds: Rect) => unknown,
    ) {
    }

    mouseDown(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number): void {
        this.state = {
            startPos : vec(mouseX, mouseY),
        }
    }

    dragStep(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number, dt: number): void { }

    dragDraw(graph: Graph<T>, visibleNodes: GraphNode<T>[], mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, deltaTime: number): void {
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

    mouseUp(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number): void {
        if (this.state === null) {
            return
        }
        let bounds = Rect.fromPoints([this.state.startPos, vec(mouseX, mouseY)])
        this.createWindow(bounds)
    }
}

export class ShiftNodeInteraction<T> implements GraphInteraction<T> {
    state: {
        draggedNode: GraphNode<T>
        edges: GraphEdge<unknown>[] 
    } | null = null

    mouseDown(graph: Graph<T>, visible: GraphNode<T>[], mouseX: number, mouseY: number) {
        let draggedNode = findClosestNode(mouseX, mouseY, visible)
        if (draggedNode !== null) {
            this.state =  {
                draggedNode,
                edges: adjacentEdges(graph, draggedNode)
            }
        }
    }

    dragStep(graph: Graph<T>, visible: GraphNode<T>[], mouseX: number, mouseY: number, deltaTime: number) {
        if (this.state) {
            this.state.draggedNode.x = mouseX
            this.state.draggedNode.y = mouseY
            stretchEdgesToFit(this.state.edges)
        }
    }

    mouseUp() {
        this.state = null
    }
}
