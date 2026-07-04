// Returns a generator over all nodes that can be reached by following the given sequence of labels starting from the root node.
// Only returns the leaf node of each path that can be reached, not inner nodes.
export function* parsePath<V, L>(path: (L | null)[], graph: BasicGraph<V> & LabeledNeighborAccessor<V, L>, root: V, previous?: V): Generator<V> {
    if (path.length === 0) { yield root; }
    let candidates = path[0] === null ? graph.neighbors(root) : graph.neighborsWithLabel(root, path[0]);
    const remainingPath = path.slice(1);
    for (let next of candidates) {
        if (next !== previous && next !== root) {
            yield* parsePath(remainingPath, graph, next, root);
        }
    }
}

// Similarly to parsePath, follows a given path of labels. In addition, it restarts the search from the leaf nodes.
// Returns all nodes reachable by following the label path any number of repeated times (including 0 times, the root).
export function* parseLinkedList<V, L>(path: (L | null)[], graph: BasicGraph<V> & LabeledNeighborAccessor<V, L>, root: V, previous?: V): Generator<V> {
    yield root;
    for (let next of parsePath(path, graph, root)) {
        if (next !== previous)
            yield* parseLinkedList(path, graph, next, root);
    }
}
