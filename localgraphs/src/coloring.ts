import { assert, assertExists, min, randInt, range } from "../../shared/utils.js"
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

enum SearchState {
    Continue,
    Terminate,
    Skip, // don't expand neighbors
}

// runs bfs until callback returns false
function bfs(start: Node | Node[], callback: (node: Node, distance: number) => SearchState) {
    bfsFold(start,
        () => 0,
        node => node.neighbors,
        (node, distance) => {
        return [callback(node, distance), distance + 1]
    })
}

function bfsFold<S,T>(start: S | S[], initial: (node: S) => T, children: (node: S) => Iterable<S>, callback: (node: S, value: T) => [SearchState, T]) {
    if (!Array.isArray(start)) {
        start = [start]
    }
    let frontier = new Map<S, T>(start.map((node) => [node, initial(node)]))
    let closed = new Set<S>()
    while (frontier.size > 0) {
        let newFrontier = new Map<S, T>()
        for (let [node, value] of frontier) {
            assert(!closed.has(node), "node already visited")
            closed.add(node)

            let [searchState, newValue] = callback(node, value)

            if (searchState == SearchState.Terminate) {
                return
            }
            if (searchState != SearchState.Skip) {
                for (let neighbor of children(node)) {
                    if (!closed.has(neighbor)) {
                        newFrontier.set(neighbor, newValue)
                    }
                }
            }
        }
        frontier = newFrontier
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
function findColoring(nodes: readonly Node[], colorLimit: number | ((node: Node, colorCounts: number[]) => number)): Map<Node, NodeColor> | null {
    // all nodes are hidden, incrementally build partial coloring
    let colors = new Map<Node, NodeColor>()
    let hidden = new Set<Node>(nodes)

    // allows coloring with as few 3s as possible
    let colorCounts = new Array<number>(5).fill(0)

    let colorLimitFunc = typeof colorLimit == "number" ? () => colorLimit : colorLimit

    // iterate through all permutations with a stack
    let index = 0
    while (index >= 0) {
        let node = nodes[index]

        // 0 or increment
        let color = 0
        let oldColor = colors.get(node)
        if (oldColor !== undefined) {
            color = oldColor + 1
            colorCounts[oldColor]--
        }
        colorCounts[color]++

        colors.set(node, color)
        hidden.delete(node)
        if (color < colorLimitFunc(node, colorCounts)) {
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
            colorCounts[color]--
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
): T | null {
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

// minimize number of changed nodes
function findRecoloringSmall(nodes: readonly Node[], colorLimit: number | ((node: Node, colorCounts: number[]) => number)): Map<Node, NodeColor> | null {
    // try to change fewer nodes first
    return incrementalRetry(0, nodes.length, (i) => {
        let partialNodes = nodes.slice(0, i + 1)
        return findColoring(partialNodes, colorLimit)
    })
}

// minimize number of colors and minimize number of nodes with highest color
function colorIncrementally(nodes: readonly Node[], minimizeChanges: boolean = false): Map<Node, number> | null {
    let coloringFunc = minimizeChanges ? findRecoloringSmall : findColoring
    return incrementalRetry(
        3, 20,
        // try incrementally with more 3s
        (colorLimit) => incrementalRetry(
            0, nodes.length / 3,
            (newColorCount) => {
                return coloringFunc(nodes, (node, colorCounts) => {
                    if (colorCounts[colorLimit - 1] > newColorCount) {
                        return colorLimit - 1
                    }
                    return colorLimit
                })
            }
        )
    )
}

// try to change fewer colors and try to change fewer nodes first, then incrementing
// (not necessarily optimal minimal in either aspect)
export function minimalGreedy(distance: number): DynamicLocal<NodeColor> {
    return {
        locality(nodeCount) {
            return distance
        },
        step(graph, pointOfChange) {
            let nodes = [...collectNeighborhood(pointOfChange, distance)] as const
            // try incrementally with more colors, and more changed nodes
            let coloring = colorIncrementally(nodes, true)
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
                coloring = findRecoloringSmall(nodes, 20)
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

function findSharedBorders(components: Map<Node, Component>): Map<Node, Set<Component>> {
    let borders = new Map<Node, Set<number>>()
    for (let [node, componentIndex] of components) {
        for (let neighbor of node.neighbors) {
            if (!borders.has(neighbor)) {
                borders.set(neighbor, new Set<number>())
            }
            borders.get(neighbor)!.add(componentIndex)
        }
    }
    for (let [node, componentIndices] of borders) {
        if (componentIndices.size == 1) {
            borders.delete(node)
        }
    }
    return borders
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
        let outerBorder = borderNode.neighbors.size < 4 // TODO: Only works for grids!
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

function getComponentSizes(components: Map<Node, Component>): Map<Component, number> {
    let result = new Map<Component, number>()
    for (let [node, component] of components) {
        result.set(component, (result.get(component) ?? 0) + 1)
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
    const nodesByComponent = getNodesByComponent(components, neighbors.filter((node) => node.data != borderColor))

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
    let neighborColors = pointOfChange.neighbors.map(n => n.data)
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

function colorWithMajorityBorder(neighborhood: Set<Node>, center: Node, borderColor: number, minimizeChanges: boolean = false): Map<Node, NodeColor> {
    let nodes = [...neighborhood]
    let distances = computeDistances(center, nodes)

    let coloringFunc = minimizeChanges ? findRecoloringSmall : findColoring

    // try to color with 2 colors
    const twoColoring = coloringFunc(nodes, borderColor - 1)
    if (twoColoring !== null) {
        return twoColoring
    }

    const borderParity = findMajorityBorderParity(
        center,
        0,
        (node) => node.data == borderColor,
        (node) => !neighborhood.has(node) // ignore nodes inside radius
    )

    // try to color with parity safe coloring
    let colorLimit: number | ((node: Node) => number)
    if (borderParity != null) {
        // try coloring with right parity borders
        let threeColoring = incrementalRetry(0, neighborhood.size / 2,
            threeCount => coloringFunc(nodes, (node, colorCounts) => {
                // check for parity and minimize border nodes
                if (colorCounts[2] < threeCount
                    && (distances.get(node)! - borderParity) % 2 == 0) {
                    return 3
                }
                return 2
            })
        )
        if (threeColoring !== null) {
            return threeColoring
        }
    }

    // normal coloring if no parity-border coloring found
    let coloring = colorIncrementally(nodes, minimizeChanges)
    if (coloring == null) {
        throw "color limit reached, giving up"
    }

    return coloring
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

            return colorWithMajorityBorder(neighborhood, pointOfChange, borderColor, true)
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

class ComplicatedPartiallyColoredNeighborhood {
    center: Node
    nodes: Set<Node> // remaining free nodes
    coloring: Map<Node, NodeColor> = new Map()

    outerMargin!: Node[]
    innerMargin!: Node[]

    innerDistances!: Map<Node, number>

    componentCount!: number

    borderColor!: number

    componentsByBorderParity!: [Set<Component>, Set<Component>]
    tunnelComponents!: Set<Component>

    neighborsByComponent!: Map<Component, Node[]>
    componentBorderParities!: Map<Component, number | null>
    componentSizes!: Map<number, number>
    components!: Map<Node, Component>

    radius: number

    constructor(center: Node, radius: number, borderColor: number) {
        this.center = center
        this.nodes = collectNeighborhood(center, radius)
        this.borderColor = borderColor
        this.innerDistances = computeDistances(this.center, this.nodes)
        this.radius = radius
        this.update()
    }

    getColor(node: Node): NodeColor {
        assert(!this.nodes.has(node), "node not yet colored")
        return this.coloring.get(node) ?? node.data
    }

    update() {
        const componentThreshold = this.radius // threshold for number of nodes in components that need to be sealed
        const tunnelThreshold = this.radius / 2 // threshold for each parity of borders to appear in a tunnel

        this.outerMargin = getOuterMargin(this.nodes).filter((node) => this.getColor(node) != this.borderColor)
        this.innerMargin = getInnerMargin(this.nodes)

        const [componentCount, components] = findConnectedComponents(
            // start component search from outer margin of neighborhood
            this.outerMargin,
            // we will change the nodes in neighborhood so skip it
            (node) => this.nodes.has(node) || this.getColor(node) == this.borderColor
        )
        this.componentCount = componentCount
        this.components = components
        this.neighborsByComponent = getNodesByComponent(components, this.outerMargin)
        this.componentSizes = getComponentSizes(components)

        // classify components by parity
        let outerDistances = computeDistances(this.center, this.outerMargin)
        this.componentBorderParities = new Map<Component, number | null>()
        this.tunnelComponents = new Set<Component>()
        this.componentsByBorderParity = [new Set(), new Set()]
        for (let c = 0; c < componentCount; c++) {
            let componentSize = this.componentSizes.get(c)! // could also try to find component radius
            if (componentSize >= componentThreshold) {
                let rep = this.neighborsByComponent.get(c)?.[0]
                assertExists(rep, "component without representative")
                let offset = outerDistances.get(rep)
                assertExists(offset)

                let parities = countBorderParities(
                    rep,
                    offset,
                    (node) => this.nodes.has(node) || this.getColor(node) == this.borderColor, // stop on borders and on ball
                    (node) => !this.nodes.has(node) // but do not count the ball
                )
                if (parities[0] < tunnelThreshold && parities[1] < tunnelThreshold) {
                    // free component
                    this.componentBorderParities.set(c, null)
                } else if (parities[0] > tunnelThreshold && parities[1] > tunnelThreshold) {
                    // tunnel component
                    this.componentBorderParities.set(c, null)
                    this.tunnelComponents.add(c)
                    console.log("Detected tunnel")
                } else {
                    let parity = parities[0] > parities[1] ? 0 : 1
                    this.componentBorderParities.set(c, parity)
                    this.componentsByBorderParity[parity].add(c)
                }
            }
        }
    }

    isLocalColoring(node: Node): boolean {
        return isLocalColoring(node, this.coloring, this.nodes)
    }

    neighborColorSet(node: Node): Set<NodeColor> {
        let result = new Set<NodeColor>()
        for (let neighbor of node.neighbors) {
            if (!this.nodes.has(neighbor)) {
                result.add(this.getColor(neighbor))
            }
        }
        return result
    }

    // chooses the smallest color that is not used by any neighbor
    greedyColoring(node: Node, minColor: number = 0): number {
        let neighborColors = this.neighborColorSet(node)
        let color = minColor
        while (neighborColors.has(color)) {
            color++
        }
        return color
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
                let neighborColors = this.neighborColorSet(node)
                if (neighborColors.has(0) && neighborColors.has(1)) {
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
        return this.componentsByBorderParity[0].size > 0 && this.componentsByBorderParity[1].size > 0
    }

    hasTunnel(): boolean {
        return this.tunnelComponents.size > 0
    }

    sealComponent(component: Component) {
        const outerNodes = this.neighborsByComponent.get(component)
        assert(outerNodes !== undefined, "component without nodes")

        // search inside the neighborhood for the closest borders of the right parity
        const parity = this.componentBorderParities.get(component)
        assertExists(parity, "can only seal component with known parity")

        const border: Node[] = []
        const fillNodes: Node[] = []
        const outerNodesSet = new Set(outerNodes)
        bfs(outerNodes, (node, distance) => {
            if (outerNodesSet.has(node)) {
                return SearchState.Continue
            }
            if (!this.nodes.has(node)) {
                // TODO: remove this, the algorithm has to walk through outside nodes as well maybe??
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
        for (const node of border) {
            const color = this.greedyColoring(node, this.borderColor)
            this.fixAndRemoveNode(node, color)
            console.assert(color == this.borderColor, "broke the coloring by sealing")
        }

        // expand the component to the border
        for (const node of fillNodes) {
            const color = this.greedyColoring(node)
            this.fixAndRemoveNode(node, color)
            console.assert(color < this.borderColor, "broke the coloring by filling seal")
        }

        this.propagateConstraints()
    }

    sealAllNonTunnelComponents() {
        // since components can disappear, we keep a node from each component as reference
        let sealSources = [...this.componentsByBorderParity[0], ...this.componentsByBorderParity[1]]
            .sort((a, b) => this.componentSizes.get(b)! - this.componentSizes.get(a)!)
            .map((c) => this.neighborsByComponent.get(c)![0])
        for (let node of sealSources) {
            let component = this.components.get(node)
            if (component !== undefined) {
                // seal only clean components
                if (this.componentBorderParities.get(component) != null) {
                    this.sealComponent(component)
                }
            } else {
                console.log("Component disappeared while sealing")
            }
        }
    }

    sealUntilNoBorderConflict() {
        while (this.hasBorderConflict()) {
            // seal smallest component with clean border
            let cleanBorderComponents = [...this.componentsByBorderParity[0], ...this.componentsByBorderParity[1]]
            let component = min(cleanBorderComponents, i => this.componentSizes.get(i)!)
            assertExists(component)
            this.sealComponent(component)
        }
    }


    finishColoring(): Map<Node, NodeColor> {
        let nodes = [...this.nodes]
        if (nodes.length > 0) {
            let coloring = colorWithMajorityBorder(this.nodes, this.center, this.borderColor, false)
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

// tries to build borders such that border parities do not collide, but not very successfully
export function borderComponentColoring(radius: number): DynamicLocal<NodeColor> {
    return {
        locality(nodeCount) {
            return radius
        },
        step(graph, pointOfChange) {
            const borderColor = 2
            let coloring = new ComplicatedPartiallyColoredNeighborhood(pointOfChange, radius, borderColor)
            coloring.propagateConstraints()
            if (coloring.hasBorderConflict()) {
                coloring.sealUntilNoBorderConflict()
            }
            if (coloring.hasTunnel()) {
                coloring.sealUntilNoBorderConflict()
            }

            // two+ components:
            // same parity and border parity => join them
            // same border parity, different parity => build border of this parity between
            // different border parity => build tunnel between them

            return coloring.finishColoring()
        },
    }
}

function getDirectedComponentBorders(components: Map<Node, Component>, insideColor: NodeColor, getColor: (node: Node) => NodeColor, skipNode: (node: Node) => boolean): Map<Component, Set<Component>> {
    let componentBorders = findSharedBorders(components)
    let neighboringComponents = new Map<Component, Set<Component>>()
    for (let component of components.values()) {
        neighboringComponents.set(component, new Set())
    }
    for (let [node, borderedComponents] of componentBorders) {
        if (!skipNode(node)) {
            let insides = new Set<Component>()
            let outsides = new Set<Component>()
            for (let n of node.neighbors) {
                if (!skipNode(n)) {
                    let component = components.get(n)
                    assertExists(component)
                    if (getColor(n) == insideColor) {
                        insides.add(component)
                    } else {
                        outsides.add(component)
                    }
                }
            }
            for (let inner of insides) {
                for (let outer of outsides) {
                    neighboringComponents.get(inner)!.add(outer)
                }
            }
        }
    }
    return neighboringComponents
}

function computeDagDepth<T>(adjacency: Map<T, Set<T>>): Map<T, number> {
    // TODO
}

// never lets borders collide
export function antiCollisionColoring(radius: number): DynamicLocal<NodeColor> {
    return {
        locality(nodeCount) {
            return radius
        },
        step(graph, pointOfChange) {
            // TODO: use memory for wantsBorder instead
            const insideBorderColor = 0
            const outsideBorderColor = 1
            const borderColor = 2
            let neighborhood = collectNeighborhood(pointOfChange, radius)
            let reachable = collectNeighborhood(pointOfChange, Infinity)
            let outerMargin = new Set(getOuterMargin(neighborhood))
            let [componentCount, components] = findConnectedComponents(
                reachable,
                (node) => neighborhood.has(node) || node.data == borderColor
            )

            let nodesByComponent = getNodesByComponent(components, components.keys())
            let significantComponents = new Set([...nodesByComponent.keys()].filter((component) => nodesByComponent.get(component)!.length > radius))

            let wantsBorder: Component[] = [] // can contain multiple borders

            // find started borders
            let startedBorders = new Set<Component>()
            for (const [node, component] of components) {
                if (node.data == insideBorderColor) {
                    for (const neighbor of node.neighbors) {
                        if (neighbor.data == borderColor) {
                            startedBorders.add(component)
                            break
                        }
                    }
                }
            }
            wantsBorder.push(...startedBorders)

            // compute parities
            let componentParities = new Map<Component, number>()
            let distances = computeDistances(pointOfChange, components.keys())
            for (const [node, component] of components) {
                let parity = (distances.get(node)! + node.data) % 2
                let oldParity = componentParities.get(component)
                if (oldParity === undefined) {
                    componentParities.set(component, parity)
                } else {
                    assert(oldParity == parity, "component has inconsistent parity")
                }
            }

            let parityBins = [new Set<Component>(), new Set<Component>()]
            for (let [component, parity] of componentParities) {
                if (wantsBorder.filter(i => i == component).length % 2 == 1) {
                    parity = 1 - parity
                }
                parityBins[parity].add(component)
            }

            // choose parity with more components
            let parity = parityBins[0].size > parityBins[1].size ? 0 : 1

            // if in conflict, build borders
            if (parityBins[0].size > 0 && parityBins[1].size > 0) {
                // TODO: think about this
                // TODO: border count, the component that has fewest borders should build a new one
                let minority = 1 - parity
                for (let component of parityBins[minority]) {
                    wantsBorder.push(component)
                }
            }

            let coloring = new Map<Node, NodeColor>()
            let remaining = new Set<Node>(neighborhood)

            function getColor(node: Node) {
                return coloring.get(node) ?? node.data
            }

            function setColor(node: Node, color: NodeColor) {
                console.assert(remaining.has(node), `tried to color node twice, was ${coloring.get(node)}, now ${color}`)
                coloring.set(node, color)
                remaining.delete(node)
            }

            // topological sort, inside should always build border before outside
            let componentEdges = getDirectedComponentBorders(components, insideBorderColor, getColor, n => neighborhood.has(n))
            let wantsBorderOrdered: Component[] = [...wantsBorder].sort((a, b) => {
                let a2b = componentEdges.get(a)!.has(b)
                let b2a = componentEdges.get(b)!.has(a)
                assert(!(a2b && b2a), "components are not a DAG")
                return a2b ? -1 : b2a ? 1 : 0
            })
            if (wantsBorder.length > 0)
                console.log("Reordered", wantsBorder, "to", wantsBorderOrdered)

            // TODO: fix for multiple borders
            for (let component of wantsBorderOrdered) {
                let nodes = nodesByComponent.get(component)!
                let root = nodes[0]
                let offset = getColor(root) == insideBorderColor ? 0 : 1
                // build border
                let borders: Node[] = []
                bfs(root,
                    (node, distance) => {
                        if (!remaining.has(node)) {
                            if (getColor(node) == borderColor) {
                                borders.push(node)
                                return SearchState.Skip
                            }
                            return SearchState.Continue
                        }
                        if ((distance+offset) % 2 == 0) {
                            setColor(node, insideBorderColor)
                            return SearchState.Continue
                        } else {
                            setColor(node, borderColor)
                            borders.push(node)
                            return SearchState.Skip
                        }
                    }
                )
                // build border padding
                for (let node of borders) {
                    for (let neighbor of node.neighbors) {
                        if (remaining.has(neighbor)) {
                            setColor(neighbor, outsideBorderColor)
                        }
                    }
                }
            }

            let neighborhoodDistances = computeDistances(pointOfChange, neighborhood)
            for (let node of remaining) {
                let distance = neighborhoodDistances.get(node)!
                setColor(node, (distance + parity) % 2)
            }

            return coloring
        },
    }
}