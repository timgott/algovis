import { describe, expect, test, jest } from '@jest/globals';

import { CommandTree, CommandTreeAdversary } from './adversary';

describe('commandTreeBranch', () => {
    test('exit', () => {
        let tree: CommandTree<number> = {
            commands: () => [],
            exit: true
        }
        let adversary = new CommandTreeAdversary(tree)
        expect(adversary.step({} as any)).toBe("exit")
    })
    test('trueBranch', () => {
        let tree: CommandTree<number> = {
            commands: () => [],
            exit: false,
            decide: () => true,
            trueBranch: {
                commands: () => [[0, 1]],
                exit: true
            },
            falseBranch: {
                commands: () => [[1, 0]],
                exit: true
            }
        }
        let adversary = new CommandTreeAdversary(tree)
        expect(adversary.step({} as any)).toEqual([0, 1])
        expect(adversary.step({} as any)).toBe("exit")
    })
    test('falseBranch', () => {
        let tree: CommandTree<number> = {
            commands: () => [[0, 1]],
            exit: false,
            decide: () => false,
            trueBranch: {
                commands: () => [[0, 1]],
                exit: true
            },
            falseBranch: {
                commands: () => [[1, 0]],
                exit: true
            }
        }
        let adversary = new CommandTreeAdversary(tree)
        expect(adversary.step({} as any)).toEqual([0, 1])
        expect(adversary.step({} as any)).toEqual([1, 0])
        expect(adversary.step({} as any)).toBe("exit")
    })
})