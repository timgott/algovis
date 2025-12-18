import { describe, expect, test, jest } from '@jest/globals';
import { HashSet } from './hashset';
import { edgesFromSymmNeighborMap } from './utils';

describe('edges/neighborMap conversion', () => {
    test('edges from neighbors empty', () => {
        let neighbors = new Map()
        let edges = edgesFromSymmNeighborMap(neighbors)
        expect(edges).toHaveLength(0)
    })
    test('edges from neighbors simple', () => {
        let neighbors = new Map([[1, [2]]])
        let edges = edgesFromSymmNeighborMap(neighbors)
        expect(edges).toEqual([[1, 2]])
    })
    test('edges from neighbors symm', () => {
        let neighbors = new Map([[1, [2]], [2, [1]]])
        let edges = edgesFromSymmNeighborMap(neighbors)
        expect(edges).toEqual([[1, 2]])
    })
    test('edges from neighbors multi', () => {
        let neighbors = new Map([[1, [2,3]], [2, [1, 4]]])
        let edges = edgesFromSymmNeighborMap(neighbors)
        expect(edges).toEqual([[1, 2], [1,3], [2, 4]])
    })
})
