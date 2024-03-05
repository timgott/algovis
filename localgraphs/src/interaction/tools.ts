import { Graph, GraphNode } from "../graph"
import { collectNeighborhood } from "../graphalgos"
import { GraphInteractionMode, dragNodes, findClosestNode } from "./graphlayout"

export class BuildGraphInteraction<T> implements GraphInteractionMode<T> {
    edgeThreshold: number = 20

    startNode: GraphNode<T> | null = null
    startX: number = 0
    startY: number = 0

    constructor(private buildNode: (graph: Graph<T>, x: number, y: number) => unknown, private buildEdge: (graph: Graph<T>, a: GraphNode<T>, b: GraphNode<T>) => unknown) {
    }

    onMouseDown(graph: Graph<T>, visible: GraphNode<T>[], mouseX: number, mouseY: number): void {
        this.startX = mouseX
        this.startY = mouseY
        this.startNode = findClosestNode(mouseX, mouseY, visible)
    }
    shouldCreateEdge(mouseX: number, mouseY: number): boolean {
        let distance = Math.hypot(mouseX - this.startX, mouseY - this.startY)
        return distance >= this.edgeThreshold
    }
    onDragStep(graph: Graph<T>, visible: Iterable<GraphNode<unknown>>, mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D): void {
        // TODO: draw edge
        if (this.startNode !== null && this.shouldCreateEdge(mouseX, mouseY)) {
            drawCtx.strokeStyle = "black"
            drawCtx.lineWidth = 1
            drawCtx.beginPath()
            let endNode = findClosestNode(mouseX, mouseY, visible)
            if (endNode !== null && this.startNode !== endNode) {
                drawCtx.moveTo(endNode.x, endNode.y)
                drawCtx.quadraticCurveTo(mouseX, mouseY, this.startNode.x, this.startNode.y)
            } else {
                drawCtx.setLineDash([6, 5])
                drawCtx.moveTo(mouseX, mouseY)
                drawCtx.lineTo(this.startNode.x, this.startNode.y)
            }
            drawCtx.stroke()
            drawCtx.setLineDash([]) 
        }
    }
    onMouseUp(graph: Graph<T>, visible: Iterable<GraphNode<T>>, endX: number, endY: number): void {
        if (this.shouldCreateEdge(endX, endY)) {
            let endNode = findClosestNode(endX, endY, visible)
            if (this.startNode !== null && endNode !== null && this.startNode !== endNode && !this.startNode.neighbors.has(endNode)) {
                // create new edge
                //pushToHistory(graph)
                //putNewEdge(graph, this.startNode, endNode)
                this.buildEdge(graph, this.startNode, endNode)
            }
        }
        else {
            // create new node
            //pushToHistory(graph)
            //putNewNode(graph, endX, endY)
            this.buildNode(graph, endX, endY)
        }

    }
}

export class MoveComponentInteraction<T> implements GraphInteractionMode<T> {
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

export class ClickNodeInteraction<T> implements GraphInteractionMode<T> {
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