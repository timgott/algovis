import { assert, max, randomChoice } from "../../shared/utils"
import { Graph, GraphNode } from "./graph"

export enum SearchState {
    Continue,
    Terminate,
    Skip, // don't expand neighbors
}

// Runs bfs until callback returns false. Executes callback on every node.
export function bfs<T>(start: GraphNode<T> | GraphNode<T>[], callback: (node: GraphNode<T>, distance: number) => SearchState) {
    bfsFoldUniform(start,
        () => 0,
        node => node.neighbors,
        (node, distance) => {
            return [callback(node, distance), distance + 1]
        })
}

// Visits each node at most once, in BFS order.
// Callback is called for each node, it returns a list of children to continue at.
// Value of type T is passed to child. The root nodes gets initial as parent value.
// Algorithm stopped immediately if one node returns Terminate.
export function bfsFold<S, T>(
  start: S | S[],
  initial: (rootNode: S) => T,
  callback: (node: S, parent: T) => Iterable<[child: S, value: T]> | SearchState.Terminate
) {
    if (!Array.isArray(start)) {
        start = [start]
    }
    let frontier = new Map<S, T>(start.map((node) => [node, initial(node)]))
    let closed = new Set<S>()
    while (frontier.size > 0) {
        let newFrontier = new Map<S, T>()
        for (let [node, value] of frontier) {
            if (!closed.has(node)) { // initial node could be added to frontier again
                closed.add(node)

                let continuation = callback(node, value)

                if (continuation == SearchState.Terminate) {
                    return
                }
                for (let [child, value] of continuation) {
                    if (!closed.has(child)) {
                        newFrontier.set(child, value)
                    }
                }
            }
        }
        frontier = newFrontier
    }
}

// Visits nodes in BFS order, but does not pass a value to children.
export function bfsSimple<S>(
  start: S | S[],
  callback: (node: S) => Iterable<S> | SearchState.Terminate
): void {
    if (!Array.isArray(start)) {
        start = [start]
    }
    let frontier = new Set<S>(start)
    let closed = new Set<S>()
    while (frontier.size > 0) {
        let newFrontier = new Set<S>()
        for (let node of frontier) {
            if (!closed.has(node)) { // initial node could be added to frontier again
                closed.add(node)

                let continuation = callback(node)

                if (continuation == SearchState.Terminate) {
                    return
                }
                for (let child of continuation) {
                    if (!closed.has(child)) {
                        newFrontier.add(child)
                    }
                }
            }
        }
        frontier = newFrontier
    }
}

// Old variant of bfsFold for callbacks that pass the same value to all children
export function bfsFoldUniform<S, T>(
  start: S | S[],
  initial: (node: S) => T,
  children: (node: S) => Iterable<S>,
  callback: (node: S, value: T) => [SearchState, T]
) {
    bfsFold<S, T>(start, initial, (node, parent) => {
        let [state, value] = callback(node, parent)
        if (state == SearchState.Terminate) {
            return SearchState.Terminate
        } else if (state == SearchState.Skip) {
            return []
        } else {
            return [...children(node)].map(child => [child, value])
        }
    })
}

// set of all nodes within radius distance of aroundNode
export function collectNeighborhood<T>(aroundNode: GraphNode<T>, radius: number): Set<GraphNode<T>> {
    let nodes = new Set<GraphNode<T>>([aroundNode])
    bfs(aroundNode, (node, distance) => {
        if (distance > radius) {
            return SearchState.Terminate
        }
        nodes.add(node)
        return SearchState.Continue
    })
    return nodes
}

// set of all nodes within radius distance of aroundSet
export function collectNeighborhoods<T>(aroundSet: GraphNode<T>[], radius: number): Set<GraphNode<T>> {
    let nodes = new Set<GraphNode<T>>(aroundSet)
    bfs(aroundSet, (node, distance) => {
        if (distance > radius) {
            return SearchState.Terminate
        }
        nodes.add(node)
        return SearchState.Continue
    })
    return nodes
}

// compute the distance of the nodes from center by BFS
export function computeDistances<T>(center: GraphNode<T>|GraphNode<T>[], nodes: Iterable<GraphNode<T>>): Map<GraphNode<T>, number> {
    let remaining = new Set<GraphNode<T>>(nodes)
    let distances = new Map<GraphNode<T>, number>()
    bfs(center, (node, distance) => {
        if (remaining.has(node)) {
            distances.set(node, distance)
            remaining.delete(node)
        }
        return (remaining.size > 0) ? SearchState.Continue : SearchState.Terminate
    })
    return distances
}

// find connected components, given by the component id each node belongs to
export type Component = number
export function findConnectedComponents<T>(seeds: Iterable<GraphNode<T>>, skip: (node: GraphNode<T>) => boolean): [number, Map<GraphNode<T>, Component>] {
    let components = new Map<GraphNode<T>, Component>()
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

export function findConnectedComponentsSimple<T>(graph: Graph<T>): [number, Map<GraphNode<T>, Component>] {
    return findConnectedComponents(graph.nodes, () => false)
}

export function countConnectedComponents<T>(graph: Graph<T>): number {
    return findConnectedComponentsSimple(graph)[0]
}

export function getNodesByComponent<T>(components: Map<GraphNode<T>, Component>, nodes: Iterable<GraphNode<T>>): Map<Component, GraphNode<T>[]> {
    let result = new Map<Component, GraphNode<T>[]>()

    for (let node of nodes) {
        let c = components.get(node)
        if (c !== undefined) {
            result.set(c, [...(result.get(c) ?? []), node])
        }
    }
    return result
}

// searches for closest node that matches and returns distance
export function findDistanceTo<T>(node: GraphNode<T>, predicate: (node: GraphNode<T>, distance: number) => boolean): number | null {
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

export function dfsWalkArbitrary<T>(nodes: GraphNode<T>[]): GraphNode<T>[] {
    let remaining = new Set(nodes)
    let queue: GraphNode<T>[] = []
    let walk: GraphNode<T>[] = []
    while (remaining.size > 0) {
        let node = queue.shift() ?? randomChoice([...remaining])
        if (remaining.has(node)) {
            remaining.delete(node)
            queue.push(...node.neighbors)
            walk.push(node)
        }
    }
    assert(new Set(walk).size === nodes.length, "wrong number of nodes in walk")
    assert(walk.length === nodes.length, "duplicate nodes in walk")
    return walk
}

export function dfsWalkWithIncreasingOrder<T>(nodes: GraphNode<T>[], key: (node: GraphNode<T>) => number): GraphNode<T>[] {
    let remaining = new Set(nodes)
    let queue: GraphNode<T>[] = []
    let walk: GraphNode<T>[] = []
    while (remaining.size > 0) {
        let node = queue.shift() ?? max(remaining, key)!
        if (remaining.has(node)) {
            remaining.delete(node)
            queue.push(...[...node.neighbors].toSorted((a,b) => key(a) - key(b)))
            walk.push(node)
        }
    }
    assert(new Set(walk).size === nodes.length, "wrong number of nodes in walk")
    assert(walk.length === nodes.length, "duplicate nodes in walk")
    return walk
}