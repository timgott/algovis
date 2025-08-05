import { createEdge, createEmptyGraph, createNode, Graph } from "../../localgraphs/src/graph";
import { ensured, mapFromFunction, mapToIndex } from "../../shared/utils";

type FlatGraphNode<T> = [
    x: number,
    y: number,
    data: T,
    // velocity is unnecessary
]

type FlatGraphEdge = [
    a: number, // indices
    b: number,
    length: number,
]

export type FlatGraph<T> = {
    nodes: FlatGraphNode<T>[]
    edges: FlatGraphEdge[]
}

export function flattenGraph<T,S>(graph: Graph<T>, dataToJson: (data: T) => S): FlatGraph<S> {
    let indices = mapToIndex(graph.nodes)
    return {
        nodes: graph.nodes.map(node => ([
            Math.round(node.x),
            Math.round(node.y),
            dataToJson(node.data),
        ])),
        edges: graph.edges.map(edge => ([
            ensured(indices.get(edge.a)),
            ensured(indices.get(edge.b)),
            Math.round(edge.length)
        ]))
    }
}

export function unflattenGraph<T,S>(flat: FlatGraph<S>, jsonToData: (json: S) => T): Graph<T> {
    let graph = createEmptyGraph<T>()
    for (let [x, y, data] of flat.nodes) {
        createNode(graph, jsonToData(data), x, y)
    }
    for (let [a, b, length] of flat.edges) {
        createEdge(graph, graph.nodes[a], graph.nodes[b], length)
    }
    return graph
}

// TODO: validate json