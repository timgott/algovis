import { assert, assertExists, existsCast, randInt } from "../../shared/utils.js"
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

function isLocalColoringAll(nodes: readonly Node[], overrides: Map<Node, NodeColor>) {
    for (let node of nodes) {
        if (!isLocalColoring(node, overrides)) {
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

function neighborColorSet(node: Node, ignoreNodes?: Set<Node>, overrides: Map<Node, NodeColor> = new Map()) {
    let result = new Set<NodeColor>()
    for (let neighbor of node.neighbors) {
        if (ignoreNodes === undefined || !ignoreNodes.has(neighbor)) {
            let color = overrides.get(neighbor) ?? neighbor.data
            result.add(color)
        }
    }
    return result
}

// chooses the smallest color that is not used by any neighbor
function greedyColoring(node: Node, ignoreNodes?: Set<Node>, overrides: Map<Node, NodeColor> = new Map()): number {
    let neighborColors = neighborColorSet(node, ignoreNodes, overrides)
    let color = 0
    while (neighborColors.has(color)) {
        color++
    }
    return color
}

enum SearchState {
    Continue,
    Terminate,
    Skip, // don't expand neighbors
}

// runs bfs until callback returns false
function bfs(start: Node | Node[], callback: (node: Node, distance: number) => SearchState) {
    if (!Array.isArray(start)) {
        start = [start]
    }
    let frontier = new Set<Node>(start)
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
function computeDistances(center: Node, nodes: Iterable<Node>): Map<Node, number> {
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
function findDistanceTo(node: Node, predicate: (node: Node, distance: number) => boolean): number | null {
    let result: number | null = null
    bfs(node, (node, distance) => {
        if (predicate(node, distance)) {
            result = distance
            return SearchState.Terminate
        }
        return SearchState.Continue
    })
    return result
}

type Component = number
function findConnectedComponents(seeds: Iterable<Node>, skip: (node: Node) => boolean): [number, Map<Node, Component>] {
    let components = new Map<Node, Component>()
    let componentIndex = 0
    for (let seed of seeds) {
        if (!components.has(seed) && !skip(seed)) {
            bfs(seed, (node, distance) => {
                if (skip(node)) {
                    return SearchState.Skip
                }
                components.set(node, componentIndex)
                return SearchState.Continue
            })
            componentIndex++
        }
    }
    return [componentIndex, components]
}

function findComponentBorderNodes(components: Map<Node, Component>): Map<Node, Set<Component>> {
    let borders = new Map<Node, Set<number>>()
    for (let [node, componentIndex] of components) {
        for (let neighbor of node.neighbors) {
            if (!borders.has(neighbor)) {
                borders.set(neighbor, new Set<number>())
            }
            borders.get(neighbor)!.add(componentIndex)
        }
    }
    return borders
}

function getNeighboringComponents(componentBorders: Map<Node, Set<Component>>): Map<Component, Component> {
    let neighboringComponents = new Map<Component, Component>()
    for (let [node, components] of componentBorders) {
        if (components.size > 1) {
            for (let i = 0; i < components.size; i++) {
                for (let j = i + 1; j < components.size; j++) {
                    neighboringComponents.set(i, j)
                    neighboringComponents.set(j, i)
                }
            }
        }
    }
    return neighboringComponents
}

function findSharedBorders(components: Map<Node, Component>): Set<Node> {
    let borders = findComponentBorderNodes(components)
    return new Set([...borders.keys()].filter((node) => borders.get(node)!.size > 1))
}

// walks through the component from source, considering wallPredicate as borders, counting border parities
function countBorderParities(source: Node, offset: number, wallPredicate: (node: Node) => boolean, countOnlyPredicate: (borderNode: Node) => boolean): number[] {
    let borderDistances = new Map<Node, number>()
    let innerComponent = new Set<Node>()
    bfs(source, (node, distance) => {
        if (wallPredicate(node)) {
            if (countOnlyPredicate(node)) {
                borderDistances.set(node, distance)
            }
            return SearchState.Skip
        } else {
            innerComponent.add(node)
            return SearchState.Continue
        }
    })
    let parityCount = [0, 0]
    for (let [borderNode, distance] of borderDistances) {
        // check whether it is an outer border
        let outerBorder = borderNode.neighbors.size < 4
            || [...borderNode.neighbors].filter((node) => !innerComponent.has(node)).length > 0

        if (outerBorder) {
            parityCount[(distance + offset) % 2]++
        }
    }
    return parityCount
}

function findMajorityBorderParity(source: Node, offset: number, wallPredicate: (node: Node) => boolean, countOnlyPredicate: (borderNode: Node) => boolean): 0 | 1 | null {
    let parityCount = countBorderParities(source, offset, wallPredicate, countOnlyPredicate)
    if (parityCount[0] == 0 && parityCount[1] == 0) {
        // no border
        return null
    }
    return parityCount[0] > parityCount[1] ? 0 : 1
}

function getNodesByComponent(components: Map<Node, Component>, nodes: Iterable<Node>): Map<Component, Node[]> {
    let result = new Map<Component, Node[]>()

    for (let node of nodes) {
        let c = components.get(node)
        if (c === undefined) {
            throw "node not found in components"
        }
        result.set(c, [...(result.get(c) ?? []), node])
    }
    return result
}

function tryResolveBorderConflicts(
    pointOfChange: Node,
    borderColor: number,
): Map<Node, NodeColor> | null {
    let neighbors = [...pointOfChange.neighbors]
    const [componentCount, components] = findConnectedComponents(
        // start component search from neighbors
        neighbors,
        // traverse only 2-colored components, do not cross borders
        (node) => node.data == pointOfChange.data || node.data == borderColor
    )

    // conflicts can exist only with more than 2 components
    if (componentCount < 2) {
        return null
    }

    const sharedBorders = findSharedBorders(components)
    const nodesByComponent = getNodesByComponent(components, neighbors)

    // get border parities
    let parities = new Set<number>()
    let parityNeighbors: Node[][] = [[], []]
    for (let i = 0; i < componentCount; i++) {
        // distance to border from first representative of component i
        const reps = nodesByComponent.get(i)
        if (reps === undefined || reps.length == 0) {
            throw "no neighbor nodes in component"
        }
        const rep = reps[0]
        const parity = findMajorityBorderParity(
            rep,
            0,
            (node) => node.data == borderColor || node == pointOfChange, // walls
            (node) => node != pointOfChange && !sharedBorders.has(node) // ignored for parity
        )
        if (parity != null) {
            parities.add(parity)
            parityNeighbors[parity].push(...reps)
        }
    }

    // conflict if multiple different parities exist
    if (parities.size <= 1) {
        return null // no border conflict
    }

    console.log("Detected border conflict")

    // try insert border
    let neighborColors = neighborColorSet(pointOfChange)
    if (!neighborColors.has(borderColor)) {
        return new Map([[pointOfChange, borderColor]])
    } else {
        // try giving one neighbor a border color
        // Because at least one neighbor has borderColor, there are at most 3 neighbors
        for (let parity of [0, 1]) {
            let coloring = new Map<Node, NodeColor>()
            for (let node of parityNeighbors[parity]) {
                coloring.set(node, borderColor)
            }
            coloring.set(pointOfChange, 1 - parity) // is available if the others get border color
            if (isLocalColoringAll(neighbors, coloring)) {
                console.log("Successfully resolved border conflict")
                return coloring
            }
        }
        console.log("Could not resolve border conflict")
        return null
    }

}

// tries to keep borders on same parity
export function parityBorderColoring(radius: number): DynamicLocal<NodeColor> {
    return {
        locality(nodeCount) {
            return radius
        },
        step(graph, pointOfChange) {
            const borderColor = 2
            let neighborhood = collectNeighborhood(pointOfChange, radius)
            const nodes = [...neighborhood] as const
            const distances = computeDistances(pointOfChange, nodes)

            if (radius >= 1) {
                // build borders between components with different border parities
                let borderConflictColoring = tryResolveBorderConflicts(pointOfChange, borderColor)
                if (borderConflictColoring !== null) {
                    return borderConflictColoring
                }
            }

            // try to color with 2 colors
            const twoColoring = findRecoloringMinimal(nodes, 2)
            if (twoColoring !== null) {
                return twoColoring
            }

            const borderParity = findMajorityBorderParity(
                pointOfChange,
                0,
                (node) => node.data == borderColor,
                (node) => !neighborhood.has(node)
            )

            // try to color with parity safe coloring
            let colorLimit: number | ((node: Node) => number)
            if (borderParity == null) {
                // no border found, no 2-coloring => normal 3 coloring
                colorLimit = 3
            } else {
                colorLimit = (node: Node) => {
                    if ((distances.get(node)! - borderParity) % 2 == 0) {
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
            let coloring = incrementalRetry(3, 20, (colorLimit) => findRecoloringMinimal(nodes, colorLimit))
            if (coloring == null) {
                throw "color limit reached, giving up"
            }
            return coloring
        },
    }
}

// nodes outside the set that have neighbors inside the set
function getOuterMargin(nodes: Set<Node>): Node[] {
    let result = new Set<Node>()
    for (let node of nodes) {
        for (let neighbor of node.neighbors) {
            if (!nodes.has(neighbor)) {
                result.add(neighbor)
            }
        }
    }
    return [...result]
}

// nodes in the set that have neighbors outside of the set
function getInnerMargin(nodes: Set<Node>): Node[] {
    let result: Node[] = []
    for (let node of nodes) {
        for (let neighbor of node.neighbors) {
            if (!nodes.has(neighbor)) {
                result.push(node)
                break
            }
        }
    }
    return result
}

class PartiallyColoredNeighborhood {
    center: Node
    nodes: Set<Node>
    coloring: Map<Node, NodeColor> = new Map()

    outerMargin!: Node[]
    innerMargin!: Node[]

    innerDistances!: Map<Node, number>

    componentCount!: number

    borderColor!: number

    componentsByParity!: [Set<Component>, Set<Component>]
    tunnelComponents!: Set<Component> 

    neighborsByComponent!: Map<Component, Node[]>
    componentParities!: Map<Component, number | null>

    constructor(center: Node, nodes: Iterable<Node>, borderColor: number) {
        this.center = center
        this.nodes = new Set(nodes)
        this.borderColor = borderColor
        this.innerDistances = computeDistances(this.center, this.nodes)
        this.update()
    }

    update() {
        this.outerMargin = getOuterMargin(this.nodes).filter((node) => node.data != this.borderColor)
        this.innerMargin = getInnerMargin(this.nodes)

        const [componentCount, components] = findConnectedComponents(
            // start component search from outer margin of neighborhood
            this.outerMargin,
            // we will change the nodes in neighborhood so skip it
            (node) => this.nodes.has(node) || node.data == this.borderColor
        )
        this.componentCount = componentCount
        this.neighborsByComponent = getNodesByComponent(components, this.outerMargin)

        // classify components by parity
        let outerDistances = computeDistances(this.center, this.outerMargin)
        this.componentParities = new Map<Component, number | null>()
        this.tunnelComponents = new Set<Component>()
        this.componentsByParity = [new Set(), new Set()]
        for (let c = 0; c < componentCount; c++) {
            let rep = this.neighborsByComponent.get(c)?.[0]
            assertExists(rep, "component without representative")
            let offset = outerDistances.get(rep)
            assertExists(offset)

            let parities = countBorderParities(
                rep,
                offset,
                (node) => node.data == this.borderColor || this.nodes.has(node), // stop on borders and on ball
                (node) => !this.nodes.has(node) // but do not count the ball
            )
            if (parities[0] == 0 && parities[1] == 0) {
                // free component
                this.componentParities.set(c, null)
            } else if (parities[0] > 0 && parities[1] > 0) {
                // tunnel component
                this.componentParities.set(c, null)
                this.tunnelComponents.add(c)
            } else {
                let parity = parities[0] > parities[1] ? 0 : 1
                this.componentParities.set(c, parity)
                this.componentsByParity[parity].add(c)
            }
        }
    }

    fixAndRemoveNode(node: Node, value: NodeColor) {
        this.coloring.set(node, value)
        this.nodes.delete(node)
        this.update()
    }

    propagateConstraints() {
        // fix nodes with only one possible color
        let changed = true
        while (changed) {
            changed = false
            for (let node of this.nodes) {
                let neighborColors = neighborColorSet(node, this.nodes, this.coloring)
                if (neighborColors.size >= 2) {
                    if (neighborColors.size >= 3) {
                        console.log("Failed at 3-coloring")
                    }
                    let color = 0
                    while (neighborColors.has(color)) {
                        color++
                    }
                    this.fixAndRemoveNode(node, color)
                    changed = true
                }
            }
        }
    }

    hasBorderConflict(): boolean {
        return this.componentsByParity[0].size > 0 && this.componentsByParity[1].size > 0
    }

    hasTunnel(): boolean {
        return this.tunnelComponents.size > 0
    }

    sealComponent(component: Component) {
        const outerNodes = this.neighborsByComponent.get(component)
        assert(outerNodes !== undefined, "component without nodes")

        // search inside the neighborhood for the closest borders of the right parity
        let parity = this.componentParities.get(component)
        assertExists(parity, "can only seal component with known parity")

        let border: Node[] = []
        let fillNodes: Node[] = []
        const outerNodesSet = new Set(outerNodes)
        bfs(outerNodes, (node, distance) => {
            if (outerNodesSet.has(node)) {
                return SearchState.Continue
            }
            if (!this.nodes.has(node)) {
                return SearchState.Skip
            }
            if (this.innerDistances.get(node)! % 2 == parity) {
                border.push(node)
                return SearchState.Skip
            } else {
                fillNodes.push(node)
                return SearchState.Continue
            }
        })

        assert(border.length > 0, "no place for border found")

        // build border
        for (let node of border) {
            this.fixAndRemoveNode(node, this.borderColor)
            assert(isLocalColoring(node, this.coloring), "broke the coloring by sealing")
        }

        // expand the component to the border
        for (let node of fillNodes) {
            let color = greedyColoring(node, this.nodes, this.coloring)
            this.fixAndRemoveNode(node, color)
            assert(color < 3, "broke the coloring by filling seal")
            assert(isLocalColoring(node, this.coloring), "broke the coloring by filling seal")
        }

        this.propagateConstraints()
    }

    sealAllNonTunnelComponents() {
        for (let component of this.componentsByParity[0]) {
            this.sealComponent(component)
        }
        for (let component of this.componentsByParity[1]) {
            this.sealComponent(component)
        }
    }

    finishColoring(): Map<Node, NodeColor> {
        let nodes = [...this.nodes]
        if (nodes.length > 0) {
            let coloring = incrementalRetry(2, 20, (colorLimit) => findColoring(nodes, colorLimit))
            if (coloring == null) {
                throw "color limit reached, giving up"
            }
            for (let [node, color] of coloring) {
                this.coloring.set(node, color)
            }
        }
        return this.coloring
    }
}

export function principledParityBorderColoring(radius: number): DynamicLocal<NodeColor> {
    return {
        locality(nodeCount) {
            return radius
        },
        step(graph, pointOfChange) {
            const borderColor = 2
            let nodes = collectNeighborhood(pointOfChange, radius)

            let coloring = new PartiallyColoredNeighborhood(pointOfChange, nodes, borderColor)
            coloring.propagateConstraints()
            while (coloring.hasBorderConflict()) {
                coloring.sealAllNonTunnelComponents()
            }
            if (coloring.hasTunnel()) {
                coloring.sealAllNonTunnelComponents()
            }

            // two+ components:
            // same parity and border parity => join them
            // same border parity, different parity => build border of this parity between
            // different border parity => build tunnel between them

            return coloring.finishColoring()
        },
    }
}