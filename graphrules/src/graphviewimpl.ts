// default implementations

import { Graph, GraphNode } from "../../localgraphs/src/graph"
import { collectBinsSets } from "../../shared/defaultmap"
import { edgesFromSymmNeighborMap, ensured, mapFromFunction, neighborMapFromEdges } from "../../shared/utils"
import { GraphWithParserAccess } from "./semantics/rule/parse_rulegraph"

export function extractBetweenEdges<V, W>(graph: FinGraph<V | W>, setA: ReadonlySet<V>, setB: ReadonlySet<W>): Map<V, Set<W>> {
    return mapFromFunction(
        setA,
        a => graph.neighbors(a).intersection(setB)
    )
}

export function makeFinGraphFromNodesEdges<V>(nodes: Iterable<V>, edges: Iterable<[V,V]>): FinGraph<V> {
    let neighbors = neighborMapFromEdges(edges)
    return makeFinGraphFromNodesNeighbors(nodes, neighbors)
}

// caller must pass a symmetric neighbors map!
export function makeFinGraphFromNodesNeighbors<V>(nodes: Iterable<V>, neighbors: Map<V,ReadonlySet<V>>): FinGraph<V> {
    let nodeSet = new Set(nodes)
    let edges = edgesFromSymmNeighborMap(neighbors)
    return {
        allNodes: () => nodeSet,
        countEdges: () => edges.length,
        enumerateEdges: () => edges,
        neighbors: (node: V) => neighbors.get(node) ?? new Set(),
    }
}

export function makeLabeledGraphFromFingraph<V,L>(fingraph: FinGraph<V>, labelFun: (node: V) => L): LabeledGraph<V,L> {
    let nodesByLabel = collectBinsSets(fingraph.allNodes(), x => [labelFun(x)])
    let labelByNode = mapFromFunction(fingraph.allNodes(), labelFun) // cache labels
    return {
    ...fingraph,
        nodesWithLabel: (label: L) => nodesByLabel.get(label),
        label: (node: V) => ensured(labelByNode.get(node))
    }
}

export function makeInfiniteUnconnectedGraph<V>(): BasicGraph<V> {
    return {
        neighbors: () => new Set(),
    }
}

export function inducedSubgraph<V,L>(nodes: ReadonlySet<V>, graph: FinGraph<V>): FinGraph<V> {
    let neighbors = extractBetweenEdges(graph, nodes, nodes)
    return makeFinGraphFromNodesNeighbors(nodes, neighbors)
}

export function inducedSubgraphLabeled<V,L>(nodes: ReadonlySet<V>, graph: LabeledGraph<V,L>): LabeledGraph<V,L> {
    return makeLabeledGraphFromFingraph(inducedSubgraph(nodes, graph), graph.label)
}

export function makeContainerGraphAccessor<V,L>(graph: LabeledGraph<V,L>): ContainerSubgraphAccessor<V, LabeledGraph<V,L>> {
    return {
        getContainerSubgraph(container: ContainerEdge<V>): LabeledGraph<V,L> {
            let nodes = new Set(graph.neighbors(container.inside))
            nodes.delete(container.outside)
            return inducedSubgraphLabeled(nodes, graph)
        }
    }
}

export function makeLabeledNeighborAccessor<V,L>(graph: LabeledGraph<V,L>): LabeledNeighborAccessor<V,L> {
    let neighborsByLabel = mapFromFunction(
        graph.allNodes(),
        node => collectBinsSets(graph.neighbors(node), x => [graph.label(x)])
    )
    return {
        neighborsWithLabel(node, label) {
            return ensured(neighborsByLabel.get(node)).get(label)
        }
    }
}

export function makeParserGraphAccessor<V,L>(graph: LabeledGraph<V,L>): GraphWithParserAccess<V,L> {
    return {
        ...graph,
        ...makeContainerGraphAccessor(graph),
        ...makeLabeledNeighborAccessor(graph)
    }
}

export function abstractifyGraph<T,L>(graph: Graph<T>, getLabel: (data: T) => L): LabeledGraph<GraphNode<T>, L> {
    return makeLabeledGraphFromFingraph(
        makeFinGraphFromNodesEdges(graph.nodes, graph.edges.map(edge => [edge.a, edge.b])),
        node => getLabel(node.data)
    )
}

export function abstractifyGraphSimple<L, T extends { label: L }>(graph: Graph<T>): LabeledGraph<GraphNode<T>, L> {
    return abstractifyGraph(graph, data => data.label)
}
