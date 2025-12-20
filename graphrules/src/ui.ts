import { createEmptyGraph, filteredGraphView, Graph, GraphNode } from "../../localgraphs/src/graph"
import { AnimationFrame, InteractiveSystem, MouseDownResponse, PointerId, SleepState } from "../../localgraphs/src/interaction/controller"
import { LayoutConfig as LayoutPhysicsConfig, separateNodes, settleNodes } from "../../localgraphs/src/interaction/physics"
import { UndoHistory } from "../../localgraphs/src/interaction/undo"
import { WindowBounds } from "../../localgraphs/src/interaction/windows"
import { collectBins, DefaultMap } from "../../shared/defaultmap"
import { Rect } from "../../shared/rectangle"
import { assert, ensured, randomChoice } from "../../shared/utils"
import { applyExhaustiveReduction } from "./semantics/reductionapply"
import { findRuleMatches } from "./semantics/rule/patternmatching"
import { parseRule } from "./semantics/rule/parse_rulegraph"
import { applyRule } from "./semantics/rule/rule_application"
import { metaSymbols } from "./semantics/symbols"
import { makeVirtualGraphToRealInserter, makeVirtualGraphEmbedding, applyRuleOnGraph } from "./viewmodel/boxsemantics"
import { DataState, MainState, RuleBoxState, UiNodeData } from "./viewmodel/state"
import { ZoomState } from "./zooming"
import { makeDefaultReductionRules } from "./semantics/reductions"

export function setLabelOnSelected(state: MainState, label: string) {
    for (let node of state.data.selectedNodes) {
        node.data.label = label
    }
}

export function pushToHistory(state: MainState) {
    state.undoHistory.push(state.data)
}

export function selectRule(state: DataState, ruleBox: RuleBoxState) {
    state.selectedRule = ruleBox
}

// computes the difference in nodes before and after the action and settles the new nodes into place
export function wrapSettleNewNodes<T>(state: DataState, action: (state: DataState) => T): T {
    let oldNodes = new Set(state.graph.nodes)

    let result = action(state)

    let newNodes = state.graph.nodes.filter(v => !oldNodes.has(v))
    separateNodes(newNodes, oldNodes)
    let nodesToMove = new Set(newNodes) //new Set(newNodes.filter(v => v.neighbors.intersection(oldNodes).size < 2))
    const settlePhysicsConfig = (t: number): LayoutPhysicsConfig => ({
        ...layoutStyle,
        pushDistance: 1000 * t + layoutStyle.pushDistance,
        dampening: t*10 + layoutStyle.dampening
    })
    settleNodes(state.graph, nodesToMove, settlePhysicsConfig, 1. / 60., 1000, []) // the arrow forces are unstable here (they really want to move other nodes)

    return result
}

export function runSelectedRule(state: DataState) {
    if (state.selectedRule === null) {
        return
    }
    let virtual = makeVirtualGraphEmbedding(state.graph, state.ruleBoxes)
    let ruleRoot = ensured(virtual.boxMapping.get(state.selectedRule)).root
    let rule = parseRule(virtual.virtualGraph, ruleRoot)
    // applyRuleEverywhere also modifies the rule itself, don't use here
    let matches = [...findRuleMatches(rule, virtual.virtualGraph)]
    if (matches.length == 0) {
        console.log("No matches")
        return
    }

    applyRuleOnGraph(rule, randomChoice(matches), virtual, state.graph)
}

// runs control flow and rule execution in separate steps
export function runSmallStepWithControlFlow(state: DataState): boolean {
    let ruleRects = state.ruleBoxes.map(b => b.bounds)
    let result = advanceControlFlow(state.graph)
    if (!result) {
        result = runRandomAction(state.graph, ruleRects)
    }
    applyExhaustiveReduction(state)
    return result
}

// runs control flow and rule execution in one step
export function runStepWithControlFlow(state: DataState): boolean {
    let ruleRects = state.ruleBoxes.map(b => b.bounds)
    let result = advanceControlFlow(state.graph)
    result = runFirstAction(state.graph, ruleRects) || result
    applyExhaustiveReduction(state)
    // TODO: placement inside boxes?
    return result
}

export function computeChangingSet(actionState: ActionStatePlayer): Map<GraphNode<UiNodeData>, RuleMatch[]> {
    return actionState.matchesByNode.toMap()
        .filter((x, matches) =>
            matches.length === 1
            || (matches.length > 0 && matches.length < actionState.matches.length)
        )
}

export function computeIndexedStepSet(actionState: ActionStatePlayer): Map<GraphNode<UiNodeData>, RuleMatch[]> {
    while (true) {
        if (actionState.stepIndex >= actionState.patternOrder.length) {
            // probably just a single match
            return new Map()
        }
        let stepNode = actionState.patternOrder[actionState.stepIndex]
        let bins = collectBins(actionState.matches, match => [ensured(match.embedding.get(stepNode))]).toMap()
        if (bins.size > 1) {
            return bins
        }
        // increase step index until it distinguishes the matches
        actionState.stepIndex++
    }
}

