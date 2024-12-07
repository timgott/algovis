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

export function createEdge<T>(graph: Graph<T>, a: GraphNode<T>, b: GraphNode<T>, length?: number) {
    console.assert(!a.neighbors.has(b))
    console.assert(!b.neighbors.has(a))
    const edge = {
        a: a,
        b: b,
        length: length ?? Math.hypot(a.x - b.x, a.y - b.y)
    }
    graph.edges.push(edge)
    a.neighbors.add(b)
    b.neighbors.add(a)
    return edge
}

export function clearAllEdges<T>(graph: Graph<T>) {
    for (let node of graph.nodes) {
        node.neighbors.clear()
    }
    graph.edges = []
}

export function clearNeighbors<T>(graph: Graph<T>, node: GraphNode<T>) {
    for (let neighbor of node.neighbors) {
        neighbor.neighbors.delete(node)
    }
    node.neighbors.clear()
    graph.edges = graph.edges.filter(e => e.a !== node && e.b !== node)
}

export function deleteEdge<T>(graph: Graph<T>, a: GraphNode<T>, b: GraphNode<T>) {
    graph.edges = graph.edges.filter(e => !(e.a === a && e.b === b) && !(e.a === b && e.b === a))
    a.neighbors.delete(b)
    b.neighbors.delete(a)
}

export function deleteNode<T>(graph: Graph<T>, node: GraphNode<T>) {
    clearNeighbors(graph, node)
    graph.nodes = graph.nodes.filter(n => n !== node)
}

export type NodeDataTranster<S,T> = (data: S, nodeMap: Map<GraphNode<S>, GraphNode<T>>) => T

// copies the given nodes with data transformed by mapping and the edges between them to targetGraph
// returns a map from old nodes to new nodes
export function mapSubgraphTo<S,T>(nodes: Iterable<GraphNode<S>>, targetGraph: Graph<T>, mapping: (value: S, nodeMap: Map<GraphNode<S>,GraphNode<T>>) => T): Map<GraphNode<S>, GraphNode<T>> {
    let nodeMap = new Map<GraphNode<S>, GraphNode<T>>()
    for (let node of nodes) {
        // translate node
        let newNode = createNode(targetGraph, undefined as T, node.x, node.y, node.vx, node.vy)
        nodeMap.set(node, newNode)

        // translate edge (only if other node is already translated)
        for (let neighbor of node.neighbors) {
            let otherNewNode = nodeMap.get(neighbor)
            if (otherNewNode !== undefined) {
                createEdge(targetGraph, newNode, otherNewNode)
            }
        }
    }
    for (let [old, node] of nodeMap) {
        node.data = mapping(old.data, nodeMap)
    }
    return nodeMap
}


// copies the given nodes and the edges between them to targetGraph
// returns a map from old nodes to new nodes
export function copySubgraphTo<T>(nodes: Iterable<GraphNode<T>>, targetGraph: Graph<T>, copyData: NodeDataTranster<T,T> = x => structuredClone(x)): Map<GraphNode<T>, GraphNode<T>> {
    return mapSubgraphTo(nodes, targetGraph, copyData)
}

// copies the entire graph into targetGraph
export function copyGraphTo<T>(source: Graph<T>, target: Graph<T>, copyData?: NodeDataTranster<T,T>): Map<GraphNode<T>, GraphNode<T>> {
    return copySubgraphTo(source.nodes, target, copyData)
}

export function copyGraph<T>(graph: Graph<T>, copyData?: NodeDataTranster<T,T>) {
    let result = createEmptyGraph<T>()
    copyGraphTo(graph, result, copyData)
    return result
}

// returns a new graph containing the given nodes and the edges between them
export function extractSubgraph<T>(nodes: Iterable<GraphNode<T>>, copyData?: NodeDataTranster<T,T>): [Graph<T>, Map<GraphNode<T>, GraphNode<T>>] {
    let subgraph = createEmptyGraph<T>()
    let map = copySubgraphTo(nodes, subgraph, copyData)
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

export type MappedNode<S, T> = GraphNode<T> & {
    get data(): T;
    originalNode: GraphNode<S>;
}
export function mapGraphLazy<S,T>(graph: Graph<S>, mapping: (value: S) => T): [Graph<T>, (node: GraphNode<S>) => MappedNode<S, T>] {
    let nodeMap = new Map<GraphNode<S>, MappedNode<S, T>>()
    function getNode(node: GraphNode<S>): MappedNode<S, T> {
        let result = nodeMap.get(node)
        if (result === undefined) {
            result = {
                ...node,
                get data() {
                    return mapping(node.data)
                },
                get neighbors() {
                    return node.neighbors.map(getNode)
                },
                originalNode: node
            }
            nodeMap.set(node, result)
        }
        return result
    }
    function getEdge(edge: GraphEdge<S>): GraphEdge<T> {
        return {
            ...edge,
            get a() {
                return getNode(edge.a)
            },
            get b() {
                return getNode(edge.b)
            }
        }
    }
    let errorGraph: Graph<T> = {
        get nodes(): GraphNode<T>[] {throw new Error("not implemented")},
        get edges(): GraphEdge<T>[] {throw new Error("not implemented")},
    }
    return [errorGraph, getNode]
}
