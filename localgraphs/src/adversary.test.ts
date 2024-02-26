import { describe, expect, test, jest } from '@jest/globals';

import { CommandTree, CommandTreeAdversary, FalseCondition, TrueCondition, collectUsedIds, duplicateTree, macroApply, make3Tree, validateTree } from './adversary';
import { createEmptyGraph } from './graph';

describe('CommandTree Execution', () => {
    const emptyGraph = createEmptyGraph<number>()
    test('empty', () => {
        let tree: CommandTree<number> = []
        let adversary = new CommandTreeAdversary(tree)
        expect(adversary.step(emptyGraph)).toBe("exit")
    })
    test('build', () => {
        let tree: CommandTree<number> = {
            action: "build", edges: [[0, 1]]
        }
        let adversary = new CommandTreeAdversary(tree)
        expect(adversary.step(emptyGraph)).toEqual([0, 1])
        expect(adversary.step(emptyGraph)).toBe("exit")
    })
    test('sequence', () => {
        let tree: CommandTree<number> = [
            { action: "build", edges: [[0, 1]] },
            { action: "build", edges: [[1, 2]] },
            { action: "build", edges: [[3, 4]] },
        ]
        let adversary = new CommandTreeAdversary(tree)
        expect(adversary.step(emptyGraph)).toEqual([0, 1])
        expect(adversary.step(emptyGraph)).toEqual([1, 2])
        expect(adversary.step(emptyGraph)).toEqual([3, 4])
        expect(adversary.step(emptyGraph)).toBe("exit")
    })
    test('branchTrue', () => {
        let tree: CommandTree<number> = {
            action: "decide",
            condition: TrueCondition,
            trueBranch: { action: "build", edges: [[0, 1]] },
            falseBranch: { action: "build", edges: [[1, 2]] }
        }
        let adversary = new CommandTreeAdversary(tree)
        expect(adversary.step(emptyGraph)).toEqual([0, 1])
        expect(adversary.step(emptyGraph)).toBe("exit")
    })
    test('branchFalse', () => {
        let tree: CommandTree<number> = {
            action: "decide",
            condition: FalseCondition,
            trueBranch: { action: "build", edges: [[0, 1]] },
            falseBranch: { action: "build", edges: [[1, 2]] }
        }
        let adversary = new CommandTreeAdversary(tree)
        expect(adversary.step(emptyGraph)).toEqual([1, 2])
        expect(adversary.step(emptyGraph)).toBe("exit")
    })
    test('branchStack', () => {
        let tree: CommandTree<number> = [
            {
                action: "decide",
                condition: TrueCondition,
                trueBranch: [
                    {
                        action: "decide",
                        condition: TrueCondition,
                        trueBranch: { action: "build", edges: [[0, 1]] },
                        falseBranch: []
                    },
                    { action: "build", edges: [[1, 2]] }
                ],
                falseBranch: []
            },
            { action: "build", edges: [[2, 3]] }
        ]
        let adversary = new CommandTreeAdversary(tree)
        expect(adversary.step(emptyGraph)).toEqual([0, 1])
        expect(adversary.step(emptyGraph)).toEqual([1, 2])
        expect(adversary.step(emptyGraph)).toEqual([2, 3])
        expect(adversary.step(emptyGraph)).toBe("exit")
    })
    test('collectUsedIds', () => {
        let tree: CommandTree<number> = [
            {
                action: "decide",
                condition: TrueCondition,
                trueBranch: { action: "build", edges: [[1, 2]] },
                falseBranch: { action: "build", edges: [[3, 4]] }
            },
            { action: "build", edges: [[3, 5]] }
        ]
        expect(collectUsedIds(tree)).toEqual(new Set([1, 2, 3, 4, 5]))
    })
    test('macro', () => {
        let bigPattern: CommandTree<unknown> = [
            { action: "build", edges: [[0, 1]] },
            { action: "build", edges: [[1, 2]] }
        ]
        let smallPattern: CommandTree<unknown> = [
            { action: "build", edges: [[0, 1]] }
        ]
        const [tree, copies] = macroApply(bigPattern, smallPattern, 0)
        expect(collectUsedIds(tree).size).toBe(6)
        expect(copies).toHaveLength(3)
        expect(copies[0]).toHaveLength(2)
        validateTree(tree)
    })
})

describe('Validating', () => {
    test('validate fail', () => {
        const tree: CommandTree<unknown> = [
            { action: "build", edges: [[0, 1]] },
            { action: "build", edges: [[0, 1]] }
        ]
        expect(() => validateTree(tree)).toThrow()
    })
    test('validate simple', () => {
        const tree: CommandTree<unknown> = [
            { action: "build", edges: [[0, 1]] },
            { action: "build", edges: [[1, 2]] }
        ]
        validateTree(tree)
    })
    test('validate duplicate', () => {
        const tree: CommandTree<unknown> = [
            { action: "build", edges: [[0, 1]] },
            { action: "build", edges: [[1, 2]] }
        ]
        const [duplTree,_] = duplicateTree(tree, 5)
        validateTree(duplTree)
    })
    test('validate 3-tree', () => {
        const tree = make3Tree(2)
        validateTree(tree)
    })
})