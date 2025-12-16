// Abstract labeled graph interface

interface BasicGraph<V> {
    neighbors(node: V): Iterable<V>
}

interface FinGraph<V> extends BasicGraph<V> {
    allNodes(): V[]
    neighbors(node: V): Set<V>
}

interface Labeling<V,L> {
    nodesWithLabel(label: L): Set<V>
    label(node: V): L
}

interface LabeledGraph<V,L> extends FinGraph<V>, Labeling<V,L> {
}
