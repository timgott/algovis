import { randInt } from "../../shared/utils.js"
import { Graph, GraphNode } from "./graphlayout.js"
import { DynamicLocal, OnlineAlgorithm, PartialGrid } from "./partialgrid.js"


// color for grid coloring
export type NodeColor = number
type Node = GraphNode<NodeColor> // shorthand

// checks if a coloring is valid for a node, with overrides and hidden nodes
// to evaluate potential partial colorings
export function isLocalColoring(
    node: Node,
    overrides: Map<Node, NodeColor> = new Map(),
    hiddenNodes: Set<Node> = new Set(),
) {
    let color = overrides.get(node) ?? node.data
    console.assert(color !== undefined)
    for (let neighbor of node.neighbors) {
        if (!hiddenNodes.has(neighbor)) {
            let neighborColor = overrides.get(neighbor) ?? neighbor.data
            if (color == neighborColor) {
                return false
            }
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

enum SearchState {
    Continue,
    Terminate,
    Skip, // don't expand neighbors
}

// runs bfs until callback returns false
function bfs(center: Node, callback: (node: Node, distance: number) => SearchState) {
    let frontier = new Set<Node>([center])
    let closed = new Set<Node>()
    let distance = 0
    while (frontier.size > 0) {
        let newFrontier = new Set<Node>()
        for (let node of frontier) {
            let searchState = callback(node, distance)

            if (searchState == SearchState.Terminate) {
                return
            }
            if (searchState != SearchState.Skip) {
                for (let neighbor of node.neighbors) {
                    if (!closed.has(neighbor)) {
                        newFrontier.add(neighbor)
                    }
                }
            }
            closed.add(node)
        }
        frontier = newFrontier
        distance++
    }
}

// set of all nodes within radius distance of node
function collectNeighborhood(node: Node, radius: number): Set<Node> {
    let nodes = new Set<Node>([node])
    bfs(node, (node, distance) => {
        if (distance > radius) {
            return SearchState.Terminate
        }
        nodes.add(node)
        return SearchState.Continue
    })
    return nodes
}

// compute the distance of the nodes from center by BFS
function computeDistances(center: Node, nodes: readonly Node[]): Map<Node, number> {
    let remaining = new Set<Node>(nodes)
    let distances = new Map<Node, number>()
    bfs(center, (node, distance) => {
        if (remaining.has(node)) {
            distances.set(node, distance)
            remaining.delete(node)
        }
        return (remaining.size > 0) ? SearchState.Continue : SearchState.Terminate
    })
    return distances
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

// tries all possible colorings of the given nodes, returns null if none is valid
function findColoring(nodes: readonly Node[], colorLimit: number | ((node: Node) => number)): Map<Node, NodeColor> | null {
    // all nodes are hidden, incrementally build partial coloring
    let colors = new Map<Node, NodeColor>()
    let hidden = new Set<Node>(nodes)

    let colorLimitFunc = typeof colorLimit == "number" ? () => colorLimit : colorLimit

    // iterate through all permutations with a stack
    let index = 0
    while (index >= 0) {
        let node = nodes[index]
        let color = (colors.get(node) ?? -1) + 1 // 0 or increment
        colors.set(node, color)
        hidden.delete(node)
        if (color < colorLimitFunc(node)) {
            console.assert(hidden.size + colors.size == nodes.length)
            if (isLocalColoring(node, colors, hidden)) {
                // extend
                index++
                if (index >= nodes.length) {
                    return colors
                }
            }
        } else {
            // backtrack
            colors.delete(node)
            hidden.add(node)
            index--
        }
    }
    return null
}

// increases index until tryFunction returns a value
function incrementalRetry<T>(
    start: number,
    limit: number,
    tryFunction: (index: number) => T | null,
) {
    let index = start
    while (index < limit) {
        let result = tryFunction(index)
        if (result !== null) {
            return result
        }
        index++
    }
    return null
}

// chooses the color permutation with the smallest max value in the neighborhood
export function neighborhoodGreedy(distance: number): DynamicLocal<NodeColor> {
    return {
        locality(nodeCount) {
            return distance
        },
        step(graph, pointOfChange) {
            let nodes = [...collectNeighborhood(pointOfChange, distance)]
            // try incrementally with more colors
            let coloring = incrementalRetry(
                2, 20,
                (colorLimit) => findColoring(nodes, colorLimit)
            )
            if (coloring == null) {
                throw "color limit reached, probably bug?"
            }
            console.log(coloring)
            return coloring
        },
    }
}

function findRecoloringMinimal(nodes: readonly Node[], colorLimit: number | ((node: Node) => number)): Map<Node, NodeColor> | null {
    // try to change fewer nodes first
    return incrementalRetry(0, nodes.length, (i) => {
        let partialNodes = nodes.slice(0, i + 1)
        return findColoring(partialNodes, colorLimit)
    })
}

// try to change fewer colors and try to change fewer nodes first, then incrementing
// (not necessarily optimal minimal in either aspect)
export function minimalGreedy(distance: number): DynamicLocal<NodeColor> {
    return {
        locality(nodeCount) {
            return distance
        },
        step(graph, pointOfChange) {
            let nodes = [...collectNeighborhood(pointOfChange, distance)]
            // try incrementally with more colors
            let coloring = incrementalRetry(
                2, 20,
                (colorLimit) => findRecoloringMinimal(nodes, colorLimit)
            )
            if (coloring == null) {
                throw "color limit reached, probably bug?"
            }
            return coloring
        },
    }
}

// tries random possible colorings of the given nodes, returns null if none found
function tryRandomColorings(nodes: Node[], colorCount: number, giveUpAfter: number): Map<Node, NodeColor> | null {
    let colors = new Map<Node, NodeColor>()
    for (let i = 0; i < giveUpAfter; i++) {
        for (let node of nodes) {
            colors.set(node, randInt(colorCount))
        }
        let valid = true
        for (let node of nodes) {
            if (!isLocalColoring(node, colors)) {
                valid = false
                break
            }
        }
        if (valid) {
            return colors
        }
    }
    return null
}

export function randomColoring(distance: number): DynamicLocal<NodeColor> {
    return {
        locality(nodeCount) {
            return distance
        },
        step(graph, pointOfChange) {
            let nodes = [...collectNeighborhood(pointOfChange, distance)]
            // try incrementally with more colors
            let coloring = tryRandomColorings(nodes, 3, 1000000)
            if (coloring == null) {
                console.log("Could not find coloring through randomness")
                coloring = findRecoloringMinimal(nodes, 20)
                if (coloring == null) {
                    throw "color limit reached, giving up"
                }
            }
            return coloring
        },
    }
}

// searches for closest node with given value and returns distance
function findDistanceToValue(node: Node, ignoreDistance: number, targetValue: number): number | null {
    let result: number | null = null
    bfs(node, (node, distance) => {
        if (distance > ignoreDistance && node.data == targetValue) {
            result = distance
            return SearchState.Terminate
        }
        return SearchState.Continue
    })
    return result
}

// tries to keep borders on same parity
export function parityBorderColoring(distance: number): DynamicLocal<NodeColor> {
    return {
        locality(nodeCount) {
            return distance
        },
        step(graph, pointOfChange) {
            const nodes = [...collectNeighborhood(pointOfChange, distance)] as const
            // try to color with 2 colors
            const twoColoring = findRecoloringMinimal(nodes, 2)
            if (twoColoring !== null) {
                return twoColoring
            }

            const distances = computeDistances(pointOfChange, nodes)
            const borderDistance = findDistanceToValue(pointOfChange, distance, 2)


            // try to color with parity safe coloring
            let colorLimit: number | ((node: Node) => number)
            if (borderDistance == null) {
                // no border found, no 2-coloring => normal 3 coloring
                colorLimit = 3
            } else {
                colorLimit = (node: Node) => {
                    if ((distances.get(node)! - borderDistance) % 2 == 0) {
                        return 3
                    }
                    return 2
                }
            }
            let threeColoring = findRecoloringMinimal(nodes, colorLimit)

            if (threeColoring !== null) {
                return threeColoring
            }

            // give up
            let coloring = findRecoloringMinimal(nodes, 20)
            if (coloring == null) {
                throw "color limit reached, giving up"
            }
            return coloring
        },
    }
}
