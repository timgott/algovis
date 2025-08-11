import { createEdge, createEmptyGraph, createNode, deleteNode, filteredGraphView, Graph, GraphEdge, GraphNode } from "../../localgraphs/src/graph"
import { countConnectedComponents } from "../../localgraphs/src/graphalgos"
import { AnimationFrame } from "../../localgraphs/src/interaction/controller"
import { DragNodeInteraction, findClosestNode, GraphInteraction } from "../../localgraphs/src/interaction/graphsim"
import { LayoutConfig as LayoutPhysicsConfig, separateNodes, settleNodes } from "../../localgraphs/src/interaction/physics"
import { BuildGraphInteraction, ClickNodeInteraction, MoveComponentInteraction } from "../../localgraphs/src/interaction/tools"
import { UndoHistory } from "../../localgraphs/src/interaction/undo"
import { calcWindowTitleArea, drawResizableWindowWithTitle, satisfyMinBounds, WindowBounds } from "../../localgraphs/src/interaction/windows"
import { DefaultMap } from "../../shared/defaultmap"
import { Rect } from "../../shared/rectangle"
import { randomChoice, randomUniform } from "../../shared/utils"
import { isDistanceLess, vec } from "../../shared/vector"
import { nestedGraphTool, StatePainter, MouseInteraction, mapTool, wrapToolWithHistory, makeSpanWindowTool, makeWindowMovingTool, stealToolClick, withToolClick, MouseClickResponse } from "./interaction"
import { findRuleMatches, PatternRule } from "./rule"
import { extractVarRuleFromBox, makeDefaultReductionRules, VarRule } from "./semantics"

export type UiNodeData = {
    label: string,
}

export type RuleBoxState = WindowBounds

type Rule = VarRule<UiNodeData>

// for now, no "macro" rules (rules that apply inside other rules)
export type DataState = {
    graph: Graph<UiNodeData>,
    ruleBoxes: RuleBoxState[],
    activeRule: RuleBoxState | null,
    selectedNodes: Set<GraphNode<UiNodeData>>,
}

export type MainState = {
    data: DataState,
    undoHistory: UndoHistory<DataState>,
    selectedTool: ToolName,
}

const defaultNodeData: UiNodeData = {
    label: "",
}

export function setSelectedLabel(state: MainState, label: string) {
    for (let node of state.data.selectedNodes) {
        node.data.label = label
    }
}

export function pushToHistory(state: MainState) {
    state.undoHistory.push(state.data)
}

function ruleFromBox(state: DataState, box: RuleBoxState): Rule {
    return extractVarRuleFromBox(state.graph, box.bounds, defaultNodeData)
}

export function selectRule(state: DataState, ruleBox: RuleBoxState) {
    state.activeRule = ruleBox
}

export function wrapSettleNewNodes(state: DataState, action: (state: DataState) => unknown) {
    let oldNodes = new Set(state.graph.nodes)

    action(state)

    const settlePhysicsConfig = (t: number): LayoutPhysicsConfig => ({
        ...layoutStyle,
        pushDistance: 1000 * t + layoutStyle.pushDistance,
        dampening: t*10 + layoutStyle.dampening
    })

    let newNodes = state.graph.nodes.filter(v => !oldNodes.has(v))
    separateNodes(newNodes, oldNodes)
    let nodesToMove = new Set(newNodes.filter(v => v.neighbors.intersection(oldNodes).size < 2))
    settleNodes(state.graph, nodesToMove, settlePhysicsConfig, 1. / 60., 1000)
}

export function runActiveRuleTest(state: DataState) {
    if (state.activeRule === null) {
        return
    }
    let rule = ruleFromBox(state, state.activeRule)
    // applyRuleEverywhere also modifies the rule itself, don't use here
    let matches = findRuleMatches(getOutsideGraphFilter(state), rule)
    if (matches.length == 0) {
        console.log("No matches")
        return
    }
    rule.apply(state.graph, randomChoice(matches))
}

export function applyRandomReduction(state: DataState): boolean {
    let rules = makeDefaultReductionRules()
    for (let rule of rules) {
        let matches = findRuleMatches(getOutsideGraphFilter(state), rule)
        if (matches.length > 0) {
            rule.apply(state.graph, randomChoice(matches))
            return true
        }
    }
    return false
}

export function applyExhaustiveReduction(state: DataState) {
    let rules = makeDefaultReductionRules()
    let changed: boolean
    do {
        changed = false
        for (let rule of rules) {
            let matches = findRuleMatches(getOutsideGraphFilter(state), rule)
            if (matches.length > 0) {
                rule.apply(state.graph, randomChoice(matches))
                changed = true
                break
            }
        }
    } while (changed)
}


