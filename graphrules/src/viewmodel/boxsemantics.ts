import { Graph, GraphNode } from "../../../localgraphs/src/graph";
import { WindowBounds } from "../../../localgraphs/src/interaction/windows";
import { collectBins } from "../../../shared/defaultmap";
import { Rect } from "../../../shared/rectangle";
import { invertMap, invertMultiMap, mapFromFunction, mapToIndex, neighborMapFromEdges, range, unreachable } from "../../../shared/utils";
import { makeFinGraphFromNodesEdges, makeLabeledGraphFromFingraph, makeParserGraphAccessor } from "../graphviewimpl";
import { GraphWithParserAccess } from "../semantics/rule/parse_rulegraph";
import { Label, OPERATOR_CONNECT, operatorsWithArgSymbols, operatorSymbols, ruleMetaSymbols, SYMBOL_RULE_INSERTION, SYMBOL_RULE_META, SYMBOL_RULE_NEGATIVE, SYMBOL_RULE_OUTSIDE, SYMBOL_RULE_PATTERN } from "../semantics/symbols";
import { RuleBoxState, UiNodeData } from "./state";

// describes how to turn boxes into a graph

const specialNodesChildren = [
    SYMBOL_RULE_PATTERN,
    SYMBOL_RULE_META,
    SYMBOL_RULE_INSERTION,
    SYMBOL_RULE_NEGATIVE,
] as const

const specialNodes = [
    SYMBOL_RULE_OUTSIDE,
    ...specialNodesChildren
] as const;

type SpecialBoxSymbol = typeof specialNodes[number]

type VirtualNode = {
    kind: "normal",
    index: number
} | {
    kind: "box",
    special: SpecialBoxSymbol
    box: RuleBoxState
}

// default UI semantics (can later implement inside the language if needed)
function getNodeTypesForNode(node: GraphNode<UiNodeData>): (typeof specialNodesChildren[number])[] {
    if (ruleMetaSymbols.has(node.data.label)) {
        // meta nodes are treated separately
        return [SYMBOL_RULE_META]
    }
    if (node.data.label === OPERATOR_CONNECT) {
        // special case: connect operator causes negative pattern edges
        return [SYMBOL_RULE_INSERTION, SYMBOL_RULE_NEGATIVE]
    } else if (operatorSymbols.has(node.data.label)) {
        // operators are inserted, as well as their arguments (then later a reduction will apply to them)
        return [SYMBOL_RULE_INSERTION]
    } else if (node.neighbors.find(x => operatorsWithArgSymbols.has(x.data.label))) {
        // arguments are also inserted into graph
        return [SYMBOL_RULE_INSERTION]
    } else {
        // normal nodes describe pattern
        return [SYMBOL_RULE_PATTERN]
    }
}

function calcNodesByBoxes(graph: Graph<UiNodeData>, ruleBoxes: RuleBoxState[]): Map<WindowBounds, GraphNode<UiNodeData>[]> {
    return mapFromFunction(
        ruleBoxes,
        box => graph.nodes.filter(v => Rect.containsPos(box.bounds, v))
    )
}

function makeNodeAndBoxGraphAccessor(graph: Graph<UiNodeData>, ruleBoxes: RuleBoxState[]): GraphWithParserAccess<VirtualNode> {
    let normalNodesToVirtual = mapFromFunction<GraphNode<UiNodeData>, VirtualNode>(
        graph.nodes,
        (x, index) => ({ kind: "normal", index })
    )
    let boxesToVirtual = mapFromFunction<RuleBoxState, Map<SpecialBoxSymbol, VirtualNode>>(
        ruleBoxes,
        box => mapFromFunction(specialNodes,
            symbol => ({ kind: "box", special: symbol, box})
        )
    )

    let nodesByBoxes = calcNodesByBoxes(graph, ruleBoxes)

    let edges: [VirtualNode, VirtualNode][] = []
    for (let edge of graph.edges) {
        edges.push([normalNodesToVirtual.get(edge.a)!, normalNodesToVirtual.get(edge.b)!])
    }
    for (let box of ruleBoxes) {
        // make a root node for the box and connect all the special nodes to it
        const boxNodes = boxesToVirtual.get(box)!
        const root = boxNodes.get(SYMBOL_RULE_OUTSIDE)!
        for (let child of specialNodesChildren) {
            edges.push([root, boxNodes.get(child)!])
        }

        // connect all nodes inside the box to the appropriate special connector
        let insideNodes = nodesByBoxes.get(box)!
        for (let node of insideNodes) {
            let categories = getNodeTypesForNode(node)
            for (let category of categories) {
                edges.push([boxNodes.get(category)!, normalNodesToVirtual.get(node)!])
            }
        }
    }

    let nodes = new Set([
        ...normalNodesToVirtual.values(),
        ...boxesToVirtual.values().flatMap(x => x.values()),
    ])

    let fingraph = makeFinGraphFromNodesEdges(nodes, edges)
    let lgraph = makeLabeledGraphFromFingraph(fingraph, node => {
        if (node.kind === "normal") {
            return graph.nodes[node.index].data.label
        } else {
            return node.special
        }
    })
    return makeParserGraphAccessor(lgraph)
}
