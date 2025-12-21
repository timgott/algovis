import { createEdge, createNode, deleteEdge, Graph, GraphEdge, GraphNode } from "../../../localgraphs/src/graph";
import { stretchEdgesToFit, stretchEdgesToRelax } from "../../../localgraphs/src/interaction/physics";
import { WindowBounds } from "../../../localgraphs/src/interaction/windows";
import { collectBins } from "../../../shared/defaultmap";
import { Rect } from "../../../shared/rectangle";
import { assert, ensured, invertMap, invertMultiMap, mapFromFunction, mapObject, mapToIndex, neighborMapFromEdges, range, unreachable, ValueOf } from "../../../shared/utils";
import { makeFinGraphFromNodesEdges, makeLabeledGraphFromFingraph, makeParserGraphAccessor } from "../graphviewimpl";
import { CollectInsertions as GraphInsertionsCollector } from "../grapheditorimpl";
import { placeNewNodesBetweenOld } from "../semantics/placement";
import { GraphWithParserAccess } from "../semantics/rule/parse_rulegraph";
import { applyRule } from "../semantics/rule/rule_application";
import { RuleGraph } from "../semantics/rule/rulegraph";
import { Label, OPERATOR_CONNECT, operatorsWithArgSymbols, operatorSymbols, ruleMetaSymbols, SYMBOL_RULE_INSERTION, SYMBOL_RULE_META, SYMBOL_RULE_NEGATIVE, SYMBOL_RULE_OUTSIDE, SYMBOL_RULE_PATTERN } from "../semantics/symbols";
import { defaultNodeData, RuleBoxState, UiNodeData } from "./state";

// VirtualGraph: underlying graph of the node and boxes hierarchy

const boxConnectorLabels = {
    root: SYMBOL_RULE_OUTSIDE,
    children: {
        pattern: SYMBOL_RULE_PATTERN,
        meta: SYMBOL_RULE_META,
        insertion: SYMBOL_RULE_INSERTION,
        negative: SYMBOL_RULE_NEGATIVE
    }
} as const

type BoxSubConnectorSymbol = ValueOf<typeof boxConnectorLabels.children>
type BoxConnectorSymbol = typeof boxConnectorLabels.root | BoxSubConnectorSymbol

const boxSubConnectorSymbols: BoxSubConnectorSymbol[] = Object.values(boxConnectorLabels.children)

export type VirtualNodeNormal = {
    kind: "normal",
    index: number
    _debug_source: unknown
}
type VirtualNodeBox =  {
    kind: "box",
    special: BoxConnectorSymbol
    box: RuleBoxState
}
export type VirtualNode = VirtualNodeNormal | VirtualNodeBox

