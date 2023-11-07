export type GraphNode<T> = {
    data: T
    x: number
    y: number
    vx: number
    vy: number
}

export type GraphEdge<T> = {
    a: GraphNode<T>
    b: GraphNode<T>
}

type Graph<T> = {
    nodes: [GraphNode<T>]
    edges: [GraphEdge<T>]
}

type LayoutConfig = {
    edgeLength: number,
    targetDistance: number,
    pushForce: number,
    edgeForce: number,
    centeringForce: number,
}

function applyLayoutForces(graph: Graph<unknown>, layout: LayoutConfig, width: number, height: number, dt: number) {
    // pull together edges
    for (let edge of graph.edges) {
        let dx = edge.b.x - edge.a.x
        let dy = edge.b.y - edge.a.y
        let dist = Math.sqrt(dx*dx+dy*dy)
        let unitX = dx/dist
        let unitY = dy/dist
        let force = (layout.edgeLength - dist) * layout.edgeForce * dt
        edge.a.vx -= force * unitX
        edge.a.vy += force * unitY
        edge.b.vx -= force * unitX
        edge.b.vy += force * unitY
    }
    // push apart nodes
    let targetDistSqr = layout.targetDistance*layout.targetDistance
    for (let a of graph.nodes) {
        for (let b of graph.nodes) {
            let dx = b.x - a.x
            let dy = b.y - a.y
            let distSqr = dx*dx+dy*dy
            if (distSqr < targetDistSqr) { 
                let force = dt * layout.pushForce
                a.vx -= force * dx
                a.vy += force * dy
                b.vx -= force * dx
                b.vy += force * dy
            }
        }
    }
    // push nodes to center
    let centerX = width / 2
    let centerY = height / 2
    for (let node of graph.nodes) {
        let dx = node.x - centerX
        let dy = node.y - centerY
        node.vx -= dx * dt * layout.centeringForce
        node.vy += dy * dt * layout.centeringForce
    }
}
