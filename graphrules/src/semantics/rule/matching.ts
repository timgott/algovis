import { assert } from "../../../../shared/utils";
import { CspController, makeMostConstrainedOrdering, MultiConstraintPropagator, solveCsp } from "../../../../subgraph/src/csp";
import { DistinctnessPropagator, EdgePropagator, makeLabeledGraphDomains, VariablePropagator } from "../../../../subgraph/src/cspsubgraph";
import { Label } from "../symbols";
import { PatternGraph, RuleGraph } from "./rulegraph";

export function* findRuleMatches<V,W>(rule: PatternGraph<V>, host: LabeledGraph<W,Label>): Generator<Map<V, W>> {
    // TODO: negative edges
    assert(rule.negativeEdges.length === 0, "detecting negative edges not yet implemented")
    // use csp because it has a generic implementation
    let domains = makeLabeledGraphDomains(rule.pattern, host, rule.freeVars)
    let constraints = new MultiConstraintPropagator<V, W>([
        new EdgePropagator(rule.pattern, host),
        new DistinctnessPropagator(),
        new VariablePropagator(rule.pattern, rule.freeVars, host)
    ])
    let csp = new CspController<V, unknown, W>(
        constraints,
        makeMostConstrainedOrdering(),
        //makeMostConstrainingOrdering(constraints), // TODO: degree ordering
        domains
    )
    yield* solveCsp(csp)
}
