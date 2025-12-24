import { createEdge, createNode, deleteEdge, Graph, GraphNode } from "../../../localgraphs/src/graph"
import { assert, randomChoice } from "../../../shared/utils"
import { applyRuleOnGraph, getRealForVirtualNormal, VirtualGraphEmbedding, VirtualNode, VirtualNodeNormal } from "./boxsemantics"
import { RuleBoxState, RuleMatch, UiNodeData } from "./state"
import { placeInCenterOf } from "./placement"
import { applyExhaustiveReduction } from "./reductionapply"
import { GraphWithParserAccess, parseRule } from "./rule/parse_rulegraph"
import { findRuleMatches } from "./rule/patternmatching"
import { RuleGraph } from "./rule/rulegraph"
import { controlOutSymbols, Label, SYMBOL_ERROR, SYMBOL_IN, SYMBOL_OUT_EXHAUSTED, SYMBOL_OUT_STEP, SYMBOL_PROGRAM_POINTER, SYMBOL_RULE_META, SYMBOL_BOX_ROOT, SYMBOL_BOX_INSIDE } from "./symbols"

export function isControlInSymbol(s: string): boolean {
    return s === SYMBOL_IN
}

export function isControlOutSymbol(s: string): boolean {
    return controlOutSymbols.has(s)
}

