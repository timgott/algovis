import { describe, expect, test, jest } from '@jest/globals';
import { applyRuleEverywhere, findRuleMatches, makeNegativeEdgesRuleFromGraph, makeSimpleRuleFromGraph } from './rule';
import { createGraphFromEdges, createPathGraph } from '../../localgraphs/src/interaction/examplegraph';
import { makeSubgraphMatcherWithNegative, simpleDataMatcher } from '../../subgraph/src/subgraph';
import { copyGraph, createEdge } from '../../localgraphs/src/graph';
import { findInjectiveMatchesGeneric } from '../../subgraph/src/matching';

describe("test makeRuleFromOperatorGraph", () => {
    test("simple rule pattern", () => {
        let testGraph = createGraphFromEdges([
            [1,2],
            [2,3]
        ])
        let rule = makeSimpleRuleFromGraph(testGraph, (x) => x.data == 1, (a,b) => a == b)
        expect(rule.pattern.nodes.map(v => v.data).sort()).toEqual([2,3])
    })
    test("simple rule application", () => {
        let ruleGraph = createGraphFromEdges([
            [1,2],
            [2,3]
        ])
        let rule = makeSimpleRuleFromGraph(ruleGraph, (x) => x.data == 1, (a,b) => a == b)
        let mainGraph = createGraphFromEdges([
            [2,3],
            [4,5]
        ])
        applyRuleEverywhere(mainGraph, rule)
        expect(mainGraph.nodes.map(v => v.data).sort()).toEqual([1,2,3,4,5])
        expect(mainGraph.edges.map(edge => [edge.a.data, edge.b.data]).sort()).toEqual(
            [[1,2],[2,3],[4,5]]
        )
    })
    test("bigger rule application", () => {
        let ruleGraph = createGraphFromEdges([
            [1,2],
            [2,3],
            [1,3],
            [3,4],
        ])
        let rule = makeSimpleRuleFromGraph(ruleGraph, (x) => x.data == 1 || x.data == 2, (a,b) => a == b)
        let mainGraph = createGraphFromEdges([
            [3,4],
            [4,5]
        ])
        applyRuleEverywhere(mainGraph, rule)
        expect(mainGraph.nodes.map(v => v.data).sort()).toEqual([1,2,3,4,5])
        expect(mainGraph.edges.map(edge => [edge.a.data, edge.b.data].sort()).sort()).toEqual(
            [[1,2],[1,3],[2,3],[3,4],[4,5]]
        )
    })
    test("negative edges subgraph", () => {
        let [pattern] = createPathGraph(["a", "b", "c"])
        let matcher = makeSubgraphMatcherWithNegative(simpleDataMatcher((a,b) => a==b), [[pattern.nodes[0],pattern.nodes[2]]])

        let graph = copyGraph(pattern)
        expect(findInjectiveMatchesGeneric(graph.nodes, pattern.nodes, matcher)).toHaveLength(1)
        createEdge(graph, graph.nodes[0], graph.nodes[2])
        expect(findInjectiveMatchesGeneric(graph.nodes, pattern.nodes, matcher)).toHaveLength(0)
    })
    test("negative edges subgraph symm", () => {
        let [pattern, [a, b, c]] = createPathGraph(["a", "b", "c"])
        let matcher = makeSubgraphMatcherWithNegative(simpleDataMatcher((a,b) => a==b), [[c,a]])
        
        let graph = copyGraph(pattern)
        expect(findInjectiveMatchesGeneric(graph.nodes, pattern.nodes, matcher)).toHaveLength(1)
        createEdge(graph, a, c)
        expect(findInjectiveMatchesGeneric(graph.nodes, pattern.nodes, matcher)).toHaveLength(0)
    })
    test("negative edges rule", () => {
        let [pattern, [a, b, c]] = createPathGraph(["a", "b", "c"])
        let rule = makeNegativeEdgesRuleFromGraph(pattern, () => false, (x,y) => x==y, [[a,c]])

        // test without modification
        let [graph, [a2, b2, c2]] = createPathGraph(["a", "b", "c"])
        expect(findRuleMatches(graph, rule)).toHaveLength(1)

        // now test negative edge
        createEdge(graph, a2, c2)
        expect(findRuleMatches(graph, rule)).toHaveLength(0)
    })
})