import { getCursorPosition } from "../../shared/canvas"
import { Graph, GraphEdge, GraphNode, createEdge, createEmptyGraph, createNode } from "./graph"


export type LayoutConfig = {
    edgeLength: number,
    targetDistance: number,
    pushForce: number,
    edgeForce: number,
    centeringForce: number,
    dampening: number
    nodeRadius: number
}

export function applyLayoutPhysics(graph: Graph<unknown>, layout: LayoutConfig, width: number, height: number, dt: number) {
    // pull together edges
    for (let edge of graph.edges) {
        let dx = edge.b.x - edge.a.x
        let dy = edge.b.y - edge.a.y
        let dist = Math.sqrt(dx * dx + dy * dy)
        console.assert(dist > 0, "Points on same spot")
        let unitX = dx / dist
        let unitY = dy / dist
        let force = (layout.edgeLength - dist) * layout.edgeForce * dt
        edge.a.vx -= force * unitX
        edge.a.vy -= force * unitY
        edge.b.vx += force * unitX
        edge.b.vy += force * unitY
    }
    // push apart nodes
    const targetDistSqr = layout.targetDistance * layout.targetDistance
    const pushForce = layout.pushForce * layout.targetDistance
    for (let a of graph.nodes) {
        for (let b of graph.nodes) {
            if (a !== b && !a.neighbors.has(b)) {
                let dx = b.x - a.x
                let dy = b.y - a.y
                let distSqr = dx * dx + dy * dy
                if (distSqr < targetDistSqr && distSqr > 0) {
                    let force = dt * pushForce / distSqr
                    a.vx -= force * dx
                    a.vy -= force * dy
                    b.vx += force * dx
                    b.vy += force * dy
                }
            }
        }
    }
    // push nodes to center
    let centerX = width / 2
    let centerY = height / 2
    for (let node of graph.nodes) {
        let dx = centerX - node.x
        let dy = centerY - node.y
        node.vx += dx * dt * layout.centeringForce
        node.vy += dy * dt * layout.centeringForce
    }

    // position and velocity integration
    for (let node of graph.nodes) {
        node.x += node.vx * dt;
        node.y += node.vy * dt;

        node.vx -= node.vx * layout.dampening * dt;
        node.vy -= node.vy * layout.dampening * dt;
    }
}

export function findClosestNode<T>(x: number, y: number, graph: Graph<T>): GraphNode<T> | null {
    if (graph.nodes.length == 0) {
        return null
    }
    let result = graph.nodes[0]
    let minDistance = Number.POSITIVE_INFINITY
    for (let node of graph.nodes) {
        let dx = (node.x - x)
        let dy = (node.y - y)
        let dist = dx * dx + dy * dy
        if (dist < minDistance) {
            result = node
            minDistance = dist
        }
    }
    return result
}

export function shuffleGraphPositions(graph: Graph<unknown>, width: number, height: number) {
    for (let node of graph.nodes) {
        node.x = Math.random() * width
        node.y = Math.random() * height
    }
}

export function createRandomGraph(size: number, edgesPerNode: number): Graph<null> {
    let graph = createEmptyGraph<null>()
    createNode(graph, null)
    for (let i = 0; i < size; i++) {
        let node = createNode(graph, null)
        for (let j = 0; j < edgesPerNode; j++) {
            let otherNode = graph.nodes[Math.floor(Math.random() * (graph.nodes.length - 1))]
            if (!node.neighbors.has(otherNode)) {
                createEdge(graph, node, otherNode)
            }
        }
    }
    return graph
}

export function createGridGraph(size: number, layout: LayoutConfig): Graph<null> {
    let graph = createEmptyGraph<null>()
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            let node = createNode(graph, null, i * layout.edgeLength, j * layout.edgeLength)
            if (i > 0) {
                createEdge(graph, node, graph.nodes[(i - 1) * size + j])
            }
            if (j > 0) {
                createEdge(graph, node, graph.nodes[i * size + j - 1])
            }
        }
    }
    return graph
}


export interface GraphInteractionMode<T> {
    onMouseDown(graph: Graph<T>, mouseX: number, mouseY: number): void
    onDragStep(graph: Graph<T>, mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D): void
    onMouseUp(graph: Graph<T>, mouseX: number, mouseY: number): void
}

export class DragNodeInteraction<T> implements GraphInteractionMode<T> {
    draggedNode: GraphNode<T> | null = null

