import { createEdge, createEmptyGraph, createNode, deleteEdge, deleteNode, extractSubgraph, Graph, GraphNode } from "../../localgraphs/src/graph"
import { createGraphFromEdges } from "../../localgraphs/src/interaction/examplegraph"
import { cartesianProduct } from "../../rulegame/src/metagame"
import { DefaultMap } from "../../shared/defaultmap"
import { Rect } from "../../shared/rectangle"
import { ContextDataMatcher, makeSubgraphMatcher, makeSubgraphMatcherWithNegative, EdgeList, SubgraphMatcher } from "../../subgraph/src/subgraph"
import { makeWildcardVariableMatcher, makeVariableMatcher, mapMatcher, makeWildcardVariableMatcherWithNegDomain } from "../../subgraph/src/variables"
import { makeRuleFromOperatorGraph, NodeDataCloner, PatternRule } from "./rule"

export const FORALL_SYMBOL="\u2200" // ∀
export const OPERATOR_NEW = "new"
export const OPERATOR_SET = "set"
export const OPERATOR_DEL = "del"
export const OPERATOR_CONNECT = "con"
export const OPERATOR_DISCONNECT = "dis"

export const WILDCARD_SYMBOL = "_" // empty string matches everything

const operatorSymbols = new Set([
    OPERATOR_NEW,
    OPERATOR_DEL,
    OPERATOR_SET,
    OPERATOR_CONNECT,
    OPERATOR_DISCONNECT
])

type NodeData = {
    label: string
}

export type VarMap = Map<string, string>
export type VarRule<T> = PatternRule<T, T, VarMap>
export type VarNodeCloner<T> = NodeDataCloner<T, T, VarMap>

function adjacentSet<T>(around: GraphNode<T>[]): Set<GraphNode<T>> {
    return new Set(around.flatMap(v => [...v.neighbors]))
}

// does not contain both directions
function allDistinctPairs<T>(items: T[]): [T, T][] {
    let result: [T, T][] = []
    for (let i = 0; i < items.length - 1; i++) {
        for (let j = i + 1; j < items.length; j++) {
            result.push([items[i], items[j]])
        }
    }
    return result
}

function adjacentArgumentPairs<T>(around: GraphNode<T>[]): [GraphNode<T>, GraphNode<T>][] {
    return around.flatMap(node => allDistinctPairs([...node.neighbors]))
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

function makeDataVarMatcher(variables: Set<string>): ContextDataMatcher<NodeData, NodeData, VarMap> {
    return mapMatcher((x: NodeData) => x.label, makeWildcardVariableMatcher(variables, WILDCARD_SYMBOL))
}

function makeSubgraphWildcardMatcher(): SubgraphMatcher<NodeData, NodeData, VarMap> {
    // could be optimized a bit because it doesn't need variable context
    return makeSubgraphMatcher(makeDataVarMatcher(new Set()))
}

function makeSubgraphVarMatcher(variables: Set<string>): SubgraphMatcher<NodeData, NodeData, VarMap> {
    return makeSubgraphMatcher(makeDataVarMatcher(variables))
}

function makeVarMatcherWithNegativeEdges(variables: Set<string>, negativeEdges: [GraphNode<NodeData>, GraphNode<NodeData>][]): SubgraphMatcher<NodeData, NodeData, VarMap> {
    return makeSubgraphMatcherWithNegative(makeDataVarMatcher(variables), negativeEdges)
}

function makeVarMatcherWithNegativeEdgesNegDomain(variables: Set<string>, negativeEdges: [GraphNode<NodeData>, GraphNode<NodeData>][], negativeDomain: Set<string>): SubgraphMatcher<NodeData, NodeData, VarMap> {
    let dataMatcher = mapMatcher((x: NodeData) => x.label, makeWildcardVariableMatcherWithNegDomain(variables, WILDCARD_SYMBOL, negativeDomain))
    return makeSubgraphMatcherWithNegative(dataMatcher, negativeEdges)
}

export function makeVarRuleFromOperatorGraph<T extends NodeData>(ruleGraph: Graph<T>, variables: Set<string>, defaultData: T): PatternRule<T, T, VarMap> {
    const operators = ruleGraph.nodes.filter(v => operatorSymbols.has(v.data.label))
    // TODO: Only new and set insert their argument. Below does not generalize, but good enough for testing. Alternative: special reduction to create pattern (only deletes allowed though)
    const operands = adjacentSet(operators.filter(v => v.data.label === OPERATOR_SET || v.data.label === OPERATOR_NEW))
    const allOpsAndArgs = new Set([...operators, ...operands])

    // variables may not equal any constant used in the pattern
    // bad idea. makes some things much harder. (which ones? keep enabled until I remember)
    let varExclude = new Set(ruleGraph.nodes.map(v => v.data.label).filter(x => !variables.has(x) && x !== WILDCARD_SYMBOL))
    console.log("exclude:", [...varExclude])

    let negativeEdges: [GraphNode<T>, GraphNode<T>][] =
        adjacentArgumentPairs(operators.filter(v => v.data.label === OPERATOR_CONNECT))

    let matcher: SubgraphMatcher<T,T,VarMap> = makeVarMatcherWithNegativeEdgesNegDomain(variables, negativeEdges, varExclude)
    let cloner = makeLabelNodeCloner<T>(defaultData)

    return makeRuleFromOperatorGraph(ruleGraph, (v) => allOpsAndArgs.has(v), matcher, cloner)
}

function makeLabelNodeCloner<T extends NodeData>(defaultData: T): VarNodeCloner<T> {
    return {
        transferUnifiedTargetData: (context: VarMap) => (data: T) => {
            let label = context.get(data.label)
            if (label === undefined) { // label MAY be "", beware of JS
                label = data.label
            }
            return {
                ...defaultData,
                label: label,
            }
        }
    }
}

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

export function makeDefaultReductionRules(): VarRule<NodeData>[] {
    return [
        makeReductionRuleNew(),
        makeReductionRuleDel(),
        makeReductionRuleSet(),
        makeReductionRuleConnect(),
        makeReductionRuleDisconnect(),
    ]
}