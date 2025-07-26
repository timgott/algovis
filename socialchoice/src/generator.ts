// functions to generate demo utility values for agents and items
import { DefaultMap } from "../../shared/defaultmap";
import { randInt } from "../../shared/utils";
import { Item } from "./algo";


// Can use some extra data about each item and agent to generate utility values.
export type UtilityGenerator<TAgent, TItem> = {
  generateUtility(agent: TAgent, item: TItem): number;
  generateItem(): TItem;
  generateAgent(): TAgent;
}

// State of the extra data used for generating utilities
export class HiddenInstanceState<TAgent, TItem> {
  itemData: DefaultMap<Item, TItem>;
  agentData: DefaultMap<string, TAgent>;

  constructor(
    public generator: UtilityGenerator<TAgent, TItem>,
  ) {
    this.itemData = new DefaultMap<Item, TItem>(() => generator.generateItem());
    this.agentData = new DefaultMap<string, TAgent>(() => generator.generateAgent());
  }

  generateUtility(agentName: string, item: Item): number {
    let agentData = this.agentData.get(agentName);
    let itemData = this.itemData.get(item);
    return this.generator.generateUtility(agentData, itemData);
  }

  clone(): HiddenInstanceState<unknown, unknown> {
    let clone = new HiddenInstanceState(this.generator);
    clone.itemData = this.itemData.clone()
    clone.agentData = this.agentData.clone();
    return clone;
  }
}


// maps x in [0, 1] to [0, 1] with a uniform exponent
function niceExponential(x: number, b: number) {
  return Math.pow(x, Math.log(1 - b) / Math.log(b));
}

// map x in [0,1] to exponential distribution
function expDistributionInv(x: number, lambda: number) {
  return -Math.log(1 - x) / lambda;
}

// Hidden Exponent distribution: each agent has a unique exponent to prevent identical distributions
export const ExpUtilityGenerator: UtilityGenerator<{ exponent: number }, null> = {
  generateUtility(agent, _) {
    let exponent = agent.exponent;
    const discreteSteps = 24;
    let r = (randInt(discreteSteps - 1) + 1) / discreteSteps; // excludes 0 and 1
    return expDistributionInv(r, exponent);
  },
  generateAgent() {
    return {
      exponent : 1.0 / (Math.random()*0.9 + 0.1)
    }
  },
  generateItem: () => null,
}

export const LineUtilityGenerator: UtilityGenerator<number, number> = {
  generateUtility(agent, item) {
    // utility is 1 - distance
    return 1 - Math.abs(agent - item);
  },
  generateItem() {
    return Math.random();
  },
  generateAgent() {
    return Math.random();
  },
}
