import { describe, expect, test, jest } from '@jest/globals';
import { findSubgridMatches, checkMatchSubgrid } from './metagame';
import { PartialGrid } from './partialgrid';

describe('matching', () => {
    test('grid works', () => {
        let grid = PartialGrid.fromArray(
            [
                [1, 2],
                [3, 4]
            ]
        )
        expect(grid.get(0, 0)).toBe(1)
        expect(grid.get(1, 1)).toBe(4)
    })

    test('grid bounds', () => {
        let grid = PartialGrid.fromArray(
            [
                [1, 2, 3],
                [4, 5, 6]
            ]
        )
        expect(grid.rows).toBe(2)
        expect(grid.columns).toBe(3)
    })
    test('grid out of bounds', () => {
        let grid = PartialGrid.fromArray(
            [
                [1, 2, 3],
                [4, 5, 6]
            ]
        )
        expect(grid.isInside(-1, 0)).toBeFalsy()
        expect(grid.isInside(0, -1)).toBeFalsy()
        expect(grid.isInside(0, 3)).toBeFalsy()
        expect(grid.isInside(2, 0)).toBeFalsy()
        expect(grid.isInside(1, 2)).toBeTruthy()
        expect(grid.isInside(0, 0)).toBeTruthy()
    })
    test('trivial check pattern', () => {
        let grid = PartialGrid.fromArray(
            [
                [1, 2],
                [3, 4]
            ]
        )
        expect(checkMatchSubgrid(grid, grid, [0, 0])).toBeTruthy()
    })
    test('findSubgridMatches', () => {
        let grid = PartialGrid.fromArray(
            [
                [1, 1, 1, 1, 1],
                [1, 1, 1, 1, 1],
                [0, 0, 2, 0, 0],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
            ]
        )
        let pattern = PartialGrid.fromArray([[2, 0, 0]]);
        let matches = findSubgridMatches(grid, pattern)
        expect(matches).toEqual([[2, 2]])
    })
})
