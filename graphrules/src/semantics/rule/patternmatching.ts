import { assert } from "../../../../shared/utils";
import { CspController, makeMostConstrainedOrdering, MultiConstraintPropagator, solveCsp } from "../../../../subgraph/src/csp";
import { DistinctnessPropagator, EdgePropagator, makeLabeledGraphDomains, NegativeEdgePropagator, VariablePropagator } from "../../../../subgraph/src/cspsubgraph";
import { Label, WILDCARD_SYMBOL } from "../symbols";
import { PatternGraph } from "./rulegraph";

export function* findRuleMatches<V,W>(rule: PatternGraph<V>, host: LabeledGraph<W,Label>): Generator<Map<V, W>> {
    // use csp because it has a generic implementation
    let varsAndWildcard = new Set([...rule.freeVars, WILDCARD_SYMBOL])
    let domains = makeLabeledGraphDomains(rule.pattern, host, varsAndWildcard)
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
