import { getCursorPosition } from "../../shared/canvas"
import { Graph, GraphEdge, GraphNode, createEdge, createEmptyGraph, createNode, filteredGraphView } from "./graph"


export type LayoutConfig = {
    minEdgeLength: number,
    pushDistance: number,
    pushForce: number,
    edgeForce: number,
    centeringForce: number,
    dampening: number
    nodeRadius: number
    sleepVelocity: number,
}

function findActiveNodes(graph: Graph<unknown>, layout: LayoutConfig): Set<GraphNode<unknown>> {
    let activeNodes = new Set<GraphNode<unknown>>()
    for (let node of graph.nodes) {
        if (Math.abs(node.vx)+Math.abs(node.vy) >= layout.sleepVelocity) {
            activeNodes.add(node)
        }
    }
    return activeNodes
}

export function applyVelocityStep(graph: Graph<unknown>, layout: LayoutConfig, dt: number) {
    // position and velocity integration
    for (let node of graph.nodes) {
        node.x += node.vx * dt;
        node.y += node.vy * dt;

        node.vx -= node.vx * layout.dampening * dt;
        node.vy -= node.vy * layout.dampening * dt;
    }
}

// returns number of active nodes during this physics update
export function applyLayoutForces(graph: Graph<unknown>, layout: LayoutConfig, width: number, height: number, dt: number): number {
    // find nodes that have moved in the last time step
    const activeNodes = findActiveNodes(graph, layout)

    for (let node of graph.nodes) {
        if (!activeNodes.has(node)) {
            node.vx = 0
            node.vy = 0
        }
    }

    // pull together edges
    for (let edge of graph.edges) {
        // don't check for active nodes because of edge cases like uncollapsing nodes
        let dx = edge.b.x - edge.a.x
        let dy = edge.b.y - edge.a.y
        let dist = Math.sqrt(dx * dx + dy * dy)
        console.assert(dist > 0, "Points on same spot")
        let unitX = dx / dist
        let unitY = dy / dist
        let delta = 0
        let length = Math.max(edge.length, layout.minEdgeLength)
        if (dist > length) {
            delta = length - dist
        } else if (dist < layout.minEdgeLength) {
            delta = layout.minEdgeLength - dist
        }
        let force = delta * layout.edgeForce * dt
        edge.a.vx -= force * unitX
        edge.a.vy -= force * unitY
        edge.b.vx += force * unitX
        edge.b.vy += force * unitY
    }
    // push apart nodes
    const targetDistSqr = layout.pushDistance * layout.pushDistance
    const pushForce = layout.pushForce * layout.pushDistance
    for (let a of activeNodes) {
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

    return activeNodes.size
}

export function findClosestNode<T>(x: number, y: number, nodes: Iterable<GraphNode<T>>): GraphNode<T> | null {
    let result = null
    let minDistance = Number.POSITIVE_INFINITY
    for (let node of nodes) {
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

export function dragNodes(nodes: Iterable<GraphNode<unknown>>, dx: number, dy: number, deltaTime: number) {
    if (deltaTime > 0) {
        for (let node of nodes) {
            node.vx = dx / deltaTime
            node.vy = dy / deltaTime
        }
    }
}

export function offsetNodes(nodes: Iterable<GraphNode<unknown>>, dx: number, dy: number) {
    for (let node of nodes) {
        node.x += dx
        node.y += dy
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
            let node = createNode(graph, null, i * layout.minEdgeLength, j * layout.minEdgeLength)
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
    onMouseDown(graph: Graph<T>, visibleNodes: GraphNode<T>[], mouseX: number, mouseY: number): void
    onDragStep(graph: Graph<T>, visibleNodes: GraphNode<T>[], mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, deltaTime: number): void
    onMouseUp(graph: Graph<T>, visibleNodes: GraphNode<T>[], mouseX: number, mouseY: number): void
}

export class DragNodeInteraction<T> implements GraphInteractionMode<T> {
    draggedNode: GraphNode<T> | null = null

    onMouseDown(graph: Graph<T>, visible: GraphNode<T>[], mouseX: number, mouseY: number) {
        this.draggedNode = findClosestNode(mouseX, mouseY, visible)
    }

    onDragStep(graph: Graph<T>, visible: GraphNode<T>[], mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, deltaTime: number) {
        if (this.draggedNode) {
            const dx = mouseX - this.draggedNode.x
            const dy = mouseY - this.draggedNode.y
            dragNodes([this.draggedNode], dx, dy, deltaTime)
        }
    }

    onMouseUp() {
        this.draggedNode = null
    }
}

export interface GraphPainter<T> {
    drawGraph(ctx: CanvasRenderingContext2D, graph: Graph<T>): void
}

export class SimpleGraphPainter<T> implements GraphPainter<T> {
    constructor(protected nodeRadius: number) {}

    public drawGraph(ctx: CanvasRenderingContext2D, graph: Graph<unknown>) {
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
        ctx.arc(node.x, node.y, this.nodeRadius, 0, Math.PI * 2)
        ctx.fill()
        ctx.closePath()
    }

    protected drawEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge<unknown>) {
        ctx.beginPath()
        ctx.lineWidth = this.nodeRadius / 3
        ctx.moveTo(edge.a.x, edge.a.y)
        ctx.lineTo(edge.b.x, edge.b.y)
        ctx.stroke()
        ctx.closePath()
    }
}

// Returns whether something has been updated
export type PhysicsStep<T> = (obj: T, width: number, height: number, dt: number) => boolean

export class GraphPhysicsSimulator<T> {
    private mouseX: number = 0
    private mouseY: number = 0
    private isMouseDown: boolean = false

    private previousTimeStamp: number | null = null
    private hasRequestedFrame: boolean = false
    
    private graph: Graph<T>
    private layoutStyle: LayoutConfig
    private canvas: HTMLCanvasElement
    private ctx: CanvasRenderingContext2D
    private painter: GraphPainter<T>
    public visibleFilter: (node: GraphNode<T>) => boolean = () => true

    private interactionMode: GraphInteractionMode<T> | null = null

    constructor(canvas: HTMLCanvasElement, graph: Graph<T>, layoutStyle: LayoutConfig, painter: GraphPainter<T>) {
        this.graph = graph
        this.layoutStyle = layoutStyle
        this.canvas = canvas
        this.painter = painter
        this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

        canvas.addEventListener("pointerdown", (ev) => {
            const [x, y] = getCursorPosition(canvas, ev)
            this.onMouseDown(x, y)
        })
        window.addEventListener("pointermove", (ev) => {
            const [x, y] = getCursorPosition(canvas, ev)
            this.onMouseMoved(x, y)
        })
        window.addEventListener("pointerup", (ev) => {
            const [x, y] = getCursorPosition(canvas, ev)
            this.onMouseUp(x, y)
        })
        window.addEventListener("resize", () => {
            this.requestFrame()
        })
    }

    setInteractionMode(mode: GraphInteractionMode<T> | null) {
        this.interactionMode = mode
    }

    getVisibleGraph() {
        return filteredGraphView(this.graph, this.visibleFilter)
    }

    getVisibleNodes() {
        return this.graph.nodes.filter(this.visibleFilter)
    }

    animate(timeStamp: number) {
        if (this.previousTimeStamp === null) {
            this.previousTimeStamp = timeStamp
        }
        const dt = Math.min(timeStamp - this.previousTimeStamp, 1. / 30.)
        if (dt < 0) {
            console.log("Negative dt", dt)
        }
        console.log("dt", dt)

        const width = this.canvas.clientWidth
        const height = this.canvas.clientHeight
        this.ctx.clearRect(0, 0, width, height);

        let visibleGraph = this.getVisibleGraph()
        if (this.interactionMode !== null && this.isMouseDown) {
            this.interactionMode.onDragStep(this.graph, visibleGraph.nodes, this.mouseX, this.mouseY, this.ctx, dt)
        }
        
        // physics
        applyVelocityStep(this.graph, this.layoutStyle, dt)
        applyLayoutForces(visibleGraph, this.layoutStyle, width, height, dt)
        const activeCount = findActiveNodes(this.graph, this.layoutStyle).size // active in next step

        // render
        this.painter.drawGraph(this.ctx, visibleGraph)

        this.previousTimeStamp = timeStamp

        if (activeCount > 0 || dt == 0) {
            this.requestFrame()
        } else {
            console.log("Physics settled, sleeping")
        }
    }

    requestFrame() {
        if (!this.hasRequestedFrame) {
            this.hasRequestedFrame = true
            if (this.previousTimeStamp === null) {
                this.previousTimeStamp = document.timeline.currentTime as number | null
            }
            requestAnimationFrame((timeStamp) => {
                this.hasRequestedFrame = false
                this.animate(timeStamp)
            })
        }
    }

    onMouseDown(x: number, y: number) {
        // start dragging node
        this.isMouseDown = true
        this.mouseX = x
        this.mouseY = y
        if (this.interactionMode !== null) {
            this.interactionMode.onMouseDown(this.graph, this.getVisibleNodes(), x, y)
            this.requestFrame()
        }
    }

    onMouseMoved(x: number, y: number) {
        this.mouseX = x
        this.mouseY = y

        if (this.interactionMode !== null && this.isMouseDown) {
            // drag event sent in animate step
            this.requestFrame()
        }
    }

    onMouseUp(x: number, y: number) {
        // stop dragging node
        if (this.isMouseDown) {
            this.isMouseDown = false
            if (this.interactionMode !== null) {
                this.interactionMode.onMouseUp(this.graph, this.getVisibleNodes(), x, y)
                this.requestFrame()
            }
        }
    }

    run() {
        // settle physics
        const PreIterations = 0
        for (let i = 0; i < PreIterations; i++) {
            const dt = 1 / 30
            applyVelocityStep(this.graph, this.layoutStyle, dt)
            applyLayoutForces(this.graph, this.layoutStyle, this.canvas.width, this.canvas.height, dt)
        }
        // start frame loop
        this.requestFrame()
    }

    changeGraph(graph: Graph<T>) {
        // setter to enforce repaint
        this.graph = graph
        this.requestFrame()
    }

    getGraph() {
        return this.graph
    }
}