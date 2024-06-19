import { describe, expect, test } from "@jest/globals";
import { Item, NamedAgent, allocateEF1PO, checkIsEnvyFreeUpTo1, checkIsEquilibrium } from "./algo";

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

    test("zero utility", () => {
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
