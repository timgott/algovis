import { createEdge, createEmptyGraph, createNode, deleteEdge, deleteNode, extractSubgraph, filteredGraphView, Graph, GraphNode, partitionGraph } from "../../localgraphs/src/graph"
import { dfsWalkArbitrary } from "../../localgraphs/src/graphalgos"
import { createGraphFromEdges } from "../../localgraphs/src/interaction/examplegraph"
import { cartesianProduct } from "../../rulegame/src/metagame"
import { DefaultMap } from "../../shared/defaultmap"
import { Rect } from "../../shared/rectangle"
import { assert, mapPair, randomChoice } from "../../shared/utils"
import { ContextDataMatcher, makeSubgraphMatcher, makeSubgraphMatcherWithNegative, EdgeList, SubgraphMatcher } from "../../subgraph/src/subgraph"
import { makeWildcardVariableMatcher, makeVariableMatcher, mapMatcher, makeWildcardVariableMatcherWithNegDomain } from "../../subgraph/src/variables"
import { placeInCenterOf } from "./placement"
import { findRuleMatches, makeInsertionRule, makeRuleFromOperatorGraph, NodeDataCloner, PatternRule } from "./rule"

export const SYMBOL_FORALL="\u2200" // ∀
export const OPERATOR_NEW = "new"
export const OPERATOR_SET = "set"
export const OPERATOR_DEL = "del"
export const OPERATOR_CONNECT = "con"
export const OPERATOR_DISCONNECT = "dis"
export const SYMBOL_PROGRAM_COUNTER = "\u261b" // ☛
export const SYMBOL_IN = "in"
export const SYMBOL_OUT_STEP = "step" // ✔
export const SYMBOL_OUT_EXHAUSTED = "ex" // ✗
export const SYMBOL_ERROR = "ERR"

export const WILDCARD_SYMBOL = "_" // empty string matches everything

export const operatorSymbols = new Set([
    OPERATOR_NEW,
    OPERATOR_DEL,
    OPERATOR_SET,
    OPERATOR_CONNECT,
    OPERATOR_DISCONNECT
])

export const controlOutSymbols = new Set([
    SYMBOL_OUT_STEP,
    SYMBOL_OUT_EXHAUSTED
])

export const controlFlowSymbols = new Set([
    SYMBOL_IN,
    SYMBOL_OUT_STEP,
    SYMBOL_OUT_EXHAUSTED,
])

export const markerSymbols = new Set([
    SYMBOL_IN,
    SYMBOL_OUT_STEP,
    SYMBOL_OUT_EXHAUSTED,
    SYMBOL_FORALL,
    SYMBOL_PROGRAM_COUNTER
])

type NodeData = {
    label: string
}

