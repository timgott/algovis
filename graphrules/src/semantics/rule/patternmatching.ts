import { assert } from "../../../../shared/utils";
import { CspController, makeMostConstrainedOrdering, MultiConstraintPropagator, solveCsp } from "../../../../subgraph/src/csp";
import { DistinctnessPropagator, EdgePropagator, makeLabeledGraphDomains, NegativeEdgePropagator, VariablePropagator } from "../../../../subgraph/src/cspsubgraph";
import { Label, SYMBOL_GLOBAL_ROOT, SYMBOL_PATTERN_ROOT, WILDCARD_SYMBOL } from "../symbols";
import { PatternGraph } from "./rulegraph";

function replacePatternRootLabel<V>(graph: LabeledGraph<V, Label>): LabeledGraph<V, Label> {
    // TODO: root levels, reduce by one
    return {
        ...graph,
        label(v: V): Label {
            let l = graph.label(v)
            console.log("queried label of ", v)
            if (l === SYMBOL_PATTERN_ROOT) {
                console.log("Replaced!!!")
                return SYMBOL_GLOBAL_ROOT
            }
            return l
        }
    }
}

export function* findRuleMatches<V,W>(rule: PatternGraph<V>, host: LabeledGraph<W,Label>): Generator<Map<V, W>> {
    // TODO: need to think of proper semantics for variables. It shouldn't match rule boxes, global root, special symbols
    // use csp because it has a generic implementation
    let varsAndWildcard = new Set([...rule.freeVars, WILDCARD_SYMBOL])
    let domains = makeLabeledGraphDomains(replacePatternRootLabel(rule.pattern), host, varsAndWildcard)
    let constraints = new MultiConstraintPropagator<V, W>([
        new EdgePropagator(rule.pattern, host),
        new DistinctnessPropagator(),
        new VariablePropagator(rule.pattern, rule.freeVars, host),
        new NegativeEdgePropagator(rule.negativeEdges, host)
    ])
    let csp = new CspController<V, unknown, W>(
        constraints,
        makeMostConstrainedOrdering(),
        //makeMostConstrainingOrdering(constraints), // TODO: degree ordering
        domains
    )
    yield* solveCsp(csp)
}
