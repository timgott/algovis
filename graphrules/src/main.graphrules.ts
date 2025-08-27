import { InteractionController, UiStack } from "../../localgraphs/src/interaction/controller";
import { GraphLayoutPhysics, LayoutConfig } from "../../localgraphs/src/interaction/physics";
import { UndoHistory } from "../../localgraphs/src/interaction/undo";
import { initFullscreenCanvas } from "../../shared/canvas";
import { assertExists, ensured, requireHtmlElement } from "../../shared/utils";
import { OnlyGraphPhysicsSimulator, PaintingSystem, ToolController } from "./interaction";
import { SYMBOL_FORALL, OPERATOR_CONNECT, OPERATOR_DEL, OPERATOR_DISCONNECT, OPERATOR_NEW, OPERATOR_SET } from "./semantics";
import { flattenState, unflattenState } from "./storage";
import { applyArrowAlignmentForces, applyDirectionAlignmentForces, applyExhaustiveReduction, applyRandomReduction, cloneDataState, createClearedState, DataState, layoutStyle, MainPainter, MainState, metaEditingTool, metaWindowTool, pushToHistory, runActiveRuleTest, setSelectedLabel as setLabelOnSelected, setSelectedTool as selectTool, SYMBOL_ARROW_DOWN, SYMBOL_ARROW_LEFT, SYMBOL_ARROW_RIGHT, SYMBOL_ARROW_UP, ToolName, windowMovingTool, wrapSettleNewNodes } from "./ui";
import JSURL from "jsurl"
import { PanZoomController } from "./zooming";
import { Vector } from "../../shared/vector";

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

function initGlobalState(): MainState {
    let loadedState = tryLoadState()
    return {
        data: loadedState ?? createClearedState(),
        undoHistory: new UndoHistory<DataState>(1000, cloneDataState),
        selectedTool: loadedState === null ? "build" : "none",
        zoom: {
            offset: Vector.Zero,
            scale: 1
        }
    }
}

let globalState: MainState = initGlobalState()

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
        selectTool(globalState, toolName);
        controller.requestFrame();
    });
    return button;
}

toolButton("none");
toolButton("build");
toolButton("drag");
toolButton("move");
toolButton("rulebox");
toolButton("delete");
toolButton("shift");

// node labeling with special buttons

function enterLabel(label: string) {
    runGlobalUndoableAction(g => {
        setLabelOnSelected(g, label);
    })
}

function operatorButton(id: string, operator: string) {
    let button = requireHtmlElement(id);
    button.addEventListener("click", () => {
        enterLabel(operator);
    });
    return button;
}

operatorButton("btn_op_for", SYMBOL_FORALL);
operatorButton("btn_op_new", OPERATOR_NEW);
operatorButton("btn_op_set", OPERATOR_SET);
operatorButton("btn_op_del", OPERATOR_DEL);
operatorButton("btn_op_connect", OPERATOR_CONNECT);
operatorButton("btn_op_disconnect", OPERATOR_DISCONNECT);

// node labeling by keyboard

const specialKeys = {
    ArrowLeft: SYMBOL_ARROW_LEFT,
    ArrowRight: SYMBOL_ARROW_RIGHT,
    ArrowUp: SYMBOL_ARROW_UP,
    ArrowDown: SYMBOL_ARROW_DOWN,
    " ": "",
    Backspace: "",
    Delete: "",
}
document.addEventListener("keydown", (e) => {
    if (e.ctrlKey) {
        if (e.key == "z") {
            undoButton.click()
        } else if (e.key == "y" || e.key == "Z") {
            redoButton.click()
        }
    } else {
        // set label of selected nodes
        let key = e.key
        if (key in specialKeys) {
            enterLabel(specialKeys[key as (keyof typeof specialKeys)])
        } else if (key.length === 1) {
            enterLabel(key)
        } else {
            console.log("Key down:", key)
        }
    }
})

// test button

requireHtmlElement("btn_test").addEventListener("click", () => {
    runGlobalUndoableAction(g => {
        wrapSettleNewNodes(g.data, () => {
            runActiveRuleTest(g.data);
        })
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
            for (let i = 0; i < 10; i++) {
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
let undoButton = requireHtmlElement("btn_undo")
undoButton.addEventListener("click", () => {
    restoreFromHistory(globalState.undoHistory.undo(globalState.data));
});
let redoButton = requireHtmlElement("btn_redo")
redoButton.addEventListener("click", () => {
    restoreFromHistory(globalState.undoHistory.redo());
});

let physics = new GraphLayoutPhysics(layoutStyle, [applyDirectionAlignmentForces, applyArrowAlignmentForces])
let canvas = ensured(document.getElementById("canvas")) as HTMLCanvasElement;
let controller = new InteractionController(canvas,
    new PanZoomController(
        () => globalState.zoom,
        new UiStack([
            new ToolController(() => globalState, metaEditingTool),
            new ToolController(() => globalState, metaWindowTool),
            new OnlyGraphPhysicsSimulator(() => globalState.data.graph, physics),
            new PaintingSystem(() => globalState, new MainPainter(layoutStyle.nodeRadius))
        ]),
    ),
)
initFullscreenCanvas(canvas)
controller.requestFrame()
