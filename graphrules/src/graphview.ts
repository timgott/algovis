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

interface LabeledNeighborAccessor<V, L> {
    // Can be implemented faster than iterating through neighbors
    neighborsWithLabel(node: V, label: L): ReadonlySet<V>
}
