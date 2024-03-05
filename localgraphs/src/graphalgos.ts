import { Graph, GraphNode, createEmptyGraph, createNode } from "./graph"

export enum SearchState {
    Continue,
    Terminate,
    Skip, // don't expand neighbors
}

// Runs bfs until callback returns false. Executes callback on every node.
export function bfs<T>(start: GraphNode<T> | GraphNode<T>[], callback: (node: GraphNode<T>, distance: number) => SearchState) {
    bfsFold(start,
        () => 0,
        node => node.neighbors,
        (node, distance) => {
            return [callback(node, distance), distance + 1]
        })
}

// Runs bfs until callback returns Terminate. Runs callback on every node and passes return value from parent.
export function bfsFold<S, T>(start: S | S[], initial: (node: S) => T, children: (node: S) => Iterable<S>, callback: (node: S, value: T) => [SearchState, T]) {
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
        }
        frontier = newFrontier
    }
}

// set of all nodes within radius distance of node
export function collectNeighborhood<T>(node: GraphNode<T>, radius: number): Set<GraphNode<T>> {
    let nodes = new Set<GraphNode<T>>([node])
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