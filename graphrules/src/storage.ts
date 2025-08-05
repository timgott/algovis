import { FlatGraph, flattenGraph, unflattenGraph } from "./graphjson";
import { createClearedState, DataState, RuleBoxState, UiNodeData } from "./ui";

type StoredNodeData = string

type StorableDataState = {
    graph: FlatGraph<StoredNodeData>,
    ruleBoxes: RuleBoxState[],
}

export function flattenState(state: DataState): StorableDataState {
    return {
        graph: flattenGraph(state.graph, x => x.label),
        ruleBoxes: state.ruleBoxes
    }
}

export function unflattenState(flat: StorableDataState): DataState {
    return {
        ...createClearedState(),
        graph: unflattenGraph(flat.graph, x => ({label: x})),
        ruleBoxes: flat.ruleBoxes,
    }
}