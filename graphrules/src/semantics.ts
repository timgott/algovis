import { extractSubgraph, Graph, GraphNode } from "../../localgraphs/src/graph"
import { Rect } from "../../shared/rectangle"
import { makeRuleFromOperatorGraph, NodeDataCloner, PatternRule } from "./reduction"

export const FORALL_SYMBOL="\u2200" // ∀
export const OPERATOR_NEW = "new"

type NodeData = {
    label: string
}

export type VarMap = Map<String, String>
export type VarRule<T> = PatternRule<T, T, VarMap>
export type VarNodeCloner<T> = NodeDataCloner<T, T, VarMap>

function adjacentSet<T>(around: GraphNode<T>[]): Set<GraphNode<T>> {
    return new Set(around.flatMap(v => [...v.neighbors]))
}

export function extractRuleFromBox<T extends NodeData, S, C>(graph: Graph<T>, box: Rect, cloner: NodeDataCloner<T, S, C>): PatternRule<T, S, C> {
    let containedNodes = graph.nodes.filter(v => Rect.containsPos(box, v))
    // extract the nodes that are attached to forall quantifier nodes
    let quantifierNodes = containedNodes.filter(v => v.data.label === FORALL_SYMBOL)
    let quantifiedNodes = adjacentSet(quantifierNodes)
    let normalNodes = containedNodes.filter(v => v.data.label !== FORALL_SYMBOL && !quantifiedNodes.has(v))
    // find subgraph of nodes inside rule box
    let [containedSubgraph, _map] = extractSubgraph(normalNodes)
    let variables = quantifiedNodes.map(v => v.data.label)

    const operators = containedNodes.filter(v => v.data.label === OPERATOR_NEW)
    const operands = adjacentSet(operators)
    const allOpsAndArgs = new Set([...operators, ...operands])

    return makeRuleFromOperatorGraph(containedSubgraph, (v) => allOpsAndArgs.has(v), cloner)
}

function makeLabelNodeCloner<T extends NodeData>(defaultData: T): VarNodeCloner<T> {
    return {
        copyPatternData: (data: T) => ({
            ...defaultData,
            label: data.label,
        }),
        copyUnifiedTargetData: (context: VarMap) => (data: T) => ({
            ...defaultData,
            label: context.get(data.label) || data.label,
        })
    }
}

export function extractVarRuleFromBox<T extends NodeData>(graph: Graph<T>, box: Rect, defaultData: T): VarRule<T> {
    let cloner = makeLabelNodeCloner<T>(defaultData)
    return extractRuleFromBox(graph, box, cloner)
}