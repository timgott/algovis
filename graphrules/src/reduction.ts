import { copySubgraphTo, createEdge, createEmptyGraph, deleteNode, Graph, GraphNode, mapSubgraphTo, NodeDataTransfer } from "../../localgraphs/src/graph"
import { findSubgraphMatches } from "../../subgraph/src/subgraph"

export type PatternRule<S,T,C> = {
    pattern: Graph<S>,
    apply: (graph: Graph<T>, embedding: Map<GraphNode<unknown>, GraphNode<T>>, context: C) => unknown
}

export function applyUnlabeledRule<T,S>(graph: Graph<T>, rule: PatternRule<S,T,null>): void {
    let matches = findSubgraphMatches(graph, rule.pattern, (a,b) => true)
    for (let match of matches) {
        rule.apply(graph, match, null)
    }
}

export function makeTestExplodeRule<T>(graph: Graph<null>): PatternRule<null, T, null> {
    return {
        pattern: graph,
        apply: (graph, embedding) => {
            embedding.forEach((hostNode, patternNode) => {
                deleteNode(graph, hostNode)
            })
        },
    }
}

export type NodeDataCloner<S,SU,C> = {
    copyPatternData: NodeDataTransfer<S,S>,
    copyUnifiedTargetData: (context: C) => NodeDataTransfer<S,SU>
}

export function makeRuleFromOperatorGraph<S,T,C>(ruleGraph: Graph<S>, isOperator: (x: GraphNode<S>) => boolean, cloner: NodeDataCloner<S,T,C>): PatternRule<S, T, C> {
    let invariantNodes = ruleGraph.nodes.filter(n => !isOperator(n))
    let pattern = createEmptyGraph<S>()
    let targetToPatternMap = copySubgraphTo(invariantNodes, pattern, cloner.copyPatternData)
    // find the nodes that have to be added and the edges that have to be created
    let insertedNodes = ruleGraph.nodes.filter(n => isOperator(n))
    let betweenEdges = insertedNodes.flatMap(a => {
        return [...a.neighbors].filter(b => !isOperator(b)).map(b => [a, b])
    })
    return {
        pattern: pattern,
        apply(graph, embedding, context) {
            let insertedToHostMap = mapSubgraphTo(insertedNodes, graph, cloner.copyUnifiedTargetData(context))
            // create edges between inserted nodes and invariant nodes
            for (let [a, b] of betweenEdges) {
                let hostA = insertedToHostMap.get(a)!
                let hostB = embedding.get(targetToPatternMap.get(b)!)!
                createEdge(graph, hostA, hostB)
            }
        }
    }
}
