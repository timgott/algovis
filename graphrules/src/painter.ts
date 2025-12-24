import { Graph, GraphNode, GraphEdge } from "../../localgraphs/src/graph";
import { AnimationFrame } from "../../localgraphs/src/interaction/controller";
import { drawResizableWindowWithTitle } from "../../localgraphs/src/interaction/windows";
import { drawArrowTip } from "../../shared/canvas";
import { DefaultMap } from "../../shared/defaultmap";
import { ensured, randomUniform } from "../../shared/utils";
import { Vector, vecdir } from "../../shared/vector";
import { StatePainter } from "./interaction";
import { computeChangingSet, computeIndexedStepSet } from "./player";
import { isControlInSymbol, isControlOutSymbol } from "./semantics/controlflow";
import { WILDCARD_SYMBOL, ruleMetaSymbols, SYMBOL_PROGRAM_POINTER, controlPortSymbols } from "./semantics/symbols";
import { getRealForVirtualNormal } from "./semantics/boxsemantics";
import { ActionStatePlayer, DataState, UiNodeData } from "./semantics/state";

function randomNodeColor() {
    //return `oklch(${Math.random() * 0.5 + 0.5} ${Math.random() * 0.25} ${Math.random() * 360})`
    return `oklab(${randomUniform(0.5, 1.0)} ${randomUniform(-1, 1) * 0.3} ${randomUniform(-1, 1) * 0.3})`;
}

export class MainPainter implements StatePainter<DataState> {
    labelColors = new DefaultMap<string, string>(() => randomNodeColor());

    constructor(private nodeRadius: number) {
        this.labelColors.set("", "white");
        this.labelColors.set(WILDCARD_SYMBOL, "white");
        for (let l of ruleMetaSymbols) {
            this.labelColors.set(l, "#f0f0f0");
        }
        this.labelColors.set(SYMBOL_PROGRAM_POINTER, "#f0f0f0");
    }

    draw(ctx: CanvasRenderingContext2D, state: DataState, frame: AnimationFrame): void {
        //let highlightedNodes = new Set<GraphNode<UiNodeData>>()
        //if (state.data.activeRule) {
        //    let rule = ruleFromBox(state.data, state.data.activeRule)
        //    highlightedNodes = findNodesMatchingRule(getOutsideGraphFilter(state.data), rule)
        //}
        if (state.action !== null && state.action.kind === "player") {
            this.drawMatches(ctx, state.action, state.graph);
        }
        this.drawGraph(ctx, state.graph, state.selectedNodes);
        this.drawRuleBoxes(ctx, state);
    }

    drawRuleBoxes(ctx: CanvasRenderingContext2D, state: DataState): void {
        for (let box of state.ruleBoxes) {
            let inactiveColor = `color-mix(in srgb, ${box.borderColor} 10%, rgba(50, 50, 50, 0.5))`;
            let color = state.selectedRule === box ? box.borderColor : inactiveColor;
            drawResizableWindowWithTitle(ctx, box.bounds, "Rule", color);
        }
    }

    drawGraph(ctx: CanvasRenderingContext2D, graph: Graph<UiNodeData>, selected: Set<GraphNode<UiNodeData>>): void {
        // TODO: fix detecting operators (use virtual graph!!!)
        let operators = new Set(); //findOperatorsAndOperandsSet(graph)
        for (let edge of graph.edges) {
            let hasOperator = operators.has(edge.a) || operators.has(edge.b);
            if (isControlInSymbol(edge.a.data.label) && isControlOutSymbol(edge.b.data.label)) {
                this.drawControlFlowDirected(ctx, edge.b, edge.a);
            } else if (isControlInSymbol(edge.b.data.label) && isControlOutSymbol(edge.a.data.label)) {
                this.drawControlFlowDirected(ctx, edge.a, edge.b);
            } else {
                this.drawEdge(ctx, edge, hasOperator);
            }
        }
        for (let node of graph.nodes) {
            let isMarker = controlPortSymbols.has(node.data.label);
            this.drawNode(ctx, node, selected.has(node), operators.has(node), isMarker);
        }
    }

    getOperatorBlack() {
        return this.getOperatorFill("black"); //`rgba(127, 127, 127, 1.0)`
    }

    getOperatorFill(color: string) {
        return `color-mix(in srgb, ${color} 50%, white)`;
    }

    drawEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge<UiNodeData>, hasOperator: boolean) {
        ctx.save();
        ctx.lineWidth = 3;
        ctx.strokeStyle = hasOperator ? this.getOperatorBlack() : "black";
        if (hasOperator) {
            ctx.setLineDash([5, 5]);
        } else {
            ctx.setLineDash([]);
        }
        ctx.beginPath();
        if (edge.a == edge.b) {
            // self loop
            ctx.lineWidth = 1;
            let cx = edge.a.x + this.nodeRadius;
            let cy = edge.a.y - this.nodeRadius;
            ctx.arc(cx, cy, this.nodeRadius, -Math.PI, Math.PI / 2, false);
            //drawArrowTip(edge.a.x + this.nodeRadius * 8, edge.a.y - this.nodeRadius, edge.a.x + this.nodeRadius, edge.a.y, this.nodeRadius / 2, ctx)
        } else {
            ctx.moveTo(edge.a.x, edge.a.y);
            ctx.lineTo(edge.b.x, edge.b.y);
        }
        ctx.stroke();
        ctx.restore();
    }

    drawControlFlowDirected(ctx: CanvasRenderingContext2D, from: GraphNode<unknown>, to: GraphNode<unknown>) {
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "black";
        ctx.moveTo(from.x, from.y);
        const offset = Vector.scale(this.nodeRadius, vecdir(from, to));
        const tip = Vector.sub(to, offset);
        ctx.lineTo(tip.x, tip.y);
        drawArrowTip(from.x, from.y, tip.x, tip.y, 12, ctx);
        ctx.stroke();
        ctx.restore();
    }

    drawNode(ctx: CanvasRenderingContext2D, node: GraphNode<UiNodeData>, selected: boolean, operator: boolean, controlFlow: boolean) {
        // no special treatment for operator, because it must maintain contrast. Only edge is modified
        // circle
        ctx.save();

        ctx.beginPath();
        let color = this.labelColors.get(node.data.label);
        let black = "black";
        let lineWidth = 3;
        ctx.fillStyle = color;
        ctx.strokeStyle = black;
        ctx.lineWidth = lineWidth;
        ctx.circle(node.x, node.y, this.nodeRadius);
        ctx.fill();
        if (!controlFlow) {
            ctx.stroke();
        }

        // selection outline
        if (selected) {
            ctx.beginPath();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "blue";
            ctx.setLineDash([5, 5]);
            ctx.circle(node.x, node.y, this.nodeRadius * 1.5);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        if (node.data.label) {
            this.drawLabel(ctx, node, node.data.label, black);
        }

        ctx.restore();
    }

    drawLabel(ctx: CanvasRenderingContext2D, node: GraphNode<unknown>, text: string, color: string) {
        // label
        //ctx.strokeStyle = color
        ctx.beginPath();
        ctx.fillStyle = color; // text in same color as outline
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const fontWeight = "normal";
        const fontSize = "12pt";
        ctx.font = `${fontWeight} ${fontSize} sans-serif`;
        ctx.fillText(text, node.x, node.y);
    }

    drawMatches(ctx: CanvasRenderingContext2D, state: ActionStatePlayer, graph: Graph<UiNodeData>) {
        let radius = this.nodeRadius * 2;
        let changingSet = computeChangingSet(state);
        let singletons = new Set(changingSet.keys().filter(vnode => vnode.kind === "normal").map(vnode => getRealForVirtualNormal(vnode, graph)));
        let color = `color-mix(in srgb, ${this.labelColors.get(state.color)} 20%, transparent)`;
        let colorStrong = `color-mix(in srgb, ${this.labelColors.get(state.color)} 40%, transparent)`;
        ctx.save();
        ctx.beginPath();
        for (let edge of graph.edges) {
            let embA = ensured(state.virtualEmbedding.nodeMapping.get(edge.a))
            let embB = ensured(state.virtualEmbedding.nodeMapping.get(edge.b))
            if (changingSet.has(embA) && changingSet.has(embB)) {
                let setA = new Set(state.matchesByNode.get(embA));
                let setB = new Set(state.matchesByNode.get(embB));
                if (!setA.isDisjointFrom(setB)) {
                    singletons.delete(edge.a);
                    singletons.delete(edge.b);
                    ctx.moveTo(edge.a.x, edge.a.y);
                    ctx.lineTo(edge.b.x, edge.b.y);
                }
            }
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = radius * 2;
        ctx.fillStyle = color;
        ctx.lineCap = "round";
        ctx.stroke();

        for (let node of singletons) {
            ctx.beginPath();
            ctx.circle(node.x, node.y, radius);
            ctx.fill();
        }
        let indexedSet = computeIndexedStepSet(state);
        ctx.fillStyle = colorStrong;
        for (let vnode of indexedSet.keys()) {
            if (vnode.kind === "normal") {
                let node = getRealForVirtualNormal(vnode, graph)
                ctx.beginPath();
                ctx.circle(node.x, node.y, radius);
                ctx.fill();
            }
        }
        ctx.restore();
    }
}