// default UI semantics (can later implement inside the language if needed)
function getNodeTypesForNode(node: GraphNode<UiNodeData>): BoxSubConnectorSymbol[] {
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

type VirtualBoxNodesMap = {
    root: VirtualNode,
    children: Map<BoxSubConnectorSymbol, VirtualNode>
}

export type VirtualGraphEmbedding = {
    virtualGraph: GraphWithParserAccess<VirtualNode>,
    nodeMapping: Map<GraphNode<UiNodeData>, VirtualNode>,
    boxMapping: Map<RuleBoxState, VirtualBoxNodesMap>,
}

export function getRealForVirtualNormal(vnode: VirtualNodeNormal, graph: Graph<UiNodeData>): GraphNode<UiNodeData> {
    return ensured(graph.nodes[vnode.index])
}

export function getVirtualForReal(emb: VirtualGraphEmbedding, graphNode: GraphNode<UiNodeData>): VirtualNode {
    return ensured(emb.nodeMapping.get(graphNode))
}

export function makeVirtualGraphEmbedding(graph: Graph<UiNodeData>, ruleBoxes: RuleBoxState[]): VirtualGraphEmbedding {
    let normalNodesToVirtual = mapFromFunction<GraphNode<UiNodeData>, VirtualNode>(
        graph.nodes,
        (x, index) => ({ kind: "normal", index, _debug_source: x.data.label })
    )
    let boxesToVirtual = mapFromFunction<RuleBoxState, VirtualBoxNodesMap>(
        ruleBoxes,
        box => ({
            root: { kind: "box", special: boxConnectorLabels.root, box } satisfies VirtualNode,
            children: mapFromFunction(boxSubConnectorSymbols, symbol => (
                {
                    kind: "box",
                    special: symbol,
                    box
                } satisfies VirtualNode
            ))
        })
    )

    let nodesByBoxes = calcNodesByBoxes(graph, ruleBoxes)

    let edges: [VirtualNode, VirtualNode][] = []
    for (let edge of graph.edges) {
        edges.push([normalNodesToVirtual.get(edge.a)!, normalNodesToVirtual.get(edge.b)!])
    }
    for (let box of ruleBoxes) {
        // make a root node for the box and connect all the special nodes to it
        const boxNodes = boxesToVirtual.get(box)!
        const root = boxNodes.root

        for (let [symbol, childNode] of boxNodes.children) {
            edges.push([root, childNode])
        }

        // connect all nodes inside the box to the appropriate special connector
        let insideNodes = nodesByBoxes.get(box)!
        for (let node of insideNodes) {
            let categories = getNodeTypesForNode(node)
            for (let category of categories) {
                edges.push([boxNodes.children.get(category)!, normalNodesToVirtual.get(node)!])
            }
        }
    }

    let nodes = new Set([
        ...normalNodesToVirtual.values(),
        ...boxesToVirtual.values().flatMap(boxNodes => [boxNodes.root, ...boxNodes.children.values()]),
    ])

    let fingraph = makeFinGraphFromNodesEdges(nodes, edges)
    let lgraph = makeLabeledGraphFromFingraph(fingraph, node => {
        if (node.kind === "normal") {
            return getRealForVirtualNormal(node, graph).data.label
        } else {
            return node.special
        }
    })
    return {
        virtualGraph: makeParserGraphAccessor(lgraph),
        nodeMapping: normalNodesToVirtual,
        boxMapping: boxesToVirtual
    }
}

export function makeVirtualGraphToRealInserter(graph: Graph<UiNodeData>)
: ConnectingLabeledGraphInserter<GraphNode<UiNodeData>, Label, VirtualNode, GraphEdge<UiNodeData>> {
    return {
        insertNode(label: string): GraphNode<UiNodeData> {
            return createNode(graph, { ...defaultNodeData, label });
        },
        insertEdge(a: GraphNode<UiNodeData>, b: GraphNode<UiNodeData>): GraphEdge<UiNodeData> {
            return createEdge(graph, a, b)
        },
        insertConnectingEdge(a: VirtualNode, b: GraphNode<UiNodeData>): void {
            if (a.kind === "box") {
                throw new Error("rule that puts node inside existing box is not possible yet!!!");
            } else if (a.kind === "normal") {
                createEdge(graph, getRealForVirtualNormal(a, graph), b);
            } else {
                unreachable(a);
            }
        },
    }
}

// the mapping of VirtualNode in match.values must refer to nodes in graph.nodes
export function applyRuleOnGraph(rule: RuleGraph<VirtualNode>, match: Map<VirtualNode, VirtualNode>, emb: VirtualGraphEmbedding, graph: Graph<UiNodeData>) {
    let inserter = new GraphInsertionsCollector(makeVirtualGraphToRealInserter(graph))
    applyRule(rule, match, emb.virtualGraph.label, inserter)
    // TODO: placement inside boxes?
    let normalExistingNodes =
        match.values()
            .filter(x => x.kind === "normal")
            .map(vnode => getRealForVirtualNormal(vnode, graph))
    // TODO: make length of edges at least the length in the pattern
    // old placement logic: insert edges with length=dist(a,b)
    placeNewNodesBetweenOld(inserter.newNodes, normalExistingNodes)
    stretchEdgesToFit(inserter.edges)
}
