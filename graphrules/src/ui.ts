import { createEdge, createEmptyGraph, createNode, deleteEdge, deleteNode, filteredGraphView, Graph, GraphEdge, GraphNode } from "../../localgraphs/src/graph"
import { countConnectedComponents } from "../../localgraphs/src/graphalgos"
import { AnimationFrame, InteractiveSystem, MouseDownResponse, PointerId, SleepState } from "../../localgraphs/src/interaction/controller"
import { DragNodeInteraction, findClosestNode, GraphInteraction } from "../../localgraphs/src/interaction/graphsim"
import { LayoutConfig as LayoutPhysicsConfig, separateNodes, settleNodes, stretchEdgesToFit, stretchEdgesToRelax } from "../../localgraphs/src/interaction/physics"
import { BuildGraphInteraction, ClickNodeInteraction, DeleteInteraction, MoveComponentInteraction, ShiftNodeInteraction } from "../../localgraphs/src/interaction/tools"
import { UndoHistory } from "../../localgraphs/src/interaction/undo"
import { calcWindowTitleArea, drawResizableWindowWithTitle, satisfyMinBounds, WindowBounds } from "../../localgraphs/src/interaction/windows"
import { drawArrowTip } from "../../shared/canvas"
import { collectBins, DefaultMap } from "../../shared/defaultmap"
import { Rect } from "../../shared/rectangle"
import { assert, ensured, randomChoice, randomUniform } from "../../shared/utils"
import { isDistanceLess, vec, vecdir, vecscale, vecset, Vector } from "../../shared/vector"
import { nestedGraphTool, StatePainter, MouseInteraction, mapTool, wrapToolWithHistory, makeSpanWindowTool, makeWindowMovingTool, stealToolClick, withToolClick, MouseClickResponse, noopTool, wrapToolWithHistoryFunc } from "./interaction"
import { findRuleMatches, isRuleMatch, PatternRule } from "./rule"
import { advanceControlFlow, controlPortSymbols, extractVarRuleFromBox, findOperatorsAndOperandsSet, isControlInSymbol, isControlOutSymbol, makeDefaultReductionRules, makePatternOptimizer, ruleMetaSymbols, ruleFromBox, runRandomAction, SYMBOL_IN, VarRule, WILDCARD_SYMBOL, SYMBOL_PROGRAM_POINTER, VarMatch, RuleActionToken, RuleActionTokenStep, findPossibleActions, executeExhaustedAction, executeStepAction, metaSymbols } from "./semantics"
import { ZoomState } from "./zooming"

export type UiNodeData = {
    label: string,
}

export type RuleBoxState = WindowBounds

// for now, no "macro" rules (rules that apply inside other rules)
export type DataState = {
    graph: Graph<UiNodeData>,
    ruleBoxes: RuleBoxState[],
    selectedRule: RuleBoxState | null,
    selectedNodes: Set<GraphNode<UiNodeData>>,
    action: ActionState
}

type RuleMatch = VarMatch<UiNodeData>

type ActionStatePlayer = {
    kind: "player",
    color: string,
    matches: RuleMatch[],
    matchesByNode: DefaultMap<GraphNode<UiNodeData>, RuleMatch[]>,
    stepIndex: number,
    patternOrder: GraphNode<UiNodeData>[],
    execute(match: RuleMatch): void,
}

type ActionStateAuto = {
    kind: "auto"
}

export type ActionState = null | ActionStateAuto | ActionStatePlayer

export type MainState = {
    data: DataState,
    undoHistory: UndoHistory<DataState>,
    selectedTool: ToolName,
    zoom: ZoomState,
}

const defaultNodeData: UiNodeData = {
    label: "",
}

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
    let rule = ruleFromBox(state.graph, state.selectedRule.bounds)
    // applyRuleEverywhere also modifies the rule itself, don't use here
    let matches = findRuleMatches(getOutsideGraphFilter(state), rule)
    if (matches.length == 0) {
        console.log("No matches")
        return
    }
    rule.apply(state.graph, randomChoice(matches))
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
    result = runRandomAction(state.graph, ruleRects) || result
    applyExhaustiveReduction(state)
    return result
}

export function applyRandomReduction(state: DataState): boolean {
    let rules = makeDefaultReductionRules(makePatternOptimizer(state.graph))
    for (let rule of rules) {
        let matches = findRuleMatches(getOutsideGraphFilter(state), rule)
        if (matches.length > 0) {
            rule.apply(state.graph, randomChoice(matches))
            return true
        }
    }
    return false
}

