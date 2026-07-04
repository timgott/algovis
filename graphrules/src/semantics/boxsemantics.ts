import { createEdge, createNode, Graph, GraphEdge, GraphNode } from "../../../localgraphs/src/graph";
import { stretchEdgesToFit } from "../../../localgraphs/src/interaction/physics";
import { Rect } from "../../../shared/rectangle";
import { assert, ensured, mapFromFunction, min, unreachable, ValueOf } from "../../../shared/utils";
import { abstractifyGraphSimple, collectDirectedSubgraphNodes, makeFinGraphFromNodesEdges, makeLabeledGraphFromFingraph, makeParserGraphAccessor } from "../graphviewimpl";
import { CollectInsertions as GraphInsertionsCollector } from "../grapheditorimpl";
import { placeNewNodesBetweenOld } from "./placement";
import { GraphWithParserAccess } from "./rule/parse_rulegraph";
import { applyRule } from "./rule/rule_application";
import { RuleGraph } from "./rule/rulegraph";
import { Label, SYMBOL_BOX_CENTER, SYMBOL_GLOBAL_ROOT, SYMBOL_BOX_INSIDE, SYMBOL_BOX_OUTSIDE } from "./symbols";
import { defaultNodeData, BoxState, UiNodeData } from "./state";
import { Positioned } from "../../../shared/vector";
import { sortedBy } from "../../../shared/sort";

// VirtualGraph: underlying graph of the node and boxes hierarchy

const boxConnectorLabels = {
    outside: SYMBOL_BOX_OUTSIDE,
    root: SYMBOL_BOX_CENTER,
    inside: SYMBOL_BOX_INSIDE,
} as const

type BoxConnectorSymbol = ValueOf<typeof boxConnectorLabels>

export type VirtualNodeNormal = {
    kind: "normal",
    index: number,
    sourceNode: GraphNode<UiNodeData>
}
export type VirtualNodeBox =  {
    kind: "box",
    special: BoxConnectorSymbol
    box: BoxState
}
export type VirtualNode = VirtualNodeNormal | VirtualNodeBox

function findNodesInBox<P extends Positioned>(box: BoxState, nodes: P[]): P[] {
    return nodes.filter(node => Rect.containsPos(box.bounds, node))
}

// can be done faster if necessary (sort boxes by size, grid marking top-left and bottom-right)
function findBoxContainingBox(box: BoxState, allBoxes: BoxState[]): BoxState | undefined {
    let boxes = allBoxes.filter(containingBox => containingBox != box && Rect.containsRect(containingBox.bounds, box.bounds))
    return min(boxes, box => Rect.area(box.bounds))
}

type VirtualBoxNodesMap = {
    center: VirtualNode,
    inside: VirtualNode,
    outside: VirtualNode,
}

export type VirtualGraphEmbedding = {
    virtualGraph: GraphWithParserAccess<VirtualNode>,
    nodeMapping: Map<GraphNode<UiNodeData>, VirtualNode>,
    boxMapping: Map<BoxState, VirtualBoxNodesMap>,
}

export function getRealForVirtualNormal(vnode: VirtualNodeNormal, graph: Graph<UiNodeData>): GraphNode<UiNodeData> {
    assert(graph.nodes.find(n => n === vnode.sourceNode) !== undefined, "graph does not match vnode")
    return vnode.sourceNode
}

export function getVirtualForReal(emb: VirtualGraphEmbedding, graphNode: GraphNode<UiNodeData>): VirtualNode {
    return ensured(emb.nodeMapping.get(graphNode))
}

export const boxDirectedLayers = [
    new Set([SYMBOL_BOX_OUTSIDE]),
    new Set([SYMBOL_BOX_CENTER]),
    new Set([SYMBOL_BOX_INSIDE]),
]

