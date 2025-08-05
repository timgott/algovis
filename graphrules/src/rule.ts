import { copySubgraphTo, createEdge, createEmptyGraph, deleteNode, filteredGraphView, Graph, GraphNode, mapSubgraphTo, NodeDataTransfer } from "../../localgraphs/src/graph"
import { bfs, SearchState } from "../../localgraphs/src/graphalgos"
import { assert } from "../../shared/utils"
import { distance, Positioned, vec, Vector } from "../../shared/vector"
import { findInjectiveMatchesGeneric, GenericMatcher } from "../../subgraph/src/matching"
import { ContextDataMatcher, DataMatcher, findSubgraphMatchesWithContext, makeSubgraphMatcher, MatchWithContext, simpleDataMatcher, SubgraphMatcher } from "../../subgraph/src/subgraph"

export type PatternRule<S,T,C> = {
    pattern: Graph<S>,
    matcher: GenericMatcher<GraphNode<S>,GraphNode<T>,C>,
    apply: (graph: Graph<T>, match: MatchWithContext<T,C>) => unknown
}

export function findRuleMatches<T,S,C>(graph: Graph<T>, rule: PatternRule<S,T,C>): MatchWithContext<T, C>[] {
    return findInjectiveMatchesGeneric(graph.nodes, rule.pattern.nodes, rule.matcher)
}

// useful if the rule does not make new patterns appear (no recursion)
export function applyRuleEverywhere<T,S,C>(graph: Graph<T>, rule: PatternRule<S,T,C>): void {
    let matches = findRuleMatches(graph, rule)
    for (let match of matches) {
        rule.apply(graph, match)
    }
}

const unlabeledMatcher = makeSubgraphMatcher<unknown, unknown, null>({
    check: (a, b) => true,
    updated: () => null,
    empty: () => null,
})

export function makeTestExplodeRule<T>(graph: Graph<null>): PatternRule<null, T, null> {
    return {
        pattern: graph,
        matcher: unlabeledMatcher,
        apply: (graph, {embedding}) => {
            embedding.forEach((hostNode, patternNode) => {
                deleteNode(graph, hostNode)
            })
        },
    }
}

export type NodeDataCloner<S,SU,C> = {
    transferUnifiedTargetData: (context: C) => NodeDataTransfer<S,SU>
}

function centerOfPoints(points: Iterable<Positioned>) {
    let sum = Vector.Zero;
    let count = 0;
    for (let point of points) {
        sum = Vector.add(sum, point)
        count += 1;
    }
    return Vector.scale(1.0 / count, sum);
}

function placeInCenterOf(node: GraphNode<unknown>, set: Iterable<Positioned>) {
    let center = centerOfPoints(set);
    node.x = center.x
    node.y = center.y
}

function placeNewNodesBetweenOld(newNodes: Iterable<GraphNode<unknown>>, oldNodes: Iterable<GraphNode<unknown>>) {
    let remaining = new Set(newNodes)
    let fixed = new Set(oldNodes)
    assert(fixed.size > 0, "at least one existing node required to place other nodes around")
    bfs([...oldNodes], (node, dist) => {
        if (remaining.has(node)) {
            // must have at least one placed neighbor because it is reached by bfs
            placeInCenterOf(node, node.neighbors.intersection(fixed))
            fixed.add(node)
            remaining.delete(node)
            return SearchState.Continue
        }
        return SearchState.Skip
    })
    for (let node of remaining) {
        placeInCenterOf(node, fixed)
    }
}

// operator = node to be inserted
export function makeRuleFromOperatorGraph<S,T,C>(ruleGraph: Graph<S>, isOperator: (x: GraphNode<S>) => boolean, matcher: SubgraphMatcher<S,T,C>, cloner: NodeDataCloner<S,T,C>): PatternRule<S, T, C> {
    let pattern = filteredGraphView(ruleGraph, n => !isOperator(n))
    // find the nodes that have to be added and the edges that have to be created
    let insertedNodes = ruleGraph.nodes.filter(n => isOperator(n))
    // use the edges such that we can transfer the edge length
    let betweenEdges = ruleGraph.edges.filter(edge => (isOperator(edge.a) != isOperator(edge.b)))
    // swap edges such that edge.a is an inserted node and edge.b is an invariant node
    for (let edge of betweenEdges) {
        if (isOperator(edge.b)) {
            let a = edge.a
            edge.a = edge.b
            edge.b = a
        }
    }
    return {
        pattern,
        matcher,
        apply(graph, {embedding, context}) {
            let insertedToHostMap = mapSubgraphTo(insertedNodes, graph, cloner.transferUnifiedTargetData(context))
            // create edges between inserted nodes and invariant nodes
            for (let edge of betweenEdges) {
                let hostA = insertedToHostMap.get(edge.a)!
                let hostB = embedding.get(edge.b)!
                let length = distance(edge.a, edge.b) // more intuitive than edge.length
                createEdge(graph, hostA, hostB, length)
            }
            // place inserted nodes at average position of their neighbors
            placeNewNodesBetweenOld(insertedToHostMap.values(), embedding.values())
        }
    }
}

export function makeStructuredNodeCloner<T>(): NodeDataCloner<T, T, null> {
    return {
        transferUnifiedTargetData: function (context: null): NodeDataTransfer<T, T> {
            return (data) => structuredClone(data)
        }
    }
}

export function makeSimpleRuleFromGraph<T>(ruleGraph: Graph<T>, isOperator: (x: GraphNode<T>) => boolean, isMatch: DataMatcher<T, T>) {
    let matcher = makeSubgraphMatcher(simpleDataMatcher(isMatch))
    return makeRuleFromOperatorGraph(ruleGraph, isOperator, matcher, makeStructuredNodeCloner())
}