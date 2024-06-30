// Allocate items fairly (EF1) and efficiently (Pareto Optimal) to a set of agents

import {
  assert,
  ensured,
  invertMap,
  invertMultiMap,
  mapFromFunction,
  max,
  maxSet,
  maxValue,
  minSet,
  minValue,
  sum,
} from "../../shared/utils";
import { bfsFold, bfsSimple } from "../../localgraphs/src/graphalgos";

export type Item = string;

export type Agent = {
  utility: Map<Item, number>;
};
export type NamedAgent = Agent & { name: string };

// allocations must always be complete (contain all items)
export type Allocation = Map<Item, Agent>;
export type Pricing = Map<Item, number>;

export type MarketOutcome = {
  allocation: Allocation;
  prices: Pricing;
};

const epsilon = 1e-6;

function calcBangPerBuck(agent: Agent, prices: Pricing, item: Item): number {
  let u = agent.utility.get(item)!;
  let p = prices.get(item)!;
  assert(p > 0, "Price cannot be zero or negative");
  return u / p;
}

// Max Bang-Per-Buck Set
export function computeMBBSet(agent: Agent, prices: Pricing): Set<Item> {
  const goods = prices.keys();
  return new Set(
    maxSet(goods, (g) => calcBangPerBuck(agent, prices, g), epsilon),
  );
}

// Resulting map is guaranteed to include bundle for every agent
export function getBundles(
  agents: Iterable<Agent>,
  allocation: Allocation,
): Map<Agent, Item[]> {
  let bundles = new Map<Agent, Item[]>();
  for (let agent of agents) {
    bundles.set(agent, []);
  }
  for (let [item, agent] of allocation) {
    ensured(bundles.get(agent)).push(item);
  }
  return bundles;
}

export function calcBudgets(
  agents: Iterable<Agent>,
  market: MarketOutcome,
): Map<Agent, number> {
  let bundles = getBundles(agents, market.allocation);
  return mapFromFunction(agents, (agent) =>
    sum(bundles.get(agent)!.map((item) => market.prices.get(item)!)),
  );
}

// check whether every agent is allocated only maximum bang-per-buck items and all items are allocated
export function checkIsEquilibrium(
  market: MarketOutcome,
  agents: Agent[],
  items: Item[],
) {
  for (let item of items) {
    if (!market.allocation.has(item)) {
      // item not allocated
      return false;
    }
    if (!market.prices.has(item)) {
      // item has no price?
      return false;
    }
  }
  let bundles = getBundles(agents, market.allocation);
  for (let [agent, items] of bundles) {
    let mbbSet = computeMBBSet(agent, market.prices);
    if (!items.every((i) => mbbSet.has(i))) {
      // agent allocated non-MBB item
      return false;
    }
  }
  return true;
}

// check whether each agent values its own bundle at least as much as the others, up to one item
export function checkIsEnvyFreeUpTo1(market: MarketOutcome, agents: Agent[]) {
  let bundles = getBundles(agents, market.allocation);
  for (let [agent, bundle] of bundles) {
    let getBundleValue = (bundle: Item[]) =>
      sum(bundle.map((item) => agent.utility.get(item)!));
    let ownValue = getBundleValue(bundle);
    for (let [otherAgent, otherBundle] of bundles) {
      if (otherAgent !== agent) {
        let otherValue = getBundleValue(otherBundle);
        let maxItem = maxValue(otherBundle, (item) => agent.utility.get(item)!);
        if (otherValue - maxItem > ownValue) {
          return false;
        }
      }
    }
  }
  return true;
}

export function allocateMaximalWelfare(
  agents: Agent[],
  items: Item[],
): Allocation {
  // Gives each item to the agent that values it most. Pareto Optimal.
  // Maximal additive social welfare.
  return mapFromFunction(
    items,
    (item) => max(agents, (a) => a.utility.get(item) ?? 0)!,
  );
}

export function allocateUnfairEquilibrium(
  agents: Agent[],
  items: Item[],
): MarketOutcome {
  // allocate items to max value agent
  const allocation = allocateMaximalWelfare(agents, items);
  // assign prices such that each item's bang-per-buck
  // is 1 for the allocated agent and at most 1 for all others
  const prices = mapFromFunction(
    items,
    (item) => allocation.get(item)!.utility.get(item)!,
  );

  return {
    allocation,
    prices,
  };
}

export function allocateUnfairToOneAgent(
  agents: Agent[],
  items: Item[],
): MarketOutcome {
  let owner = agents[0]
  // allocate all items to the first agent.
  const allocation = mapFromFunction(items, _ => owner)
  // assign prices such that each item's bang-per-buck is 1
  const prices = mapFromFunction(items, (item) => owner.utility.get(item)!);

  return { allocation, prices }
}

