import { copyGraph, copyGraphTo, copySubgraphTo, createEdge, createEmptyGraph, deleteNode, extractSubgraph, filteredGraphView, Graph, GraphEdge, GraphNode, mapSubgraphTo, NodeDataTransfer, partitionGraph } from "../../localgraphs/src/graph"
import { bfs, dfsWalkArbitrary, SearchState } from "../../localgraphs/src/graphalgos"
import { stretchEdgesToRelax } from "../../localgraphs/src/interaction/physics"
import { assert, ensured, mapPair, max, randomUniform } from "../../shared/utils"
import { distance, Positioned, vec, Vector } from "../../shared/vector"
import { findAllInjectiveMatchesGeneric as findInjectiveMatchesGeneric, GenericMatcher, verifyInjectiveMatchGeneric } from "../../subgraph/src/matching"
import { ContextDataMatcher, DataMatcher, findSubgraphMatchesWithContext, makeSubgraphMatcher, makeSubgraphMatcherWithNegative, MatchWithContext, simpleDataMatcher, SubgraphMatcher } from "../../subgraph/src/subgraph"
import { placeNewNodesBetweenOld } from "./placement"

export type PatternRule<S,T,C> = {
    pattern: Graph<S>,
    matcher: GenericMatcher<GraphNode<S>,GraphNode<T>,C>,
    apply: (graph: Graph<T>, match: MatchWithContext<T,C>) => unknown
}

export function findAllRuleMatches<T,S,C>(graph: Graph<T>, rule: PatternRule<S,T,C>): MatchWithContext<T, C>[] {
    return [...findInjectiveMatchesGeneric(graph.nodes, rule.pattern.nodes, rule.matcher)]
}

export function findFirstRuleMatch<T,S,C>(graph: Graph<T>, rule: PatternRule<S,T,C>): MatchWithContext<T, C> | null {
    let result = findInjectiveMatchesGeneric(graph.nodes, rule.pattern.nodes, rule.matcher).next()
    if (result.done) {
        return null
    } else {
        return result.value
    }
}

export function isRuleMatch<T,S,C>(match: MatchWithContext<T, C>, rule: PatternRule<S,T,C>): boolean {
    return verifyInjectiveMatchGeneric(match, rule.matcher)
}

// useful if the rule does not make new patterns appear (no recursion)
export function applyRuleEverywhere<T,S,C>(graph: Graph<T>, rule: PatternRule<S,T,C>): void {
    let matches = findAllRuleMatches(graph, rule)
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

export function makeInsertionRule<S,T,C>(pattern: Graph<S>, insertedSubgraph: Graph<S>, betweenEdges: GraphEdge<S>[], matcher: SubgraphMatcher<S,T,C>, cloner: NodeDataCloner<S,T,C>): PatternRule<S,T,C> {
    return {
        pattern,
        matcher,
        apply: makeInsertionApplyFun(insertedSubgraph.nodes, betweenEdges, cloner)
    }
}

function makeInsertionApplyFun<S,T,C>(insertedSubgraph: GraphNode<S>[], betweenEdges: GraphEdge<S>[], cloner: NodeDataCloner<S,T,C>)
    : (graph: Graph<T>, match: MatchWithContext<T,C>) => void {
    return (graph, {embedding, context}) => {
        let insertedToHostMap = mapSubgraphTo(insertedSubgraph, graph, cloner.transferUnifiedTargetData(context))
        // create edges between inserted nodes and invariant nodes
        let newEdges = []
        for (let edge of betweenEdges) {
            let [a, b] = [edge.a, edge.b];
            if (!insertedToHostMap.has(a)) {
                [b, a] = [a, b]
            }
            let hostA = insertedToHostMap.get(a)!
            let hostB = embedding.get(b)!
            let length = distance(a, b) // more intuitive than edge.length
            newEdges.push(createEdge(graph, hostA, hostB, length))
        }
        // place inserted nodes at average position of their neighbors
        placeNewNodesBetweenOld(insertedToHostMap.values(), embedding.values())
        stretchEdgesToRelax(newEdges)
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
    let partition = partitionGraph(ruleGraph, new Set(ruleGraph.nodes.filter(v => !isOperator(v))))
    return makeInsertionRule(partition.inside, partition.outside, partition.betweenEdges, matcher, makeStructuredNodeCloner())
}

export function makeNegativeEdgesRuleFromGraph<T>(ruleGraph: Graph<T>, isOperator: (x: GraphNode<T>) => boolean, isMatch: DataMatcher<T, T>, negativeEdges: [GraphNode<T>, GraphNode<T>][]) {
    let partition = partitionGraph(ruleGraph, new Set(ruleGraph.nodes.filter(v => !isOperator(v))))
    let negativeEdgesInPattern = negativeEdges.map(mapPair(x => ensured(partition.insideMap.get(x))))
    let patternNodes = new Set(partition.inside.nodes)
    negativeEdgesInPattern.forEach(([a,b]) => assert(patternNodes.has(a) && patternNodes.has(b), "invalid negative edges"))
    let matcher = makeSubgraphMatcherWithNegative(simpleDataMatcher(isMatch), negativeEdgesInPattern)
    return makeInsertionRule(partition.inside, partition.outside, partition.betweenEdges, matcher, makeStructuredNodeCloner())
}
