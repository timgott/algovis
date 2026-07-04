import { allDistinctPairs, assert, mapFromFunction } from "../../../../shared/utils";
import { extractBetweenEdges, makeFinGraphFromNodesEdges } from "../../graphviewimpl";
import { parsePath } from "../parse_path";
import { Label, SYMBOL_RULE_INSERTION, SYMBOL_RULE_ROOT, SYMBOL_RULE_NONEDGE, SYMBOL_BOX_CENTER, SYMBOL_RULE_PATTERN, SYMBOL_BOX_INSIDE, SYMBOL_GLOBAL_ROOT, SYMBOL_FORALL, SYMBOL_RULE_VARS } from "../symbols";
import { RuleGraph } from "./rulegraph";

export type GraphWithParserAccess<V,L=Label> =
    LabeledGraph<V,L>
    & InducedSubgraphAccessor<V, LabeledGraph<V,L>>
    & LabeledNeighborAccessor<V, L>

// can be thrown anywhere for semantic issues
export class RuleSyntaxError<V> {
    constructor(public message: string, public locations: V[]) {
    }
}

function syntaxAssert<V>(condition: boolean, message: string, locations: V[]): asserts condition {
    if (!condition) {
        throw new RuleSyntaxError(message, locations)
    }
}

function parseSubgraphAtChild<V>(graph: GraphWithParserAccess<V>, ruleRoot: V, childLabel: Label) {
    let nodes = new Set(parsePath([childLabel, null], graph, ruleRoot))
    return graph.inducedSubgraph(nodes)
}

function* parseNegativeEdges<V>(graph: GraphWithParserAccess<V>, ruleRoot: V, patternSubgraph: FinGraph<V>): Generator<[V, V]> {
    let negativeSubgraph = parseSubgraphAtChild(graph, ruleRoot, SYMBOL_RULE_NONEDGE)
    syntaxAssert(negativeSubgraph.countEdges() == 0, "Negative edge markers should not be connected", [...negativeSubgraph.allNodes()])
    for (let [x, nodes] of extractBetweenEdges(graph, negativeSubgraph.allNodes(), patternSubgraph.allNodes())) {
        yield* allDistinctPairs([...nodes]);
    }
}

function parseNegativeSubgraph<V>(graph: GraphWithParserAccess<V>, ruleInside: V, patternSubgraph: FinGraph<V>): FinGraph<V> {
    let edges = parseNegativeEdges(graph, ruleInside, patternSubgraph)
    return makeFinGraphFromNodesEdges(patternSubgraph.allNodes(), edges)
}

function parseFreeVars<V>(graph: GraphWithParserAccess<V>, ruleRoot: V): Set<string> {
    return new Set<Label>(
        parsePath([SYMBOL_RULE_VARS, null], graph, ruleRoot)
            .map(v => graph.label(v))
    )
}


export function parseRule<V>(graph: GraphWithParserAccess<V>, ruleInside: V): RuleGraph<V> {
    syntaxAssert(graph.label(ruleInside) === SYMBOL_RULE_ROOT, "incorrect inside node of rule", [ruleInside])
    let pattern = parseSubgraphAtChild(graph, ruleInside, SYMBOL_RULE_PATTERN)
    let insertion = parseSubgraphAtChild(graph, ruleInside, SYMBOL_RULE_INSERTION)
    let connectingEdges = extractBetweenEdges(graph, pattern.allNodes(), insertion.allNodes())
    let negativeEdges = parseNegativeSubgraph(graph, ruleInside, pattern)
    let vars = parseFreeVars(graph, ruleInside)
    syntaxAssert(pattern.allNodes().size > 0, "must have nodes in pattern", [ruleInside])
    syntaxAssert(insertion.allNodes().size > 0, "rule must have insertion", [ruleInside])
    return {
        pattern,
        insertion,
        connectingEdges,
        negativeEdges,
        freeVars: vars
    }
}
