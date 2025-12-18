import { makeDefaultReductionRules } from "./reductions"

export function applyExhaustiveReduction(state: DataState) {
    let rules = makeDefaultReductionRules(makePatternOptimizer(state.graph))
    let changed: boolean
    do {
        changed = false
        for (let [i,rule] of rules.entries()) {
            let startTime = performance.now()
            let match = findAllRuleMatches(getOutsideGraphFilter(state), rule)[0] ?? null
            let endTime = performance.now()
            ruleTimers[i] += endTime - startTime
            ruleCounters[i] += 1
            if (match !== null) {
                rule.apply(state.graph, match)
                changed = true
                break
            }
        }
    } while (changed)
    // Instead of retrying from the first rule again, it would be possible to
    // loop on each rule individually to save calls to the subgraph algorithm;
    // but very often we won't run more than one reduction per step. It is
    // better to keep the nice semantic properties of this version for now. For
    // performance optimization, it would be more clever to make an explicit
    // implementation of the reduction rules anyways.
}
