import { createEdge, createNode, deleteEdge, Graph, GraphEdge, GraphNode } from "../../../localgraphs/src/graph";
import { stretchEdgesToFit, stretchEdgesToRelax } from "../../../localgraphs/src/interaction/physics";
import { WindowBounds } from "../../../localgraphs/src/interaction/windows";
import { collectBins } from "../../../shared/defaultmap";
import { Rect } from "../../../shared/rectangle";
import { assert, ensured, invertMap, invertMultiMap, mapFromFunction, mapObject, mapToIndex, min, neighborMapFromEdges, range, unreachable, ValueOf } from "../../../shared/utils";
import { makeFinGraphFromNodesEdges, makeLabeledGraphFromFingraph, makeParserGraphAccessor } from "../graphviewimpl";
import { CollectInsertions as GraphInsertionsCollector } from "../grapheditorimpl";
import { placeNewNodesBetweenOld } from "../semantics/placement";
import { GraphWithParserAccess } from "../semantics/rule/parse_rulegraph";
import { applyRule } from "../semantics/rule/rule_application";
import { RuleGraph } from "../semantics/rule/rulegraph";
import { Label, OPERATOR_CONNECT, operatorsWithArgSymbols, operatorSymbols, ruleMetaSymbols, SYMBOL_RULE_INSERTION, SYMBOL_RULE_META, SYMBOL_RULE_NEGATIVE, SYMBOL_BOX_ROOT, SYMBOL_RULE_PATTERN, SYMBOL_GLOBAL_ROOT, SYMBOL_BOX_INSIDE } from "../semantics/symbols";
import { defaultNodeData, RuleBoxState, UiNodeData } from "./state";

// VirtualGraph: underlying graph of the node and boxes hierarchy

const boxConnectorLabels = {
    root: SYMBOL_BOX_ROOT,
    inside: SYMBOL_BOX_INSIDE,
    children: {
        pattern: SYMBOL_RULE_PATTERN,
        meta: SYMBOL_RULE_META,
        insertion: SYMBOL_RULE_INSERTION,
        negative: SYMBOL_RULE_NEGATIVE,
    },
} as const

type BoxSubConnectorSymbol = ValueOf<typeof boxConnectorLabels.children>
type BoxConnectorSymbol = typeof boxConnectorLabels.root | typeof boxConnectorLabels.inside | BoxSubConnectorSymbol

const boxSubConnectorSymbols: BoxSubConnectorSymbol[] = Object.values(boxConnectorLabels.children)

export type VirtualNodeNormal = {
    kind: "normal",
    index: number,
    sourceNode: GraphNode<UiNodeData>
}
type VirtualNodeBox =  {
    kind: "box",
    special: BoxConnectorSymbol
    box: RuleBoxState
}
type VirtualNodeGlobalRoot = {
    kind: "root"
}
export type VirtualNode = VirtualNodeNormal | VirtualNodeBox | VirtualNodeGlobalRoot

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

// Containment checks could be done faster if necessary (grid marking boxes)
// find innermost box containing node or null if outside
function findBoxContainingNode(graphNode: GraphNode<UiNodeData>, ruleBoxes: RuleBoxState[]): RuleBoxState | undefined {
    let boxes = ruleBoxes.filter(box => Rect.containsPos(box.bounds, graphNode))
    return min(boxes, box => Rect.area(box.bounds))
}

// can be done faster if necessary (sort boxes by size, grid marking top-left and bottom-right)
function findBoxContainingBox(box: RuleBoxState, allBoxes: RuleBoxState[]): RuleBoxState | undefined {
    let boxes = allBoxes.filter(containingBox => containingBox != box && Rect.containsRect(containingBox.bounds, box.bounds))
    return min(boxes, box => Rect.area(box.bounds))
}

type VirtualBoxNodesMap = {
    root: VirtualNode,
    children: Map<BoxSubConnectorSymbol, VirtualNode>,
    inside: VirtualNode,
}

export type VirtualGraphEmbedding = {
    virtualGraph: GraphWithParserAccess<VirtualNode>,
    nodeMapping: Map<GraphNode<UiNodeData>, VirtualNode>,
    boxMapping: Map<RuleBoxState, VirtualBoxNodesMap>,
    globalRoot: VirtualNodeGlobalRoot
}