function selectNode(state: DataState, node: GraphNode<UiNodeData>) {
    state.selectedNodes.clear()
    state.selectedNodes.add(node)
}

const nodeClickDistance = 30

function selectClosest(state: DataState, mouseX: number, mouseY: number, limit?: number): "Click" | "Ignore" {
    let node = findClosestNode(mouseX, mouseY, state.graph.nodes)
    if (node !== null) {
        selectNode(state, node)
        if (isDistanceLess(vec(mouseX, mouseY), node, nodeClickDistance)) {
            return "Click"
        } else {
            return "Ignore"
        }
    }
    return "Ignore"
}

function selectClicked(state: DataState, mouseX: number, mouseY: number): "Click" | "Ignore" {
    return selectClosest(state, mouseX, mouseY, nodeClickDistance)
}

function toolWithUndo(tool: MouseInteraction<DataState>): MouseInteraction<MainState> {
    return mapTool(g => g.data, g => wrapToolWithHistory(g.undoHistory, tool))
}

function graphTool(tool: (state: DataState) => GraphInteraction<UiNodeData>): MouseInteraction<MainState> {
    return toolWithUndo(nestedGraphTool(s => s.graph, tool))
}

function graphToolWithClickSelect(tool: (state: DataState) => GraphInteraction<UiNodeData>): MouseInteraction<MainState> {
    return toolWithUndo(stealToolClick(selectClicked, nestedGraphTool(s => s.graph, tool), true))
}

function graphToolAlwaysSelect(tool: (state: DataState) => GraphInteraction<UiNodeData>): MouseInteraction<MainState> {
    return toolWithUndo(withToolClick(selectClosest, nestedGraphTool(s => s.graph, tool)))
}

function putNewNode(state: DataState, x: number, y: number): GraphNode<UiNodeData> {
    let node = createNode<UiNodeData>(state.graph, {...defaultNodeData}, x, y)
    state.selectedNodes = new Set([node])
    return node
}

function putNewWindow(bounds: Rect, state: DataState) {
    let color = `hsl(${Math.random() * 360}, 70%, 40%)`
    let window = {
        bounds,
        borderColor: color,
        resizing: {
            minWidth: 50,
            minHeight: 30,
        }
    }
    satisfyMinBounds(window)
    state.ruleBoxes.push(window)
}


const tools = {
    "build": graphToolWithClickSelect((s) => new BuildGraphInteraction((g, x, y) => putNewNode(s, x, y), createEdge)),
    "drag": graphToolAlwaysSelect(() => new DragNodeInteraction()),
    "move": graphToolWithClickSelect(() => new MoveComponentInteraction()),
    //"duplicate": graphTool(() => new DuplicateInteraction(new SimpleGraphPainter(5, "black"), )),
    "delete": graphTool(() => new ClickNodeInteraction((node, graph) => deleteNode(graph, node))),
    "rulebox": toolWithUndo(makeSpanWindowTool(putNewWindow)),
}

export type ToolName = keyof typeof tools

export const metaEditingTool: MouseInteraction<MainState> = (state, mouseX, mouseY) => {
    let tool = tools[state.selectedTool]
    return tool(state, mouseX, mouseY)
}

export const metaWindowTool: MouseInteraction<MainState> = (state, mouseX, mouseY) => {
    if (state.selectedTool === "delete") {
        return deleteWindowTool(state, mouseX, mouseY)
    } else {
        return windowMovingTool(state, mouseX, mouseY)
    }
}

export const windowMovingTool: MouseInteraction<MainState> =
    toolWithUndo(mapTool(
        s => s.ruleBoxes,
        s => makeWindowMovingTool({
            moveWindow(window, dx, dy) {
                for (let node of s.graph.nodes) {
                    if (Rect.contains(window.bounds, node.x, node.y)) {
                        node.x += dx
                        node.y += dy
                    }
                }
            },
            clickWindow(window) {
                s.activeRule = window
            }
        })
    ))

const deleteWindowTool: MouseInteraction<MainState> =
    toolWithUndo((state: DataState, x: number, y: number): MouseClickResponse => {
        for (let [i,box] of state.ruleBoxes.entries()) {
            let titleArea = calcWindowTitleArea(box.bounds)
            if (Rect.contains(titleArea, x, y)) {
                state.ruleBoxes.splice(i, 1)
                return "Click"
            }
        }
        return "Ignore"
    })


export function createClearedState() : DataState {
    return {
        graph: createEmptyGraph<UiNodeData>(),
        ruleBoxes: [],
        activeRule: null,
        selectedNodes: new Set(),
    }
}

