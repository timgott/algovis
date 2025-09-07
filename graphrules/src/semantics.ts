import { createEdge, createEmptyGraph, createNode, deleteEdge, deleteNode, extractSubgraph, filteredGraphView, Graph, GraphNode, partitionGraph } from "../../localgraphs/src/graph"
import { dfsWalkArbitrary, dfsWalkWithIncreasingOrder } from "../../localgraphs/src/graphalgos"
import { createGraphFromEdges } from "../../localgraphs/src/interaction/examplegraph"
import { cartesianProduct } from "../../rulegame/src/metagame"
import { collectCounts, DefaultMap } from "../../shared/defaultmap"
import { Rect } from "../../shared/rectangle"
import { assert, mapPair, randomChoice } from "../../shared/utils"
import { ContextDataMatcher, makeSubgraphMatcher, makeSubgraphMatcherWithNegative, EdgeList, SubgraphMatcher, MatchWithContext } from "../../subgraph/src/subgraph"
import { makeWildcardVariableMatcher, makeVariableMatcher, mapMatcher, makeWildcardVariableMatcherWithNegDomain } from "../../subgraph/src/variables"
import { placeInCenterOf } from "./placement"
import { findRuleMatches, makeInsertionRule, NodeDataCloner, PatternRule } from "./rule"

export const SYMBOL_FORALL="\u2200" // ∀
export const OPERATOR_NEW = "new"
export const OPERATOR_SET = "set"
export const OPERATOR_DEL = "del"
export const OPERATOR_CONNECT = "con"
export const OPERATOR_DISCONNECT = "dis"
export const SYMBOL_PROGRAM_POINTER = "\u261b" // ☛
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

export const controlPortSymbols = new Set([
    SYMBOL_IN,
    SYMBOL_OUT_STEP,
    SYMBOL_OUT_EXHAUSTED,
])

export const ruleMetaSymbols = new Set([
    ...controlPortSymbols,
    SYMBOL_FORALL,
])

