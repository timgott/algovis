import { GraphNode, Graph, extractSubgraph, createNode, createEdge, deleteNode, deleteEdge } from "../../localgraphs/src/graph";
import { collectNeighborhood } from "../../localgraphs/src/graphalgos";
import { findClosestNode, GraphInteraction, DragNodeInteraction } from "../../localgraphs/src/interaction/graphsim";
import { stretchEdgesToRelax } from "../../localgraphs/src/interaction/physics";
import { BuildGraphInteraction, ShiftNodeInteraction, MoveComponentInteraction, DeleteInteraction } from "../../localgraphs/src/interaction/tools";
import { satisfyMinBounds, calcWindowTitleArea } from "../../localgraphs/src/interaction/windows";
import { Rect } from "../../shared/rectangle";
import { isDistanceLess, vec } from "../../shared/vector";
import { MouseClickResponse, MouseInteraction, mapTool, wrapToolWithHistory, nestedGraphTool, stealToolClick, withToolClick, MultiClickDetector, noopTool, makeSpanWindowTool, multiplexTool, makeWindowMovingTool } from "./interaction";
import { playerClickNode } from "./player";
import { pushToHistory } from "./ui";
import { DataState, UiNodeData, MainState, defaultNodeData } from "./viewmodel/state";

function playerTool(state: DataState, mouseX: number, mouseY: number): MouseClickResponse {
    // TODO: if action = null, place new program pointer!!!!!!
    if (state.action !== null && state.action.kind === "player") {
        let node = findClosestNode(mouseX, mouseY, state.graph.nodes);
        if (node !== null) {
            let success = playerClickNode(state.action, node);
            console.log("Clicked on node", success);
            if (success) {
                return "Click";
            }
        }
    }
    return "Ignore";
}
function selectNode(state: DataState, node: GraphNode<UiNodeData>) {
    state.selectedNodes.clear();
    state.selectedNodes.add(node);
}
function toggleNodeSelected(state: DataState, node: GraphNode<UiNodeData>) {
    if (state.selectedNodes.has(node)) {
        state.selectedNodes.delete(node);
    } else {
        state.selectedNodes.add(node);
    }
}
function imitateSelectedState(state: DataState, node: GraphNode<UiNodeData>, reference: GraphNode<UiNodeData>) {
    if (state.selectedNodes.has(reference)) {
        state.selectedNodes.add(node);
    } else {
        state.selectedNodes.delete(node);
    }
}

export function getSelectedSubgraph(state: DataState): Graph<UiNodeData> {
    return extractSubgraph(state.selectedNodes)[0];
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
function graphTool(tool: (state: DataState) => GraphInteraction<UiNodeData>): MouseInteraction<MainState> {
    return toolWithUndo(nestedGraphTool(s => s.graph, tool));
}
function graphToolWithClickSelect(tool: (state: DataState) => GraphInteraction<UiNodeData>): MouseInteraction<MainState> {
    return toolWithUndo(stealToolClick(selectClicked, nestedGraphTool(s => s.graph, tool), true));
}
function graphToolAlwaysSelect(tool: (state: DataState) => GraphInteraction<UiNodeData>): MouseInteraction<MainState> {
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
            state.selectedNodes.clear();
        }
        return "Click";
    };
    return mapTool(g => g.data, g => dataTool);
}
function putNewNode(state: DataState, x: number, y: number): GraphNode<UiNodeData> {
    let node = createNode<UiNodeData>(state.graph, { ...defaultNodeData }, x, y);
    state.selectedNodes = new Set([node]);
    return node;
}
function putNewWindow(bounds: Rect, state: DataState) {
    let color = `hsl(${Math.random() * 360}, 70%, 40%)`;
    let window = {
        bounds,
        borderColor: color,
        resizing: {
            minWidth: 50,
            minHeight: 30,
        }
    };
    satisfyMinBounds(window);
    state.ruleBoxes.push(window);
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
    "select": selectionTool(new MultiClickDetector(500)),
};

export type ToolName = keyof typeof tools;

export const metaEditingTool: MouseInteraction<MainState> = multiplexTool(state => tools[state.selectedTool]);


export function selectTool(state: MainState, tool: ToolName) {
    state.selectedTool = tool;
    state.data.selectedNodes = new Set();
    if (tool === "play") {
        pushToHistory(state); // the play tool starts execution, push an undo point so that it can be reset
        state.data.action = { kind: "auto" };
    } else {
        state.data.action = null;
    }
}

export const metaWindowTool: MouseInteraction<MainState> = multiplexTool(state => {
    if (state.selectedTool === "delete") {
        return deleteWindowTool;
    } else {
        return windowMovingTool;
    }
});

export const windowMovingTool: MouseInteraction<MainState> = toolWithUndo(mapTool(
    s => s.ruleBoxes,
    s => makeWindowMovingTool({
        moveWindow(window) {
            let insideNodes = new Set(s.graph.nodes.filter((node) => Rect.contains(window.bounds, node.x, node.y)));
            let connectedEdges = s.graph.edges.filter(edge => insideNodes.has(edge.a) != insideNodes.has(edge.b));
            return (dx, dy) => {
                for (let node of insideNodes) {
                    node.x += dx;
                    node.y += dy;
                }
                stretchEdgesToRelax(connectedEdges);
            };
        },
        clickWindow(window) {
            s.selectedRule = window;
        }
    })
));
const deleteWindowTool: MouseInteraction<MainState> = toolWithUndo((state: DataState, x: number, y: number): MouseClickResponse => {
    for (let [i, box] of state.ruleBoxes.entries()) {
        let titleArea = calcWindowTitleArea(box.bounds);
        if (Rect.contains(titleArea, x, y)) {
            state.ruleBoxes.splice(i, 1);
            return "Click";
        }
    }
    return "Ignore";
});
