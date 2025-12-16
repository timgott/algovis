import { createEdge, createNode, deleteEdge, Graph, GraphNode } from "../../../localgraphs/src/graph"
import { assert } from "../../../shared/utils"
import { placeInCenterOf } from "./placement"
import { controlOutSymbols, SYMBOL_ERROR, SYMBOL_IN, SYMBOL_PROGRAM_POINTER } from "./symbols"

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

export function hasError<V>(graph: LabeledGraph<V,string>): boolean {
    return graph.nodesWithLabel(SYMBOL_ERROR).size > 0
}

export function advanceControlFlow(graph: Graph<NodeData>): boolean {
    // move all pc nodes from an out-node to an in-node.
    let doneSomething = false
    let pcNodes = graph.nodes.filter(n => n.data.label === SYMBOL_PROGRAM_POINTER)
    for (let pc of pcNodes) {
        for (let currentOut of [...pc.neighbors].filter(n => isControlOutSymbol(n.data.label))) {
            let nextIns = [...currentOut.neighbors].filter(n => isControlInSymbol(n.data.label));
            if (nextIns.length > 1) {
                putError(graph, [currentOut], "multiple outgoing connections")
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

// CONTINUE HERE: replace Graph with an abstract AGraph
export function findPossibleActions<V>(graph: AGraph<V,Label>, ruleBoxes: Rect[]): RuleActionToken[] {
    if (hasError(graph)) {
        return []
    }
    // TODO: can be optimized by precomputing data structures for containment and labels
    let actions: RuleActionToken[] = []
    let pcNodes = graph.nodesWithLabel(SYMBOL_PROGRAM_POINTER)
    let outsideGraph = getOutsideGraphFilter(graph, ruleBoxes) // TODO: replace by inside and outside neighbors of rule node
    let optimizer = makePatternOptimizer(outsideGraph)
    for (let pc of pcNodes) {
        for (let inNode of [...pc.neighbors].filter(n => isControlInSymbol(n.data.label))) {
            for (let ruleBox of ruleBoxes.filter(box => Rect.containsPos(box, inNode))) { // TODO: remove
                let insideNodes = graph.nodes.filter(n => Rect.containsPos(ruleBox, n))

                // applyRuleEverywhere also modifies inside rule boxes, don't use here
                let rule = ruleFromBox(graph, ruleBox)
                rule.pattern = optimizer(rule.pattern)
                let matches = findAllRuleMatches(outsideGraph, rule)

                let action = makeActionToken(matches, rule, graph, pc, inNode, insideNodes)
                if (action !== null) {
                    actions.push(action)
                }
            }
        }
    }
    return actions
}

export function findFirstPossibleAction(graph: Graph<NodeData>, ruleBoxes: Rect[]): RuleActionToken | null {
    if (hasError(graph)) {
        return null
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
                let match = findFirstRuleMatch(outsideGraph, rule)
                let matches = match === null ? [] : [match]
                let action = makeActionToken(matches, rule, graph, pc, inNode, insideNodes)
                if (action !== null) {
                    return action
                }
            }
        }
    }
    return null
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

export function runFirstAction(graph: Graph<NodeData>, ruleBoxes: Rect[]): boolean {
    let action = findFirstPossibleAction(graph, ruleBoxes)
    if (action === null) {
        return false
    }
    if (action.kind === "exhausted") {
        executeExhaustedAction(graph, action)
    } else {
        executeStepAction(graph, action, randomChoice(action.matches))
    }
    return true
}
