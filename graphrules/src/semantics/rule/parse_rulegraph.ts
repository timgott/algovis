import { allDistinctPairs, assert, mapFromFunction } from "../../../../shared/utils";
import { extractBetweenEdges, makeFinGraphFromNodesEdges } from "../../graphviewimpl";
import { Label, SYMBOL_RULE_INSERTION, SYMBOL_RULE_META, SYMBOL_RULE_NEGATIVE, SYMBOL_BOX_ROOT, SYMBOL_RULE_PATTERN, SYMBOL_BOX_INSIDE, SYMBOL_GLOBAL_ROOT } from "../symbols";
import { RuleGraph } from "./rulegraph";

export type GraphWithParserAccess<V,L=Label> =
    LabeledGraph<V,L>
    & ContainerSubgraphAccessor<V, LabeledGraph<V,L>>
    & LabeledNeighborAccessor<V, L>
    & DirectedSubgraphAccessor<V, L, LabeledGraph<V,L>>

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

function expectExactlyOneNode<V>(nodes: ReadonlySet<V>, errorMessage: string, extraErrorNodes: V[]): V {
    syntaxAssert(nodes.size === 1, errorMessage, [...extraErrorNodes, ...nodes])
    let [node] = nodes
    return node
}

function parseBoxSubgraph<V>(graph: GraphWithParserAccess<V>, ruleRoot: V, innerSymbol: Label, diagnosticName: string) {
    let patternRoot = expectExactlyOneNode(
        graph.neighborsWithLabel(ruleRoot, innerSymbol),
        `Rule must have exactly one ${diagnosticName} child`,
        [ruleRoot]
    )
    return graph.getContainerSubgraph({ outside: ruleRoot, inside: patternRoot })
}

const boxDirectedLayers = [
    new Set([SYMBOL_BOX_ROOT]),
    new Set([SYMBOL_BOX_INSIDE]),
    new Set([SYMBOL_RULE_META, SYMBOL_RULE_PATTERN, SYMBOL_RULE_INSERTION, SYMBOL_RULE_NEGATIVE]),
]

function parsePatternSubgraph<V>(graph: GraphWithParserAccess<V>, ruleInside: V, globalRoot: V) {
    let innerSymbol = SYMBOL_RULE_PATTERN
    let diagnosticName = "pattern"
    let patternRoot = expectExactlyOneNode(
        graph.neighborsWithLabel(ruleInside, innerSymbol),
        `Rule must have exactly one ${diagnosticName} child`,
        [ruleInside]
    )
    return graph.getDirectedSubgraph(patternRoot, boxDirectedLayers, globalRoot)
}

function* parseNegativeEdges<V>(graph: GraphWithParserAccess<V>, ruleInside: V, patternSubgraph: FinGraph<V>): Generator<[V, V]> {
    let negativeSubgraph = parseBoxSubgraph(graph, ruleInside, SYMBOL_RULE_NEGATIVE, "negative edges")
    syntaxAssert(negativeSubgraph.countEdges() == 0, "Negative edge markers should not be connected", [...negativeSubgraph.allNodes()])
    for (let [x, nodes] of extractBetweenEdges(graph, negativeSubgraph.allNodes(), patternSubgraph.allNodes())) {
        yield* allDistinctPairs([...nodes]);
    }
}

function parseNegativeSubgraph<V>(graph: GraphWithParserAccess<V>, ruleRoot: V, patternSubgraph: FinGraph<V>): FinGraph<V> {
    let edges = parseNegativeEdges(graph, ruleRoot, patternSubgraph)
    return makeFinGraphFromNodesEdges(patternSubgraph.allNodes(), edges)
}

function parseGlobalRoot<V>(graph: GraphWithParserAccess<V>): V {
    return expectExactlyOneNode(
        graph.nodesWithLabel(SYMBOL_GLOBAL_ROOT),
        "There must be exactly one global root",
        []
    )
}

export function parseRule<V>(graph: GraphWithParserAccess<V>, ruleRoot: V): RuleGraph<V> {
    let ruleInside = expectExactlyOneNode(
        graph.neighborsWithLabel(ruleRoot, SYMBOL_BOX_INSIDE),
        `There must be exactly one {SYMBOL_BOX_INSIDE} node for every rule`, [ruleRoot]
    )
    let globalRoot = parseGlobalRoot(graph)
    let pattern = parsePatternSubgraph(graph, ruleInside, globalRoot)
    let insertion = parseBoxSubgraph(graph, ruleInside, SYMBOL_RULE_INSERTION, "insertion")
    let connectingEdges = extractBetweenEdges(graph, pattern.allNodes(), insertion.allNodes())
    let negativeEdges = parseNegativeSubgraph(graph, ruleInside, pattern)
    let vars = new Set<Label>() // TODO!!!!!!!!!!!!!!!!
    syntaxAssert(pattern.allNodes().size > 0, "must have nodes in pattern", [ruleRoot])
    syntaxAssert(insertion.allNodes().size > 0, "rule must have insertion", [ruleRoot])
    return {
        pattern,
        insertion,
        connectingEdges,
        negativeEdges,
        freeVars: vars
    }
}
