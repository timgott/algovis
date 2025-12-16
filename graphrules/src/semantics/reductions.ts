import { createEdge, createEmptyGraph, createNode, Graph, GraphNode } from "../../../localgraphs/src/graph"
import { WILDCARD_SYMBOL } from "./symbols"

export function createLabeledPathGraph(labels: string[]): [Graph<NodeData>, GraphNode<NodeData>[]] {
    let graph = createEmptyGraph<NodeData>()
    let last: GraphNode<NodeData> | null = null
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

export function makeReductionRuleSet(): VarRule<NodeData> {
    let [pattern, [opNode, argNode, targetNode]] = createLabeledPathGraph([OPERATOR_SET, "val", "target"])
    let matcher = makeSubgraphVarMatcher(new Set(["val", "target"]))
    return {
        pattern,
        matcher,
        apply(graph, {embedding, context}) {
            deleteNode(graph, embedding.get(opNode)!)
            deleteNode(graph, embedding.get(argNode)!)
            embedding.get(targetNode)!.data.label = context.get("val")!
        },
    }
}

export function makeReductionRuleDel(): VarRule<NodeData> {
    let [pattern, [opNode, argNode]] = createLabeledPathGraph([OPERATOR_DEL, ANY])
    let matcher = makeSubgraphWildcardMatcher()
    return {
        pattern,
        matcher,
        apply(graph, {embedding}) {
            deleteNode(graph, embedding.get(opNode)!)
            deleteNode(graph, embedding.get(argNode)!)
        },
    }
}

export function makeReductionRuleNew(): VarRule<NodeData> {
    let [pattern, [opNode]] = createLabeledPathGraph([OPERATOR_NEW])
    let matcher = makeSubgraphWildcardMatcher()
    return {
        pattern,
        matcher,
        apply(graph, {embedding}) {
            deleteNode(graph, embedding.get(opNode)!)
        },
    }
}

export function makeReductionRuleDisconnect(): VarRule<NodeData> {
    let [pattern, [argA, opNode, argB]] = createLabeledPathGraph([ANY, OPERATOR_DISCONNECT, ANY])
    createEdge(pattern, argA, argB) // complete triangle
    let matcher = makeSubgraphWildcardMatcher()
    return {
        pattern,
        matcher,
        apply(graph, {embedding, context}) {
            deleteNode(graph, embedding.get(opNode)!)
            deleteEdge(graph, embedding.get(argA)!, embedding.get(argB)!)
        },
    }
}

export function makeReductionRuleConnect(): VarRule<NodeData> {
    let [pattern, [argA, opNode, argB]] = createLabeledPathGraph([ANY, OPERATOR_CONNECT, ANY])
    let matcher = makeVarMatcherWithNegativeEdges(new Set(), [[argA, argB]])
    return {
        pattern,
        matcher,
        apply(graph, {embedding, context}) {
            deleteNode(graph, embedding.get(opNode)!)
            createEdge(graph, embedding.get(argA)!, embedding.get(argB)!)
        },
    }
}

export function makeDefaultReductionRules(optimizer: PatternOrderOptimizer<NodeData>): VarRule<NodeData>[] {
    let rules = [
        makeReductionRuleNew(),
        makeReductionRuleDel(),
        makeReductionRuleSet(),
        makeReductionRuleConnect(),
        makeReductionRuleDisconnect(),
    ]
    for (let rule of rules) {
        rule.pattern = optimizer(rule.pattern)
    }
    return rules
}
