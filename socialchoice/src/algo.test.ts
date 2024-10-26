import { describe, expect, test } from "@jest/globals";
import { Item, NamedAgent, allocateEF1PO, checkIsEnvyFreeUpTo1, checkIsEquilibrium } from "./algo";
import { bfsFold, bfsSimple } from "../../localgraphs/src/graphalgos";
import { assert } from "../../shared/utils";

describe("allocateEF1PO", () => {
  test("allocateEF1PO", () => {
    const items = ["a", "b", "c", "d"];
    const agent1: NamedAgent = {
      name: "Alice",
      utility: new Map([
        ["a", 1],
        ["b", 2],
        ["c", 3],
        ["d", 4],
      ]),
    };
    const agent2: NamedAgent = {
      name: "Bob",
      utility: new Map([
        ["a", 2],
        ["b", 3],
        ["c", 4],
        ["d", 1],
      ]),
    };
    const agent3: NamedAgent = {
      name: "Clown",
      utility: new Map([
        ["a", 100],
        ["b", 100],
        ["c", 100],
        ["d", 100],
      ]),
    };
    const agents = [agent1, agent2, agent3];
    const outcome = allocateEF1PO(agents, items);
    expect(checkIsEquilibrium(outcome, agents, items));
    expect(checkIsEnvyFreeUpTo1(outcome, agents));

    console.log("Outcome:", outcome);
  });

  test("More agents than items", () => {
      const items = ["a"];
      const agent1: NamedAgent = {
        name: "Alice",
        utility: new Map([
          ["a", 1],
        ]),
      };
      const agent2: NamedAgent = {
        name: "Bob",
        utility: new Map([
          ["a", 2],
        ]),
      };
      const agent3: NamedAgent = {
        name: "Clown",
        utility: new Map([
          ["a", 100],
        ]),
      };
      const agents = [agent1, agent2, agent3];
      const outcome = allocateEF1PO(agents, items);
      expect(checkIsEquilibrium(outcome, agents, items));
      expect(checkIsEnvyFreeUpTo1(outcome, agents));

      console.log("Outcome:", outcome);
    });

    test("One agent no items", () => {
      const items: Item[] = [];
      const agent1: NamedAgent = {
        name: "Alice",
        utility: new Map([
        ]),
      };
      const agents = [agent1];
      const outcome = allocateEF1PO(agents, items);
      expect(checkIsEquilibrium(outcome, agents, items));
      expect(checkIsEnvyFreeUpTo1(outcome, agents));

      console.log("Outcome:", outcome);
    });

    test.skip("zero utility", () => {
      const items: Item[] = ["a"];
      const agent1: NamedAgent = {
        name: "Alice",
        utility: new Map([
          ["a", 0],
        ]),
      };
      const agents = [agent1];
      const outcome = allocateEF1PO(agents, items);
      expect(checkIsEquilibrium(outcome, agents, items));
      expect(checkIsEnvyFreeUpTo1(outcome, agents));

      console.log("Outcome:", outcome);
    });

});

describe("shortest path", () => {
    test("bfs order", () => {
      const children = new Map([
        [1,[2]],
        [2,[3]],
        [3,[5]],
        [4,[5]],
      ]);
      let visited: number[] = [];
      bfsSimple([1,4], (node) => {
        visited.push(node);
        if (node == 4) {
          expect(visited).toEqual([1,4])
        }
        return children.get(node) || [];
      })
      expect(visited).toEqual([1,4,2,5,3])
    })
    test("bfs distance", () => {
      const children = new Map([
        [1,[2]],
        [2,[3]],
        [4,[3]],
      ]);
      let distances = new Map<number, number>();
      bfsFold([1,4], () => 0, (node, dist) => {
        distances.set(node, dist);
        return children.get(node)?.map(n => [n,dist + 1]) || [];
      })
      expect(distances.get(1)).toEqual(0);
      expect(distances.get(2)).toEqual(1);
      expect(distances.get(3)).toEqual(1);
      expect(distances.get(4)).toEqual(0);
    })
})