const defaultNodeData = {
    label: "",
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
    // TODO: move outside rule box? more general and would allow better macros
    let quantifierNodes = nodes.filter(v => v.data.label === SYMBOL_FORALL)
    let quantifiedNodes = adjacentSet(quantifierNodes)
    let normalNodes = nodes.filter(v =>
        !markerSymbols.has(v.data.label) && !quantifiedNodes.has(v)
    )
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

export function findOperators<T extends NodeData>(graph: Graph<T>): GraphNode<T>[] {
    return graph.nodes.filter(v => operatorSymbols.has(v.data.label))
}

export function findOperands<T extends NodeData>(operators: GraphNode<T>[]): Set<GraphNode<T>> {
    // TODO: Only new and set insert their argument. Below does not generalize, but good enough for testing.
    // Alternative: special reduction to create pattern (only deletes allowed though)
    // Alternative 2: op node + compiler transformations
    return adjacentSet(operators.filter(v => v.data.label === OPERATOR_SET || v.data.label === OPERATOR_NEW))
}

export function findOperatorsAndOperandsSet<T extends NodeData>(graph: Graph<T>): Set<GraphNode<T>> {
    let operators = findOperators(graph)
    return new Set([...operators, ...findOperands(operators)])
}

export function makeVarRuleFromOperatorGraph<T extends NodeData>(ruleGraph: Graph<T>, variables: Set<string>, defaultData: T): PatternRule<T, T, VarMap> {
    const operators = findOperators(ruleGraph)
    const operands = findOperands(operators)
    const allOpsAndArgs = new Set([...operators, ...operands])

    // separate pattern and inserted parts of rule
    let patternNodes = new Set(ruleGraph.nodes).difference(allOpsAndArgs)
    let partition = partitionGraph(ruleGraph, patternNodes)

    // variables may not equal any constant used in the pattern
    // bad idea. makes some things much harder. (which ones? keep enabled until I remember)
    let varExclude = new Set(ruleGraph.nodes.map(v => v.data.label).filter(x => !variables.has(x) && x !== WILDCARD_SYMBOL))
    //console.log("exclude:", [...varExclude])

    let negativeEdges: [GraphNode<T>, GraphNode<T>][] =
        adjacentArgumentPairs(operators.filter(v => v.data.label === OPERATOR_CONNECT))
        .map(mapPair(x => partition.insideMap.get(x)!))

    //let matcher: SubgraphMatcher<T,T,VarMap> = makeVarMatcherWithNegativeEdges(variables, negativeEdges)
    let matcher: SubgraphMatcher<T,T,VarMap> = makeVarMatcherWithNegativeEdgesNegDomain(variables, negativeEdges, varExclude)
    let cloner = makeLabelNodeCloner<T>(defaultData)

    return makeInsertionRule(partition.inside, partition.outside, partition.betweenEdges, matcher, cloner)
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

export function isControlInSymbol(s: string): boolean {
    return s === SYMBOL_IN
}

export function isControlOutSymbol(s: string): boolean {
    return controlOutSymbols.has(s)
}

function moveEdgeEndpoint<T>(graph: Graph<T>, start: GraphNode<T>, from: GraphNode<T>, to: GraphNode<T>) {
    assert(start.neighbors.has(from), "not connected to 'from'")
    assert(!start.neighbors.has(to), "already connected with new endpoint")
    deleteEdge(graph, start, from)
    createEdge(graph, start, to)
}

export function advanceControlFlow(graph: Graph<NodeData>): boolean {
    // move all pc nodes from an out-node to an in-node.
    let doneSomething = false
    let pcNodes = graph.nodes.filter(n => n.data.label === SYMBOL_PROGRAM_COUNTER)
    for (let pc of pcNodes) {
        for (let currentOut of [...pc.neighbors].filter(n => isControlOutSymbol(n.data.label))) {
            for (let nextIn of [...currentOut.neighbors].filter(n => isControlInSymbol(n.data.label))) {
                moveEdgeEndpoint(graph, pc, currentOut, nextIn)
                doneSomething = true
            }
        }
    }
    return doneSomething
}

export function ruleFromBox(graph: Graph<NodeData>, box: Rect): PatternRule<NodeData, NodeData, VarMap> {
    return extractVarRuleFromBox(graph, box, defaultNodeData)
}

function getOutsideGraphFilter(graph: Graph<NodeData>, ruleBoxes: Rect[]): Graph<NodeData> {
    return filteredGraphView(graph, (node) => {
        for (let box of ruleBoxes) {
            if (Rect.containsPos(box, node)) {
                return false
            }
        }
        return true
    })
}

function putError(graph: Graph<NodeData>, connectedNodes: Iterable<GraphNode<NodeData>>, message: string) {
    let errorNode = createNode(graph, { label: SYMBOL_ERROR })
    let messageNode = createNode(graph, { label: message })
    placeInCenterOf(errorNode, connectedNodes)
    placeInCenterOf(messageNode, connectedNodes)
    for (let node of connectedNodes) {
        let edge = createEdge(graph, node, errorNode)
        edge.length *= 2
    }
    createEdge(graph, errorNode, messageNode, 100)
}

export function hasError(graph: Graph<NodeData>): boolean {
    return graph.nodes.find(n => n.data.label === SYMBOL_ERROR) !== undefined
}

export function runRulesWithPc(graph: Graph<NodeData>, ruleBoxes: Rect[]): boolean {
    if (hasError(graph)) {
        return false
    }
    // If the pc is connected to an in-node, then run the rule once at a random match if possible
    // If no match => move pc to ex-node
    // If match => move pc to step-node
    // TODO: can be optimized by precomputing data structures
    let doneSomething = false
    let pcNodes = graph.nodes.filter(n => n.data.label === SYMBOL_PROGRAM_COUNTER)
    for (let pc of pcNodes) {
        for (let inNode of [...pc.neighbors].filter(n => isControlInSymbol(n.data.label))) {
            for (let ruleBox of ruleBoxes.filter(box => Rect.containsPos(box, inNode))) {
                doneSomething = true
                let insideNodes = graph.nodes.filter(n => Rect.containsPos(ruleBox, n))
                let exNodes = insideNodes.filter(n => n.data.label === SYMBOL_OUT_EXHAUSTED)
                let stepNodes = insideNodes.filter(n => n.data.label === SYMBOL_OUT_STEP)

                // applyRuleEverywhere also modifies inside rule boxes, don't use here
                let rule = ruleFromBox(graph, ruleBox)
                let matches = findRuleMatches(getOutsideGraphFilter(graph, ruleBoxes), rule)
                if (matches.length == 0) {
                    if (exNodes.length > 0) {
                        if (exNodes.length > 1) { console.warn("More than 1 ex-node:", exNodes.length) }
                        moveEdgeEndpoint(graph, pc, inNode, randomChoice(exNodes))
                    } else {
                        putError(graph, [inNode], `no match and no ${SYMBOL_OUT_EXHAUSTED}-node`)
                    }
                } else {
                    rule.apply(graph, randomChoice(matches))
                    if (stepNodes.length > 0) {
                        if (stepNodes.length > 1) { console.warn("More than 1 step-node:", stepNodes.length) }
                        moveEdgeEndpoint(graph, pc, inNode, randomChoice(stepNodes))
                    } else {
                        putError(graph, [inNode], `cannot continue, no ${SYMBOL_OUT_STEP}-node`)
                    }
                }
            }
        }
    }
    return doneSomething
}