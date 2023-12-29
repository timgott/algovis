import { assertExists, min } from "../../shared/utils"

// returns list of nodes along path and costs to reach them
export function findPath<NodeT>(
    startNode: NodeT, endNode: NodeT,
    getNeighbors: (node: NodeT) => NodeT[],
    getCost: (node: NodeT, neighbor: NodeT) => number,
): NodeT[] | null {
    let frontier = new Set<NodeT>([startNode])
    let cameFrom = new Map<NodeT, NodeT>()
    let costSoFar = new Map<NodeT, number>()
    costSoFar.set(startNode, 0)

    while (frontier.size > 0) {
        let current = min(frontier, node => costSoFar.get(node)!)!
        if (current === endNode) {
            break
        }
        frontier.delete(current)

        for (let next of getNeighbors(current)) {
            let newCost = costSoFar.get(current)! + getCost(current, next)
            if (!costSoFar.has(next) || newCost < costSoFar.get(next)!) {
                costSoFar.set(next, newCost)
                frontier.add(next)
                cameFrom.set(next, current)
            }
        }
    }

    if (!costSoFar.has(endNode)) {
        // no path found
        return null
    }

    let backtrack: NodeT[] = []
    let current: NodeT | undefined = endNode
    while (current !== undefined) {
        backtrack.push(current)
        current = cameFrom.get(current)
    }
    return backtrack.reverse()
}

export function getPathEdges<NodeT>(path: readonly NodeT[]) {
    let edges: [NodeT, NodeT][] = []
    for (let i = 0; i < path.length - 1; i++) {
        edges.push([path[i], path[i+1]])
    }
    return edges
}

export function limitPathBudget<NodeT>(path: NodeT[] | null, edgeCost: (a:NodeT, b:NodeT) => number, budget: number): [NodeT[], number] {
    if (path === null) {
        return [[], 0]
    }
    let total = 0
    let i: number
    for (i = 1; i < path.length; i++) {
        let cost = edgeCost(path[i-1], path[i])
        if (total + cost > budget) {
            break
        }
        total += cost
    }
    path = path.slice(0, i)
    return [path, total]
}
