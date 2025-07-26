import { allocateEF1PO, Allocation } from "../algo";
import { generateUniformLineInstance, isConnectedAllocation, LineInstance } from "./lineutilities";

let count = 10000

function sortMap<T>(map: Map<T, number>): T[] {
    let keys = [...map.keys()]
    keys.sort((a,b) => map.get(a)! - map.get(b)!)
    return keys
}

function sortedOwnership(allocation: Allocation, instance: LineInstance) {
    let agents = sortMap(instance.agentPositions);
    let items = sortMap(instance.itemPositions);
    return items.map(item => agents.indexOf(allocation.get(item)!))
}

function formatInstance(instance: LineInstance): string {
    let agents = Array.from(instance.agentPositions.values()).sort();
    let items = Array.from(instance.itemPositions.values()).sort();
    return `Agents: ${agents.join(", ")}\nItems: ${items.join(", ")}`;
}
for (let k = 3; k <= 10; k++) {
    console.log(`Run with ${k} items`);
    for (let i = 0; i < count; i++) {
        let instance = generateUniformLineInstance(4, k)
        let agents = [...instance.agentPositions.keys()];
        let items = [...instance.itemPositions.keys()];
        let outcome = allocateEF1PO(agents, items);
        let connected = isConnectedAllocation(outcome.allocation, instance);
        if (!connected) {
            console.log("not connected allocation:", sortedOwnership(outcome.allocation, instance));
            console.log(formatInstance(instance));
        }
    }
}