// find all agents that spend more than budget even if taking one item out of their bundle.
export function findBudgetViolatorsUpTo1(
  budget: number,
  market: MarketOutcome,
): Agent[] {
  // condition:
  // find agents i s.t. price(bundle of agent i without good) <= budget
  let bundles = invertMap(market.allocation); // does not contain any empty bundles!
  let violators: Agent[] = [];
  for (const [agent, items] of bundles) {
    const itemPrices = items.map((item) => market.prices.get(item)!);
    const total = sum(itemPrices);
    if (!itemPrices.find((g) => total - g <= budget + epsilon)) {
      // no item can be left out such that we can stay in budget
      // => budget violator up to 1
      violators.push(agent);
    }
  }
  return violators;
}

type SwapComponent = {
  agents: Set<Agent>;
  items: Set<Item>;
  swappables: Map<Agent, [Item, Agent]>;
};

export function findSwappableTowards(
  root: Agent[],
  market: MarketOutcome,
  mbbSets: Map<Agent, Set<Item>>,
): SwapComponent {
  const getOwner = (item: Item) => market.allocation.get(item)!;

  let connectedAgents = new Set<Agent>();
  let connectedItems = new Set<Item>();
  let predecessor = new Map<Agent, [Item, Agent]>();
  bfsSimple(root, (agent: Agent) => {
    connectedAgents.add(agent);

    // find alternating continuation (mbb, then allocation)
    const mbb = mbbSets.get(agent)!;
    const children: Agent[] = [];
    for (const item of mbb) {
      connectedItems.add(item);
      const owner = getOwner(item);
      if (!connectedAgents.has(owner)) {
        children.push(owner);
        predecessor.set(owner, [item, agent]);
      }
    }

    return children;
  });
  return {
    agents: connectedAgents,
    items: connectedItems,
    swappables: predecessor,
  };
}

// Component of agents towards which a swap chain exists starting from the root.
// swapcomponent.swappable points along the shortest path to a root
export function findSwappableFrom(
  root: Agent[],
  market: MarketOutcome,
  mbbSets: Map<Agent, Set<Item>>,
): SwapComponent {
  let allAgents = mbbSets.keys()
  let bundles = getBundles(allAgents, market.allocation)
  let itemMBBs = invertMultiMap(mbbSets)
  let connectedAgents = new Set<Agent>();
  let connectedItems = new Set<Item>();
  let predecessor = new Map<Agent, [Item, Agent]>();
  bfsFold(root, () => null, (agent: Agent, parent: [Item, Agent] | null) => {
    connectedAgents.add(agent);
    if (parent) {
      predecessor.set(agent, parent);
    }

    // find alternating continuation allocation, then mbb
    let bundle = ensured(bundles.get(agent))
    let children: [Agent,[Item,Agent]][] = []
    for (const item of bundle) {
      connectedItems.add(item);
      for (const next of ensured(itemMBBs.get(item))) {
        children.push([next, [item, agent]]);
      }
    }
    return children;
  });
  return {
    agents: connectedAgents,
    items: connectedItems,
    swappables: predecessor,
  };
}

function raisePrices(market: MarketOutcome, items: Set<Item>, factor: number) {
  // in-place
  for (let [item, price] of market.prices) {
    if (items.has(item)) {
      market.prices.set(item, price * factor);
    }
  }
}

function minMBBIncreaseFactor(
  prices: Pricing,
  insideAgents: Iterable<Agent>,
  mbbSets: Map<Agent, Iterable<Item>>,
  outsideItems: Iterable<Item>,
): number {
  const getMBB = (agent: Agent) => {
    const [first] = ensured(mbbSets.get(agent));
    return calcBangPerBuck(agent, prices, first);
  };
  // find factor to increase prices of max bang-per-buck set such that more items will be max bpb too
  // result = min(mbb(inside) / mbb(outside))
  return minValue(insideAgents, (agent) => {
    let insideMBB = getMBB(agent)
    let outsideMBB = maxValue(outsideItems, (item) =>
      calcBangPerBuck(agent, prices, item),
    );
    return insideMBB / outsideMBB;
  });
}

function validateUtilities(agents: Agent[], items: Item[]) {
  for (let agent of agents) {
    for (let item of items) {
      const u = agent.utility.get(item);
      assert(u !== undefined, "Agent must have utility for every item");
      assert(u > 0, "Utilities must be positive"); // item that has 0 utility in all agents causes 0 price and then division by 0
    }
  }
}

export function findLeastSpenders(agents: Agent[], budgets: Map<Agent, number>): [Agent[], leastBudget: number] {
  let leastSpenders =  minSet(agents, (agent) => budgets.get(agent)!, epsilon);
  return [leastSpenders, budgets.get(leastSpenders[0])!];
}

