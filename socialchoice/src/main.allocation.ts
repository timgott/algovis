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
  allocateUnfairEquilibrium,
  calcBudgets,
  checkIsEquilibrium,
  computeMBBSet,
  findBudgetViolatorsUpTo1,
  findLeastSpenders,
  improveAllocationStep,
} from "./algo";
import {
  Graph,
  GraphNode,
  createEdge,
  createEmptyGraph,
} from "../../localgraphs/src/graph";
import { UndoHistory } from "../../localgraphs/src/interaction/undo";
import { NAMES, THINGS } from "./names";
import { assert, ensured, mapFromFunction, randInt } from "../../shared/utils";

const canvas = document.getElementById("graph_canvas") as HTMLCanvasElement;
initFullscreenCanvas(canvas);

const layoutStyle: LayoutConfig = {
  nodeRadius: 10,
  pushDistance: 40,
  minEdgeLength: 50,
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

// maps x in [0, 1] to [0, 1] with a uniform exponent
function niceExponential(x: number, b: number) {
  return Math.pow(x, Math.log(1 - b) / Math.log(b));
}

// map x in [0,1] to exponential distribution
function expDistributionInv(x: number, lambda: number) {
  return -Math.log(1 - x) / lambda;
}

type DemoAgent = NamedAgent & {
  // unique exponent to break identical distributions
  utilityExponent: number;
};
class AllocationDemo {
  items: Item[];
  agents: DemoAgent[];
  market: MarketOutcome;

  constructor() {
    this.items = [];
    this.agents = [];
    this.clearAllocation(); // empty market outcome
  }

  addItem(): Item {
    const itemName = getUniqueName(THINGS, this.items.length);
    this.items.push(itemName);
    for (let agent of this.agents) {
      agent.utility.set(itemName, this.randomUtility(agent.utilityExponent));
    }
    return itemName;
  }

  randomUtility(exponent: number) {
    const discreteSteps = 128;
    let r = (randInt(discreteSteps-1)+1) / discreteSteps; // excludes 0 and 1
    return expDistributionInv(r, exponent);
  }

  addAgent(): NamedAgent {
    const name = getUniqueName(NAMES, this.agents.length);
    const utilityExponent = 1.0 / (Math.random()*0.9 + 0.1);
    const utilities = mapFromFunction(this.items, () =>
      this.randomUtility(utilityExponent),
    );
    const agent: DemoAgent = {
      utility: utilities,
      name,
      utilityExponent,
    };
    this.agents.push(agent);

    return agent;
  }

  computeAllocation() {
    if (this.agents.length > 0) {
      // run algorithm!
      this.market = allocateEF1PO(this.agents, this.items);
    }
  }

  clearAllocation() {
    this.market = {
      allocation: new Map(),
      prices: new Map(),
    };
  }

  algoStep() {
    if (this.agents.length > 0) {
      if (!checkIsEquilibrium(this.market, this.agents, this.items)) {
        // needs initial allocation
        this.market = allocateUnfairEquilibrium(this.agents, this.items);
      } else {
        improveAllocationStep(this.market, this.agents, this.items);
      }
    }
  }

  clone(): AllocationDemo {
    let clone = new AllocationDemo();
    clone.items = this.items.slice();
    clone.agents = this.agents.slice(); // agents are not immutable! utilities are added with new items
    clone.market = {
      allocation: new Map(this.market.allocation),
      prices: new Map(this.market.prices),
    };
    return clone;
  }
}

type AgentNodeData = {
  nodeType: "agent";
  agent: NamedAgent;
  mbbItems: Set<GraphNode<ItemNodeData>>;
  budget: number;
  utilities: [GraphNode<ItemNodeData>, number][];
  isViolator: boolean;
  isLeastSpender: boolean;
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
  itemMap: Map<Item, GraphNode<ItemNodeData>> = new Map();
  agentMap: Map<Agent, GraphNode<AgentNodeData>> = new Map();

  constructor() {
    this.graph = createEmptyGraph();
  }

  private putNewAgentNode(agent: NamedAgent): GraphNode<AgentNodeData> {
    let node = this.createNewNode<AgentNodeData>({
      nodeType: "agent",
      agent,
      mbbItems: new Set(),
      budget: 0,
      utilities: [],
      isViolator: false,
      isLeastSpender: false,
    });
    return node;
  }

  private putNewItemNode(item: string): GraphNode<ItemNodeData> {
    let node = this.createNewNode<ItemNodeData>({
      nodeType: "item",
      name: item,
      owner: null,
      price: null,
    });
    return node;
  }

  createNewNode<D extends NodeData>(data: D): GraphNode<D> {
    let x = (0.25 + 0.5 * Math.random()) * canvas.clientWidth;
    let y = (0.25 + 0.5 * Math.random()) * canvas.clientHeight;
    return {
      data,
      x,
      y,
      vx: 0,
      vy: 0,
      neighbors: new Set<GraphNode<D>>(),
    };
  }

  updateGraphNodes(model: AllocationDemo) {
    // clear all nodes
    let newGraph = createEmptyGraph<NodeData>();
    let newItems = new Map<Item, GraphNode<ItemNodeData>>();
    let newAgents = new Map<Agent, GraphNode<AgentNodeData>>();

    // add item nodes
    for (let item of model.items) {
      let itemNode = this.itemMap.get(item) ?? this.putNewItemNode(item);
      itemNode.neighbors = new Set();
      newGraph.nodes.push(itemNode);
      newItems.set(item, itemNode);
    }

    // add agent nodes
    for (let agent of model.agents) {
      let agentNode = this.agentMap.get(agent) ?? this.putNewAgentNode(agent);
      agentNode.neighbors = new Set();
      newGraph.nodes.push(agentNode);
      newAgents.set(agent, agentNode);
    }

    this.graph = newGraph;
    this.itemMap = newItems;
    this.agentMap = newAgents;
  }

  update(model: AllocationDemo) {
    this.updateGraphNodes(model);

    let budgets = calcBudgets(model.agents, model.market);
    let [leastSpenders, leastBudget] = findLeastSpenders(model.agents, budgets);
    let violators = new Set(
      findBudgetViolatorsUpTo1(leastBudget, model.market),
    );
    let leastSpendersSet = new Set(leastSpenders);
    for (let [agent, agentNode] of this.agentMap) {
      // connect MBB set
      let mbbSet = computeMBBSet(agent, model.market.prices);
      agentNode.data.mbbItems = mbbSet.map((item) =>
        ensured(this.itemMap.get(item)),
      );

      // assign budget
      agentNode.data.budget = budgets.get(agent)!;

      // connect utilities
      agentNode.data.utilities = model.items.map((item) => [
        ensured(this.itemMap.get(item)),
        ensured(agent.utility.get(item)),
      ]);

      // mark violators and least spenders
      agentNode.data.isViolator = violators.has(agent);
      agentNode.data.isLeastSpender = leastSpendersSet.has(agent);
    }
    for (let [item, itemNode] of this.itemMap) {
      // connect allocation
      let owner = model.market.allocation.get(item);
      itemNode.data.owner = owner ? ensured(this.agentMap.get(owner)) : null;
      // assign price
      itemNode.data.price = model.market.prices.get(item) ?? null;
    }

    // add physics edges
    // (old edges have already been cleared)
    for (let agentNode of this.agentMap.values()) {
      for (let itemNode of agentNode.data.mbbItems) {
        if (itemNode.data.owner != agentNode) {
          createEdge(this.graph, agentNode, itemNode, 300); // length 300
        }
      }
    }
    for (let item of this.itemMap.values()) {
      let owner = item.data.owner;
      if (owner) {
        createEdge(this.graph, item, owner, 100); // length 100
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
    let priceScale = 50;
    let priceOffset = 2;
    let getRadiusForPrice = (price: number) =>
      Math.max(Math.sqrt(price * priceScale), priceOffset);
    let drawNames = true;
    let showUtilities = false;
    let agentNodes: GraphNode<AgentNodeData>[] = graph.nodes.filter(
      (n): n is GraphNode<AgentNodeData> => n.data.nodeType == "agent",
    );
    let itemNodes: GraphNode<ItemNodeData>[] = graph.nodes.filter(
      (n): n is GraphNode<ItemNodeData> => n.data.nodeType == "item",
    );
    if (showUtilities) {
      for (let node of agentNodes) {
        // preferences
        // TODO: show only on hover
        for (let [item, utility] of node.data.utilities) {
          ctx.lineWidth = utility * 20.0;
          let alpha = utility * 0.75;
          ctx.strokeStyle = `rgba(10,100,50,${alpha})`;
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(item.x, item.y);
          ctx.stroke();
        }
      }
    }

    for (let node of itemNodes) {
      // line from item to allocated owner
      let owner = node.data.owner;
      if (owner !== null) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = "black";
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(owner.x, owner.y);
        ctx.stroke();
      }
    }

    for (let node of agentNodes) {
      let data = node.data;

      // MBB lines
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      for (let item of data.mbbItems) {
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(item.x, item.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // agent square
      let color = data.isViolator
        ? "red"
        : data.isLeastSpender
          ? "black"
          : "darkgreen";
      ctx.fillStyle = color;
      let radius = getRadiusForPrice(data.budget);
      assert(radius < 500, "budget too large");
      ctx.beginPath();
      drawSquare(ctx, node.x, node.y, radius);
      ctx.fill();

      if (drawNames) {
        ctx.fillStyle = color;
        ctx.textBaseline = "middle";
        ctx.fillText(data.agent.name, node.x + 2 + radius, node.y);
      }
    }

    for (let node of itemNodes) {
      let data = node.data;

      // item circle
      let price = data.price ?? 0;
      let radius = getRadiusForPrice(price);
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

// Global init
type GlobalState = AllocationDemo;

let globalState: GlobalState = new AllocationDemo();
let allocationGraph: AllocationGraph = new AllocationGraph();

const sim = new GraphPhysicsSimulator<NodeData>(
  allocationGraph.graph,
  layoutStyle,
  new AllocationRenderer(),
);
sim.substeps = 10;
sim.setInteractionMode(() => new DragNodeInteraction());

const controller = new InteractionController(canvas, sim);

function applyGlobalState(target: GlobalState) {
  globalState = target;
  allocationGraph.update(globalState);
  sim.changeGraph(allocationGraph.graph);
  controller.requestFrame();
}

let history = new UndoHistory<GlobalState>(Infinity, (s) => s.clone());

function globalAction(f: (model: AllocationDemo) => unknown): () => void {
  return () => {
    history.push(globalState);
    f(globalState);
    applyGlobalState(globalState);
  };
}

// action buttons
let addAgentButton = document.getElementById("add_agent")!;
addAgentButton.addEventListener(
  "click",
  globalAction((g) => g.addAgent()),
);
let addItemButton = document.getElementById("add_item")!;
addItemButton.addEventListener(
  "click",
  globalAction((g) => g.addItem()),
);
let stepButton = document.getElementById("btn_step")!;
stepButton.addEventListener(
  "click",
  globalAction((g) => g.algoStep()),
);
let clearButton = document.getElementById("btn_clear")!;
clearButton.addEventListener(
  "click",
  globalAction((g) => g.clearAllocation()),
);
let solveButton = document.getElementById("btn_solve")!;
solveButton.addEventListener(
  "click",
  globalAction((g) => g.computeAllocation()),
);

// meta buttons
let resetButton = document.getElementById("btn_reset")!;
resetButton.addEventListener("click", () => {
  applyGlobalState(new AllocationDemo());
});
let undoButton = document.getElementById("btn_undo")!;
undoButton.addEventListener("click", () => {
  let lastState = history.undo(globalState);
  if (lastState == null) throw "End of undo history";
  applyGlobalState(lastState);
});
let redoButton = document.getElementById("btn_redo")!;
redoButton.addEventListener("click", () => {
  let nextState = history.redo();
  if (nextState == null) throw "End of redo history";
  applyGlobalState(nextState);
});

// Run.
controller.requestFrame();
