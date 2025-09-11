import { describe, expect, test, jest } from '@jest/globals';
import { createEdge, createEmptyGraph, createNode } from './graph';
import { dfsWalkWithIncreasingOrder } from './graphalgos';

describe('dfs', () => {
    test("dfs ordered simple", () => {
        let graph = createEmptyGraph<number>();
        let n1 = createNode(graph, 1)
        let n2 = createNode(graph, 2)
        let n3 = createNode(graph, 3)
        createEdge(graph, n2, n1)
        createEdge(graph, n3, n1)
        let walk = dfsWalkWithIncreasingOrder(graph.nodes, n => n.data)
        let walkLabels = walk.map(n => n.data)
        expect(walkLabels).toEqual([1, 2, 3])
    })
    test("dfs ordered path check dfs order", () => {
        let graph = createEmptyGraph<number>();
        let n1 = createNode(graph, 4)
        let n2 = createNode(graph, 1)
        let n3 = createNode(graph, 2)
        let n4 = createNode(graph, 3)
        createEdge(graph, n1, n2)
        createEdge(graph, n2, n3)
        createEdge(graph, n3, n4)
        // 4-1-2-3
        let walk = dfsWalkWithIncreasingOrder(graph.nodes, n => n.data)
        let walkLabels = walk.map(n => n.data)
        expect(walkLabels).toEqual([1, 2, 3, 4])
    })
    test("dfs ordered complex", () => {
        let graph = createEmptyGraph<number>();
        let n1 = createNode(graph, 1)
        let n2 = createNode(graph, 2)
        let n3 = createNode(graph, 3)
        let n4 = createNode(graph, 4)
        let n5 = createNode(graph, 5)
        let n7 = createNode(graph, 7)
        let n6 = createNode(graph, 6)
        createEdge(graph, n5, n1)
        createEdge(graph, n4, n1)
        createEdge(graph, n4, n3)
        createEdge(graph, n2, n4)
        createEdge(graph, n2, n5)
        createEdge(graph, n2, n6)
        createEdge(graph, n2, n7)
        /*
             _____
            /     \
            5-1-4-2-7
                | |
                3 6
        */
        let walk = dfsWalkWithIncreasingOrder(graph.nodes, n => n.data)
        let walkLabels = walk.map(n => n.data)
        expect(walkLabels).toEqual([1, 4, 2, 5, 6, 7, 3])
    })
})
