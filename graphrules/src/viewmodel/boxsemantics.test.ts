import { describe, expect, test, jest } from '@jest/globals';
import { createPathGraph } from '../../../localgraphs/src/interaction/examplegraph';
import { Graph, GraphNode } from '../../../localgraphs/src/graph';
import { defaultNodeData, RuleBoxState, UiNodeData } from './state';
import { Label, OPERATOR_CONNECT, OPERATOR_NEW, SYMBOL_BOX_INSIDE, SYMBOL_GLOBAL_ROOT, SYMBOL_RULE_INSERTION, SYMBOL_RULE_META, SYMBOL_RULE_NEGATIVE, SYMBOL_RULE_PATTERN, SYMBOL_BOX_ROOT } from '../semantics/symbols';
import { Rect } from '../../../shared/rectangle';
import { makeVirtualGraphEmbedding, makeVirtualGraphToRealInserter, VirtualNode } from './boxsemantics';
import { ensured } from '../../../shared/utils';
import { findRuleMatches } from '../semantics/rule/patternmatching';
import { parseRule } from '../semantics/rule/parse_rulegraph';
import { applyRule } from '../semantics/rule/rule_application';

function createPathGraphFromLabels(labels: Label[]): [Graph<UiNodeData>, GraphNode<UiNodeData>[]] {
    return createPathGraph(labels.map(label => ({...defaultNodeData, label})))
}
function createTestBoxForGraph(graph: Graph<unknown>): RuleBoxState {
    return {
        bounds: Rect.fromPoints(graph.nodes),
        borderColor: "red",
        resizing: false,
    }
}

