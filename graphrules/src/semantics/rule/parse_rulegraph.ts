import { allDistinctPairs, assert, mapFromFunction } from "../../../../shared/utils";
import { extractBetweenEdges, makeFinGraphFromNodesEdges } from "../../graphviewimpl";
import { Label, SYMBOL_RULE_INSERTION, SYMBOL_RULE_META, SYMBOL_RULE_NEGATIVE, SYMBOL_BOX_ROOT, SYMBOL_RULE_PATTERN, SYMBOL_BOX_INSIDE, SYMBOL_GLOBAL_ROOT, SYMBOL_FORALL } from "../symbols";
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

function parseBoxSubgraph<V>(graph: GraphWithParserAccess<V>, ruleInside: V, innerSymbol: Label, diagnosticName: string) {
    let patternRoot = expectExactlyOneNode(
        graph.neighborsWithLabel(ruleInside, innerSymbol),
        `Rule must have exactly one ${diagnosticName} child`,
        [ruleInside]
    )
    return graph.getContainerSubgraph({ outside: ruleInside, inside: patternRoot })
}

function* parseNegativeEdges<V>(graph: GraphWithParserAccess<V>, ruleInside: V, patternSubgraph: FinGraph<V>): Generator<[V, V]> {
    let negativeSubgraph = parseBoxSubgraph(graph, ruleInside, SYMBOL_RULE_NEGATIVE, "negative edges")
    syntaxAssert(negativeSubgraph.countEdges() == 0, "Negative edge markers should not be connected", [...negativeSubgraph.allNodes()])
    for (let [x, nodes] of extractBetweenEdges(graph, negativeSubgraph.allNodes(), patternSubgraph.allNodes())) {
        yield* allDistinctPairs([...nodes]);
    }
}

function parseNegativeSubgraph<V>(graph: GraphWithParserAccess<V>, ruleInside: V, patternSubgraph: FinGraph<V>): FinGraph<V> {
    let edges = parseNegativeEdges(graph, ruleInside, patternSubgraph)
    return makeFinGraphFromNodesEdges(patternSubgraph.allNodes(), edges)
}

function parseGlobalRoot<V>(graph: GraphWithParserAccess<V>): V {
    return expectExactlyOneNode(
        graph.nodesWithLabel(SYMBOL_GLOBAL_ROOT),
        "There must be exactly one global root",
        []
    )
}

function parseFreeVars<V>(graph: GraphWithParserAccess<V>, ruleInside: V): Set<string> {
    let metaRoot = expectExactlyOneNode(
        graph.neighborsWithLabel(ruleInside, SYMBOL_RULE_META),
        `Rule must have exactly one meta child`,
        [ruleInside]
    )
    let vars = new Set<Label>()
    for (let quantifierNode of graph.neighborsWithLabel(metaRoot, SYMBOL_FORALL)) {
        for (let neighbor of graph.neighbors(quantifierNode)) {
            let label = graph.label(neighbor)
            if (neighbor !== metaRoot) {
                syntaxAssert(label !== SYMBOL_GLOBAL_ROOT, "global root should not be connected to a quantifier", [quantifierNode])
                vars.add(label)
            }
        }
    }
    return vars
}


export function parseRule<V>(graph: GraphWithParserAccess<V>, ruleInside: V): RuleGraph<V> {
    syntaxAssert(graph.label(ruleInside) === SYMBOL_BOX_INSIDE, "incorrect inside node of rule", [ruleInside])
    let pattern = parseBoxSubgraph(graph, ruleInside, SYMBOL_RULE_PATTERN, "insertion")
    let insertion = parseBoxSubgraph(graph, ruleInside, SYMBOL_RULE_INSERTION, "insertion")
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
