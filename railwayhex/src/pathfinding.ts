import { min } from "../../shared/utils"

export function findPath<NodeT>(
    startNode: NodeT, endNode: NodeT,
    getNeighbors: (node: NodeT) => NodeT[],
    getCost: (node: NodeT, neighbor: NodeT) => number,
): NodeT[] {
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

    let backtrack: NodeT[] = []
    let current: NodeT | undefined = endNode
    while (current !== undefined) {
        backtrack.push(current)
        current = cameFrom.get(current)
    }
    return backtrack.reverse()
}

export function getPathEdges<NodeT>(path: NodeT[]) {
    let edges: [NodeT, NodeT][] = []
    for (let i = 0; i < path.length - 1; i++) {
        edges.push([path[i], path[i+1]])
    }
    return edges
}