export function cloneDataState(state: DataState): DataState {
    return structuredClone(state)
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

function findNodesMatchingRule<S,T,C>(graph: Graph<T>, rule: PatternRule<S,T,C>): Set<GraphNode<T>> {
    if (countConnectedComponents(rule.pattern) > 1) {
        console.warn("disconnected component found, not yet optimized! ignoring!")
        return new Set()
    };
    let matches = findRuleMatches(graph, rule)
    let nodes = new Set<GraphNode<T>>()
    for (let match of matches) {
        for (let node of match.embedding.values()) {
            nodes.add(node)
        }
    }
    return nodes
}

function randomNodeColor() {
    //return `oklch(${Math.random() * 0.5 + 0.5} ${Math.random() * 0.25} ${Math.random() * 360})`
    return `oklab(${randomUniform(0.5, 1.0)} ${randomUniform(-1, 1)*0.3} ${randomUniform(-1, 1)*0.3})`
}

export class MainPainter implements StatePainter<MainState> {
    labelColors = new DefaultMap<string, string>(() => randomNodeColor())

    constructor(private nodeRadius: number) {
        this.labelColors.set("", "white")
    }

    draw(ctx: CanvasRenderingContext2D, state: MainState, frame: AnimationFrame): void {
        //let highlightedNodes = new Set<GraphNode<UiNodeData>>()
        //if (state.data.activeRule) {
        //    let rule = ruleFromBox(state.data, state.data.activeRule)
        //    highlightedNodes = findNodesMatchingRule(getOutsideGraphFilter(state.data), rule)
        //}
        this.drawGraph(ctx, state.data.graph, new Set(), state.data.selectedNodes)
        this.drawRuleBoxes(ctx, state.data)
    }

    drawRuleBoxes(ctx: CanvasRenderingContext2D, state: DataState): void {
        for (let box of state.ruleBoxes) {
            let inactiveColor = `color-mix(in srgb, ${box.borderColor} 10%, rgba(50, 50, 50, 0.5))`
            let color = state.activeRule === box ? box.borderColor : inactiveColor
            drawResizableWindowWithTitle(ctx, box.bounds, "Rule", color)
        }
    }

    drawGraph(ctx: CanvasRenderingContext2D, graph: Graph<UiNodeData>, highlighted: Set<GraphNode<UiNodeData>>, selected: Set<GraphNode<UiNodeData>>): void {
        for (let edge of graph.edges) {
            this.drawEdge(ctx, edge)
        }
        for (let node of graph.nodes) {
            this.drawNode(ctx, node, highlighted.has(node), selected.has(node))
        }
    }

    drawEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge<UiNodeData>) {
        ctx.beginPath()
        ctx.lineWidth = 3
        ctx.strokeStyle = "black"
        if (edge.a == edge.b) {
            // self loop
            ctx.lineWidth = 1
            let cx = edge.a.x + this.nodeRadius;
            let cy = edge.a.y - this.nodeRadius;
            ctx.arc(cx, cy, this.nodeRadius, -Math.PI, Math.PI / 2, false);
            //drawArrowTip(edge.a.x + this.nodeRadius * 8, edge.a.y - this.nodeRadius, edge.a.x + this.nodeRadius, edge.a.y, this.nodeRadius / 2, ctx)
        } else {
            ctx.moveTo(edge.a.x, edge.a.y)
            ctx.lineTo(edge.b.x, edge.b.y)
        }
        ctx.stroke()
    }

    drawNode(ctx: CanvasRenderingContext2D, node: GraphNode<UiNodeData>, highlight: boolean, selected: boolean) {
        // circle
        let color = this.labelColors.get(node.data.label)
        ctx.fillStyle = color
        ctx.strokeStyle = highlight ? "darkred" : "black"
        ctx.lineWidth = 3
        ctx.circle(node.x, node.y, this.nodeRadius)
        ctx.fill()
        ctx.stroke()

        // selection outline
        if (selected) {
            ctx.lineWidth = 2
            ctx.strokeStyle = "blue"
            ctx.setLineDash([5, 5])
            ctx.circle(node.x, node.y, this.nodeRadius * 1.5)
            ctx.stroke()
            ctx.setLineDash([])
        }

        // label
        if (node.data.label !== "") {
            ctx.strokeStyle = "black"
            ctx.fillStyle = ctx.strokeStyle // text in same color as outline
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            const fontWeight = "normal"
            const fontSize = "12pt"
            ctx.font = `${fontWeight} ${fontSize} sans-serif`
            let label = node.data.label ?? ""
            ctx.fillText(label, node.x, node.y)
        }
    }

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