describe("test virtual graph", () => {
    test("new node rule graph", () => {
        let [ruleGraph, ruleGraphNodes] = createPathGraphFromLabels(["a", "b", OPERATOR_NEW])
        let ruleBox = createTestBoxForGraph(ruleGraph)
        let emb = makeVirtualGraphEmbedding(ruleGraph, [ruleBox])
        // Graph should look like:
        //
        // root
        // - meta
        // - pattern
        //   * a
        // - insertion
        //   * b
        //   * new
        // - negative
        let actualLabels = [...emb.virtualGraph.allNodes()].map(vnode => emb.virtualGraph.label(vnode))
        let expectedLabels = [
            "a",
            "b",
            OPERATOR_NEW,
            SYMBOL_GLOBAL_ROOT,
            SYMBOL_BOX_ROOT, SYMBOL_RULE_INSERTION, SYMBOL_RULE_META, SYMBOL_RULE_NEGATIVE, SYMBOL_RULE_PATTERN,
            SYMBOL_BOX_INSIDE
        ]
        expect(actualLabels.toSorted()).toEqual(expectedLabels.toSorted())
        expect(emb.virtualGraph.allNodes().size).toEqual(3+1+5+1) // pattern nodes + global root + rule root, connectors, contains
        let [mappedA, mappedB, mappedOp] = ruleGraphNodes.map(v => ensured(emb.nodeMapping.get(v)!))
        let boxMapping = emb.boxMapping.get(ruleBox)!
        expect(emb.virtualGraph.neighbors(boxMapping.root)).toEqual(new Set([emb.globalRoot, boxMapping.inside]))
        expect(emb.virtualGraph.neighbors(boxMapping.inside)).toEqual(new Set([...boxMapping.children.values(), boxMapping.root]))
        let patternNode = boxMapping.children.get(SYMBOL_RULE_PATTERN)!
        let insertionNode = boxMapping.children.get(SYMBOL_RULE_INSERTION)!
        expect(emb.virtualGraph.neighbors(patternNode).size).toEqual(2)
        expect(emb.virtualGraph.neighbors(patternNode)).toContain(mappedA)
        expect(emb.virtualGraph.neighbors(patternNode)).toContain(boxMapping.inside)
        expect(emb.virtualGraph.neighbors(insertionNode)).toEqual(new Set([mappedB, mappedOp, boxMapping.inside]))
        expect(emb.virtualGraph.neighbors(mappedA)).toEqual(new Set([patternNode, mappedB]))
        expect(emb.virtualGraph.neighbors(mappedB)).toEqual(new Set([insertionNode, mappedA, mappedOp]))
        expect(emb.virtualGraph.neighbors(mappedOp)).toEqual(new Set([insertionNode, mappedB]))
        //expect(emb.virtualGraph.neighbors(insertionNode)).toHaveLength(3)
        //expect(emb.virtualGraph.neighbors(insertionNode)).toContain(mappedB)
        //expect(emb.virtualGraph.neighbors(insertionNode)).toContain(mappedOp)
    })

    test("connect nodes rule graph", () => {
        let [ruleGraph, ruleGraphNodes] = createPathGraphFromLabels(["a", OPERATOR_CONNECT, "b"])
        let ruleBox = createTestBoxForGraph(ruleGraph)
        let emb = makeVirtualGraphEmbedding(ruleGraph, [ruleBox])
        // Graph should look like:
        //
        // root
        // - meta
        // - pattern
        //   * a
        //   * b
        // - insertion
        //   * con
        // - negative
        //   * con
        expect(emb.virtualGraph.allNodes().size).toBe(3+1+2+4) // pattern nodes + global root + rule root, rule inside, rule connectors
        let [mappedA, mappedOp, mappedB] = ruleGraphNodes.map(v => ensured(emb.nodeMapping.get(v)!))
        let boxMapping = emb.boxMapping.get(ruleBox)!
        expect(emb.virtualGraph.neighbors(boxMapping.inside)).toEqual(new Set([...boxMapping.children.values(), boxMapping.root]))
        let patternNode = boxMapping.children.get(SYMBOL_RULE_PATTERN)!
        let insertionNode = boxMapping.children.get(SYMBOL_RULE_INSERTION)!
        let negativeNode = boxMapping.children.get(SYMBOL_RULE_NEGATIVE)!
        expect(emb.virtualGraph.neighbors(patternNode)).toEqual(new Set([mappedA, mappedB, boxMapping.inside]))
        expect(emb.virtualGraph.neighbors(insertionNode)).toEqual(new Set([mappedOp, boxMapping.inside]))
        expect(emb.virtualGraph.neighbors(mappedA)).toEqual(new Set([patternNode, mappedOp]))
        expect(emb.virtualGraph.neighbors(mappedOp)).toEqual(new Set([insertionNode, mappedA, mappedB, negativeNode]))
        expect(emb.virtualGraph.neighbors(mappedB)).toEqual(new Set([patternNode, mappedOp]))
        //expect(emb.virtualGraph.neighbors(insertionNode)).toHaveLength(3)
        //expect(emb.virtualGraph.neighbors(insertionNode)).toContain(mappedB)
        //expect(emb.virtualGraph.neighbors(insertionNode)).toContain(mappedOp)
    })

    test("virtual graph edges", () => {
        let [testGraph, testGraphNodes] = createPathGraphFromLabels(["a", "b"])
        expect(testGraph.edges).toHaveLength(1)
        let testEmb = makeVirtualGraphEmbedding(testGraph, [])
        expect(testEmb.virtualGraph.countEdges()).toBe(3) // edges from global root to a and b
        expect([...testEmb.virtualGraph.enumerateEdges()]).toHaveLength(3)
    })
})