// Returns all nodes that are connected to a global root or rule root.
// Does not return the roots themselves unless they are rooted.
function findRootedNodes<V>(graph: LabeledGraph<V, Label>): Set<V> {
    let roots = [...graph.nodesWithLabel(SYMBOL_GLOBAL_ROOT), ...graph.nodesWithLabel(SYMBOL_BOX_OUTSIDE)]
    // first layer is already the root, so the next layer has to be the inside layer
    let cycle = [boxDirectedLayers[1], boxDirectedLayers[2], boxDirectedLayers[0]]
    return collectDirectedSubgraphNodes(graph, roots, cycle)
}

function findUnrootedNodes<V>(graph: LabeledGraph<V, Label>) {
    return graph.allNodes().difference(findRootedNodes(graph))
}

export function makeVirtualGraphEmbedding(graph: Graph<UiNodeData>, ruleBoxes: BoxState[]): VirtualGraphEmbedding {
    let normalNodesToVirtual = mapFromFunction<GraphNode<UiNodeData>, VirtualNode>(
        graph.nodes,
        (x, index) => ({ kind: "normal", index, sourceNode: x })
    )
    let boxesToVirtual = mapFromFunction<BoxState, VirtualBoxNodesMap>(
        ruleBoxes,
        box => ({
            center: { kind: "box", special: boxConnectorLabels.root, box } satisfies VirtualNode,
            inside: { kind: "box", special: boxConnectorLabels.inside, box },
            outside: { kind: "box", special: boxConnectorLabels.outside, box },
        })
    )

    let labels = (node: VirtualNode) => {
        if (node.kind === "normal") {
            return getRealForVirtualNormal(node, graph).data.label
        } else if (node.kind === "box") {
            return node.special
        } else {
            unreachable(node)
        }
    }

    let nodes = new Set([
        ...normalNodesToVirtual.values(),
        ...boxesToVirtual.values().flatMap(boxNodes => [boxNodes.center, boxNodes.inside, boxNodes.outside]),
    ])

    let edges: [VirtualNode, VirtualNode][] = []
    // add edges between normal nodes
    for (let edge of graph.edges) {
        edges.push([normalNodesToVirtual.get(edge.a)!, normalNodesToVirtual.get(edge.b)!])
    }

    // Connect virtual box root and box connectors
    for (let box of ruleBoxes) {
        // connect all the special nodes to the root
        const boxNodes = ensured(boxesToVirtual.get(box))

        // connect the root to the inside and outside connectors
        edges.push([boxNodes.center, boxNodes.inside])
        edges.push([boxNodes.center, boxNodes.outside])

        // connect box to its parent box
        let parentBox = findBoxContainingBox(box, ruleBoxes)
        if (parentBox !== undefined) {
            const parentBoxNodes = ensured(boxesToVirtual.get(parentBox))
            edges.push([boxNodes.outside, parentBoxNodes.inside])
        }
    }

    // Now we need to connect nodes to their containing box.
    // First exclude nodes already in the rule hierarchy in the real graph (e.g., manually built rule nodes instead of boxes)
    let unrootedNodes = findUnrootedNodes(abstractifyGraphSimple(graph))

    // start with the smallest box and connect all contained unrooted nodes
    for (let box of sortedBy(ruleBoxes, box => Rect.area(box.bounds))) {
        let unrootedContained = findNodesInBox(box, [...unrootedNodes])
        for (let node of unrootedContained) {
            let virtualNode = ensured(normalNodesToVirtual.get(node))
            const boxNodes = ensured(boxesToVirtual.get(box))
            edges.push([ensured(boxNodes.inside), virtualNode])
            // remove it from remaining unrooted nodes
            unrootedNodes.delete(node)
        }
    }

    let fingraph = makeFinGraphFromNodesEdges(nodes, edges)
    let lgraph = makeLabeledGraphFromFingraph(fingraph, labels)
    return {
        virtualGraph: makeParserGraphAccessor(lgraph),
        nodeMapping: normalNodesToVirtual,
        boxMapping: boxesToVirtual,
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
