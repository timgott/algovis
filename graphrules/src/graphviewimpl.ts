// default implementations

import { Graph, GraphNode } from "../../localgraphs/src/graph"
import { collectBinsSets } from "../../shared/defaultmap"
import { edgesFromSymmNeighborMap, ensured, mapFromFunction, neighborMapFromEdges, unionAll } from "../../shared/utils"
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

// shortcut
export function makeLabeledGraphFromEdges<V,L>(nodes: Iterable<V>, edges: Iterable<[V,V]>, labelFun: (node: V) => L): LabeledGraph<V,L> {
    return makeLabeledGraphFromFingraph(makeFinGraphFromNodesEdges(nodes, edges), labelFun)
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

export function collectDirectedSubgraphNodes<V,L>(graph: LabeledGraph<V,L>, roots: Iterable<V>, labelCycle: readonly Set<L>[]): Set<V> {
    let nodes = new Set<V>()
    let currentLayer: V[] = [...roots]
    let i = 0
    let orderLabels = unionAll(labelCycle)
    while (currentLayer.length > 0) {
        let nextLayer: V[] = []
        for (let layerNode of currentLayer) {
            for (let neighbor of graph.neighbors(layerNode)) {
                let label = graph.label(neighbor)
                if (!orderLabels.has(label)) {
                    // normal node, does not recurse to next layer
                    nodes.add(neighbor)
                } else if (labelCycle[i].has(label)) {
                    // continue along cycle
                    nextLayer.push(neighbor)
                }
            }
        }
        for (let node of nextLayer) {
            nodes.add(node)
        }
        currentLayer = nextLayer
        i += 1
        i %= labelCycle.length
    }
    return nodes
}

function insertNode<V>(graph: FinGraph<V>, node: V, neighbors: V[]): FinGraph<V> {
    let nodes = new Set(graph.allNodes())
    nodes.add(node)
    let edges = [...graph.enumerateEdges(), ...neighbors.map(nb => [node, nb] as [V,V])]
    return makeFinGraphFromNodesEdges(nodes, edges)
}

// TODO: neighbors in set accessor
export function makeDirectedSubgraphAccessor<V,L>(graph: LabeledGraph<V,L>): DirectedSubgraphAccessor<V, L, LabeledGraph<V,L>> {
    return {
        getDirectedSubgraph(root: V, labelCycle: Set<L>[], replaceRoot?: V | undefined): LabeledGraph<V, L> {
            let nodes = collectDirectedSubgraphNodes(graph, [root], labelCycle)
            let subgraph = inducedSubgraph(nodes, graph)
            if (replaceRoot !== undefined) {
                subgraph = insertNode(subgraph, replaceRoot, [...graph.neighbors(root).intersection(nodes)])
            }
            return makeLabeledGraphFromFingraph(subgraph, graph.label)
        }
    }
}

export function makeParserGraphAccessor<V,L>(graph: LabeledGraph<V,L>): GraphWithParserAccess<V,L> {
    let cg = makeContainerGraphAccessor(graph)
    let ln = makeLabeledNeighborAccessor(graph)
    let ds = makeDirectedSubgraphAccessor(graph)
    return {
        ...graph,
        ...ln,
        ...cg,
        ...ds
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
