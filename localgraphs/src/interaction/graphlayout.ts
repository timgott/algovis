import { getCursorPosition } from "../../../shared/canvas"
import { min } from "../../../shared/utils"
import { Positioned } from "../../../shared/vector"
import { Graph, GraphEdge, GraphNode, createEdge, createEmptyGraph, createNode, filteredGraphView } from "../graph"
import { AnimationFrame, InteractiveSystem, MouseDownResponse, PointerId, SleepState } from "./renderer"


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

export function distanceToPointSqr(x: number, y: number, node: Positioned) {
    let dx = node.x - x
    let dy = node.y - y
    return dx * dx + dy * dy
}

export function findClosestNode<T extends Positioned>(x: number, y: number, nodes: Iterable<T>, limit: number = Infinity): T | null {
    return min(nodes, (node) => distanceToPointSqr(x, y, node), limit*limit) ?? null
}

export function distanceToLineSqr(x: number, y: number, a: Positioned, b: Positioned) {
    let dx = b.x - a.x
    let dy = b.y - a.y
    let lengthSqr = dx * dx + dy * dy
    let dot = (x - a.x) * dx + (y - a.y) * dy
    let t = Math.max(0, Math.min(1, dot / lengthSqr))
    let closestX = a.x + t * dx
    let closestY = a.y + t * dy
    return distanceToPointSqr(x, y, { x: closestX, y: closestY })
}

export function findClosestEdge<T extends Positioned, E extends {a: T, b: T}>
    (x: number, y: number, edges: Iterable<E>, limit: number = Infinity): E | null {
    return min(edges, (edge) => distanceToLineSqr(x, y, edge.a, edge.b), limit*limit) ?? null
}

export function shuffleGraphPositions(graph: Graph<unknown>, width: number, height: number) {
    for (let node of graph.nodes) {
        node.x = Math.random() * width
        node.y = Math.random() * height
    }
}

export function moveSlightly(node: GraphNode<unknown>, strength: number = 3) {
    // prevents nodes on same position and wakes them from sleep
    node.vx += (Math.random()*2.-1.) * strength
    node.vy += (Math.random()*2.-1.) * strength
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


export interface GraphInteraction<T> {
    onMouseDown(graph: Graph<T>, visibleNodes: GraphNode<T>[], mouseX: number, mouseY: number): void
    onDragStep(graph: Graph<T>, visibleNodes: GraphNode<T>[], mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, deltaTime: number): void
    onMouseUp(graph: Graph<T>, visibleNodes: GraphNode<T>[], mouseX: number, mouseY: number): void
}

export class DragNodeInteraction<T> implements GraphInteraction<T> {
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
    constructor(protected nodeRadius: number, protected color: string = "black") {}

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
        ctx.circle(node.x, node.y, this.nodeRadius)
        ctx.fillStyle = this.color
        ctx.fill()
    }

    protected drawEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge<unknown>) {
        ctx.beginPath()
        ctx.lineWidth = this.nodeRadius / 3
        ctx.moveTo(edge.a.x, edge.a.y)
        ctx.lineTo(edge.b.x, edge.b.y)
        ctx.strokeStyle = this.color
        ctx.stroke()
    }
}

export class GraphPhysicsSimulator<T> implements InteractiveSystem {
    private graph: Graph<T>
    private layoutStyle: LayoutConfig
    private painter: GraphPainter<T>
    public visibleFilter: (node: GraphNode<T>) => boolean = () => true
    public substeps = 1

    private interactionMode: (() => GraphInteraction<T>) | null = null
    private interactions: Map<PointerId, GraphInteraction<T>> = new Map()

    constructor(
      graph: Graph<T>,
      layoutStyle: LayoutConfig,
      painter: GraphPainter<T>,
    ) {
        this.graph = graph
        this.layoutStyle = layoutStyle
        this.painter = painter
    }

    // mode is a constructor to enable multitouch
    setInteractionMode(mode: (() => GraphInteraction<T>) | null) {
        this.interactionMode = mode
    }

    getVisibleGraph() {
        return filteredGraphView(this.graph, this.visibleFilter)
    }

    getVisibleNodes() {
        return this.graph.nodes.filter(this.visibleFilter)
    }

    animate({dt, width, height, ctx, dragState}: AnimationFrame): SleepState {
        let visibleGraph = this.getVisibleGraph()
        for (let step = 0; step < this.substeps; step++) {
          let subdt = dt / this.substeps;
          for (let [id, pointerState] of dragState) {
              const drag = this.interactions.get(id)
              if (drag !== undefined) {
                  drag.onDragStep(this.graph, visibleGraph.nodes,
                      pointerState.x, pointerState.y, ctx, subdt)
              }
          }

          // physics
          applyVelocityStep(this.graph, this.layoutStyle, subdt)
          applyLayoutForces(visibleGraph, this.layoutStyle, width, height, subdt)
        }

        const activeCount = findActiveNodes(this.graph, this.layoutStyle).size // active in next step

        // render
        this.painter.drawGraph(ctx, visibleGraph)

        if (activeCount > 0 || dt == 0) {
            return "Running"
        } else {
            return "Sleeping"
        }
    }

    onMouseDown(x: number, y: number, pointerId: PointerId): MouseDownResponse {
        // start dragging node
        if (this.interactionMode !== null) {
            const drag = this.interactionMode()
            drag.onMouseDown(this.graph, this.getVisibleNodes(), x, y)
            this.interactions.set(pointerId, drag)
            return "Drag"
        }
        return "Ignore"
    }

    onDragEnd(x: number, y: number, pointerId: PointerId): void {
        // stop dragging node
        const drag = this.interactions.pop(pointerId)
        if (drag !== undefined) {
            drag.onMouseUp(this.graph, this.getVisibleNodes(), x, y)
        }
    }

    changeGraph(graph: Graph<T>) {
        // setter to enforce repaint
        this.graph = graph
    }

    getGraph() {
        return this.graph
    }
}
