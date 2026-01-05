// Abstract labeled graph interface

interface BasicGraph<V> {
    neighbors(node: V): Iterable<V>
}

interface FinGraph<V> extends BasicGraph<V> {
    allNodes(): ReadonlySet<V>
    countEdges(): number
    enumerateEdges(): Iterable<[V,V]>
    neighbors(node: V): ReadonlySet<V>
}

interface Labeling<V,L> {
    nodesWithLabel(label: L): ReadonlySet<V>
    label(node: V): L
}

interface LabeledGraph<V,L> extends FinGraph<V>, Labeling<V,L> {
}

// Specialized Accessors

type ContainerEdge<V> = {
    outside: V,
    inside: V
}

interface ContainerSubgraphAccessor<V, G> {
    // Given nodes outer and inner, return the subgraph induced by
    // direct neighbors of inner, without the nodes outer and inner.
    // The vertex set of the subgraph should be a direct subset of
    // the original vertex set.
    getContainerSubgraph(container: ContainerEdge<V>): G
}

interface DirectedSubgraphAccessor<V, L, G> {
    // Follow "directed" edges marked by cyclic labels, skipping or replacing root.
    // Nodes that have different labels and do not occur in cycle labels are leafs.
    // Example matched structure:
    // root - label[0] - label[1] - bla
    //      \ foo                 \ label[2] - label[0]
    //      \ bar
    //
    // If replaceRoot is given, it replaces root in the output. If not given, root is removed.
    // Output is an induced subgraph containing all nodes that follow this pattern, starting from the node start.
    // If replaceRoot is given,
    getDirectedSubgraph(root: V, labelCycle: Set<L>[], replaceRoot?: V | undefined): G
}

interface LabeledNeighborAccessor<V, L> {
    // Can be implemented faster than iterating through neighbors
    neighborsWithLabel(node: V, label: L): ReadonlySet<V>
}
