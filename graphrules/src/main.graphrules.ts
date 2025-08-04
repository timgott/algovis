import { InteractionController, UiStack } from "../../localgraphs/src/interaction/controller";
import { GraphLayoutPhysics, LayoutConfig } from "../../localgraphs/src/interaction/physics";
import { UndoHistory } from "../../localgraphs/src/interaction/undo";
import { initFullscreenCanvas } from "../../shared/canvas";
import { assertExists, ensured, requireHtmlElement } from "../../shared/utils";
import { OnlyGraphPhysicsSimulator, PaintingSystem, ToolController } from "./interaction";
import { cloneDataState, createClearedState, DataState, MainPainter, MainState, metaEditingTool, ToolName, windowMovingTool } from "./ui";

let globalState: MainState = {
    data: createClearedState(),
    undoHistory: new UndoHistory<DataState>(1000, cloneDataState),
    selectedTool: "build",
}

const layoutStyle: LayoutConfig = {
    nodeRadius: 14,
    pushDistance: 30,
    minEdgeLength: 30,
    pushForce: 30.0,
    edgeForce: 100.0,
    centeringForce: 0.0,
    dampening: 5.0,
    sleepVelocity: 0.5,
}

function toolButton(toolName: ToolName) {
    let id = `tool_${toolName}`;
    let button = requireHtmlElement(id);
    button.addEventListener("click", () => {
        globalState.selectedTool = toolName as any;
        controller.requestFrame();
    });
    return button;
}

toolButton("build");
toolButton("drag");
toolButton("move");
toolButton("rulebox");

// history
function restoreFromHistory(newState: DataState | null) {
    if (newState) {
        globalState.data = newState;
        controller.requestFrame();
    } else {
        console.log("End of history");
    }
}
let undoButton = requireHtmlElement("btn_undo").addEventListener("click", () => {
    restoreFromHistory(globalState.undoHistory.undo(globalState.data));
});
let redoButton = requireHtmlElement("btn_redo").addEventListener("click", () => {
    restoreFromHistory(globalState.undoHistory.redo());
});

let physics = new GraphLayoutPhysics(layoutStyle)
let canvas = ensured(document.getElementById("canvas")) as HTMLCanvasElement;
let controller = new InteractionController(canvas, new UiStack([
    new ToolController(() => globalState, metaEditingTool),
    new ToolController(() => globalState, windowMovingTool),
    new OnlyGraphPhysicsSimulator(() => globalState.data.graph, physics),
    new PaintingSystem(() => globalState, new MainPainter(layoutStyle.nodeRadius))
]))
initFullscreenCanvas(canvas)
controller.requestFrame()