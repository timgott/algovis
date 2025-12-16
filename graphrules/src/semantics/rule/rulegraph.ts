import { Label } from "../symbols"

// what is a rule
// TODO: variables
export type RuleGraph<V,W=V> = {
    pattern: LabeledGraph<V, Label>
    insertion: LabeledGraph<W, Label>
    connectingEdges: Map<V, Set<W>> // from pattern to insertion
    negativeEdges: [V, V][]
    vars: Set<Label>
}
