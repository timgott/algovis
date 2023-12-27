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

export function createEmptyGraph<T>(): Graph<T> {
    return {
        nodes: [],
        edges: []
    }
}

export function createNode<T>(graph: Graph<T>, data: T, x: number = 0, y: number = 0): GraphNode<T> {
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
    const edge = { a: a, b: b }
    graph.edges.push(edge)
    a.neighbors.add(b)
    b.neighbors.add(a)
    return edge
}

export function copyGraph<T>(graph: Graph<T>) {
    let result = createEmptyGraph<T>()
    let nodeMap = new Map<GraphNode<T>, GraphNode<T>>()
    for (let node of graph.nodes) {
        let newNode = createNode(result, node.data, node.x, node.y)
        nodeMap.set(node, newNode)
    }
    for (let edge of graph.edges) {
        let newA = nodeMap.get(edge.a)!
        let newB = nodeMap.get(edge.b)!
        createEdge(result, newA, newB)
    }
    return result
}