import { InteractionController, UiStack } from "../../localgraphs/src/interaction/controller";
import { GraphLayoutPhysics, LayoutConfig } from "../../localgraphs/src/interaction/physics";
import { UndoHistory } from "../../localgraphs/src/interaction/undo";
import { initFullscreenCanvas } from "../../shared/canvas";
import { assertExists, ensured, requireHtmlElement } from "../../shared/utils";
import { OnlyGraphPhysicsSimulator, PaintingSystem, ToolController } from "./interaction";
import { FORALL_SYMBOL, OPERATOR_CONNECT, OPERATOR_DEL, OPERATOR_DISCONNECT, OPERATOR_NEW, OPERATOR_SET } from "./semantics";
import { flattenState, unflattenState } from "./storage";
import { applyExhaustiveReduction, applyRandomReduction, cloneDataState, createClearedState, DataState, layoutStyle, MainPainter, MainState, metaEditingTool, metaWindowTool, pushToHistory, runActiveRuleTest, setSelectedLabel, ToolName, windowMovingTool, wrapSettleNewNodes } from "./ui";
import JSURL from "jsurl"

function tryLoadState(): DataState | null {
    let hash = window.location.search
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

function saveState(): DataState {
    let flat = flattenState(globalState.data)
    let str = JSURL.stringify(flat)
    document.location.search = str
    return unflattenState(JSURL.parse(str)) // try parse
}

let globalState: MainState = {
    data: tryLoadState() ?? createClearedState(),
    undoHistory: new UndoHistory<DataState>(1000, cloneDataState),
    selectedTool: "build",
}

function runGlobalUndoableAction(action: (g: MainState) => void) {
    pushToHistory(globalState)
    action(globalState)
    controller.requestFrame()
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
toolButton("delete");

// node labeling with special buttons

function enterLabel(label: string) {
    runGlobalUndoableAction(g => {
        setSelectedLabel(g, label);
    })
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
operatorButton("btn_op_connect", OPERATOR_CONNECT);
operatorButton("btn_op_disconnect", OPERATOR_DISCONNECT);

// node labeling by keyboard

document.addEventListener("keypress", (e) => {
    // set label of selected nodes
    enterLabel(e.key.trim())
})

// test button

requireHtmlElement("btn_test").addEventListener("click", () => {
    runGlobalUndoableAction(g => {
        runActiveRuleTest(g.data);
    })
})

requireHtmlElement("btn_reduce").addEventListener("click", () => {
    runGlobalUndoableAction(g => {
        applyRandomReduction(g.data);
    })
})

requireHtmlElement("btn_apply").addEventListener("click", () => {
    runGlobalUndoableAction(g => {
        wrapSettleNewNodes(g.data, () => {
            runActiveRuleTest(g.data);
            applyExhaustiveReduction(g.data)
        })
    })
})

requireHtmlElement("btn_apply_repeat").addEventListener("click", () => {
    runGlobalUndoableAction(g => {
        wrapSettleNewNodes(g.data, () => {
            for (let i = 0; i < 100; i++) {
                runActiveRuleTest(g.data);
                applyExhaustiveReduction(g.data)
            }
        })
    })
})

// persistence

requireHtmlElement("btn_save").addEventListener("click", () => {
    globalState.data = saveState() // load immediately to detect errors
})

// reset

requireHtmlElement("btn_reset").addEventListener("click", () => {
    runGlobalUndoableAction(g => {
        g.data = createClearedState()
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
    new ToolController(() => globalState, metaWindowTool),
    new OnlyGraphPhysicsSimulator(() => globalState.data.graph, physics),
    new PaintingSystem(() => globalState, new MainPainter(layoutStyle.nodeRadius))
]))
initFullscreenCanvas(canvas)
controller.requestFrame()