export function getRealForVirtualNormal(vnode: VirtualNodeNormal, graph: Graph<UiNodeData>): GraphNode<UiNodeData> {
    assert(graph.nodes.find(n => n === vnode.sourceNode) !== undefined, "graph does not match vnode")
    return vnode.sourceNode
}

export function getVirtualForReal(emb: VirtualGraphEmbedding, graphNode: GraphNode<UiNodeData>): VirtualNode {
    return ensured(emb.nodeMapping.get(graphNode))
}

export function makeVirtualGraphEmbedding(graph: Graph<UiNodeData>, ruleBoxes: RuleBoxState[]): VirtualGraphEmbedding {
    let normalNodesToVirtual = mapFromFunction<GraphNode<UiNodeData>, VirtualNode>(
        graph.nodes,
        (x, index) => ({ kind: "normal", index, sourceNode: x })
    )
    let boxesToVirtual = mapFromFunction<RuleBoxState, VirtualBoxNodesMap>(
        ruleBoxes,
        box => ({
            root: { kind: "box", special: boxConnectorLabels.root, box } satisfies VirtualNode,
            inside: { kind: "box", special: boxConnectorLabels.inside, box },
            children: mapFromFunction(boxSubConnectorSymbols, symbol => (
                {
                    kind: "box",
                    special: symbol,
                    box
                } satisfies VirtualNode
            )),
        })
    )
    let globalRootNode: VirtualNodeGlobalRoot = {
        kind: "root"
    }

    let edges: [VirtualNode, VirtualNode][] = []
    // add edges between normal nodes
    for (let edge of graph.edges) {
        edges.push([normalNodesToVirtual.get(edge.a)!, normalNodesToVirtual.get(edge.b)!])
    }
    // connect box root and box connectors
    for (let box of ruleBoxes) {
        // connect all the special nodes to the root
        const boxNodes = ensured(boxesToVirtual.get(box))

        // connect the root to the inside node
        edges.push([boxNodes.root, boxNodes.inside])

        for (let [symbol, childNode] of boxNodes.children) {
            edges.push([boxNodes.inside, childNode])
        }

        // connect box to its parent box
        let parentBox = findBoxContainingBox(box, ruleBoxes)
        if (parentBox !== undefined) {
            const parentBoxNodes = ensured(boxesToVirtual.get(parentBox))
            edges.push([boxNodes.root, ensured(parentBoxNodes.children.get(SYMBOL_RULE_PATTERN))])
        } else {
            edges.push([boxNodes.root, globalRootNode])
        }
    }
    // connect all nodes the appropriate special connector in the box that holds it, or to the root if outside
    for (let node of graph.nodes) {
        const box = findBoxContainingNode(node, ruleBoxes)
        let virtualNode = normalNodesToVirtual.get(node)!
        if (box !== undefined) {
            const boxNodes = ensured(boxesToVirtual.get(box))
            let categories = getNodeTypesForNode(node)
            for (let category of categories) {
                edges.push([ensured(boxNodes.children.get(category)), virtualNode])
            }
        } else {
            edges.push([virtualNode, globalRootNode])
        }
    }

    let nodes = new Set([
        ...normalNodesToVirtual.values(),
        ...boxesToVirtual.values().flatMap(boxNodes => [boxNodes.root, boxNodes.inside, ...boxNodes.children.values()]),
        globalRootNode
    ])

    let fingraph = makeFinGraphFromNodesEdges(nodes, edges)
    let lgraph = makeLabeledGraphFromFingraph(fingraph, node => {
        if (node.kind === "normal") {
            return getRealForVirtualNormal(node, graph).data.label
        } else if (node.kind === "box") {
            return node.special
        } else if (node.kind === "root") {
            return SYMBOL_GLOBAL_ROOT
        } else {
            unreachable(node)
        }
    })
    return {
        virtualGraph: makeParserGraphAccessor(lgraph),
        nodeMapping: normalNodesToVirtual,
        boxMapping: boxesToVirtual,
        globalRoot: globalRootNode
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
            } else if (a.kind === "root") {
                // TODO: make a sensible model for how to connect edges to a box
                throw new Error("rule that connects a node with root is not possible!");
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
