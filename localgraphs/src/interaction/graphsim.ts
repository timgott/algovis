import { min } from "../../../shared/utils"
import { Positioned } from "../../../shared/vector"
import { Graph, GraphEdge, GraphNode, filteredGraphView } from "../graph"
import { LayoutPhysics } from "./physics"
import { AnimationFrame, InteractiveSystem, MouseDownResponse, PointerId, SleepState } from "./controller"

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
    node.x += node.vx * 0.2
    node.y += node.vy * 0.2
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


export interface GraphInteraction<T> {
    mouseDown(graph: Graph<T>, visibleNodes: GraphNode<T>[], mouseX: number, mouseY: number): void
    dragStep(graph: Graph<T>, visibleNodes: GraphNode<T>[], mouseX: number, mouseY: number, deltaTime: number): void
    dragDraw?(graph: Graph<T>, visibleNodes: GraphNode<T>[], mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, deltaTime: number): void
    mouseUp(graph: Graph<T>, visibleNodes: GraphNode<T>[], mouseX: number, mouseY: number): void
}

export class DragNodeInteraction<T> implements GraphInteraction<T> {
    draggedNode: GraphNode<T> | null = null

    mouseDown(graph: Graph<T>, visible: GraphNode<T>[], mouseX: number, mouseY: number) {
        this.draggedNode = findClosestNode(mouseX, mouseY, visible)
    }

    dragStep(graph: Graph<T>, visible: GraphNode<T>[], mouseX: number, mouseY: number, deltaTime: number) {
        if (this.draggedNode) {
            const dx = mouseX - this.draggedNode.x
            const dy = mouseY - this.draggedNode.y
            dragNodes([this.draggedNode], dx, dy, deltaTime)
        }
    }

    mouseUp() {
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
    private layout: LayoutPhysics<T>
    private painter: GraphPainter<T>
    public visibleFilter: null | ((node: GraphNode<T>) => boolean) = null
    public substeps = 1

    private interactionMode: (() => GraphInteraction<T>) | null = null
    private interactions: Map<PointerId, GraphInteraction<T>> = new Map()

    constructor(
      graph: Graph<T>,
      layout: LayoutPhysics<T>,
      painter: GraphPainter<T>,
    ) {
        this.graph = graph
        this.layout = layout
        this.painter = painter
    }

    // mode is a constructor to enable multitouch
    setInteractionMode(mode: (() => GraphInteraction<T>) | null) {
        this.interactionMode = mode
    }

    getVisibleGraph() {
        if (this.visibleFilter) {
            return filteredGraphView(this.graph, this.visibleFilter)
        } else {
            return this.graph
        }
    }

    getVisibleNodes() {
        if (this.visibleFilter) {
            return this.graph.nodes.filter(this.visibleFilter)
        } else {
            return this.graph.nodes
        }
    }

    update({dt, bounds, dragState}: AnimationFrame): SleepState {
        let visibleGraph = this.getVisibleGraph()
        let activeCount = 0
        for (let step = 0; step < this.substeps; step++) {
          let subdt = dt / this.substeps;
          for (let [id, pointerState] of dragState) {
              const drag = this.interactions.get(id)
              if (drag !== undefined) {
                  drag.dragStep(this.graph, visibleGraph.nodes,
                      pointerState.x, pointerState.y, subdt)
              }
          }

          // physics
          activeCount = this.layout.step(visibleGraph, bounds, subdt)
        }
        if (activeCount > 0 || dt == 0) {
            return "Running"
        } else {
            return "Sleeping"
        }
    }

    draw(frame: AnimationFrame, ctx: CanvasRenderingContext2D): void {
        let visibleGraph = this.getVisibleGraph()
        for (let [id, pointerState] of frame.dragState) {
            const drag = this.interactions.get(id)
            if (drag !== undefined && drag.dragDraw) {
                drag.dragDraw(this.graph, visibleGraph.nodes,
                    pointerState.x, pointerState.y, ctx, frame.dt)
            }
        }

        // render
        this.painter.drawGraph(ctx, visibleGraph)
    }

    mouseDown(x: number, y: number, pointerId: PointerId): MouseDownResponse {
        // start dragging node
        if (this.interactionMode !== null) {
            const drag = this.interactionMode()
            drag.mouseDown(this.graph, this.getVisibleNodes(), x, y)
            this.interactions.set(pointerId, drag)
            return "Drag"
        }
        return "Ignore"
    }

    dragEnd(x: number, y: number, pointerId: PointerId): void {
        // stop dragging node
        const drag = this.interactions.pop(pointerId)
        if (drag !== undefined) {
            drag.mouseUp(this.graph, this.getVisibleNodes(), x, y)
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