// One step of the iterative improvement algorithm. Returns null when EF1+PO allocation is reached.
export function improveAllocationStep(
  market: MarketOutcome,
  agents: Agent[],
  items: Item[],
): boolean {
  validateUtilities(agents, items);
  assert(agents.length > 0, "Needs at least one agent");
  assert(
    checkIsEquilibrium(market, agents, items),
    "invariant: must be fisher equilibrium",
  );
  const budgets = calcBudgets(agents, market);
  const [leastSpenders, leastBudget] = findLeastSpenders(agents, budgets);
  const violators = findBudgetViolatorsUpTo1(leastBudget, market);
  if (violators.length === 0) {
    // MBB equilibrium and pEF1.
    return false;
  }
  const mbbSets = mapFromFunction(agents, (agent) =>
    computeMBBSet(agent, market.prices),
  );
  const swapComponent = findSwappableTowards(leastSpenders, market, mbbSets);
  let reachableViolator = violators.find((v) =>
    swapComponent.swappables.has(v),
  );
  if (reachableViolator) {
    // TODO: Order least spenders as in paper?
    let [swapItem, swapTo] = swapComponent.swappables.get(reachableViolator)!;
    market.allocation.set(swapItem, swapTo);
    return true;
  } else {
    // raise prices of items in the component
    const outsideItems = items.filter((item) => !swapComponent.items.has(item));
    const outsideAgents = agents.filter(
      (agent) => !swapComponent.agents.has(agent),
    );
    assert(
      outsideItems.length > 0,
      "There must be at least one item outside of component",
    );
    assert(
      outsideAgents.length > 0,
      "There must be at least one agent outside of component",
    );
    const gamma1 = minMBBIncreaseFactor(
      market.prices,
      swapComponent.agents,
      mbbSets,
      outsideItems,
    );
    const leastOutsideSpending = minValue(
      outsideAgents,
      (agent) => budgets.get(agent)!,
    );
    const gamma2 = leastOutsideSpending / leastBudget;
    const priceFactor = Math.min(gamma1, gamma2);
    raisePrices(market, swapComponent.items, priceFactor);
    return true;
  }
}

// One step of the iterative improvement algorithm. Returns null when EF1+PO allocation is reached.
export function improveAllocationStepInverse(
  market: MarketOutcome,
  agents: Agent[],
  items: Item[],
): boolean {
  validateUtilities(agents, items);
  assert(agents.length > 0, "Needs at least one agent");
  assert(
    checkIsEquilibrium(market, agents, items),
    "invariant: must be fisher equilibrium",
  );
  const budgets = calcBudgets(agents, market);
  const [leastSpenders, leastBudget] = findLeastSpenders(agents, budgets);
  const violators = findBudgetViolatorsUpTo1(leastBudget, market);
  if (violators.length === 0) {
    // MBB equilibrium and pEF1.
    return false;
  }
  const mbbSets = mapFromFunction(agents, (agent) =>
    computeMBBSet(agent, market.prices),
  );
  const swapComponent = findSwappableFrom(violators, market, mbbSets);
  let reachableLeast = leastSpenders.find((v) =>
    swapComponent.swappables.has(v),
  );
  if (reachableLeast) {
    let agent: Agent
    let item: Item
    let next: Agent = reachableLeast
    do {
      agent = next;
      [item, next] = ensured(swapComponent.swappables.get(agent));
    } while (swapComponent.swappables.has(next))
    market.allocation.set(item, agent);
    return true;
  } else {
    // lower prices of items in the component
    const outsideItems = items.filter((item) => !swapComponent.items.has(item));
    const outsideAgents = agents.filter(
      (agent) => !swapComponent.agents.has(agent),
    );
    assert(
      outsideItems.length > 0,
      "There must be at least one item outside of component",
    );
    assert(
      outsideAgents.length > 0,
      "There must be at least one agent outside of component",
    );
    assert(
      outsideItems.length > 0,
      "There must be at least one item outside of component",
    );
    const gamma1 = minMBBIncreaseFactor(
      market.prices,
      outsideAgents,
      mbbSets,
      swapComponent.items,
    );
    const leastInsideSpending = minValue(
      swapComponent.agents,
      (agent) => budgets.get(agent)!,
    );
    const gamma2 = leastInsideSpending / leastBudget;
    const priceFactor = Math.min(gamma1, gamma2);
    raisePrices(market, swapComponent.items, 1.0 / priceFactor);
    return true;
  }
}

export function allocateEF1PO(agents: Agent[], items: Item[]): MarketOutcome {
  // initialize with a welfare maximizing allocation
  const market = allocateUnfairEquilibrium(agents, items);

  // swap and raise prices until termination
  let steps = 0;
  while (improveAllocationStep(market, agents, items)) steps++;
  console.log("Increase Algo:", steps);

  return market;
}

export function allocateEF1POAlt(agents: Agent[], items: Item[]): MarketOutcome {
  // initialize with a welfare maximizing allocation
  const market = allocateUnfairEquilibrium(agents, items);

  // swap and raise prices until termination
  let steps = 0;
  while (improveAllocationStepInverse(market, agents, items)) steps++;
  console.log("Decrease Algo:", steps);

  return market;
}
