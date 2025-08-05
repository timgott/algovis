import { DefaultMap } from "../../../shared/defaultmap"
import { createEdge, createEmptyGraph, createNode, Graph, GraphNode } from "../graph"

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

export function createGridGraph(size: number, edgeLength: number): Graph<null> {
    let graph = createEmptyGraph<null>()
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            let node = createNode(graph, null, i * edgeLength, j * edgeLength)
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

export function createRegularTree(depth: number, degree: number): Graph<null> {
    let graph = createEmptyGraph<null>()
    let root = createNode(graph, null)
    let lastLayer = [root]
    while (depth > 0) {
        let newLayer: GraphNode<null>[] = []
        for (let parent of lastLayer) {
            for (let i = 0; i < degree - 1; i++) {
                let child = createNode(graph, null)
                createEdge(graph, parent, child)
                newLayer.push(child)
            }
        }
        depth--;
        lastLayer = newLayer;
    }
    return graph
}

export function createGraphFromEdges<V>(edges: [V,V][]): Graph<V> {
    let graph = createEmptyGraph<V>()
    let vertices = new DefaultMap<V, GraphNode<V>>((key: V) => createNode(graph, key))
    for (let [a,b] of edges) {
        createEdge(graph, vertices.get(a), vertices.get(b))
    }
    return graph
}

export function createPathGraph<T>(datas: T[]): [Graph<T>, GraphNode<T>[]] {
    let graph = createEmptyGraph<T>()
    let last: GraphNode<T> | null = null
    for (let v of datas) {
        let node = createNode(graph, v)
        if (last !== null) {
            createEdge(graph, node, last)
        }
        last = node
    }
    return [graph, graph.nodes]
}