import {
  Graph,
  GraphNode,
  createEmptyGraph,
  createNode,
} from "../../localgraphs/src/graph";

// Not sure if necessary

type VirtualNodeData<K, T> = {
  key: K;
  data: T;
};

export class VirtualGraph<K, T> {
  graph: Graph<VirtualNodeData<K, T>>;
  nodeMap: Map<K, GraphNode<VirtualNodeData<K, T>>> = new Map();

  constructor(private keyFunc: (data: T) => K) {
    this.graph = createEmptyGraph();
  }

  sync(source: T[]) {
    this.nodeMap = virtualUpdate(
      source,
      this.nodeMap,
      this.keyFunc,
      (old, data, key) => {
        if (old == null) {
          return createNode(this.graph, { key, data });
        } else {
          old.data.data = data
          return old;
        }
      },
    );
    this.graph.nodes = [...this.nodeMap.values()];
    // TODO: translate edges
  }
}

function virtualUpdate<K, S, T>(
  source: S[],
  oldTarget: Map<K, T>,
  key: (item: S) => K,
  transfer: (old: T | null, data: S, key: K) => T,
): Map<K, T> {
  return new Map<K, T>(
    source.map((item) => {
      const k = key(item);
      return [k, transfer(oldTarget.get(k) ?? null, item, k)];
    }),
  );
}
