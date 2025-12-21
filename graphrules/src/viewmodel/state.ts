import { Graph, GraphNode } from "../../../localgraphs/src/graph"
import { UndoHistory } from "../../../localgraphs/src/interaction/undo"
import { WindowBounds } from "../../../localgraphs/src/interaction/windows"
import { DefaultMap } from "../../../shared/defaultmap"
import { ToolName } from "../tools"
import { ZoomState } from "../zooming"
import { VirtualGraphEmbedding, VirtualNode } from "./boxsemantics"

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

export type RuleMatch = Map<VirtualNode, VirtualNode>

export type ActionStatePlayer = {
    kind: "player",
    color: string,
    virtualEmbedding: VirtualGraphEmbedding,
    matches: RuleMatch[],
    matchesByNode: DefaultMap<VirtualNode, RuleMatch[]>,
    stepIndex: number,
    patternOrder: VirtualNode[],
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

export const defaultNodeData: UiNodeData = {
    label: "",
}
