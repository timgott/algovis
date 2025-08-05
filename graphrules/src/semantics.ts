import { extractSubgraph, Graph, GraphNode } from "../../localgraphs/src/graph"
import { Rect } from "../../shared/rectangle"
import { ContextMatcher } from "../../subgraph/src/subgraph"
import { makeVariableMatcher, mapMatcher } from "../../subgraph/src/variables"
import { makeRuleFromOperatorGraph, NodeDataCloner, PatternRule } from "./rule"

export const FORALL_SYMBOL="\u2200" // ∀
export const OPERATOR_NEW = "new"
export const OPERATOR_SET = "set"
export const OPERATOR_DEL = "del"

type NodeData = {
    label: string
}

export type VarMap = Map<String, String>
export type VarRule<T> = PatternRule<T, T, VarMap>
export type VarNodeCloner<T> = NodeDataCloner<T, T, VarMap>

function adjacentSet<T>(around: GraphNode<T>[]): Set<GraphNode<T>> {
    return new Set(around.flatMap(v => [...v.neighbors]))
}

export function extractVarRuleFromBox<T extends NodeData>(graph: Graph<T>, box: Rect, defaultData: T): PatternRule<T, T, VarMap> {
    let containedNodes = graph.nodes.filter(v => Rect.containsPos(box, v))
    return extractVarRuleFromNodes(containedNodes, defaultData)
}

export function extractVarRuleFromNodes<T extends NodeData>(nodes: GraphNode<T>[], defaultData: T): PatternRule<T, T, VarMap> {
    // extract the nodes that are attached to forall quantifier nodes
    let quantifierNodes = nodes.filter(v => v.data.label === FORALL_SYMBOL)
    let quantifiedNodes = adjacentSet(quantifierNodes)
    let normalNodes = nodes.filter(v => v.data.label !== FORALL_SYMBOL && !quantifiedNodes.has(v))
    // find subgraph of nodes inside rule box
    let [containedSubgraph, _map] = extractSubgraph(normalNodes)
    let variables = quantifiedNodes.map(v => v.data.label)
    return makeVarRuleFromOperatorGraph(containedSubgraph, variables, defaultData)
}

export function makeVarRuleFromOperatorGraph<T extends NodeData>(ruleGraph: Graph<T>, variables: Set<string>, defaultData: T): PatternRule<T, T, VarMap> {
    const operators = ruleGraph.nodes.filter(v => v.data.label === OPERATOR_NEW)
    const operands = adjacentSet(operators)
    const allOpsAndArgs = new Set([...operators, ...operands])

    let matcher: ContextMatcher<T,T,VarMap> = mapMatcher((x: T) => x.label, makeVariableMatcher(variables))
    let cloner = makeLabelNodeCloner<T>(defaultData)

    return makeRuleFromOperatorGraph(ruleGraph, (v) => allOpsAndArgs.has(v), matcher, cloner)
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
