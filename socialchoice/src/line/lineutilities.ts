// test whether allocations are connected if items and agents are on a line

import { mapFromFunction, maxValue, minValue } from "../../../shared/utils";
import {
  Agent,
  Allocation,
  Item,
  getBundles,
} from "../algo";

export type LineInstance = {
    agentPositions: Map<Agent, number>;
    itemPositions: Map<Item, number>;
}

export function generateLineInstance(agentPositions: number[], itemPositions: number[]): LineInstance {
    const agentMap = new Map<Agent, number>();
    const itemMap = new Map<Item, number>();

    for (let i = 0; i < itemPositions.length; i++) {
        let item: Item = `Item${i + 1}`;
        itemMap.set(item, itemPositions[i]);
    }

    for (let i = 0; i < agentPositions.length; i++) {
        let pos = agentPositions[i];
        let agent: Agent = {
            utility: mapFromFunction(itemMap.keys(), (item) => {
                let itemPos = itemMap.get(item)!
                // utility is 1 - distance
                //return 1 - Math.abs(pos - itemPos);
                //return 1 - Math.abs(pos - itemPos);
                return 1 - Math.abs(pos - itemPos);
            }),
        }
        agentMap.set(agent, pos);
    }

    return { agentPositions: agentMap, itemPositions: itemMap };
}

export function generateUniformLineInstance(numAgents: number, numItems: number): LineInstance {
    //let rand = () => Math.round(Math.random()*100)/100;
    let rand = () => Math.random();
    let agents: number[] = Array(numAgents).fill(0).map(() => rand());
    let items: number[] = Array(numItems).fill(0).map(() => rand());
    return generateLineInstance(agents, items);
}

export function isConnectedAllocation(allocation: Allocation, instance: LineInstance): boolean {
    let agents = [...instance.agentPositions.keys()];
    let allItems = [...instance.itemPositions.keys()];
    let bundles = getBundles(agents, allocation);

    // check if each agent's bundle is a connected piece of items, uninterrupted by other agents' items
    for (const agent of agents) {
        const bundle = new Set(bundles.get(agent)!);

        // find min and max positions of items in the agent's bundle
        let lower = minValue(bundle, (item) => instance.itemPositions.get(item)!);
        let upper = maxValue(bundle, (item) => instance.itemPositions.get(item)!);

        for (const item of allItems) {
            let itemPos = instance.itemPositions.get(item)!;
            if (!bundle.has(item) && itemPos > lower && itemPos < upper) {
                // other agent's bundle intersects this agent's bundle
                return false
            }
        }
    }

    return true;
}
