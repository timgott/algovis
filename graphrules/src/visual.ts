import { Graph } from "../../localgraphs/src/graph"
import { WindowBounds } from "../../localgraphs/src/interaction/windows"
import { PatternRule } from "./reduction"

type UiNodeData = {
    label: string,
    highlightColor: string,
    selected: boolean,
}

type NodeData = {
    label: string
}

type RuleBoxState = WindowBounds

type Rule = PatternRule<NodeData, NodeData, Map<string, string>>

// for now, no "macro" rules (rules that apply inside other rules)
type ModelState = {
    mainGraph: Graph<NodeData>,
    // TODO: extract variable unification from subgraph into its own file
    rules: Rule[]
    currentRule: Rule | null,
}

type UiState = {
    viewGraph: Graph<UiNodeData>,
    ruleBoxes: RuleBoxState[],
    model: ModelState,
}

// two-way binding between model and view
export function updateUiStateFromModel(ui: UiState, model: ModelState) {}
export function updateModelFromUi(ui: UiState, model: ModelState) {}