export const ruleTimers = [
    0, 0, 0, 0, 0, 0,
]

export const ruleCounters = [
    0, 0, 0, 0, 0, 0,
]

export function applyExhaustiveReduction(state: DataState) {
    let rules = makeDefaultReductionRules(makePatternOptimizer(state.graph))
    let changed: boolean
    do {
        changed = false
        for (let [i,rule] of rules.entries()) {
            let startTime = performance.now()
            let matches = findRuleMatches(getOutsideGraphFilter(state), rule)
            ruleTimers[i] += performance.now() - startTime
            ruleCounters[i] += 1
            if (matches.length > 0) {
                rule.apply(state.graph, randomChoice(matches))
                changed = true
                break
            }
        }
    } while (changed)
    // Instead of retrying from the first rule again, it would be possible to
    // loop on each rule individually to save calls to the subgraph algorithm;
    // but very often we won't run more than one reduction per step. It is
    // better to keep the nice semantic properties of this version for now. For
    // performance optimization, it would be more clever to make an explicit
    // implementation of the reduction rules anyways.
}

function computeChangingSet(actionState: ActionStatePlayer): Map<GraphNode<UiNodeData>, RuleMatch[]> {
    return actionState.matchesByNode.toMap()
        .filter((x, matches) =>
            matches.length === 1
            || (matches.length > 0 && matches.length < actionState.matches.length)
        )
}

