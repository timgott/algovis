import { AnimationFrame, InteractionController, UiStack } from "../../../localgraphs/src/interaction/controller";
import { GraphLayoutPhysics, LayoutConfig as GraphLayoutConfig } from "../../../localgraphs/src/interaction/physics";
import { UndoHistory } from "../../../localgraphs/src/interaction/undo";
import { initRepaintOnResize } from "../../../shared/canvas";
import { ensured, randomUniform, requireHtmlElement } from "../../../shared/utils";
import { mapTool, MouseInteraction, MultiClickDetector, multiplexTool, nestedGraphTool, noopTool, OnlyGraphPhysicsSimulator, PaintingSystem, StatePainter, stealToolClick, ToolController, withToolClick, wrapActionAfterRelease, wrapToolWithHistory } from "../interaction";
import { isDistanceLess, vec } from "../../../shared/vector";
import { createEdge, createEmptyGraph, createNode, deleteEdge, deleteNode, extractSubgraph, Graph, GraphEdge, GraphNode } from "../../../localgraphs/src/graph";
import { DefaultMap } from "../../../shared/defaultmap";
import { DragNodeInteraction, findClosestNode, GraphInteraction, offsetNodes, shuffleGraphPositions } from "../../../localgraphs/src/interaction/graphsim";
import { collectNeighborhood } from "../../../localgraphs/src/graphalgos";
import { BuildGraphInteraction, DeleteInteraction, MoveComponentInteraction, ShiftNodeInteraction } from "../../../localgraphs/src/interaction/tools";
import { abstractifyGraph, makeLabeledNeighborAccessor } from "../graphviewimpl";
import { LABEL_DOM_CHILD, LABEL_DOM_ORDER_AFTER, LABEL_DOM_ORDER_BEFORE, LABEL_DOM_PARENT, LABEL_DOM_ROOT, parseDomElementList } from "./domparser";
import { flattenGraph, unflattenGraph } from "../graphjson";
import JSURL from "jsurl"

type NodeData = {
    label: string
}

const defaultNodeData = {
    label: ""
}

type DataState = {
    graph: Graph<NodeData>,
    // constraint for this demo:
    // only position information and similar user editable visuals are allowed in addition to graph data
    selected: Set<GraphNode<NodeData>>
}

type MainState = {
    data: DataState,
    undoHistory: UndoHistory<DataState>,
    tool: ToolName,
}
type ToolName = "build" | "drag" | "move" | "shift" | "delete" | "none" | "select"

function tryLoadState(): DataState | null {
    let hash = window.location.hash
    if (hash === "") {
        return null
    }
    try {
        let str = hash.slice(1)
        return unflattenState(JSURL.parse(str))
    } catch (error) {
        console.error("Could not load data;", error)
        return null
    }
}

function unflattenState(flat: any) {
    return {
        ...createClearDataState(),
        graph: unflattenGraph(flat, x => <NodeData>{label: x})
    }
}

function saveState(): DataState {
    let flat = flattenGraph(globalState.data.graph, x => x.label)
    let str = JSURL.stringify(flat)
    document.location.hash = str
    return unflattenState(JSURL.parse(str)) // try parse
}

function createClearDataState(): DataState {
    return {
        graph: createEmptyGraph(),
        selected: new Set(),
    }
}

function createDemoDataState(): DataState {
    let state = createClearDataState()
    let graph = state.graph

    let root = createNode(graph, {label: LABEL_DOM_ROOT})
    let div = createNode(graph, {label: "div"})
    let parent = createNode(graph, {label: LABEL_DOM_PARENT})
    let child = createNode(graph, {label: LABEL_DOM_CHILD})
    let h1 = createNode(graph, {label: "h1"})
    let text = createNode(graph, {label: "text"})
    let bla = createNode(graph, {label: "bla"})
    let before = createNode(graph, {label: LABEL_DOM_ORDER_BEFORE})
    let after = createNode(graph, {label: LABEL_DOM_ORDER_AFTER})
    let div2 = createNode(graph, {label: "div"})

    createEdge(graph, root, div)
    createEdge(graph, div, parent)
    createEdge(graph, parent, child)
    createEdge(graph, child, h1)
    createEdge(graph, h1, before)
    createEdge(graph, before, after)
    createEdge(graph, after, div2)
    createEdge(graph, h1, text)
    createEdge(graph, text, bla)

    shuffleGraphPositions(graph, 500, 500)
    offsetNodes(graph.nodes, 50, 50)

    return state
}

function initGlobalState(): MainState {
    let loadedState = tryLoadState()
    return {
        data: loadedState ?? createDemoDataState(),
        undoHistory: new UndoHistory<DataState>(1000),
        tool: "build",
    }
}

let globalState: MainState = initGlobalState()

function runGlobalUndoableAction(action: (g: MainState) => void) {
    globalState.undoHistory.push(globalState.data)
    action(globalState)
    controller.requestFrame()
}

