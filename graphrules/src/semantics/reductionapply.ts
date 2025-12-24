import { Graph, GraphNode } from "../../../localgraphs/src/graph"
import { randomChoice } from "../../../shared/utils"
import { abstractifyGraphSimple } from "../graphviewimpl"
import { getRealForVirtualNormal, makeVirtualGraphEmbedding, VirtualGraphEmbedding, VirtualNode } from "./boxsemantics"
import { DataState, RuleBoxState, UiNodeData } from "./state"
import { makeDefaultReductionRules, ReductionRule } from "./reductions"
import { findRuleMatches } from "./rule/patternmatching"

export const ruleTimers = [
    0, 0, 0, 0, 0, 0,
]

export const ruleCounters = [
    0, 0, 0, 0, 0, 0,
]

function decodeReductionMatch<V>(graph: Graph<UiNodeData>, match: Map<V, VirtualNode>): Map<V, GraphNode<UiNodeData>> {
    let entriesMapped = match.entries().map(([a, mapped]) => {
        if (mapped.kind === "normal") {
            return [a, getRealForVirtualNormal(mapped, graph)] satisfies [V, GraphNode<UiNodeData>]
        } else if (mapped.kind === "root") {
            return null
        } else {
            throw new Error("box reductions unsupported")
        }
    })
    return new Map(entriesMapped.filter(e => e != null))
}

export function applyExhaustiveReduction(graph: Graph<UiNodeData>, ruleBoxes: RuleBoxState[]) {
    let rules = makeDefaultReductionRules()
    let changed: boolean
    do {
        changed = false
        for (let [i,rule] of rules.entries()) {
            let startTime = performance.now()
            // use vgraph so that e.g. it is possible to match nodes only outside rule boxes
            let vgraph = makeVirtualGraphEmbedding(graph, ruleBoxes)
            // take the first match
            let matchResult = findRuleMatches(rule.pattern, vgraph.virtualGraph).next()
            let endTime = performance.now()
            ruleTimers[i] += endTime - startTime
            ruleCounters[i] += 1
            if (!matchResult.done) {
                let match = decodeReductionMatch(graph, matchResult.value)
                rule.apply(graph, match)
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

export function applyReductionOnceRandomly(graph: Graph<UiNodeData>): boolean {
    let rules = makeDefaultReductionRules()
    for (let rule of rules) {
        let matches = [...findRuleMatches(rule.pattern, abstractifyGraphSimple(graph))]
        if (matches.length > 0) {
            let match = randomChoice(matches)
            rule.apply(graph, match)
            return true
        }
    }
    return false
}