function computeIndexedStepSet(actionState: ActionStatePlayer): Map<GraphNode<UiNodeData>, RuleMatch[]> {
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

function playerClickNode(actionState: ActionStatePlayer, node: GraphNode<UiNodeData>): boolean {
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

function playerTool(state: DataState, mouseX: number, mouseY: number): MouseClickResponse {
    if (state.action !== null && state.action.kind === "player") {
        let node = findClosestNode(mouseX, mouseY, state.graph.nodes)
        if (node !== null) {
            let success = playerClickNode(state.action, node)
            console.log("Clicked on node", success)
            if (success) {
                return "Click"
            }
        }
    }
    return "Ignore"
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
    "none": noopTool,
    "build": graphToolWithClickSelect((s) => new BuildGraphInteraction((g, x, y) => putNewNode(s, x, y), createEdge)),
    "drag": graphTool(() => new DragNodeInteraction()),
    "shift": graphTool(() => new ShiftNodeInteraction()),
    "move": graphTool(() => new MoveComponentInteraction()),
    //"duplicate": graphTool(() => new DuplicateInteraction(new SimpleGraphPainter(5, "black"), )),
    "delete": graphTool(() => new DeleteInteraction(deleteNode, deleteEdge)),
    "rulebox": toolWithUndo(makeSpanWindowTool(putNewWindow)),
    "play": toolWithUndo(playerTool),
}

export type ToolName = keyof typeof tools

export const metaEditingTool: MouseInteraction<MainState> = (state, mouseX, mouseY) => {
    let tool = tools[state.selectedTool]
    return tool(state, mouseX, mouseY)
}

export function selectTool(state: MainState, tool: ToolName) {
    state.selectedTool = tool
    state.data.selectedNodes = new Set()
    if (tool === "play") {
        pushToHistory(state) // the play tool starts execution, push an undo point so that it can be reset
        state.data.action = { kind: "auto" }
    } else {
        state.data.action = null
    }
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
            moveWindow(window) {
                let insideNodes = new Set(s.graph.nodes.filter((node) => Rect.contains(window.bounds, node.x, node.y)))
                let connectedEdges = s.graph.edges.filter(edge => insideNodes.has(edge.a) != insideNodes.has(edge.b))
                return (dx, dy) => {
                    for (let node of insideNodes) {
                        node.x += dx
                        node.y += dy
                    }
                    stretchEdgesToRelax(connectedEdges)
                }
            },
            clickWindow(window) {
                s.selectedRule = window
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
        this.labelColors.set(WILDCARD_SYMBOL, "white")
        for (let l of ruleMetaSymbols) {
            this.labelColors.set(l, "#f0f0f0")
        }
        this.labelColors.set(SYMBOL_PROGRAM_POINTER, "#f0f0f0")
    }

    draw(ctx: CanvasRenderingContext2D, state: MainState, frame: AnimationFrame): void {
        //let highlightedNodes = new Set<GraphNode<UiNodeData>>()
        //if (state.data.activeRule) {
        //    let rule = ruleFromBox(state.data, state.data.activeRule)
        //    highlightedNodes = findNodesMatchingRule(getOutsideGraphFilter(state.data), rule)
        //}
        if (state.data.action !== null && state.data.action.kind === "player") {
            this.drawMatches(ctx, state.data.action, state.data.graph)
        }
        this.drawGraph(ctx, state.data.graph, state.data.selectedNodes)
        this.drawRuleBoxes(ctx, state.data)
    }

    drawRuleBoxes(ctx: CanvasRenderingContext2D, state: DataState): void {
        for (let box of state.ruleBoxes) {
            let inactiveColor = `color-mix(in srgb, ${box.borderColor} 10%, rgba(50, 50, 50, 0.5))`
            let color = state.selectedRule === box ? box.borderColor : inactiveColor
            drawResizableWindowWithTitle(ctx, box.bounds, "Rule", color)
        }
    }

    drawGraph(ctx: CanvasRenderingContext2D, graph: Graph<UiNodeData>, selected: Set<GraphNode<UiNodeData>>): void {
        let operators = findOperatorsAndOperandsSet(graph)
        for (let edge of graph.edges) {
            let hasOperator = operators.has(edge.a) || operators.has(edge.b)
            if (isControlInSymbol(edge.a.data.label) && isControlOutSymbol(edge.b.data.label)) {
                this.drawControlFlowDirected(ctx, edge.b, edge.a)
            } else if (isControlInSymbol(edge.b.data.label) && isControlOutSymbol(edge.a.data.label)) {
                this.drawControlFlowDirected(ctx, edge.a, edge.b)
            } else {
                this.drawEdge(ctx, edge, hasOperator)
            }
        }
        for (let node of graph.nodes) {
            let isMarker = controlPortSymbols.has(node.data.label)
            this.drawNode(ctx, node, selected.has(node), operators.has(node), isMarker)
        }
    }

    getOperatorBlack() {
        return this.getOperatorFill("black") //`rgba(127, 127, 127, 1.0)`
    }

    getOperatorFill(color: string) {
        return `color-mix(in srgb, ${color} 50%, white)`
    }

    drawEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge<UiNodeData>, hasOperator: boolean) {
        ctx.save()
        ctx.beginPath()
        ctx.lineWidth = 3
        ctx.strokeStyle = hasOperator ? this.getOperatorBlack() : "black"
        if (hasOperator) {
            ctx.setLineDash([5, 5])
        }
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
        ctx.restore()
    }

    drawControlFlowDirected(ctx: CanvasRenderingContext2D, from: GraphNode<unknown>, to: GraphNode<unknown>) {
        ctx.save()
        ctx.lineWidth = 2
        ctx.strokeStyle = "black"
        ctx.moveTo(from.x, from.y)
        const offset = Vector.scale(this.nodeRadius, vecdir(from, to))
        const tip = Vector.sub(to, offset)
        ctx.lineTo(tip.x, tip.y)
        drawArrowTip(from.x, from.y, tip.x, tip.y, 12, ctx)
        ctx.stroke()
        ctx.restore()
    }

    drawNode(ctx: CanvasRenderingContext2D, node: GraphNode<UiNodeData>, selected: boolean, operator: boolean, controlFlow: boolean) {
        // no special treatment for operator, because it must maintain contrast. Only edge is modified

        // circle
        ctx.save()

        ctx.beginPath()
        let color = this.labelColors.get(node.data.label)
        let black = "black"
        let lineWidth = 3
        ctx.fillStyle = color
        ctx.strokeStyle = black
        ctx.lineWidth = lineWidth
        ctx.circle(node.x, node.y, this.nodeRadius)
        ctx.fill()
        if (!controlFlow) {
            ctx.stroke()
        }

        // selection outline
        if (selected) {
            ctx.beginPath()
            ctx.lineWidth = 2
            ctx.strokeStyle = "blue"
            ctx.setLineDash([5, 5])
            ctx.circle(node.x, node.y, this.nodeRadius * 1.5)
            ctx.stroke()
            ctx.setLineDash([])
        }

        if (node.data.label) {
            this.drawLabel(ctx, node, node.data.label, black)
        }

        ctx.restore()
    }

    drawLabel(ctx: CanvasRenderingContext2D, node: GraphNode<unknown>, text: string, color: string) {
        // label
        //ctx.strokeStyle = color
        ctx.beginPath()
        ctx.fillStyle = color // text in same color as outline
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        const fontWeight = "normal"
        const fontSize = "12pt"
        ctx.font = `${fontWeight} ${fontSize} sans-serif`
        ctx.fillText(text, node.x, node.y)
    }

    drawMatches(ctx: CanvasRenderingContext2D, state: ActionStatePlayer, graph: Graph<UiNodeData>) {
        let radius = this.nodeRadius * 2
        let changingSet = computeChangingSet(state)
        let singletons = new Set(changingSet.keys())
        let color = `color-mix(in srgb, ${this.labelColors.get(state.color)} 20%, transparent)`
        let colorStrong = `color-mix(in srgb, ${this.labelColors.get(state.color)} 40%, transparent)`
        ctx.save()
        ctx.beginPath()
        for (let edge of graph.edges) {
            if (changingSet.has(edge.a) && changingSet.has(edge.b)) {
                let setA = new Set(state.matchesByNode.get(edge.a))
                let setB = new Set(state.matchesByNode.get(edge.b))
                if (!setA.isDisjointFrom(setB)) {
                    singletons.delete(edge.a)
                    singletons.delete(edge.b)
                    ctx.moveTo(edge.a.x, edge.a.y)
                    ctx.lineTo(edge.b.x, edge.b.y)
                }
            }
        }
        ctx.strokeStyle = color
        ctx.lineWidth = radius * 2
        ctx.fillStyle = color
        ctx.lineCap = "round"
        ctx.stroke()

        for (let node of singletons) {
            ctx.beginPath()
            ctx.circle(node.x, node.y, radius)
            ctx.fill()
        }
        let indexedSet = computeIndexedStepSet(state)
        ctx.fillStyle = colorStrong
        for (let node of indexedSet.keys()) {
            ctx.beginPath()
            ctx.circle(node.x, node.y, radius)
            ctx.fill()
        }
        ctx.restore()
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

export const SYMBOL_HORIZONTAL_ALIGN = "—"
export const SYMBOL_VERTICAL_ALIGN = "|"
export const SYMBOL_ARROW_LEFT = "←"
export const SYMBOL_ARROW_RIGHT = "→"
export const SYMBOL_ARROW_UP = "↑"
export const SYMBOL_ARROW_DOWN = "↓"

export function applyDirectionAlignmentForces(dt: number, graph: Graph<UiNodeData>) {
    const forceStrength = 200
    for (let node of graph.nodes) {
        if (node.neighbors.size === 2) {
            switch (node.data.label) {
            case SYMBOL_HORIZONTAL_ALIGN:
                for (let other of node.neighbors) {
                    let force = forceStrength * (node.y - other.y)
                    other.vy += force * dt
                    node.vy -= force * dt
                }
                break;
            case SYMBOL_VERTICAL_ALIGN:
                for (let other of node.neighbors) {
                    let force = forceStrength * (node.x - other.x)
                    other.vx += force * dt
                    node.vx -= force * dt
                }
                break
            }
        }
    }
}

export function applyArrowAlignmentForces(dt: number, graph: Graph<UiNodeData>) {
    const forceStrength = 50
    const arrows = new Map([
        [SYMBOL_ARROW_LEFT, {opposite: SYMBOL_ARROW_RIGHT, dir: vec(-1, 0)}],
        [SYMBOL_ARROW_RIGHT, {opposite: SYMBOL_ARROW_LEFT, dir: vec(1, 0)}],
        [SYMBOL_ARROW_UP, {opposite: SYMBOL_ARROW_DOWN, dir: vec(0, -1)}],
        [SYMBOL_ARROW_DOWN, {opposite: SYMBOL_ARROW_UP, dir: vec(0, 1)}],
    ])
    for (let node of graph.nodes) {
        if (node.neighbors.size === 2) {
            let arrow = arrows.get(node.data.label)
            if (arrow) {
                for (let other of node.neighbors) {
                    let dir = Vector.sub(node, other)
                    let ortho = Vector.rotate(dir, Math.PI / 2, Vector.Zero)
                    let orthodot = Vector.dot(ortho, arrow.dir)
                    let v = Vector.scale(forceStrength * dt * orthodot, Vector.normalize(ortho))
                    if (other.data.label === arrow.opposite) {
                        node.vx -= v.x
                        node.vy -= v.y
                    } else {
                        other.vx -= v.x
                        other.vy -= v.y
                        node.vx += v.x
                        node.vy += v.y
                    }
                }
            }
        }
    }
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