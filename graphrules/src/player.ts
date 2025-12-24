import { GraphNode } from "../../localgraphs/src/graph"
import { collectBins, DefaultMap } from "../../shared/defaultmap"
import { assert, ensured, randomChoice } from "../../shared/utils"
import { VirtualGraph } from "../../socialchoice/src/virtualgraph"
import { Label, metaSymbols } from "./semantics/symbols"
import { VirtualNode } from "./semantics/boxsemantics"
import { ActionStatePlayer, RuleMatch, UiNodeData } from "./semantics/state"

export function computeChangingSet(actionState: ActionStatePlayer): Map<VirtualNode, RuleMatch[]> {
    return actionState.matchesByNode.toMap()
        .filter((x, matches) =>
            matches.length === 1
            || (matches.length > 0 && matches.length < actionState.matches.length)
        )
}

export function computeIndexedStepSet(actionState: ActionStatePlayer): Map<VirtualNode, RuleMatch[]> {
    while (true) {
        if (actionState.stepIndex >= actionState.patternOrder.length) {
            // probably just a single match
            return new Map()
        }
        let stepNode = actionState.patternOrder[actionState.stepIndex]
        let bins = collectBins(actionState.matches, match => [ensured(match.get(stepNode))]).toMap()
        if (bins.size > 1) {
            return bins
        }
        // increase step index until it distinguishes the matches
        actionState.stepIndex++
    }
}

export function getControllingPlayer<V>(marker: GraphNode<UiNodeData>): string | null {
    let players = [...marker.neighbors].map(n => n.data.label).filter(x => !metaSymbols.has(x))
    if (players.length === 0) {
        return null
    }
    if (players.length > 1) {
        console.warn("Multiple players for rule! Attached player count:", players.length)
    }
    return randomChoice(players)
}

export function computeMatchesByNode(matches: RuleMatch[]): DefaultMap<VirtualNode, RuleMatch[]> {
    return collectBins(matches, (match) => match.values())
}

export function playerClickNode(actionState: ActionStatePlayer, node: GraphNode<UiNodeData>): boolean {
    let vnode = ensured(actionState.virtualEmbedding.nodeMapping.get(node))
    let changingSet = computeChangingSet(actionState)
    let indexedSet = computeIndexedStepSet(actionState)
    let newMatchSet = indexedSet.get(vnode) ?? changingSet.get(vnode)
    if (newMatchSet !== undefined) {
        assert(newMatchSet.length > 0, "misunderstood truthiness in Javascript again")
        actionState.matches = newMatchSet
        actionState.matchesByNode = computeMatchesByNode(newMatchSet)
        if (indexedSet.has(vnode)) {
            actionState.stepIndex++
        }
        if (newMatchSet.length === 1) {
            // execute rule
            let [match] = newMatchSet
            actionState.execute(match)
        }
        return true
    }
    return false
}
