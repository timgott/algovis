import { copySubgraphTo, createEdge, createEmptyGraph, deleteNode, filteredGraphView, Graph, GraphEdge, GraphNode, mapSubgraphTo, NodeDataTransfer } from "../../localgraphs/src/graph"
import { bfs, dfsWalkArbitrary, SearchState } from "../../localgraphs/src/graphalgos"
import { stretchEdgesToRelax } from "../../localgraphs/src/interaction/physics"
import { assert, max, randomUniform } from "../../shared/utils"
import { distance, Positioned, vec, Vector } from "../../shared/vector"
import { findInjectiveMatchesGeneric, GenericMatcher, verifyInjectiveMatchGeneric } from "../../subgraph/src/matching"
import { ContextDataMatcher, DataMatcher, findSubgraphMatchesWithContext, makeSubgraphMatcher, MatchWithContext, simpleDataMatcher, SubgraphMatcher } from "../../subgraph/src/subgraph"
import { placeNewNodesBetweenOld } from "./placement"

export type PatternRule<S,T,C> = {
    pattern: Graph<S>,
    matcher: GenericMatcher<GraphNode<S>,GraphNode<T>,C>,
    apply: (graph: Graph<T>, match: MatchWithContext<T,C>) => unknown
}

export function findRuleMatches<T,S,C>(graph: Graph<T>, rule: PatternRule<S,T,C>): MatchWithContext<T, C>[] {
    return findInjectiveMatchesGeneric(graph.nodes, rule.pattern.nodes, rule.matcher)
}

export function isRuleMatch<T,S,C>(match: MatchWithContext<T, C>, rule: PatternRule<S,T,C>): boolean {
    return verifyInjectiveMatchGeneric(match, rule.matcher)
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

// operator = node to be inserted
export function makeRuleFromOperatorGraph<S,T,C>(ruleGraph: Graph<S>, isOperator: (x: GraphNode<S>) => boolean, matcher: SubgraphMatcher<S,T,C>, cloner: NodeDataCloner<S,T,C>): PatternRule<S, T, C> {
    // pattern is graph without operators
    // TODO: rework this such that node neighbor set is also changed. Currently
    // the matchers rely on the node identity too much so we cannot copy them easily.
    let pattern = filteredGraphView(ruleGraph, n => !isOperator(n))
    //let graphCopy = structuredClone(ruleGraph)
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
    //let pattern = graphCopy
    //let operatorNodes = pattern.nodes.filter(n => isOperator(n))
    // reorder subgraph for performance
    //pattern.nodes = dfsWalkArbitrary(pattern.nodes)
    return {
        pattern,
        matcher,
        apply(graph, {embedding, context}) {
            let insertedToHostMap = mapSubgraphTo(insertedNodes, graph, cloner.transferUnifiedTargetData(context))
            // create edges between inserted nodes and invariant nodes
            let newEdges = []
            for (let edge of betweenEdges) {
                let hostA = insertedToHostMap.get(edge.a)!
                let hostB = embedding.get(edge.b)!
                let length = distance(edge.a, edge.b) // more intuitive than edge.length
                newEdges.push(createEdge(graph, hostA, hostB, length))
            }
            // place inserted nodes at average position of their neighbors
            placeNewNodesBetweenOld(insertedToHostMap.values(), embedding.values())
            stretchEdgesToRelax(newEdges)
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