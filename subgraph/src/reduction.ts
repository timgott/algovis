import { deleteNode, Graph, GraphNode } from "../../localgraphs/src/graph"
import { findSubgraphMatches } from "./subgraph"

export type Rule<S,T> = {
    pattern: Graph<S>,
    matcher: (a: S, b: T) => boolean,
    apply: (graph: Graph<T>, embedding: Map<GraphNode<unknown>, GraphNode<T>>) => unknown
}

export function applyRule<T,S>(graph: Graph<T>, rule: Rule<S,T>): void {
    let matches = findSubgraphMatches(graph, rule.pattern, rule.matcher)
    for (let match of matches) {
        rule.apply(graph, match)
    }
}

export function makeTestExplodeRule<T>(graph: Graph<null>): Rule<null, T> {
    return {
        pattern: graph,
        matcher: (a, b) => true, // ignore labels
        apply: (graph, embedding) => {
            embedding.forEach((hostNode, patternNode) => {
                deleteNode(graph, hostNode)
            })
        },
    }
}