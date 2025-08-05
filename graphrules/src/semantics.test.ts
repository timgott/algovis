import { describe, expect, test, jest } from '@jest/globals';
import { applyRuleEverywhere, makeRuleFromOperatorGraph, makeSimpleRuleFromGraph, NodeDataCloner } from './reduction';
import { createGraphFromEdges } from '../../localgraphs/src/interaction/examplegraph';
import { ContextMatcher } from '../../subgraph/src/subgraph';
import { GraphNode, NodeDataTransfer } from '../../localgraphs/src/graph';
import { extractVarRuleFromNodes, OPERATOR_NEW } from './semantics';

describe("test extractVarRuleFromNodes", () => {
    test("simple rule pattern", () => {
        let a = {label: "A"}
        let b = {label: "B"}
        let c = {label: "C"}
        let n = {label: OPERATOR_NEW}
        let testGraph = createGraphFromEdges([
            [a,b],
            [b,c],
            [c,n]
        ])
        let rule = extractVarRuleFromNodes(testGraph.nodes, {label: ""})
        expect(rule.pattern.nodes.map(v => v.data.label).sort()).toEqual(["A", "B"])
    })
})