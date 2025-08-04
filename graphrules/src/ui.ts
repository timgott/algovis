import { createEdge, createEmptyGraph, createNode, Graph, GraphEdge, GraphNode } from "../../localgraphs/src/graph"
import { AnimationFrame } from "../../localgraphs/src/interaction/controller"
import { DragNodeInteraction, GraphInteraction, SimpleGraphPainter } from "../../localgraphs/src/interaction/graphsim"
import { BuildGraphInteraction, DuplicateInteraction, MoveComponentInteraction } from "../../localgraphs/src/interaction/tools"
import { UndoHistory } from "../../localgraphs/src/interaction/undo"
import { drawResizableWindowWithTitle, satisfyMinBounds, WindowBounds } from "../../localgraphs/src/interaction/windows"
import { Rect } from "../../shared/rectangle"
import { nestedGraphTool, StatePainter, MouseInteraction, mapTool, wrapToolWithHistory, makeSpanWindowTool, makeWindowMovingTool } from "./interaction"
import { extractVarRuleFromBox, VarRule } from "./semantics"

type UiNodeData = {
    label: string,
}

type RuleBoxState = WindowBounds

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

function toolWithUndo(tool: MouseInteraction<DataState>): MouseInteraction<MainState> {
    return mapTool(g => g.data, g => wrapToolWithHistory(g.undoHistory, tool))
}

function graphTool(tool: (state: DataState) => GraphInteraction<UiNodeData>): MouseInteraction<MainState> {
    return toolWithUndo(nestedGraphTool(s => s.graph, tool))
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
    "build": graphTool((s) => new BuildGraphInteraction((g, x, y) => putNewNode(s, x, y), createEdge)),
    "drag": graphTool(() => new DragNodeInteraction()),
    "move": graphTool(() => new MoveComponentInteraction()),
    //"duplicate": graphTool(() => new DuplicateInteraction(new SimpleGraphPainter(5, "black"), )),
    //"delete": _,
    "rulebox": toolWithUndo(makeSpanWindowTool(putNewWindow)),
}

export type ToolName = keyof typeof tools

export const metaEditingTool: MouseInteraction<MainState> = (state, mouseX, mouseY) => {
    let tool = tools[state.selectedTool]
    return tool(state, mouseX, mouseY)
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

function ruleFromBox(state: DataState, box: RuleBoxState): Rule {
    return extractVarRuleFromBox(state.graph, box.bounds, defaultNodeData)
}

export function selectRule(state: DataState, ruleBox: RuleBoxState) {
    state.activeRule = ruleBox
}

export class MainPainter implements StatePainter<MainState> {
    constructor(private nodeRadius: number) { }

    draw(ctx: CanvasRenderingContext2D, state: MainState, frame: AnimationFrame): void {
        this.drawGraph(ctx, state.data.graph, state.data.selectedNodes)
        this.drawRuleBoxes(ctx, state.data)
    }

    drawRuleBoxes(ctx: CanvasRenderingContext2D, state: DataState): void {
        for (let box of state.ruleBoxes) {
            let inactiveColor = `color-mix(in srgb, ${box.borderColor} 50%, rgba(50, 50, 50, 0.5))`
            let color = state.activeRule === box ? box.borderColor : inactiveColor
            drawResizableWindowWithTitle(ctx, box.bounds, "Rule", color)
        }
    }

    drawGraph(ctx: CanvasRenderingContext2D, graph: Graph<UiNodeData>, selected: Set<GraphNode<UiNodeData>>): void {
        for (let edge of graph.edges) {
            this.drawEdge(ctx, edge)
        }
        for (let node of graph.nodes) {
            this.drawNode(ctx, node, false, selected.has(node))
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
        ctx.fillStyle = highlight ? "red" : "white"
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
