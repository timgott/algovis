import { createEmptyGraph, Graph, GraphNode } from "../../localgraphs/src/graph"
import { AnimationFrame, InteractiveSystem, MouseDownResponse, PointerId, SleepState } from "../../localgraphs/src/interaction/controller"
import { LayoutConfig as LayoutPhysicsConfig, separateNodes, settleNodes } from "../../localgraphs/src/interaction/physics"
import { Rect } from "../../shared/rectangle"
import { ensured, randomChoice } from "../../shared/utils"
import { findRuleMatches } from "./semantics/rule/patternmatching"
import { parseRule } from "./semantics/rule/parse_rulegraph"
import { makeVirtualGraphEmbedding, applyRuleOnGraph } from "./semantics/boxsemantics"
import { DataState, MainState, RuleBoxState, UiNodeData } from "./semantics/state"
import { advanceControlFlow, executeActionExhausted, executeActionStep, findPossibleActions } from "./semantics/controlflow"
import { computeMatchesByNode, getControllingPlayer } from "./player"

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
        pushDistance: 10 * t + layoutStyle.pushDistance,
        dampening: (1-t)*10 + layoutStyle.dampening
    })
    settleNodes(state.graph, nodesToMove, settlePhysicsConfig, 1. / 60., 1000, []) // the arrow forces are unstable here (they really want to move other nodes)

    return result
}

export function runSelectedRule(state: DataState) {
    if (state.selectedRule === null) {
        return
    }
    let virtual = makeVirtualGraphEmbedding(state.graph, state.ruleBoxes)
    let ruleInside = ensured(virtual.boxMapping.get(state.selectedRule)).inside
    let rule = parseRule(virtual.virtualGraph, ruleInside)
    // applyRuleEverywhere also modifies the rule itself, don't use here
    let matches = [...findRuleMatches(rule, virtual.virtualGraph)]
    if (matches.length == 0) {
        console.log("No matches")
        return
    }

    applyRuleOnGraph(rule, randomChoice(matches), virtual, state.graph)
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

export function toggleRunning(state: MainState): void {
    if (state.data.action !== null) {
        state.data.action = null
    } else {
        state.data.action = { kind: "auto" }
        state.selectedTool = "play"
    }
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

                // Abstract graph. Graph may not be mutated while virtualEmb is being used.
                let virtualEmb = makeVirtualGraphEmbedding(state.graph, state.ruleBoxes)
                let vgraph = virtualEmb.virtualGraph

                // find rule matches
                let actions = findPossibleActions(vgraph)
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
                    executeActionExhausted(action, state.graph)
                } else {
                    let player = getControllingPlayer(action.control.inNode)
                    if (player === null) {
                        // execute on random match
                        state.action = { kind: "auto" }
                        let match = randomChoice(action.matches)
                        executeActionStep(action, match, state.graph, state.ruleBoxes, virtualEmb)
                    } else {
                        // order nodes arbitrarily (i.e. in the order they were built)
                        let patternOrder = [...action.rule.pattern.allNodes()]
                        state.action = {
                            kind: "player",
                            color: player,
                            virtualEmbedding: virtualEmb,
                            matches: action.matches,
                            matchesByNode: computeMatchesByNode(action.matches),
                            patternOrder,
                            stepIndex: 0,
                            execute(match) {
                                state.action = { kind: "auto" }
                                wrapSettleNewNodes(state, (data) => {
                                    executeActionStep(action, match, data.graph, data.ruleBoxes, virtualEmb)
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
