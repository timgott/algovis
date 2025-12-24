import { describe, expect, test, jest } from '@jest/globals';
import { createPathGraph, insertPathIntoGraph } from '../../../localgraphs/src/interaction/examplegraph';
import { createEmptyGraph, Graph, GraphNode } from '../../../localgraphs/src/graph';
import { defaultNodeData, RuleBoxState, UiNodeData } from './state';
import { Label, OPERATOR_CONNECT, OPERATOR_NEW, SYMBOL_BOX_INSIDE, SYMBOL_GLOBAL_ROOT, SYMBOL_RULE_INSERTION, SYMBOL_RULE_META, SYMBOL_RULE_NEGATIVE, SYMBOL_RULE_PATTERN, SYMBOL_BOX_ROOT, SYMBOL_IN, SYMBOL_OUT_STEP, SYMBOL_OUT_EXHAUSTED, SYMBOL_PROGRAM_POINTER, OPERATOR_SET } from '../semantics/symbols';
import { Rect } from '../../../shared/rectangle';
import { makeVirtualGraphEmbedding, makeVirtualGraphToRealInserter, VirtualNode } from '../semantics/boxsemantics';
import { ensured } from '../../../shared/utils';
import { findRuleMatches } from '../semantics/rule/patternmatching';
import { parseRule } from '../semantics/rule/parse_rulegraph';
import { applyRule } from '../semantics/rule/rule_application';
import { Positioned } from '../../../shared/vector';
import { filterNormalNodes, findPossibleActions, hasError, isControlInSymbol, iterPointedRules } from './controlflow';

function createPathGraphFromLabels(labels: Label[]): [Graph<UiNodeData>, GraphNode<UiNodeData>[]] {
    return createPathGraph(labels.map(label => ({...defaultNodeData, label})))
}
function insertPathFromLabels(graph: Graph<UiNodeData>, labels: Label[]): GraphNode<UiNodeData>[] {
    return insertPathIntoGraph(graph, labels.map(label => ({...defaultNodeData, label})))
}
function createTestBoxForGraph(nodes: Iterable<Positioned>): RuleBoxState {
    return {
        bounds: Rect.fromPoints(nodes),
        borderColor: "red",
        resizing: false,
    }
}

function moveOutsideBox(nodes: Iterable<Positioned>, box: RuleBoxState) {
    for (let v of nodes) {
        v.x = box.bounds.left - 10
        v.y = box.bounds.top - 10
    }
}

function makeTestGraph() {
    const graph = createEmptyGraph<UiNodeData>()
    const ruleContentNodes = insertPathFromLabels(graph, ["a", "b", OPERATOR_SET])
    const [pcNode, inNode, stepNode] = insertPathFromLabels(graph, [SYMBOL_PROGRAM_POINTER, SYMBOL_IN, SYMBOL_OUT_STEP])
    const [exNode] = insertPathFromLabels(graph, [SYMBOL_OUT_EXHAUSTED])
    const ruleBox = createTestBoxForGraph([...ruleContentNodes, inNode, stepNode, exNode])

    // move pc outside box
    moveOutsideBox([pcNode], ruleBox)

    return {
        graph,
        ruleContentNodes,
        pcNode, inNode, stepNode, exNode,
        ruleBox,
    }
}

describe("test actions and control flow", () => {

    test("graph has no error", () => {
        const g = makeTestGraph()
        const virtualEmb = makeVirtualGraphEmbedding(g.graph, [g.ruleBox])
        expect(hasError(virtualEmb.virtualGraph)).toBe(false)
    })

    test("filter normal nodes inNode", () => {
        const g = makeTestGraph()
        const virtualEmb = makeVirtualGraphEmbedding(g.graph, [g.ruleBox])
        const inVirtual = ensured(virtualEmb.nodeMapping.get(g.inNode))
        expect(filterNormalNodes([inVirtual])).toEqual([inVirtual])
    })
    test("graph pc neighbors", () => {
        const g = makeTestGraph()
        const virtualEmb = makeVirtualGraphEmbedding(g.graph, [g.ruleBox])
        const pcVirtual = ensured(virtualEmb.nodeMapping.get(g.pcNode))
        const inVirtual = ensured(virtualEmb.nodeMapping.get(g.inNode))
        const boxVirtuals = ensured(virtualEmb.boxMapping.get(g.ruleBox))
        const boxMeta = ensured(boxVirtuals.children.get(SYMBOL_RULE_META))
        const boxInside = ensured(boxVirtuals.inside)
        const boxRoot = ensured(boxVirtuals.root)
        const vgraph = virtualEmb.virtualGraph
        expect(isControlInSymbol(vgraph.label(inVirtual))).toBe(true)
        expect(vgraph.neighborsWithLabel(pcVirtual, SYMBOL_IN)).toEqual(new Set([inVirtual]))
        expect(vgraph.neighborsWithLabel(inVirtual, SYMBOL_RULE_META)).toEqual(new Set([boxMeta]))
        expect(vgraph.neighborsWithLabel(boxMeta, SYMBOL_BOX_ROOT)).toEqual(new Set([]))
        expect(vgraph.neighborsWithLabel(boxMeta, SYMBOL_BOX_INSIDE)).toEqual(new Set([boxInside]))
        expect(vgraph.neighborsWithLabel(boxInside, SYMBOL_BOX_ROOT)).toEqual(new Set([boxRoot]))
    })

    test("iterPointedRules", () => {
        const g = makeTestGraph()
        const virtualEmb = makeVirtualGraphEmbedding(g.graph, [g.ruleBox])
        const pcVirtual = ensured(virtualEmb.nodeMapping.get(g.pcNode))
        const l = [...iterPointedRules(virtualEmb.virtualGraph, pcVirtual)]
        expect(l).toHaveLength(1)
        expect(l[0].ruleRoot).toBe(virtualEmb.boxMapping.get(g.ruleBox)?.inside)
    })

    test("rule no match", () => {
        const g = makeTestGraph()
        const virtualEmb = makeVirtualGraphEmbedding(g.graph, [g.ruleBox])
        let actions = findPossibleActions(virtualEmb.virtualGraph)
        expect(actions).toHaveLength(1)
        expect(actions[0].kind === "exhausted").toBe(true)
        expect(actions[0].control.inNode).toBe(g.inNode)
        expect(actions[0].control.outNode).toBe(g.exNode)
        expect(actions[0].control.pointer).toBe(g.pcNode)
    })
})
