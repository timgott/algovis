import { createEdge, createEmptyGraph, createNode, deleteEdge, deleteNode, Graph, GraphNode } from "../../../localgraphs/src/graph"
import { ensured } from "../../../shared/utils"
import { abstractifyGraphSimple, makeFinGraphFromNodesEdges, makeInfiniteUnconnectedGraph } from "../graphviewimpl"
import { UiNodeData } from "./state"
import { PatternGraph } from "./rule/rulegraph"
import { OPERATOR_CONNECT, OPERATOR_DEL, OPERATOR_DISCONNECT, OPERATOR_NEW, OPERATOR_SET, SYMBOL_GLOBAL_ROOT, WILDCARD_SYMBOL } from "./symbols"

export function createLabeledPathGraph(labels: string[]): [Graph<UiNodeData>, GraphNode<UiNodeData>[]] {
    let graph = createEmptyGraph<UiNodeData>()
    let last: GraphNode<UiNodeData> | null = null
    for (let v of labels) {
        let node = createNode(graph, { label: v })
        if (last !== null) {
            createEdge(graph, node, last)
        }
        last = node
    }
    return [graph, graph.nodes]
}

const ANY = WILDCARD_SYMBOL

export type ReductionRule<V=GraphNode<UiNodeData>> = {
    pattern: PatternGraph<V>
    apply(graph: Graph<UiNodeData>, embedding: Map<V,GraphNode<UiNodeData>>): void
}

type BasicReductionRuleSource = {
    pattern: Graph<UiNodeData>,
    apply(graph: Graph<UiNodeData>, embedding: Map<GraphNode<UiNodeData>,GraphNode<UiNodeData>>): void,
    freeVars?: string[],
    negativeEdges?: [GraphNode<UiNodeData>, GraphNode<UiNodeData>][],
}

function makeSimpleReductionRule(source: BasicReductionRuleSource): ReductionRule {
    return {
        pattern: {
            pattern: abstractifyGraphSimple(source.pattern),
            freeVars: new Set(source.freeVars ?? []),
            negativeEdges:
                source.negativeEdges !== undefined
                ? makeFinGraphFromNodesEdges(source.pattern.nodes, source.negativeEdges)
                : makeInfiniteUnconnectedGraph()
        },
        apply: source.apply
    }
}

// forces operators to be outside of rule boxes
function makeGlobalRootWithConnection(graph: Graph<UiNodeData>, operators: Iterable<GraphNode<UiNodeData>>) {
    let globalRoot = createNode(graph, { label: SYMBOL_GLOBAL_ROOT })
    for (let op of operators) {
        createEdge(graph, op, globalRoot)
    }
}

export function makeReductionRuleAssign(): ReductionRule {
    let [patternGraph, [opNode, argNode, targetNode]] = createLabeledPathGraph([OPERATOR_SET, "val", "target"])
    makeGlobalRootWithConnection(patternGraph, [opNode])
    return makeSimpleReductionRule({
        pattern: patternGraph,
        freeVars: ["val", "target"],
        apply(graph, embedding) {
            deleteNode(graph, ensured(embedding.get(opNode)))
            deleteNode(graph, ensured(embedding.get(argNode)))
            embedding.get(targetNode)!.data.label = embedding.get(argNode)!.data.label
        }
    })
}

export function makeReductionRuleDel(): ReductionRule {
    let [pattern, [opNode, argNode]] = createLabeledPathGraph([OPERATOR_DEL, ANY])
    makeGlobalRootWithConnection(pattern, [opNode])
    return makeSimpleReductionRule({
        pattern: pattern,
        apply(graph, embedding) {
            deleteNode(graph, embedding.get(opNode)!)
            deleteNode(graph, embedding.get(argNode)!)
        }
    })
}

export function makeReductionRuleNew(): ReductionRule {
    let [pattern, [opNode]] = createLabeledPathGraph([OPERATOR_NEW])
    makeGlobalRootWithConnection(pattern, [opNode])
    return makeSimpleReductionRule({
        pattern: pattern,
        apply(graph, embedding) {
            deleteNode(graph, embedding.get(opNode)!)
        }
    })
}

export function makeReductionRuleDisconnect(): ReductionRule {
    let [pattern, [argA, opNode, argB]] = createLabeledPathGraph([ANY, OPERATOR_DISCONNECT, ANY])
    makeGlobalRootWithConnection(pattern, [opNode])
    createEdge(pattern, argA, argB) // complete triangle
    return makeSimpleReductionRule({
        pattern: pattern,
        apply(graph, embedding) {
            deleteNode(graph, embedding.get(opNode)!)
            deleteEdge(graph, embedding.get(argA)!, embedding.get(argB)!)
        }
    })
}

export function makeReductionRuleConnect(): ReductionRule {
    let [pattern, [argA, opNode, argB]] = createLabeledPathGraph([ANY, OPERATOR_CONNECT, ANY])
    makeGlobalRootWithConnection(pattern, [opNode])
    return makeSimpleReductionRule({
        pattern,
        negativeEdges: [[argA, argB]],
        apply(graph, embedding) {
            deleteNode(graph, embedding.get(opNode)!)
            createEdge(graph, embedding.get(argA)!, embedding.get(argB)!)
        },
    })
}

export function makeDefaultReductionRules(): ReductionRule[] {
    let rules = [
        makeReductionRuleNew(),
        makeReductionRuleDel(),
        makeReductionRuleAssign(),
        makeReductionRuleConnect(),
        makeReductionRuleDisconnect(),
    ]
    return rules
}
