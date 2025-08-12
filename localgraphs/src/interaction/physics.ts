import { assert, min, randomUniform } from "../../../shared/utils";
import { distance, isDistanceLess, Vector } from "../../../shared/vector";
import { filteredGraphView, Graph, GraphEdge, GraphNode } from "../graph";

export interface LayoutPhysics<T> {
    // Returns number of active nodes, 0 sends simulation to sleep
    step(
        graph: Graph<T>,
        width: number,
        heigh: number,
        dt: number,
    ): number;
}

export type LayoutConfig = {
    minEdgeLength: number,
    pushDistance: number,
    pushForce: number,
    edgeForce: number,
    centeringForce: number,
    nodeRadius: number,
    dampening: number
    sleepVelocity: number,
}

export function findActiveNodes(
    graph: Graph<unknown>,
    sleepVelocity: number,
): Set<GraphNode<unknown>> {
    let activeNodes = new Set<GraphNode<unknown>>();
    for (let node of graph.nodes) {
        if (node.vx * node.vy + node.vy * node.vy >= sleepVelocity * sleepVelocity) {
            activeNodes.add(node);
        }
    }
    return activeNodes;
}

export function applyVelocityStep(
    nodes: Iterable<GraphNode<unknown>>,
    dampening: number,
    dt: number,
) {
    // position and velocity integration
    for (let node of nodes) {
        assert(!isNaN(node.x) && !isNaN(node.y), "position is NaN")
        assert(!isNaN(node.vx) && !isNaN(node.vy), "velocity is NaN")
        node.x += node.vx * dt;
        node.y += node.vy * dt;

        node.vx -= node.vx * dampening * dt;
        node.vy -= node.vy * dampening * dt;
    }
}

const minDistance = 0.01;

function separatePair(active: GraphNode<unknown>, passive: GraphNode<unknown>) {
    if (active !== passive) {
        while (isDistanceLess(active, passive, minDistance)) {
            let v = Vector.fromAngle(randomUniform(0, 2 * Math.PI), minDistance)
            active.x += v.x
            active.y += v.y
            active.vx += v.x / 0.01
            active.vy += v.y / 0.01
        }
    }
}

export function separateNodes<T>(activeNodes: Iterable<GraphNode<T>>, allNodes: Iterable<GraphNode<T>>): void {
    for (let a of activeNodes) {
        for (let b of allNodes) {
            separatePair(a, b)
        }
    }
}

function separateNeighbors<T>(activeNodes: Iterable<GraphNode<T>>, allNodes: Iterable<GraphNode<T>>): void {
    for (let a of activeNodes) {
        for (let b of a.neighbors) {
            separatePair(a, b)
        }
    }
}

function applyLayoutForces<T>(
    graph: Graph<T>,
    layout: LayoutConfig,
    activeNodes: Set<GraphNode<T>>,
    width: number,
    height: number,
    dt: number,
) {
    for (let node of graph.nodes) {
        if (!activeNodes.has(node)) {
            node.vx = 0;
            node.vy = 0;
        }
    }

    // make sure no 2 nodes are on the same spot
    separateNodes(activeNodes, graph.nodes)

    // pull together edges
    for (let edge of graph.edges) {
        if (edge.a !== edge.b) { // skip self-loops
            // don't check for active nodes because of edge cases like uncollapsing nodes
            let dx = edge.b.x - edge.a.x;
            let dy = edge.b.y - edge.a.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            console.assert(dist > 0, "Points on same spot");
            if (dist > 0) {
                let unitX = dx / dist;
                let unitY = dy / dist;
                let delta = 0;
                let length = Math.max(edge.length, layout.minEdgeLength);
                if (dist > length) {
                    delta = length - dist;
                } else if (dist < layout.minEdgeLength) {
                    delta = layout.minEdgeLength - dist;
                }
                let force = delta * layout.edgeForce * dt;
                edge.a.vx -= force * unitX;
                edge.a.vy -= force * unitY;
                edge.b.vx += force * unitX;
                edge.b.vy += force * unitY;
            }
        }
    }
    // push apart nodes
    const targetDistSqr = layout.pushDistance * layout.pushDistance;
    const pushForce = layout.pushForce * layout.pushDistance;
    for (let a of activeNodes) {
        for (let b of graph.nodes) {
            if (a !== b && !a.neighbors.has(b)) {
                let dx = b.x - a.x;
                let dy = b.y - a.y;
                let distSqr = dx * dx + dy * dy;
                if (distSqr < targetDistSqr && distSqr > 0) {
                    let force = (dt * pushForce) / distSqr;
                    a.vx -= force * dx;
                    a.vy -= force * dy;
                    b.vx += force * dx;
                    b.vy += force * dy;
                }
            }
        }
    }
    // push nodes to center
    let centerX = width / 2;
    let centerY = height / 2;
    for (let node of graph.nodes) {
        let dx = centerX - node.x;
        let dy = centerY - node.y;
        node.vx += dx * dt * layout.centeringForce;
        node.vy += dy * dt * layout.centeringForce;
    }
}

