export type GraphNode<T> = {
    data: T
    x: number
    y: number
    vx: number
    vy: number
    neighbors: Set<GraphNode<T>>
}

export type GraphEdge<T> = {
    a: GraphNode<T>
    b: GraphNode<T>
}

export type Graph<T> = {
    nodes: GraphNode<T>[]
    edges: GraphEdge<T>[]
}

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
        let dist = Math.sqrt(dx*dx+dy*dy)
        console.assert(dist > 0, "Points on same spot")
        let unitX = dx/dist
        let unitY = dy/dist
        let force = (layout.edgeLength - dist) * layout.edgeForce * dt
        edge.a.vx -= force * unitX
        edge.a.vy -= force * unitY
        edge.b.vx += force * unitX
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
                a.vy -= force * dy
                b.vx += force * dx
                b.vy += force * dy
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

export function drawGraph(ctx: CanvasRenderingContext2D, graph: Graph<unknown>, layout: LayoutConfig) {
    // edges
    for (let edge of graph.edges) {
      ctx.beginPath();
      ctx.lineWidth = layout.nodeRadius / 3
      ctx.moveTo(edge.a.x, edge.a.y)
      ctx.lineTo(edge.b.x, edge.b.y)
      ctx.stroke()
      ctx.closePath()
    }

    // nodes
    for (let node of graph.nodes) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, layout.nodeRadius, 0, Math.PI * 2);
        //ctx.fillStyle = 'blue';
        ctx.fill();
        ctx.closePath();
    }
}

export function findClosestNode(x: number, y: number, graph: Graph<unknown>) {
  let result = graph.nodes[0]
  let minDistance = Number.POSITIVE_INFINITY
  for (let node of graph.nodes) {
    let dx = (node.x - x)
    let dy = (node.y - y)
    let dist = dx*dx + dy*dy
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

export function createEmptyGraph<T>(): Graph<T> {
    return {
        nodes: [],
        edges: []
    }
}

export function createNode<T>(graph: Graph<unknown>, data: T, x: number = 0, y: number = 0): GraphNode<T> {
    const node = {
        data: data,
        x: x,
        y: y,
        vx: 0,
        vy: 0,
        neighbors: new Set<GraphNode<T>>()
    }
    graph.nodes.push(node)
    return node
}

export function createEdge(graph: Graph<unknown>, a: GraphNode<unknown>, b: GraphNode<unknown>) {
    console.assert(!a.neighbors.has(b))
    console.assert(!b.neighbors.has(a))
    graph.edges.push({a: a, b: b})
    a.neighbors.add(b)
    b.neighbors.add(a)
}

export function createRandomGraph(size: number, edgesPerNode: number): Graph<null> {
    let graph = createEmptyGraph<null>()
    createNode(graph, null)
    for (let i=0; i < size; i++) {
        let node = createNode(graph, null)
        for (let j=0; j < edgesPerNode; j++) {
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
    for (let i=0; i < size; i++) {
        for (let j=0; j < size; j++) {
            let node = createNode(graph, null, i*layout.edgeLength, j*layout.edgeLength)
            if (i > 0) {
                createEdge(graph, node, graph.nodes[(i-1)*size+j])
            }
            if (j > 0) {
                createEdge(graph, node, graph.nodes[i*size+j-1])
            }
        }
    }
    return graph
}