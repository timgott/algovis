import { Graph } from "../../localgraphs/src/graph";
import { VirtualGraph } from "../../socialchoice/src/virtualgraph";
import { VirtualGraphEmbedding, VirtualNode } from "./viewmodel/boxsemantics";
import { UiNodeData } from "./viewmodel/state";

export class CollectInsertions<V, L, C, E> implements ConnectingLabeledGraphInserter<V, L, C, E> {
    public newNodes: V[] = [];
    public edges: E[] = [];
    public connectors: C[] = [];

    constructor(private actualInserter: ConnectingLabeledGraphInserter<V, L, C, E>) { }

    insertNode(label: L): V {
        let v = this.actualInserter.insertNode(label);
        this.newNodes.push(v);
        return v;
    }
    insertEdge(a: V, b: V): E {
        let e = this.actualInserter.insertEdge(a, b);
        this.edges.push(e);
        return e;
    }
    insertConnectingEdge(a: C, b: V): void {
        let e = this.actualInserter.insertConnectingEdge(a, b);
        this.connectors.push(a);
    }
}
