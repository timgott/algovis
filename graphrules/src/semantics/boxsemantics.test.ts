import { describe, expect, test, jest } from '@jest/globals';
import { createPathGraph } from '../../../localgraphs/src/interaction/examplegraph';
import { Graph, GraphNode } from '../../../localgraphs/src/graph';
import { defaultNodeData, BoxState, UiNodeData } from './state';
import { Label, OPERATOR_CONNECT, OPERATOR_NEW, SYMBOL_BOX_INSIDE, SYMBOL_GLOBAL_ROOT, SYMBOL_RULE_INSERTION, SYMBOL_RULE_ROOT, SYMBOL_RULE_NONEDGE, SYMBOL_RULE_PATTERN, SYMBOL_BOX_CENTER, SYMBOL_BOX_OUTSIDE } from '../semantics/symbols';
import { Rect } from '../../../shared/rectangle';
import { makeVirtualGraphEmbedding, makeVirtualGraphToRealInserter, VirtualNode } from '../semantics/boxsemantics';
import { ensured } from '../../../shared/utils';
import { findRuleMatches } from '../semantics/rule/patternmatching';
import { parseRule } from '../semantics/rule/parse_rulegraph';
import { applyRule } from '../semantics/rule/rule_application';

function createPathGraphFromLabels(labels: Label[]): [Graph<UiNodeData>, GraphNode<UiNodeData>[]] {
    return createPathGraph(labels.map(label => ({...defaultNodeData, label})))
}
function createTestBoxForGraph(graph: Graph<unknown>): BoxState {
    return {
        bounds: Rect.fromPoints(graph.nodes),
        borderColor: "red",
        resizing: false,
    }
}

describe("test virtual graph", () => {
    test("simple box graph with nodes a and b", () => {
        let [ruleGraph, ruleGraphNodes] = createPathGraphFromLabels(["a", "b"])
        let ruleBox = createTestBoxForGraph(ruleGraph)
        let emb = makeVirtualGraphEmbedding(ruleGraph, [ruleBox])
        // Graph should look like:
        //
        // outside
        // - center
        //   - inside
        //     - a
        //     - b
        let actualLabels = [...emb.virtualGraph.allNodes()].map(vnode => emb.virtualGraph.label(vnode))
        let expectedLabels = [
            "a",
            "b",
            SYMBOL_BOX_CENTER, SYMBOL_BOX_OUTSIDE, SYMBOL_BOX_INSIDE
        ]
        expect(actualLabels.toSorted()).toEqual(expectedLabels.toSorted())
        expect(emb.virtualGraph.allNodes().size).toEqual(2+3) // normal nodes + connectors
        let [mappedA, mappedB] = ruleGraphNodes.map(v => ensured(emb.nodeMapping.get(v)!))
        let boxMapping = emb.boxMapping.get(ruleBox)!
        expect(emb.virtualGraph.neighbors(boxMapping.outside)).toEqual(new Set([boxMapping.center]))
        expect(emb.virtualGraph.neighbors(boxMapping.center)).toEqual(new Set([boxMapping.outside, boxMapping.inside]))
        expect(emb.virtualGraph.neighbors(boxMapping.inside)).toEqual(new Set([mappedA, mappedB, boxMapping.center]))
        expect(emb.virtualGraph.neighbors(mappedA)).toEqual(new Set([boxMapping.inside, mappedB]))
        expect(emb.virtualGraph.neighbors(mappedB)).toEqual(new Set([boxMapping.inside, mappedA]))
    })
})
