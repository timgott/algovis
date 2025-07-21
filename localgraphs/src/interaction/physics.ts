import { assert } from "../../../shared/utils";
import { Graph, GraphNode } from "../graph";

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
        if (Math.abs(node.vx) + Math.abs(node.vy) >= sleepVelocity) {
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

    // pull together edges
    for (let edge of graph.edges) {
        if (edge.a !== edge.b) { // skip self-loops
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
            edge.a.vx -= force * unitX;
            edge.a.vy -= force * unitY;
            edge.b.vx += force * unitX;
            edge.b.vy += force * unitY;
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

export class GraphLayoutPhysics<T> implements LayoutPhysics<T> {
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
