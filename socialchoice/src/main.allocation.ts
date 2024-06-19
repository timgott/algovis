import { InteractionController } from "../../localgraphs/src/interaction/renderer";
import { initFullscreenCanvas } from "../../shared/canvas";
import {
  DragNodeInteraction,
  GraphPainter,
  GraphPhysicsSimulator,
  LayoutConfig,
} from "../../localgraphs/src/interaction/graphlayout";
import {
  Agent,
  Item,
  MarketOutcome,
  NamedAgent,
  allocateEF1PO,
  calcBudgets,
  computeMBBSet,
} from "./algo";
import {
  Graph,
  GraphNode,
  clearEdges,
  createEdge,
  createEmptyGraph,
  createNode,
} from "../../localgraphs/src/graph";
import { NAMES, THINGS } from "./names";
import { mapFromFunction, randInt } from "../../shared/utils";

const canvas = document.getElementById("graph_canvas") as HTMLCanvasElement;
initFullscreenCanvas(canvas);

const layoutStyle: LayoutConfig = {
  nodeRadius: 10,
  pushDistance: 40,
  minEdgeLength: 30,
  pushForce: 100,
  edgeForce: 100,
  centeringForce: 0.0,
  dampening: 20.0,
  sleepVelocity: 0.1,
};

function getUniqueName(names: string[], index: number) {
  const repetition = Math.floor(index / names.length);
  const suffix = repetition > 0 ? `${repetition + 1}` : "";
  return names[index % names.length] + suffix;
}

class AllocationDemo {
  items: Item[];
  agents: Agent[];
  market: MarketOutcome;

  constructor() {
    this.items = [];
    this.agents = [];
    this.recompute(); // empty market outcome
  }

  addItem(): Item {
    const itemName = getUniqueName(THINGS, this.items.length);
    this.items.push(itemName);
    for (let agent of this.agents) {
      agent.utility.set(itemName, this.randomUtility());
    }

    this.recompute();

    return itemName;
  }

  randomUtility() {
    return randInt(2) * randInt(20) + 1;
  }

  addAgent(): NamedAgent {
    const name = getUniqueName(NAMES, this.agents.length);
    const agent: NamedAgent = {
      name,
      utility: mapFromFunction(this.items, () => this.randomUtility()),
    };
    this.agents.push(agent);

    this.recompute();

    return agent;
  }

  recompute() {
    if (this.agents.length > 0) {
      // run algorithm!
      this.market = allocateEF1PO(this.agents, this.items);
    } else {
      // dummy
      this.market = {
        allocation: new Map(),
        prices: new Map(),
      };
    }
  }
}

type AgentNodeData = {
  nodeType: "agent";
  agent: NamedAgent;
  mbbItems: Set<GraphNode<ItemNodeData>>;
  budget: number;
  utilities: [GraphNode<ItemNodeData>, number][];
};
type ItemNodeData = {
  nodeType: "item";
  name: string;
  owner: GraphNode<AgentNodeData> | null;
  price: number | null;
};
type NodeData = AgentNodeData | ItemNodeData;

class AllocationGraph {
  graph: Graph<NodeData>;
  model: AllocationDemo;

  itemMap: Map<Item, GraphNode<ItemNodeData>> = new Map();
  agentMap: Map<Agent, GraphNode<AgentNodeData>> = new Map();

  constructor() {
    this.graph = createEmptyGraph();
    this.model = new AllocationDemo();
  }

  addAgent() {
    let agent = this.model.addAgent();
    let node = this.putNewNode<AgentNodeData>({
      nodeType: "agent",
      agent,
      mbbItems: new Set(),
      budget: 0,
      utilities: [],
    });
    this.agentMap.set(agent, node);
    this.updateGraph();
  }

  addItem() {
    let item = this.model.addItem();
    let node = this.putNewNode<ItemNodeData>({
      nodeType: "item",
      name: item,
      owner: null,
      price: null,
    });
    this.itemMap.set(item, node);
    this.updateGraph();
  }

  putNewNode<D extends NodeData>(data: D): GraphNode<D> {
    let x = (0.25 + 0.5 * Math.random()) * canvas.clientWidth;
    let y = (0.25 + 0.5 * Math.random()) * canvas.clientHeight;
    return createNode(this.graph, data, x, y) as GraphNode<D>;
  }

