import { Graph, GraphNode } from "./graphlayout.js"
import { DynamicLOCAL, PartialGrid } from "./partialgrid.js"

// color for grid coloring
export type NodeColor = number

export function isLocalColoring(node: GraphNode<NodeColor>) {
    for (let neighbor of node.neighbors) {
        if (node.data == neighbor.data) {
            return false
        }
    }
    return true
}

export function isGlobalColoring(graph: Graph<NodeColor>) {
    for (let node of graph.nodes) {
        if (!isLocalColoring(node)) {
            return false
        }
    }
    return true
}

export let greedyColoring: DynamicLOCAL<NodeColor> = (graph, pointOfChange) => {
    // iterate through colors until valid
    pointOfChange.data = 0
    while (!isLocalColoring(pointOfChange)) {
        pointOfChange.data++
    }
    return pointOfChange.data
}