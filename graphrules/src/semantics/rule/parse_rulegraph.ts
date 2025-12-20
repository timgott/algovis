import { allDistinctPairs, mapFromFunction } from "../../../../shared/utils";
import { extractBetweenEdges, makeFinGraphFromNodesEdges } from "../../graphviewimpl";
import { Label, SYMBOL_RULE_INSERTION, SYMBOL_RULE_NEGATIVE, SYMBOL_RULE_PATTERN } from "../symbols";
import { RuleGraph } from "./rulegraph";

export type GraphWithParserAccess<V,L=Label> =
    LabeledGraph<V,L>
    & ContainerSubgraphAccessor<V, LabeledGraph<V,L>>
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

function parseRuleSubgraph<V>(graph: GraphWithParserAccess<V>, ruleRoot: V, innerSymbol: Label, diagnosticName: string) {
    let patternRoots = graph.neighborsWithLabel(ruleRoot, innerSymbol)
    syntaxAssert(patternRoots.size === 1, `Rule must have exactly one ${diagnosticName} child`, [ruleRoot, ...patternRoots])
    let [patternRoot] = patternRoots
    return graph.getContainerSubgraph({ outside: ruleRoot, inside: patternRoot })
}

function* parseNegativeEdges<V>(graph: GraphWithParserAccess<V>, ruleRoot: V, patternSubgraph: FinGraph<V>): Generator<[V, V]> {
    let negativeSubgraph = parseRuleSubgraph(graph, ruleRoot, SYMBOL_RULE_NEGATIVE, "negative edges")
    syntaxAssert(negativeSubgraph.countEdges() == 0, "Negative edge markers should not be connected", [...negativeSubgraph.allNodes()])
    for (let [x, nodes] of extractBetweenEdges(graph, negativeSubgraph.allNodes(), patternSubgraph.allNodes())) {
        yield* allDistinctPairs([...nodes]);
    }
}

function parseNegativeSubgraph<V>(graph: GraphWithParserAccess<V>, ruleRoot: V, patternSubgraph: FinGraph<V>): FinGraph<V> {
    let edges = parseNegativeEdges(graph, ruleRoot, patternSubgraph)
    return makeFinGraphFromNodesEdges(patternSubgraph.allNodes(), edges)
}


export function parseRule<V>(graph: GraphWithParserAccess<V>, ruleRoot: V): RuleGraph<V> {
    let pattern = parseRuleSubgraph(graph, ruleRoot, SYMBOL_RULE_PATTERN, "pattern")
    let insertion = parseRuleSubgraph(graph, ruleRoot, SYMBOL_RULE_INSERTION, "insertion")
    let connectingEdges = extractBetweenEdges(graph, pattern.allNodes(), insertion.allNodes())
    let negativeEdges = parseNegativeSubgraph(graph, ruleRoot, pattern)
    let vars = new Set<Label>() // TODO!!!!!!!!!!!!!!!!
    return {
        pattern,
        insertion,
        connectingEdges,
        negativeEdges,
        freeVars: vars
    }
}
