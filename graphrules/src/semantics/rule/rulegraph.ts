import { Label } from "../symbols"

// What a rule is.

// sufficient for finding matches
export type PatternGraph<V> = {
    pattern: LabeledGraph<V, Label>
    negativeEdges: [V, V][]
    freeVars: Set<Label>
}
// sufficient for finding matches and insert something into the graph
export type RuleGraph<V,W=V> = PatternGraph<V> & {
    insertion: LabeledGraph<W, Label>
    connectingEdges: Map<V, Set<W>> // from pattern to insertion
}
