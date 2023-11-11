import { Graph, GraphNode } from "./graphlayout.js"
import { DynamicLocal, OnlineAlgorithm, PartialGrid } from "./partialgrid.js"


// color for grid coloring
export type NodeColor = number
type Node = GraphNode<NodeColor> // shorthand

export function isLocalColoring(node: Node) {
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

function neighborColorSet(node: Node) {
    let result = new Set<NodeColor>()
    for (let neighbor of node.neighbors) {
        result.add(neighbor.data)
    }
    return result
}

// set of all nodes within radius distance of node
function collectNeighborhood(node: Node, distance: number): Set<Node> {
    let nodes = new Set<Node>([node])
    while (distance > 0) {
        // has to be a copy, otherwise we modify the set while iterating
        let newNodes = new Set<Node>()
        for (let node of nodes) {
            for (let neighbor of node.neighbors) {
                newNodes.add(neighbor)
            }
        }
        for (let node of newNodes) {
            nodes.add(node)
        }
        distance--
    }
    return nodes
}

// chooses the smallest color that is not used by any neighbor
export let greedyColoring: OnlineAlgorithm<NodeColor> = (graph, pointOfChange) => {
    // iterate through colors until valid
    let neighborColors = neighborColorSet(pointOfChange)
    pointOfChange.data = 0
    while (neighborColors.has(pointOfChange.data)) {
        pointOfChange.data++
    }
    return pointOfChange.data
}

function tryColorPermutations(nodes: Node[], colorLimit: number): boolean {
    // clear all nodes to infinity
    for (let node of nodes) {
        node.data = Infinity
    }
    // iterate through all permutations with a stack
    let index = 0
    nodes[0].data = -1
    while (index >= 0) {
        let node = nodes[index]
        let color = ++node.data
        if (color < colorLimit) {
            if (isLocalColoring(node)) {
                // extend
                index++
                if (index >= nodes.length) {
                    return true
                }
                nodes[index].data = -1
            }
        } else {
            // backtrack
            nodes[index].data = Infinity
            index--
        }
    }
    return false
}

// chooses the color permutation with the smallest max value in the neighborhood
export function neighborhoodRecoloring(distance: number): DynamicLocal<NodeColor> {
    return  {
        locality(nodeCount) {
            return distance
        },
        step(graph, pointOfChange) {
            let result = new Map<Node, NodeColor>()
            let nodes = [...collectNeighborhood(pointOfChange, distance)]
            let colorLimit = 2
            while(!tryColorPermutations(nodes, colorLimit)) {
                colorLimit++
            }
            for (let node of nodes) {
                result.set(node, node.data)
            }
            return result
        },
    }
}