    onMouseDown(graph: Graph<T>, mouseX: number, mouseY: number) {
        this.draggedNode = findClosestNode(mouseX, mouseY, graph)
    }

    onDragStep(graph: Graph<T>, mouseX: number, mouseY: number) {
        if (this.draggedNode) {
            this.draggedNode.x = mouseX
            this.draggedNode.y = mouseY
            this.draggedNode.vx = 0
            this.draggedNode.vy = 0
        }
    }

    onMouseUp() {
        this.draggedNode = null
    }
}

export class GraphPhysicsSimulator<T> {
    mouseX: number = 0
    mouseY: number = 0
    isMouseDown: boolean = false

    previousTimeStamp: number | undefined = undefined

    graph: Graph<T>
    layoutStyle: LayoutConfig
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D

    interactionMode: GraphInteractionMode<T> | null = null

    constructor(canvas: HTMLCanvasElement, graph: Graph<T>, layoutStyle: LayoutConfig) {
        this.graph = graph
        this.layoutStyle = layoutStyle
        this.canvas = canvas
        this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

        canvas.addEventListener("mousedown", (ev) => {
            const [x, y] = getCursorPosition(canvas, ev)
            this.onMouseDown(x, y)
        })
        window.addEventListener("mousemove", (ev) => {
            const [x, y] = getCursorPosition(canvas, ev)
            this.onMouseMoved(x, y)
        })
        window.addEventListener("mouseup", (ev) => {
            const [x, y] = getCursorPosition(canvas, ev)
            this.onMouseUp(x, y)
        })
    }

    setInteractionMode(mode: GraphInteractionMode<T> | null) {
        this.interactionMode = mode
    }

    animate(timeStamp: number) {
        if (!this.previousTimeStamp) {
            this.previousTimeStamp = timeStamp
        }
        const dt = Math.min(timeStamp - this.previousTimeStamp, 1. / 30.)

        const width = this.canvas.width
        const height = this.canvas.height
        this.ctx.clearRect(0, 0, width, height);

        if (this.interactionMode !== null && this.isMouseDown) {
            this.interactionMode.onDragStep(this.graph, this.mouseX, this.mouseY, this.ctx)
        }

        // physics
        applyLayoutPhysics(this.graph, this.layoutStyle, width, height, dt)

        // render
        this.drawGraph(this.ctx, this.graph)

        this.previousTimeStamp = timeStamp
        requestAnimationFrame((t) => this.animate(t));
    }

    protected drawGraph(ctx: CanvasRenderingContext2D, graph: Graph<unknown>) {
        // edges
        for (let edge of graph.edges) {
            this.drawEdge(ctx, edge)
        }
        // nodes
        for (let node of graph.nodes) {
            this.drawNode(ctx, node)
        }
    }

    protected drawNode(ctx: CanvasRenderingContext2D, node: GraphNode<unknown>) {
        ctx.beginPath()
        ctx.arc(node.x, node.y, this.layoutStyle.nodeRadius, 0, Math.PI * 2)
        ctx.fill()
        ctx.closePath()
    }

    protected drawEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge<unknown>) {
        ctx.beginPath()
        ctx.lineWidth = this.layoutStyle.nodeRadius / 3
        ctx.moveTo(edge.a.x, edge.a.y)
        ctx.lineTo(edge.b.x, edge.b.y)
        ctx.stroke()
        ctx.closePath()
    }

    onMouseDown(x: number, y: number) {
        // start dragging node
        this.isMouseDown = true
        this.mouseX = x
        this.mouseY = y
        if (this.interactionMode !== null) {
            this.interactionMode.onMouseDown(this.graph, x, y)
        }
    }

    onMouseMoved(x: number, y: number) {
        // drag event sent on every animate step
        this.mouseX = x
        this.mouseY = y
    }

    onMouseUp(x: number, y: number) {
        // stop dragging node
        if (this.isMouseDown) {
            this.isMouseDown = false
            if (this.interactionMode !== null) {
                this.interactionMode.onMouseUp(this.graph, x, y)
            }
        }
    }

    run() {
        // settle physics
        const PreIterations = 0
        for (let i = 0; i < PreIterations; i++) {
            applyLayoutPhysics(this.graph, this.layoutStyle, this.canvas.width, this.canvas.height, 1 / 30)
        }
        // start frame loop
        this.animate(performance.now());
    }

}