describe("test new-operator semantics", () => {
    const [ruleGraph, ruleGraphNodes] = createPathGraphFromLabels(["a", "b", OPERATOR_NEW])
    const ruleBox = createTestBoxForGraph(ruleGraph)
    const ruleEmb = makeVirtualGraphEmbedding(ruleGraph, [ruleBox])
    const rule = parseRule(ruleEmb.virtualGraph, ensured(ruleEmb.boxMapping.get(ruleBox)).root)
    const [ruleNodeA, ruleNodeB, ruleNodeOpNew]: VirtualNode[] = ruleGraphNodes.map(v => ensured(ruleEmb.nodeMapping.get(v)))

    test("parse rule", () => {
        expect(rule.insertion.allNodes().size).toBe(2)
        expect(rule.pattern.allNodes().size).toBe(2)
        expect(rule.pattern.nodesWithLabel("a").size).toBe(1)
        expect(rule.insertion.nodesWithLabel("b").size).toBe(1)
        expect(rule.insertion.nodesWithLabel(OPERATOR_NEW).size).toBe(1)
        expect([...rule.negativeEdges.neighbors(ruleNodeA)]).toHaveLength(0)
        expect(rule.freeVars.size).toBe(0)
    })

    test("rule no match", () => {
        let [testGraph, testGraphNodes] = createPathGraphFromLabels(["b"])
        let testEmb = makeVirtualGraphEmbedding(testGraph, [])
        let matches = [...findRuleMatches(rule, testEmb.virtualGraph)]
        expect(matches).toHaveLength(0)
    })

    test("rule no match (empty graph)", () => {
        let [testGraph, testGraphNodes] = createPathGraphFromLabels([])
        let testEmb = makeVirtualGraphEmbedding(testGraph, [])
        let matches = [...findRuleMatches(rule, testEmb.virtualGraph)]
        expect(matches).toHaveLength(0)
    })

    test("rule simple match", () => {
        let [testGraph, testGraphNodes] = createPathGraphFromLabels(["a"])
        let testEmb = makeVirtualGraphEmbedding(testGraph, [])
        let matches = [...findRuleMatches(rule, testEmb.virtualGraph)]
        expect(matches).toHaveLength(1)
    })

    test("rule dummy inserter", () => {
        let [testGraph, testGraphNodes] = createPathGraphFromLabels(["a"])
        let testEmb = makeVirtualGraphEmbedding(testGraph, [])
        let [testNodeA] = testGraphNodes.map(v => ensured(testEmb.nodeMapping.get(v)))
        let match = new Map([[ruleNodeA, testNodeA]])
        let inserter: ConnectingLabeledGraphInserter<string, Label, VirtualNode> = {
            insertNode: jest.fn((label: string) => label),
            insertEdge: jest.fn(),
            insertConnectingEdge: jest.fn(),
        }
        expect(testGraph.nodes.map(v => v.data.label).toSorted()).toEqual(["a"].toSorted())
        applyRule(rule, match, testEmb.virtualGraph.label, inserter)
        expect(inserter.insertNode).toHaveBeenCalledTimes(2)
        expect(inserter.insertNode).toHaveBeenCalledWith("b")
        expect(inserter.insertNode).toHaveBeenCalledWith(OPERATOR_NEW)
        expect(inserter.insertConnectingEdge).toHaveBeenCalledTimes(1)
        expect(inserter.insertConnectingEdge).toHaveBeenCalledWith(testNodeA, "b")
        expect(inserter.insertEdge).toHaveBeenCalledWith("b", OPERATOR_NEW)
        expect(inserter.insertEdge).toHaveBeenCalledTimes(1) // strong condition
    })

    test("rule graph inserter", () => {
        let [testGraph, testGraphNodes] = createPathGraphFromLabels(["a"])
        let testEmb = makeVirtualGraphEmbedding(testGraph, [])
        let [testNodeA] = testGraphNodes.map(v => ensured(testEmb.nodeMapping.get(v)))
        let match = new Map([[ruleNodeA, testNodeA]])
        let inserter = makeVirtualGraphToRealInserter(testGraph)
        expect(testGraph.nodes.map(v => v.data.label).toSorted()).toEqual(["a"].toSorted())
        applyRule(rule, match, testEmb.virtualGraph.label, inserter)
        expect(testGraph.nodes).toHaveLength(3)
        expect(testGraph.nodes.map(v => v.data.label).toSorted()).toEqual(["a", "b", OPERATOR_NEW].toSorted())
        expect(testGraph.edges).toHaveLength(2)
        expect(testGraph.edges.map(edge => [edge.a.data.label, edge.b.data.label].toSorted()).toSorted())
            .toEqual([["a", "b"], ["b", OPERATOR_NEW]].map(l => l.toSorted()).toSorted())
    })
})
