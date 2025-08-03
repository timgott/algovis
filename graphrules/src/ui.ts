import { Graph, GraphNode, NodeDataTransfer } from "../../localgraphs/src/graph"
import { WindowBounds } from "../../localgraphs/src/interaction/windows"
import { VarMap, VarNodeCloner, VarRule } from "./semantics"

type UiNodeData = {
    label: string,
    selected: boolean,
}

type RuleBoxState = WindowBounds

type Rule = VarRule<UiNodeData>

// for now, no "macro" rules (rules that apply inside other rules)
type UiState = {
    graph: Graph<UiNodeData>,
    ruleBoxes: RuleBoxState[],
    currentRule: Rule | null
}

const defaultNodeData: UiNodeData = {
    label: "",
    selected: false,
}