export const metaSymbols = new Set([
    ...ruleMetaSymbols,
    SYMBOL_PROGRAM_POINTER
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
export type VarMatch<T> = MatchWithContext<T, VarMap>

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

export function extractVarRuleFromBox<T extends NodeData>(graph: Graph<T>, box: Rect, defaultData: T): VarRule<T> {
    let containedNodes = graph.nodes.filter(v => Rect.containsPos(box, v))
    return extractVarRuleFromNodes(containedNodes, defaultData)
}

export function extractVarRuleFromNodes<T extends NodeData>(nodes: GraphNode<T>[], defaultData: T): VarRule<T> {
    // extract the nodes that are attached to forall quantifier nodes
    // TODO: move outside rule box? more general and would allow better macros
    let quantifierNodes = nodes.filter(v => v.data.label === SYMBOL_FORALL)
    let quantifiedNodes = adjacentSet(quantifierNodes)
    let normalNodes = nodes.filter(v =>
        !ruleMetaSymbols.has(v.data.label) && !quantifiedNodes.has(v)
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

type PatternOrderOptimizer<T> = (graph: Graph<T>) => Graph<T>

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
    console.log("exclude:", [...varExclude])

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
    let pcNodes = graph.nodes.filter(n => n.data.label === SYMBOL_PROGRAM_POINTER)
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

export function makePatternOptimizer(completeGraph: Graph<NodeData>): PatternOrderOptimizer<NodeData> {
    let labelStatistics = collectCounts(completeGraph.nodes.map(v => v.data.label))
    return (graph) => {
        graph.nodes = dfsWalkWithIncreasingOrder(graph.nodes, n => labelStatistics.get(n.data.label)!)
        return graph
    }
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

type PointerControlInfo = {
    pointer: GraphNode<NodeData>,
    inNode: GraphNode<NodeData>,
    outNode: GraphNode<NodeData>,
}

export type RuleActionTokenExhausted = {
    kind: "exhausted",
    control: PointerControlInfo,
}

export type RuleActionTokenStep = {
    kind: "step",
    matches: VarMatch<NodeData>[],
    rule: VarRule<NodeData>,
    control: PointerControlInfo,
}

export type RuleActionToken = RuleActionTokenExhausted | RuleActionTokenStep

function advancePointerStep(graph: Graph<NodeData>, pc: GraphNode<NodeData>, inNode: GraphNode<NodeData>, insideNodes: GraphNode<NodeData>[], exitLabel: string): void {
    let stepNodes = insideNodes.filter(n => n.data.label === exitLabel)
    if (stepNodes.length > 0) {
        if (stepNodes.length > 1) { console.warn(`More than 1 ${exitLabel}-node:`, stepNodes.length) }
        moveEdgeEndpoint(graph, pc, inNode, randomChoice(stepNodes))
    } else {
        putError(graph, [inNode], `cannot continue, no ${exitLabel}-node`)
    }
}

function makePointerControl(graph: Graph<NodeData>, pointer: GraphNode<NodeData>, inNode: GraphNode<NodeData>, insideNodes: GraphNode<NodeData>[], exitLabel: string): PointerControlInfo | null {
    let outNodes = insideNodes.filter(n => n.data.label === exitLabel)
    if (outNodes.length > 0) {
        if (outNodes.length > 1) { console.warn(`More than 1 ${exitLabel}-node:`, outNodes.length) }
        let outNode = randomChoice(outNodes)
        return {
            outNode,
            inNode,
            pointer
        }
    } else {
        putError(graph, [inNode], `cannot continue, no ${exitLabel}-node`)
        return null
    }
}

function makeActionToken(
    matches: VarMatch<NodeData>[], rule: VarRule<NodeData>,
    graph: Graph<NodeData>, pc: GraphNode<NodeData>, inNode: GraphNode<NodeData>, insideNodes: GraphNode<NodeData>[]
): RuleActionToken | null {
    // If no match => move pc to ex-node
    // If match => execute rule once and move pc to step-node
    let exhausted = matches.length === 0
    let exitSymbol = exhausted ? SYMBOL_OUT_EXHAUSTED : SYMBOL_OUT_STEP
    let pointerControl = makePointerControl(graph, pc, inNode, insideNodes, exitSymbol)
    if (pointerControl === null) { return null }
    if (exhausted) {
        return {
            kind: "exhausted",
            control: pointerControl,
        }
    } else {
        return {
            kind: "step",
            matches,
            rule,
            control: pointerControl,
        }
    }
}

export function findPossibleActions(graph: Graph<NodeData>, ruleBoxes: Rect[]): RuleActionToken[] {
    if (hasError(graph)) {
        return []
    }
    // TODO: can be optimized by precomputing data structures for containment and labels
    let actions: RuleActionToken[] = []
    let pcNodes = graph.nodes.filter(n => n.data.label === SYMBOL_PROGRAM_POINTER)
    let outsideGraph = getOutsideGraphFilter(graph, ruleBoxes)
    let optimizer = makePatternOptimizer(outsideGraph)
    for (let pc of pcNodes) {
        for (let inNode of [...pc.neighbors].filter(n => isControlInSymbol(n.data.label))) {
            for (let ruleBox of ruleBoxes.filter(box => Rect.containsPos(box, inNode))) {
                let insideNodes = graph.nodes.filter(n => Rect.containsPos(ruleBox, n))

                // applyRuleEverywhere also modifies inside rule boxes, don't use here
                let rule = ruleFromBox(graph, ruleBox)
                rule.pattern = optimizer(rule.pattern)
                let matches = findRuleMatches(outsideGraph, rule)

                let action = makeActionToken(matches, rule, graph, pc, inNode, insideNodes)
                if (action !== null) {
                    actions.push(action)
                }
            }
        }
    }
    return actions
}

function executePointerControl(graph: Graph<NodeData>, control: PointerControlInfo): void {
    moveEdgeEndpoint(graph, control.pointer, control.inNode, control.outNode)
}

export function executeExhaustedAction(graph: Graph<NodeData>, action: RuleActionTokenExhausted) {
    executePointerControl(graph, action.control)
}

export function executeStepAction(graph: Graph<NodeData>, action: RuleActionTokenStep, match: VarMatch<NodeData>) {
    action.rule.apply(graph, match)
    executePointerControl(graph, action.control)
}

export function runRandomAction(graph: Graph<NodeData>, ruleBoxes: Rect[]): boolean {
    let actions = findPossibleActions(graph, ruleBoxes)
    if (actions.length === 0) {
        return false
    }
    for (let action of actions) {
        if (action.kind === "exhausted") {
            executeExhaustedAction(graph, action)
        } else {
            executeStepAction(graph, action, randomChoice(action.matches))
        }
    }
    return true
}