function showHtml() {
    const graph = globalState.data.graph
    const abstractGraph = abstractifyGraph(graph, d => d.label)
    const graphAccessor = {
        ...abstractGraph,
        ...makeLabeledNeighborAccessor(abstractGraph)
    }
    let elements = Iterator.from(graphAccessor.nodesWithLabel(LABEL_DOM_ROOT))
        .flatMap(v => graphAccessor.neighbors(v))
        .flatMap(v => parseDomElementList(graphAccessor, v))
    previewHtmlRoot.replaceChildren(...elements)
}

// painter

function randomNodeColor() {
    //return `oklch(${Math.random() * 0.5 + 0.5} ${Math.random() * 0.25} ${Math.random() * 360})`
    return `oklab(${randomUniform(0.5, 1.0)} ${randomUniform(-1, 1) * 0.3} ${randomUniform(-1, 1) * 0.3})`;
}

export class MainPainter implements StatePainter<DataState> {
    labelColors = new DefaultMap<string, string>(() => randomNodeColor());

    constructor(private nodeRadius: number) {
        this.labelColors.set("", "white");
    }

    draw(ctx: CanvasRenderingContext2D, state: DataState, frame: AnimationFrame): void {
        this.drawGraph(ctx, state.graph, state.selected);
    }

    drawGraph(ctx: CanvasRenderingContext2D, graph: Graph<NodeData>, selected: Set<GraphNode<NodeData>>): void {
        // TODO: fix detecting operators (use virtual graph!!!)
        for (let edge of graph.edges) {
            this.drawEdge(ctx, edge);
        }
        for (let node of graph.nodes) {
            this.drawNode(ctx, node, selected.has(node));
        }
    }

    getOperatorBlack() {
        return this.getOperatorFill("black"); //`rgba(127, 127, 127, 1.0)`
    }

    getOperatorFill(color: string) {
        return `color-mix(in srgb, ${color} 50%, white)`;
    }

    drawEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge<NodeData>) {
        ctx.save();
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
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

    drawNode(ctx: CanvasRenderingContext2D, node: GraphNode<NodeData>, selected: boolean) {
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
        ctx.stroke();

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
}

// tool selection

function toolButton(toolName: ToolName) {
    let id = `tool_${toolName}`;
    let button = requireHtmlElement(id);
    button.addEventListener("click", () => {
        globalState.tool = toolName;
        controller.requestFrame();
    });
    return button;
}

toolButton("build");
toolButton("drag");
toolButton("move");
toolButton("delete");
toolButton("shift");
toolButton("select");

function selectNode(state: DataState, node: GraphNode<NodeData>) {
    state.selected.clear();
    state.selected.add(node);
}
function toggleNodeSelected(state: DataState, node: GraphNode<NodeData>) {
    if (state.selected.has(node)) {
        state.selected.delete(node);
    } else {
        state.selected.add(node);
    }
}
function imitateSelectedState(state: DataState, node: GraphNode<NodeData>, reference: GraphNode<NodeData>) {
    if (state.selected.has(reference)) {
        state.selected.add(node);
    } else {
        state.selected.delete(node);
    }
}

export function getSelectedSubgraph(state: DataState): Graph<NodeData> {
    return extractSubgraph(state.selected)[0];
}
const nodeClickDistance = 30;
function selectClosest(state: DataState, mouseX: number, mouseY: number, limit?: number): "Click" | "Ignore" {
    let node = findClosestNode(mouseX, mouseY, state.graph.nodes);
    if (node !== null) {
        selectNode(state, node);
        if (isDistanceLess(vec(mouseX, mouseY), node, nodeClickDistance)) {
            return "Click";
        } else {
            return "Ignore";
        }
    }
    return "Ignore";
}
function selectClicked(state: DataState, mouseX: number, mouseY: number): "Click" | "Ignore" {
    return selectClosest(state, mouseX, mouseY, nodeClickDistance);
}
function toolWithUndo(tool: MouseInteraction<DataState>): MouseInteraction<MainState> {
    return mapTool(g => g.data, g => wrapToolWithHistory(g.undoHistory, tool));
}
function graphTool(tool: (state: DataState) => GraphInteraction<NodeData>): MouseInteraction<MainState> {
    return toolWithUndo(nestedGraphTool(s => s.graph, tool));
}
function graphToolWithClickSelect(tool: (state: DataState) => GraphInteraction<NodeData>): MouseInteraction<MainState> {
    return toolWithUndo(stealToolClick(selectClicked, nestedGraphTool(s => s.graph, tool), true));
}
function graphToolAlwaysSelect(tool: (state: DataState) => GraphInteraction<NodeData>): MouseInteraction<MainState> {
    return toolWithUndo(withToolClick((s, x, y) => selectClosest(s, x, y), nestedGraphTool(s => s.graph, tool)));
}
function selectionTool(clicker: MultiClickDetector): MouseInteraction<MainState> {
    let dataTool = (state: DataState, mouseX: number, mouseY: number): "Click" => {
        let clickedNode = findClosestNode(mouseX, mouseY, state.graph.nodes);
        if (clickedNode !== null) {
            let clickCount = clicker.click(clickedNode);
            console.log("click count", clickCount);
            if (clickCount === 1) {
                toggleNodeSelected(state, clickedNode);
            } else {
                let nodes = collectNeighborhood(clickedNode, clickCount - 1);
                for (let other of nodes) {
                    imitateSelectedState(state, other, clickedNode);
                }
            }
        } else {
            state.selected.clear();
        }
        return "Click";
    };
    return mapTool(g => g.data, g => dataTool);
}
function putNewNode(state: DataState, x: number, y: number): GraphNode<NodeData> {
    let node = createNode<NodeData>(state.graph, { ...defaultNodeData }, x, y);
    state.selected = new Set([node]);
    return node;
}
const tools = {
    "none": noopTool,
    "build": graphToolWithClickSelect((s) => new BuildGraphInteraction((g, x, y) => putNewNode(s, x, y), createEdge)),
    "drag": graphTool(() => new DragNodeInteraction()),
    "shift": graphTool(() => new ShiftNodeInteraction()),
    "move": graphTool(() => new MoveComponentInteraction()),
    //"duplicate": graphTool(() => new DuplicateInteraction(new SimpleGraphPainter(5, "black"), )),
    "delete": graphTool(() => new DeleteInteraction(deleteNode, deleteEdge)),
    "select": selectionTool(new MultiClickDetector(500)),
};
const metaTool = multiplexTool<MainState>((state) => {
    return tools[state.tool]
})

// label input

function enterLabel(label: string) {
    runGlobalUndoableAction(g => {
        for (let node of g.data.selected) {
            node.data.label = label
        }
    })
}

const labelTextbox = requireHtmlElement("input_label") as HTMLInputElement
labelTextbox.addEventListener("input", (ev) => {
    enterLabel(labelTextbox.value.trim())
})

labelTextbox.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
        labelTextbox.blur()
    }
})

