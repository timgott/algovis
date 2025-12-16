import { CspController, makeMostConstrainedOrdering, MultiConstraintPropagator, solveCsp } from "../../../../subgraph/src/csp";
import { DistinctnessPropagator, EdgePropagator, makeLabeledGraphDomains, VariablePropagator } from "../../../../subgraph/src/cspsubgraph";
import { Label } from "../symbols";
import { RuleGraph } from "./rulegraph";

function* findMatches<V,W>(pattern: LabeledGraph<V, Label>, freeVars: Set<Label>, host: LabeledGraph<W,Label>): Generator<Map<V, W>> {
    // use csp because it has a generic implementation
    let domains = makeLabeledGraphDomains(pattern, host, freeVars)
    let constraints = new MultiConstraintPropagator<V, W>([
        new EdgePropagator(pattern, host),
        new DistinctnessPropagator(),
        new VariablePropagator(pattern, freeVars, host)
    ])
    let csp = new CspController<V, unknown, W>(
        constraints,
        makeMostConstrainedOrdering(),
        //makeMostConstrainingOrdering(constraints), // TODO: degree ordering
        domains
    )
    yield* solveCsp(csp)
}