// Only affects activeNodes based on forces between active and inactive nodes.
// Can be useful to move new nodes into place without disrupting the layout.
// Don't call this twice to make it two sided though, that is inefficient
export function applyLayoutForcesOneSided<T>(
    graph: Graph<T>,
    layout: LayoutConfig,
    activeNodes: Set<GraphNode<T>>,
    dt: number,
) {
    // make sure no 2 nodes are on the same spot
    separateNodes(activeNodes, graph.nodes)

    // pull together edges
    for (let edge of graph.edges) {
        if (edge.a !== edge.b) { // skip self-loops
            let node: GraphNode<T> | null = null
            let sign: number = 0
            if (activeNodes.has(edge.a)) {
                node = edge.a
                sign = 1
            } else if (activeNodes.has(edge.b)) {
                node = edge.b
                sign = -1
            }
            if (node !== null) {
                // don't check for active nodes because of edge cases like uncollapsing nodes
                let dx = edge.b.x - edge.a.x;
                let dy = edge.b.y - edge.a.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                console.assert(dist > 0, "Points on same spot");
                let unitX = dx / dist;
                let unitY = dy / dist;
                let delta = 0;
                let length = Math.max(edge.length, layout.minEdgeLength);
                if (dist > length) {
                    delta = length - dist;
                } else if (dist < layout.minEdgeLength) {
                    delta = layout.minEdgeLength - dist;
                }
                let force = delta * layout.edgeForce * dt;
                node.vx -= force * unitX * sign * 2;
                node.vy -= force * unitY * sign * 2;
            }
        }
    }
    // push apart nodes
    const targetDistSqr = layout.pushDistance * layout.pushDistance;
    const pushForce = layout.pushForce * layout.pushDistance;
    let otherNodes = graph.nodes.filter(v => !activeNodes.has(v))
    for (let a of activeNodes) {
        for (let b of otherNodes) {
            if (a !== b && !a.neighbors.has(b)) {
                let dx = b.x - a.x;
                let dy = b.y - a.y;
                let distSqr = dx * dx + dy * dy;
                if (distSqr < targetDistSqr) {
                    let force = (dt * pushForce) / distSqr;
                    a.vx -= force * dx * 2;
                    a.vy -= force * dy * 2;
                }
            }
        }
    }
}

export function settleNodes<T>(graph: Graph<T>, nodes: Set<GraphNode<unknown>>, layoutStyle: (t: number) => LayoutConfig, dt: number, iterations: number,
    customForces: ((dt: number, graph: Graph<T>) => unknown)[]) {
    let subgraph = filteredGraphView(graph, (v) => nodes.has(v))
    for (let i = 0; i < iterations; i++) {
        let layout = layoutStyle(1 - i / iterations)
        applyLayoutForcesOneSided(graph, layout, nodes, dt)
        applyLayoutForces(subgraph, layout, nodes, 0, 0, dt)
        for (let force of customForces) {
            force(dt, subgraph)
        }
        applyVelocityStep(graph.nodes, layout.dampening, dt)
    }
    for (let node of nodes) {
        node.vx = 0;
        node.vy = 0;
    }
}


// makes edge length at least the current distance
export function stretchEdgesToRelax(edges: GraphEdge<unknown>[]) {
    for (let edge of edges) {
        let dist = distance(edge.a, edge.b)
        edge.length = Math.max(edge.length, dist)
    }
}

export function stretchEdgesToFit(edges: GraphEdge<unknown>[]) {
    for (let edge of edges) {
        edge.length = distance(edge.a, edge.b)
    }
}

export class GraphLayoutPhysics<T> implements LayoutPhysics<T> {
    private lastNodes = new Set<GraphNode<unknown>>()
    constructor(
        private layoutStyle: LayoutConfig,
        private customForces: ((dt: number, graph: Graph<T>, w: number, h: number) => unknown)[] = []
    ) {}
    step(
        graph: Graph<T>,
        width: number,
        height: number,
        dt: number,
    ) {
        let activeNodes = findActiveNodes(graph, this.layoutStyle.sleepVelocity)
        for (let node of graph.nodes) {
            if (!this.lastNodes.has(node)) {
                activeNodes.add(node)
            }
        }
        this.lastNodes = new Set(graph.nodes);

        for (let custom of this.customForces) {
            custom(dt, graph, width, height);
        }

        applyVelocityStep(graph.nodes, this.layoutStyle.dampening, dt)
        applyLayoutForces(graph, this.layoutStyle, activeNodes, width, height, dt)
        // count at the end again, in case nodes started moving this step
        let activeNodesCount = activeNodes.size;
        activeNodesCount += findActiveNodes(graph, this.layoutStyle.sleepVelocity).size;
        return activeNodesCount;
    }
}
