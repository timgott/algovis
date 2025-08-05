import { InteractionController, UiStack } from "../../localgraphs/src/interaction/controller";
import { GraphLayoutPhysics, LayoutConfig } from "../../localgraphs/src/interaction/physics";
import { UndoHistory } from "../../localgraphs/src/interaction/undo";
import { initFullscreenCanvas } from "../../shared/canvas";
import { assertExists, ensured, requireHtmlElement } from "../../shared/utils";
import { OnlyGraphPhysicsSimulator, PaintingSystem, ToolController } from "./interaction";
import { FORALL_SYMBOL, OPERATOR_DEL, OPERATOR_NEW, OPERATOR_SET } from "./semantics";
import { cloneDataState, createClearedState, DataState, layoutStyle, MainPainter, MainState, metaEditingTool, pushToHistory, runActiveRuleTest, setSelectedLabel, ToolName, windowMovingTool } from "./ui";

let globalState: MainState = {
    data: createClearedState(),
    undoHistory: new UndoHistory<DataState>(1000, cloneDataState),
    selectedTool: "build",
}

// tool selection

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

// node labeling with special buttons

function enterLabel(label: string) {
    pushToHistory(globalState);
    setSelectedLabel(globalState, label);
    controller.requestFrame();
}

function operatorButton(id: string, operator: string) {
    let button = requireHtmlElement(id);
    button.addEventListener("click", () => {
        enterLabel(operator);
    });
    return button;
}

operatorButton("btn_op_for", FORALL_SYMBOL);
operatorButton("btn_op_new", OPERATOR_NEW);
operatorButton("btn_op_set", OPERATOR_SET);
operatorButton("btn_op_del", OPERATOR_DEL);

// node labeling by keyboard

document.addEventListener("keypress", (e) => {
    // set label of selected nodes
    enterLabel(e.key.trim())
})

// test button

requireHtmlElement("btn_test").addEventListener("click", () => {
    pushToHistory(globalState);
    runActiveRuleTest(globalState.data);
    controller.requestFrame();
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