function putError(graph: Graph<UiNodeData>, connectedNodes: Iterable<GraphNode<UiNodeData>>, message: string) {
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

export function hasError<V>(graph: LabeledGraph<V,string>): boolean {
    return graph.nodesWithLabel(SYMBOL_ERROR).size > 0
}

export function advanceControlFlow<V>(graph: Graph<UiNodeData>): boolean {
    // do not use immutable graph views because this mutates the graph heavily
    // move all pc nodes from an out-node to an in-node.
    let doneSomething = false
    let pcNodes = graph.nodes.filter(n => n.data.label === SYMBOL_PROGRAM_POINTER)
    for (let pc of pcNodes) {
        for (let currentOut of [...pc.neighbors].filter(n => isControlOutSymbol(n.data.label))) {
            let nextIns = [...currentOut.neighbors].filter(n => isControlInSymbol(n.data.label));
            if (nextIns.length > 1) {
                //FIXME: putError
                throw new Error("make putError work")
                //putError(graph, [currentOut], "multiple outgoing connections")
            }
            else if (nextIns.length === 1) {
                let [nextIn] = nextIns
                moveEdgeEndpoint(graph, pc, currentOut, nextIn)
                doneSomething = true
            }
        }
    }
    return doneSomething
}

type PointerControlInfo = {
    pointer: GraphNode<UiNodeData>,
    inNode: GraphNode<UiNodeData>,
    outNode: GraphNode<UiNodeData>,
}

export type RuleActionTokenExhausted = {
    kind: "exhausted",
    control: PointerControlInfo,
}

export type RuleActionTokenStep = {
    kind: "step",
    matches: RuleMatch[],
    rule: RuleGraph<VirtualNode>,
    control: PointerControlInfo,
}

export type RuleActionToken = RuleActionTokenExhausted | RuleActionTokenStep

function makePointerControl(
    graph: GraphWithParserAccess<VirtualNode>,
    pointer: VirtualNodeNormal,
    metaNode: VirtualNode,
    inNode: VirtualNodeNormal,
    exitLabel: string
): PointerControlInfo | null {
    let outNodes = normalNeighborsWithLabel(graph, metaNode, exitLabel)
    if (outNodes.length > 0) {
        if (outNodes.length > 1) { console.warn(`More than 1 ${exitLabel}-node:`, outNodes.length) }
        let outNode = randomChoice(outNodes)
        return {
            outNode: outNode.sourceNode,
            inNode: inNode.sourceNode,
            pointer: pointer.sourceNode
        }
    } else {
        // FIXME
        throw new Error("fix putError")
        //putError(graph, [inNode], `cannot continue, no ${exitLabel}-node`)
        return null
    }
}

function makeActionToken(
    matches: RuleMatch[], rule: RuleGraph<VirtualNode>,
    graph: GraphWithParserAccess<VirtualNode>, pc: VirtualNodeNormal, inNode: VirtualNodeNormal, metaNode: VirtualNode
): RuleActionToken | null {
    // If no match => move pc to ex-node
    // If match => execute rule once and move pc to step-node
    let exhausted = matches.length === 0
    let exitSymbol = exhausted ? SYMBOL_OUT_EXHAUSTED : SYMBOL_OUT_STEP
    let pointerControl = makePointerControl(graph, pc, metaNode, inNode, exitSymbol)
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

export function filterNormalNodes(bla: Iterable<VirtualNode>): VirtualNodeNormal[] {
    return [...bla].filter(n => n.kind === "normal")
}

function normalAllNodesWithLabel(graph: GraphWithParserAccess<VirtualNode>, label: Label): VirtualNodeNormal[] {
    return filterNormalNodes(graph.nodesWithLabel(label))
}

function normalNeighborsWithLabel(graph: GraphWithParserAccess<VirtualNode>, node: VirtualNode, label: Label): VirtualNodeNormal[] {
    return filterNormalNodes(graph.neighborsWithLabel(node, label))
}

type PointedRuleMetadata = { inNode: VirtualNodeNormal, metaNode: VirtualNode, ruleRoot: VirtualNode }
export function* iterPointedRules(graph: GraphWithParserAccess<VirtualNode>, pointer: VirtualNode): Generator<PointedRuleMetadata> {
    for (let inNode of filterNormalNodes(graph.neighbors(pointer)).filter(n => isControlInSymbol(graph.label(n)))) {
        for (let metaNode of graph.neighborsWithLabel(inNode, SYMBOL_RULE_META)) {
            for (let ruleRoot of graph.neighborsWithLabel(metaNode, SYMBOL_BOX_INSIDE)) {
                yield { inNode, metaNode, ruleRoot }
            }
        }
    }
}

export function findPossibleActions(graph: GraphWithParserAccess<VirtualNode>): RuleActionToken[] {
    if (hasError(graph)) {
        return []
    }
    // TODO: can be optimized by precomputing data structures for containment and labels
    let actions: RuleActionToken[] = []
    let pcNodes = normalAllNodesWithLabel(graph, SYMBOL_PROGRAM_POINTER)
    for (let pc of pcNodes) {
        for (let {inNode, metaNode, ruleRoot} of iterPointedRules(graph, pc)) {
            let rule = parseRule(graph, ruleRoot)
            let matches = [...findRuleMatches(rule, graph)]
            let action = makeActionToken(matches, rule, graph, pc, inNode, metaNode)
            if (action !== null) {
                actions.push(action)
            }
        }
    }
    return actions
}

function moveEdgeEndpoint(graph: Graph<unknown>, start: GraphNode<unknown>, from: GraphNode<unknown>, to: GraphNode<unknown>): void {
    assert(start.neighbors.has(from), "not connected to 'from'")
    assert(!start.neighbors.has(to), "already connected with new endpoint")
    deleteEdge(graph, start, from)
    createEdge(graph, start, to)
}

function executePointerControl(graph: Graph<UiNodeData>, control: PointerControlInfo): void {
    moveEdgeEndpoint(graph,
        control.pointer,
        control.inNode,
        control.outNode,
    )
}

export function executeActionExhausted(action: RuleActionTokenExhausted, graph: Graph<UiNodeData>) {
    executePointerControl(graph, action.control)
}

export function executeActionStep(action: RuleActionTokenStep, match: RuleMatch, graph: Graph<UiNodeData>, ruleBoxes: RuleBoxState[], virtualEmb: VirtualGraphEmbedding) {
    applyRuleOnGraph(action.rule, match, virtualEmb, graph)
    applyExhaustiveReduction(graph, ruleBoxes)
    executePointerControl(graph, action.control)
}
