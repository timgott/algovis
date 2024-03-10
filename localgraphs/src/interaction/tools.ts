import { Positioned, distance } from "../../../shared/vector"
import { Graph, GraphNode } from "../graph"
import { collectNeighborhood } from "../graphalgos"
import { GraphInteractionMode, dragNodes, findClosestNode } from "./graphlayout"

export class BuildGraphInteraction<T> implements GraphInteractionMode<T> {
    moveThreshold: number = 20
    connectConeFactor: number = 0.7 // weight factor for connecting existing nodes instead of adding a new node

    startNode: GraphNode<T> | null = null
    startX: number = 0
    startY: number = 0
    hasMoved: boolean = false

    constructor(private buildNode: (graph: Graph<T>, x: number, y: number) => GraphNode<T>, private buildEdge: (graph: Graph<T>, a: GraphNode<T>, b: GraphNode<T>) => unknown) {
    }

    onMouseDown(graph: Graph<T>, visible: GraphNode<T>[], mouseX: number, mouseY: number): void {
        this.startX = mouseX
        this.startY = mouseY
        this.startNode = findClosestNode(mouseX, mouseY, visible)
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
            let endNode = findClosestNode(mouseX, mouseY, visible)
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
            let endNode = findClosestNode(endX, endY, visible)
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