function setLabelTextboxFromSelected(state: MainState) {
    let set = state.data.selected
    if (set.size > 0) {
        let [first] = set
        labelTextbox.value = first.data.label
        labelTextbox.focus()
    } else {
        labelTextbox.value = ""
    }
}

// special node label buttons

function operatorButton(id: string, operator: string) {
    let button = requireHtmlElement(id);
    button.addEventListener("click", () => {
        enterLabel(operator);
    });
    return button;
}

const SYMBOL_BOX = "box"
operatorButton("btn_op_box", SYMBOL_BOX);


// keyboard shortcuts (do these actually work?)

document.addEventListener("keydown", (e) => {
    if (e.ctrlKey) {
        if (e.key == "z") {
            undoButton.click()
        } else if (e.key == "y" || e.key == "Z") {
            redoButton.click()
        }
    }
})

// persistence

requireHtmlElement("btn_save").addEventListener("click", () => {
    globalState.data = saveState() // load immediately to detect errors
})

// reset

requireHtmlElement("btn_reset").addEventListener("click", () => {
    runGlobalUndoableAction(g => {
        g.data = createClearDataState()
    })
})

// history
function restoreFromHistory(newState: DataState | null) {
    if (newState) {
        globalState.data = newState;
        controller.requestFrame();
    } else {
        console.log("End of history");
    }
}
let undoButton = requireHtmlElement("btn_undo")
undoButton.addEventListener("click", () => {
    restoreFromHistory(globalState.undoHistory.undo(globalState.data));
});
let redoButton = requireHtmlElement("btn_redo")
redoButton.addEventListener("click", () => {
    restoreFromHistory(globalState.undoHistory.redo());
});
let showButton = requireHtmlElement("btn_show")
showButton.addEventListener("click", () => {
    showHtml()
});

const maxStepsPerFrame = 1

export const layoutStyle: GraphLayoutConfig = {
    nodeRadius: 14,
    pushDistance: 30,
    minEdgeLength: 50,
    pushForce: 100.0,
    edgeForce: 100.0,
    centeringForce: 0.0,
    dampening: 10.0,
    sleepVelocity: 0.5,
}

let physics = new GraphLayoutPhysics(layoutStyle)
let canvas = ensured(document.getElementById("canvas")) as HTMLCanvasElement;
let painter = new MainPainter(layoutStyle.nodeRadius)

let previewHtmlRoot = ensured(document.getElementById("preview"))

let controller = new InteractionController(canvas,
    new UiStack([
        new ToolController(() => globalState, wrapActionAfterRelease(metaTool, setLabelTextboxFromSelected)),
        new OnlyGraphPhysicsSimulator(() => globalState.data.graph, physics),
        new PaintingSystem(() => globalState.data, painter),
    ]),
)

initRepaintOnResize(canvas, ensured(document.getElementById("main_canvas_container")), () => controller.frameCallback(document.timeline.currentTime as number || 0))
controller.requestFrame()
