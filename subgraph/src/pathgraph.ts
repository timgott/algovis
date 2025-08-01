import { createEdge, createEmptyGraph, createNode, Graph, GraphNode } from "../../localgraphs/src/graph"
import { DefaultMap } from "../../shared/defaultmap";

export function makeUnlabeledPathGraph(length: number): Graph<null> {
    let graph = createEmptyGraph<null>()
    createNode(graph, null)
    for (let i = 1; i < length; i++) {
        createNode(graph, null)
        createEdge(graph, graph.nodes[i-1], graph.nodes[i])
    }
    return graph
}

export function makeUnlabeledGraphFromEdges<V>(edges: [V,V][]): Graph<null> {
    let graph = createEmptyGraph<null>()
    let vertices = new DefaultMap<V, GraphNode<null>>(() => createNode(graph, null))
    for (let [a,b] of edges) {
        createEdge(graph, vertices.get(a), vertices.get(b))
    }
    return graph
}