  updateGraph() {
    let budgets = calcBudgets(this.model.agents, this.model.market);
    for (let agent of this.model.agents) {
      let agentNode = this.agentMap.get(agent)!;
      // MBB set
      let mbbSet = computeMBBSet(agent, this.model.market.prices);
      agentNode.data.mbbItems = mbbSet.map((item) => this.itemMap.get(item)!);

      // budget
      agentNode.data.budget = budgets.get(agent)!;

      // utilities
      agentNode.data.utilities = [...agent.utility.entries()].map(
        ([item, u]) => [this.itemMap.get(item)!, u],
      );
    }
    for (let item of this.model.items) {
      let itemNode = this.itemMap.get(item)!;
      // allocation
      let owner = this.model.market.allocation.get(item);
      if (owner !== undefined) {
        itemNode.data.owner = this.agentMap.get(owner)!;
      }
      // price
      itemNode.data.price = this.model.market.prices.get(item) ?? null;
    }

    // add physics edges
    clearEdges(this.graph);
    for (let agentNode of this.agentMap.values()) {
      for (let itemNode of agentNode.data.mbbItems) {
        if (itemNode.data.owner != agentNode) {
          createEdge(this.graph, agentNode, itemNode, 300);
        }
      }
    }
    for (let item of this.itemMap.values()) {
      let owner = item.data.owner;
      if (owner) {
        createEdge(this.graph, item, owner, 100);
      }
    }
  }
}

function drawSquare(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  ctx.rect(x - r, y - r, 2 * r, 2 * r);
}

class AllocationRenderer implements GraphPainter<NodeData> {
  drawGraph(ctx: CanvasRenderingContext2D, graph: Graph<NodeData>): void {
    let priceScale = 2;
    let priceOffset = 5;
    let drawNames = true;
    let agentNodes: GraphNode<AgentNodeData>[] =
      graph.nodes.filter((n) => n.data.nodeType == "agent") as GraphNode<AgentNodeData>[];
    let itemNodes: GraphNode<ItemNodeData>[] =
      graph.nodes.filter((n) => n.data.nodeType == "item") as GraphNode<ItemNodeData>[];
    for (let node of agentNodes) {
      // preferences
      // TODO: show only on hover
      for (let [item, utility] of node.data.utilities) {
        let u = utility * utility / 20.0; // square for distinctive effect
        ctx.lineWidth = u;
        let alpha = u / 50.0;
        ctx.strokeStyle = `rgba(10,100,50,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(item.x, item.y);
        ctx.stroke();
      }
    }

    for (let node of agentNodes) {
      let data = node.data;

      // MBB lines
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      for (let item of data.mbbItems) {
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(item.x, item.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // agent square
      ctx.fillStyle = "black";
      let radius = Math.sqrt(data.budget) * priceScale + priceOffset;
      ctx.beginPath();
      drawSquare(ctx, node.x, node.y, radius);
      ctx.fill();

      if (drawNames) {
        ctx.fillStyle = "black";
        ctx.textBaseline = "middle";
        ctx.fillText(data.agent.name, node.x + 2 + radius, node.y);
      }
    }

    for (let node of itemNodes) {
      let data = node.data;

      // line from item to allocated owner
      let owner = data.owner;
      if (owner !== null) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = "black";
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(owner.x, owner.y);
        ctx.stroke();
      }

      // item circle
      let price = data.price ?? 0;
      let radius = Math.sqrt(price * priceScale) + priceOffset;
      ctx.lineWidth = 1;
      ctx.fillStyle = "blue";
      ctx.strokeStyle = "black";
      ctx.circle(node.x, node.y, radius);
      ctx.fill();
      ctx.stroke();

      if (drawNames) {
        ctx.textBaseline = "middle";
        ctx.fillText(data.name, node.x + 2 + radius, node.y);
      }
    }
  }
}

let allocationGraph = new AllocationGraph();

const sim = new GraphPhysicsSimulator<NodeData>(
  allocationGraph.graph,
  layoutStyle,
  new AllocationRenderer(),
);
sim.substeps = 10;
sim.setInteractionMode(() => new DragNodeInteraction());

const controller = new InteractionController(canvas, sim);
controller.requestFrame();

// buttons
const addAgentButton = document.getElementById("add_agent")!;
const addItemButton = document.getElementById("add_item")!;
addAgentButton.addEventListener("click", () => {
  allocationGraph.addAgent();
  controller.requestFrame();
});
addItemButton.addEventListener("click", () => {
  allocationGraph.addItem();
  controller.requestFrame();
});
const resetButton = document.getElementById("btn_reset")!;
resetButton.addEventListener("click", () => {
  allocationGraph = new AllocationGraph();
  sim.changeGraph(allocationGraph.graph);
  controller.requestFrame();
});
