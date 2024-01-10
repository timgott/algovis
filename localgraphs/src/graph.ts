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
    length: number
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

export function createNode<T>(graph: Graph<T>, data: T, x: number = 0, y: number = 0, vx: number = 0, vy: number = 0): GraphNode<T> {
    const node = {
        data: data,
        x: x,
        y: y,
        vx: vx,
        vy: vy,
        neighbors: new Set<GraphNode<T>>()
    }
    graph.nodes.push(node)
    return node
}

export function createEdge(graph: Graph<unknown>, a: GraphNode<unknown>, b: GraphNode<unknown>) {
    console.assert(!a.neighbors.has(b))
    console.assert(!b.neighbors.has(a))
    const edge = {
        a: a,
        b: b,
        length: Math.hypot(a.x - b.x, a.y - b.y)
    }
    graph.edges.push(edge)
    a.neighbors.add(b)
    b.neighbors.add(a)
    return edge
}

// copies the given nodes with data transformed by mapping and the edges between them to targetGraph
// returns a map from old nodes to new nodes
export function mapSubgraphTo<S,T>(nodes: Iterable<GraphNode<S>>, targetGraph: Graph<T>, mapping: (value: S) => T): Map<GraphNode<S>, GraphNode<T>> {
    let nodeMap = new Map<GraphNode<S>, GraphNode<T>>()
    for (let node of nodes) {
        // translate node
        let newNode = createNode(targetGraph, mapping(node.data), node.x, node.y, node.vx, node.vy)
        nodeMap.set(node, newNode)

        // translate edge (only if other node is already translated)
        for (let neighbor of node.neighbors) {
            let otherNewNode = nodeMap.get(neighbor)
            if (otherNewNode !== undefined) {
                createEdge(targetGraph, newNode, otherNewNode)
            }
        }
    }
    return nodeMap
}


// copies the given nodes and the edges between them to targetGraph
// returns a map from old nodes to new nodes
export function copySubgraphTo<T>(nodes: Iterable<GraphNode<T>>, targetGraph: Graph<T>): Map<GraphNode<T>, GraphNode<T>> {
    return mapSubgraphTo(nodes, targetGraph, (value) => structuredClone(value))
}

// copies the entire graph into targetGraph
export function copyGraphTo<T>(source: Graph<T>, target: Graph<T>): Map<GraphNode<T>, GraphNode<T>> {
    return copySubgraphTo(source.nodes, target)
}

export function copyGraph<T>(graph: Graph<T>) {
    let result = createEmptyGraph<T>()
    copyGraphTo(graph, result)
    return result
}

// returns a new graph containing the given nodes and the edges between them
export function extractSubgraph<T>(nodes: Iterable<GraphNode<T>>): [Graph<T>, Map<GraphNode<T>, GraphNode<T>>] {
    let subgraph = createEmptyGraph<T>()
    let map = copySubgraphTo(nodes, subgraph)
    return [subgraph, map]
}

export function mapGraph<S,T>(graph: Graph<S>, mapping: (value: S) => T): [Graph<T>, Map<GraphNode<S>, GraphNode<T>>] {
    let result = createEmptyGraph<T>()
    let translation = mapSubgraphTo(graph.nodes, result, mapping)
    return [result, translation]
}

export function filteredGraphView<T>(graph: Graph<T>, predicate: (node: GraphNode<T>) => boolean): Graph<T> {
    let nodes = graph.nodes.filter(predicate)
    let nodesSet = new Set(nodes)
    let edges = graph.edges.filter(edge => nodesSet.has(edge.a) && nodesSet.has(edge.b))
    return {
        nodes: nodes,
        edges: edges
    }
}