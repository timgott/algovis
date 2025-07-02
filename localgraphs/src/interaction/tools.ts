import { Rect } from "../../../shared/rectangle"
import { ensured } from "../../../shared/utils"
import { Positioned, Vector, distance, vec } from "../../../shared/vector"
import { copyGraphTo, extractSubgraph, filteredGraphView, Graph, GraphEdge, GraphNode, NodeDataTransfer } from "../graph"
import { collectNeighborhood } from "../graphalgos"
import { GraphInteraction, GraphPainter, dragNodes, findClosestEdge, findClosestNode, moveSlightly, offsetNodes } from "./graphsim"

export class BuildGraphInteraction<T> implements GraphInteraction<T> {
    moveThreshold: number = 20
    connectConeFactor: number = 0.7 // weight factor for connecting existing nodes instead of adding a new node

    startNode: GraphNode<T> | null = null
    startX: number = 0
    startY: number = 0
    hasMoved: boolean = false

    constructor(private buildNode: (graph: Graph<T>, x: number, y: number) => GraphNode<T>, private buildEdge: (graph: Graph<T>, a: GraphNode<T>, b: GraphNode<T>) => unknown) {
    }

    findNode(x: number, y: number, visible: Iterable<GraphNode<T>>): GraphNode<T> | null {
        return findClosestNode(x, y, visible)
    }

    onMouseDown(graph: Graph<T>, visible: GraphNode<T>[], mouseX: number, mouseY: number): void {
        this.startX = mouseX
        this.startY = mouseY
        this.startNode = this.findNode(mouseX, mouseY, visible)
        this.hasMoved = false
    }
    checkHasMoved(mouseX: number, mouseY: number): boolean {
        let distance = Math.hypot(mouseX - this.startX, mouseY - this.startY)
        return distance >= this.moveThreshold
    }
    shouldCreateEndpoint(mouseX: number, mouseY: number, closestNode: GraphNode<T>): boolean {
        if (this.startNode === closestNode
            || this.startNode?.neighbors.has(closestNode)) {
            return true
        }
        const mouse = { x: mouseX, y: mouseY }
        const node = { x: closestNode.x, y: closestNode.y }
        const start = { x: this.startX, y: this.startY}
        return distance(start, mouse)*this.connectConeFactor < distance(mouse, node)
    }
    onDragStep(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D): void {
        if (!this.hasMoved && this.checkHasMoved(mouseX, mouseY)) {
            this.hasMoved = true
        }
        if (this.startNode !== null && this.hasMoved) {
            drawCtx.strokeStyle = "black"
            drawCtx.lineWidth = 1
            drawCtx.beginPath()
            let endNode = this.findNode(mouseX, mouseY, visible)
            if (endNode !== null && !this.shouldCreateEndpoint(mouseX, mouseY, endNode)) {
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
    onMouseUp(graph: Graph<T>, visible: Iterable<GraphNode<T>>, endX: number, endY: number): void {
        if (this.startNode !== null && this.hasMoved) {
            let endNode = this.findNode(endX, endY, visible)
            if (endNode === null || this.shouldCreateEndpoint(endX, endY, endNode)) {
                endNode = this.buildNode(graph, endX, endY)
            }
            // create new edge
            //pushToHistory(graph)
            //putNewEdge(graph, this.startNode, endNode)
            this.buildEdge(graph, this.startNode, endNode)
        }
        else {
            // create new node
            //pushToHistory(graph)
            //putNewNode(graph, endX, endY)
            this.buildNode(graph, endX, endY)
        }

    }
}

export class MoveComponentInteraction<T> implements GraphInteraction<T> {
    draggedNode: GraphNode<T> | null = null

    onMouseDown(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number) {
        this.draggedNode = findClosestNode(mouseX, mouseY, visible)
    }

    onDragStep(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number, ctx: unknown, dt: number) {
        if (this.draggedNode) {
            let nodes = collectNeighborhood(this.draggedNode, Infinity)
            dragNodes(nodes, mouseX - this.draggedNode.x, mouseY - this.draggedNode.y, dt)
        }
    }

    onMouseUp() {
        this.draggedNode = null
    }
}

export class ClickNodeInteraction<T> implements GraphInteraction<T> {
    constructor(private callback: (node: GraphNode<T>, graph: Graph<T>) => void) {}

    onMouseDown(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number) {
        let node = findClosestNode(mouseX, mouseY, visible)
        if (node !== null) {
            this.callback(node, graph)
        }
    }
    onDragStep() {}
    onMouseUp() {}
}

export class ClickEdgeInteraction<T> implements GraphInteraction<T> {
    constructor(private callback: (node: GraphEdge<T>, graph: Graph<T>) => void) {}

    onMouseDown(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number) {
        let edge = findClosestEdge(mouseX, mouseY, graph.edges)
        if (edge !== null) {
            this.callback(edge, graph)
        }
    }
    onDragStep() {}
    onMouseUp() {}
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

    onMouseDown(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number): void {
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
    onDragStep(graph: Graph<T>, visible: unknown, mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, dt: number): void {
        // draw preview
        let state = this.state
        if (state !== null) {
            offsetNodes(state.subgraph.nodes, mouseX - state.root.x, mouseY - state.root.y)
            this.painter.drawGraph(drawCtx, state.visibleSubgraph)
        }
    }
    onMouseUp(graph: Graph<T>, visible: unknown, mouseX: number, mouseY: number): void {
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

    onMouseDown(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number): void {
        this.state = {
            startPos : vec(mouseX, mouseY),
        }
    }

    onDragStep(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, dt: number): void {
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

    onMouseUp(graph: Graph<T>, visible: Iterable<GraphNode<T>>, mouseX: number, mouseY: number): void {
        if (this.state === null) {
            return
        }
        let bounds = Rect.fromPoints([this.state.startPos, vec(mouseX, mouseY)])
        this.createWindow(bounds)
    }
}
