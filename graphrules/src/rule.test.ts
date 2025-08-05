import { describe, expect, test, jest } from '@jest/globals';
import { applyRuleEverywhere, makeRuleFromOperatorGraph, makeSimpleRuleFromGraph, NodeDataCloner } from './rule';
import { createGraphFromEdges } from '../../localgraphs/src/interaction/examplegraph';
import { ContextMatcher } from '../../subgraph/src/subgraph';
import { GraphNode, NodeDataTransfer } from '../../localgraphs/src/graph';

describe("test makeRuleFromOperatorGraph", () => {
    test("simple rule pattern", () => {
        let testGraph = createGraphFromEdges([
            [1,2],
            [2,3]
        ])
        let rule = makeSimpleRuleFromGraph(testGraph, (x) => x.data == 1, (a,b) => a == b)
        expect(rule.pattern.nodes.map(v => v.data).sort()).toEqual([2,3])
        expect(rule.matcher.check(2,3, null)).toBe(false)
        expect(rule.matcher.check(2,2, null)).toBe(true)
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
})