import { Graph, GraphNode } from "../../../localgraphs/src/graph"
import { UndoHistory } from "../../../localgraphs/src/interaction/undo"
import { WindowBounds } from "../../../localgraphs/src/interaction/windows"
import { DefaultMap } from "../../../shared/defaultmap"
import { ToolName } from "../ui"
import { ZoomState } from "../zooming"

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
