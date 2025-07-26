import { describe, expect, test } from "@jest/globals"
import { Agent, Allocation, Item } from "../algo"
import { isConnectedAllocation } from "./lineutilities"

describe("isConnectedAllocation", () => {
    function createDummyAgent(items: Item[]): Agent {
        return {
            utility: new Map(items.map((item) => [item, 0.0])),
        }
    }
    
    let items = ["Item1", "Item2", "Item3"]
    let agent1: Agent = createDummyAgent(items)
    let agent2: Agent = createDummyAgent(items)
    let instance = {
        itemPositions: new Map([
            ["Item1", 0.2],
            ["Item2", 0.5],
            ["Item3", 0.8],
        ]),
        agentPositions: new Map([
            [agent1, 0.1],
            [agent2, 0.9],
        ]),
    }

    test("not connected", () => {
        let allocation: Allocation = new Map([
            ["Item1", agent1],
            ["Item2", agent2],
            ["Item3", agent1],
        ])
        expect(isConnectedAllocation(allocation, instance)).toBe(false)
    })

    test("connected", () => {
        let allocation: Allocation = new Map([
            ["Item1", agent2],
            ["Item2", agent2],
            ["Item3", agent1],
        ])
        expect(isConnectedAllocation(allocation, instance)).toBe(true)
    })
})