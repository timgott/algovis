import { InteractionController, UiStack } from "../../localgraphs/src/interaction/controller";
import { GraphLayoutPhysics, LayoutConfig } from "../../localgraphs/src/interaction/physics";
import { UndoHistory } from "../../localgraphs/src/interaction/undo";
import { initFullscreenCanvas } from "../../shared/canvas";
import { assertExists, ensured, requireHtmlElement } from "../../shared/utils";
import { OnlyGraphPhysicsSimulator, PaintingSystem, ToolController, wrapActionAfterRelease } from "./interaction";
import { SYMBOL_FORALL, OPERATOR_CONNECT, OPERATOR_DEL, OPERATOR_DISCONNECT, OPERATOR_NEW, OPERATOR_SET, SYMBOL_IN, SYMBOL_OUT_STEP, SYMBOL_OUT_EXHAUSTED, SYMBOL_PROGRAM_COUNTER, WILDCARD_SYMBOL } from "./semantics";
import { flattenState, unflattenState } from "./storage";
import { applyArrowAlignmentForces, applyDirectionAlignmentForces, applyExhaustiveReduction, applyRandomReduction, cloneDataState, createClearedState, DataState, layoutStyle, MainPainter, MainState, metaEditingTool, metaWindowTool, pushToHistory, runSelectedRule, selectTool, SYMBOL_ARROW_DOWN, SYMBOL_ARROW_LEFT, SYMBOL_ARROW_RIGHT, SYMBOL_ARROW_UP, ToolName, windowMovingTool, wrapSettleNewNodes, runSmallStepWithControlFlow, setLabelOnSelected, RuleRunner, runStepWithControlFlow, ruleTimers, ruleCounters } from "./ui";
import JSURL from "jsurl"
import { PanZoomController } from "./zooming";
import { Vector } from "../../shared/vector";

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

function saveState(): DataState {
    let flat = flattenState(globalState.data)
    let str = JSURL.stringify(flat)
    document.location.hash = str
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
        },
        running: false
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

// label input

function enterLabel(label: string) {
    runGlobalUndoableAction(g => {
        setLabelOnSelected(g, label);
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
    let set = state.data.selectedNodes
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

operatorButton("btn_op_for", SYMBOL_FORALL);
operatorButton("btn_op_new", OPERATOR_NEW);
operatorButton("btn_op_set", OPERATOR_SET);
operatorButton("btn_op_del", OPERATOR_DEL);
operatorButton("btn_op_connect", OPERATOR_CONNECT);
operatorButton("btn_op_disconnect", OPERATOR_DISCONNECT);
operatorButton("btn_op_in", SYMBOL_IN);
operatorButton("btn_op_step", SYMBOL_OUT_STEP);
operatorButton("btn_op_ex", SYMBOL_OUT_EXHAUSTED);
operatorButton("btn_op_pc", SYMBOL_PROGRAM_COUNTER);
operatorButton("btn_op_left", SYMBOL_ARROW_LEFT);
operatorButton("btn_op_right", SYMBOL_ARROW_RIGHT);
operatorButton("btn_op_up", SYMBOL_ARROW_UP);
operatorButton("btn_op_down", SYMBOL_ARROW_DOWN);
operatorButton("btn_op_wildcard", WILDCARD_SYMBOL);


// node labeling by keyboard

document.addEventListener("keydown", (e) => {
    if (e.ctrlKey) {
        if (e.key == "z") {
            undoButton.click()
        } else if (e.key == "y" || e.key == "Z") {
            redoButton.click()
        }
    }
})

// buttons

requireHtmlElement("btn_test").addEventListener("click", () => {
    runGlobalUndoableAction(g => {
        wrapSettleNewNodes(g.data, () => {
            runSelectedRule(g.data);
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
            runSelectedRule(g.data);
            applyExhaustiveReduction(g.data)
        })
    })
})

requireHtmlElement("btn_apply_repeat").addEventListener("click", () => {
    runGlobalUndoableAction(g => {
        wrapSettleNewNodes(g.data, () => {
            for (let i = 0; i < 10; i++) {
                runSelectedRule(g.data);
                applyExhaustiveReduction(g.data)
            }
        })
    })
})

requireHtmlElement("btn_step").addEventListener("click", () => {
    runGlobalUndoableAction(g => {
        wrapSettleNewNodes(g.data, () => {
            runSmallStepWithControlFlow(g.data)
        })
    })
})

const goButton = requireHtmlElement("btn_go")
goButton.addEventListener("click", () => {
    runGlobalUndoableAction(g => {
        g.running = !g.running
        controller.requestFrame()
    })
})

requireHtmlElement("btn_benchmark").addEventListener("click", () => {
    runGlobalUndoableAction(g => {
        let startTime = performance.now()
        while (runStepWithControlFlow(g.data)) {}
        let endTime = performance.now()
        console.log("Benchmark time:", endTime-startTime)
        alert(`Benchmark time: ${endTime-startTime} ms`)
        console.log("Rule timers", ruleTimers)
        console.log("Rule counters", ruleCounters)
        controller.requestFrame()
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
            new RuleRunner(() => globalState),
            new ToolController(() => globalState, wrapActionAfterRelease(metaEditingTool, setLabelTextboxFromSelected)),
            new ToolController(() => globalState, metaWindowTool),
            new OnlyGraphPhysicsSimulator(() => globalState.data.graph, physics),
            new PaintingSystem(() => globalState, new MainPainter(layoutStyle.nodeRadius)),
        ]),
    ),
)
initFullscreenCanvas(canvas)
controller.requestFrame()
