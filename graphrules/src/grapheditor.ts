// Writable graph
interface LabeledGraphInserter<V, L, E> {
    insertNode(label: L): V;
    insertEdge(a: V, b: V): E;
}
interface ConnectingLabeledGraphInserter<V, L, C = V, E = unknown> extends LabeledGraphInserter<V, L, E> {
    insertConnectingEdge(a: C, b: V): void;
}
interface EdgeMover<V> {
    moveEdgeEndpoint(start: V, from: V, to: V): void;
}
