// placement helpers

import { GraphNode } from "../../localgraphs/src/graph";
import { bfs, SearchState } from "../../localgraphs/src/graphalgos";
import { randomUniform, assert } from "../../shared/utils";
import { Positioned, Vector } from "../../shared/vector";

export function centerOfPoints(points: Iterable<Positioned>) {
    let sum = Vector.Zero;
    let count = 0;
    for (let point of points) {
        sum = Vector.add(sum, point)
        count += 1;
    }
    return Vector.scale(1.0 / count, sum);
}

export function placeInCenterOf(node: GraphNode<unknown>, set: Iterable<Positioned>) {
    let center = centerOfPoints(set);
    const shake = 1;
    node.x = center.x + randomUniform(-1,1) * shake;
    node.y = center.y + randomUniform(-1,1) * shake;
}

export function placeNewNodesBetweenOld(newNodes: Iterable<GraphNode<unknown>>, oldNodes: Iterable<GraphNode<unknown>>) {
    let remaining = new Set(newNodes)
    let fixed = new Set(oldNodes)
    assert(fixed.size > 0, "at least one existing node required to place other nodes around")
    bfs([...fixed], (node, dist) => {
        if (remaining.has(node)) {
            // must have at least one placed neighbor because it is reached by bfs
            placeInCenterOf(node, node.neighbors.intersection(fixed))
            fixed.add(node)
            remaining.delete(node)
            return SearchState.Continue
        }
        if (!fixed.has(node)) {
            return SearchState.Skip
        }
        return SearchState.Continue
    })
    for (let node of remaining) {
        placeInCenterOf(node, fixed)
    }
}