export function createClearedState() : DataState {
    return {
        graph: createEmptyGraph<UiNodeData>(),
        ruleBoxes: [],
        selectedRule: null,
        selectedNodes: new Set(),
        action: null,
    }
}

export function cloneDataState(state: DataState): DataState {
    return structuredClone({ ...state, action: null })
}

function getOutsideGraphFilter(state: DataState): Graph<UiNodeData> {
    return filteredGraphView(state.graph, (node) => {
        for (let box of state.ruleBoxes) {
            if (Rect.containsPos(box.bounds, node)) {
                return false
            }
        }
        return true
    })
}

export const layoutStyle: LayoutPhysicsConfig = {
    nodeRadius: 14,
    pushDistance: 30,
    minEdgeLength: 50,
    pushForce: 100.0,
    edgeForce: 100.0,
    centeringForce: 0.0,
    dampening: 10.0,
    sleepVelocity: 0.5,
}

function runActionWithReductions(state: DataState, action: RuleActionTokenStep, match: RuleMatch): void {
    executeStepAction(state.graph, action, match)
    applyExhaustiveReduction(state)
}

function getControllingPlayer(marker: GraphNode<UiNodeData>): string | null {
    let players = [...marker.neighbors].map(v => v.data.label).filter(x => !metaSymbols.has(x))
    if (players.length === 0) {
        return null
    }
    if (players.length > 1) {
        console.warn("Multiple players for rule! Attached player count:", players.length)
    }
    return randomChoice(players)
}

function computeMatchesByNode(matches: RuleMatch[]): DefaultMap<GraphNode<UiNodeData>, RuleMatch[]> {
    return collectBins(matches, (match) => match.embedding.values())
}

export function toggleRunning(state: MainState): void {
    if (state.data.action !== null) {
        state.data.action = null
    } else {
        state.data.action = { kind: "auto" }
        state.selectedTool = "play"
    }
}

export function playerClickNode(actionState: ActionStatePlayer, node: GraphNode<UiNodeData>): boolean {
    let changingSet = computeChangingSet(actionState)
    let indexedSet = computeIndexedStepSet(actionState)
    let newMatchSet = indexedSet.get(node) ?? changingSet.get(node)
    if (newMatchSet !== undefined) {
        assert(newMatchSet.length > 0, "misunderstood truthiness in Javascript again")
        actionState.matches = newMatchSet
        actionState.matchesByNode = computeMatchesByNode(newMatchSet)
        if (indexedSet.has(node)) {
            actionState.stepIndex++
        }
        if (newMatchSet.length === 1) {
            // execute rule
            let [match] = newMatchSet
            actionState.execute(match)
        }
        return true
    }
    return false
}

export class RuleRunner implements InteractiveSystem {
    constructor(protected getState: () => DataState, protected maxStepsPerFrame: number) {}
    update(frame: AnimationFrame): SleepState {
        let state = this.getState()
        if (state.action === null) {
            return "Sleeping"
        }
        if (state.action.kind === "player") {
            // wait for player
            return "Sleeping"
        }
        return wrapSettleNewNodes(state, (data) => {
            for (let i = 0; i < this.maxStepsPerFrame; i++) {
                // if possible, advance control flow
                while (advanceControlFlow(state.graph)) {
                }
                // find rule matches
                let ruleRects = state.ruleBoxes.map(b => b.bounds)

                let actions = findPossibleActions(state.graph, ruleRects)
                if (actions.length === 0) {
                    state.action = null
                    return "Sleeping" // nothing to do left
                }
                let action = randomChoice(actions)
                //let action = findFirstPossibleAction(state.graph, ruleRects)
                if (action === null) {
                    state.action = null
                    return "Sleeping" // nothing to do left
                }

                if (action.kind === "exhausted") {
                    state.action = { kind: "auto" }
                    executeExhaustedAction(state.graph, action)
                } else {
                    let player = getControllingPlayer(action.control.inNode)
                    if (player === null) {
                        // execute on random match
                        state.action = { kind: "auto" }
                        let match = randomChoice(action.matches)
                        runActionWithReductions(state, action, match)
                    } else {
                        state.action = {
                            kind: "player",
                            color: player,
                            matches: action.matches,
                            matchesByNode: computeMatchesByNode(action.matches),
                            stepIndex: 0,
                            patternOrder: action.rule.pattern.nodes,
                            execute(match) {
                                state.action = { kind: "auto" }
                                wrapSettleNewNodes(state, (data) => {
                                    runActionWithReductions(data, action, match)
                                })
                            },
                        }
                        return "Sleeping" // wait for player interaction
                    }
                }
            }
            return "Running" // reached max steps limit
        })
    }
    draw(frame: AnimationFrame, ctx: CanvasRenderingContext2D): void {
    }
    mouseDown(x: number, y: number, pointerId: PointerId, bounds: Rect): MouseDownResponse {
        return "Ignore"
    }
    dragEnd(x: number, y: number, pointerId: PointerId, bounds: Rect): void {
    }
}
