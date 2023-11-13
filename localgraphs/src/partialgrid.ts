import { createEmptyGrid } from "../../shared/utils.js";
import { Graph, GraphNode, createEdge, createEmptyGraph, createNode } from "./graphlayout.js";

export type OnlineAlgorithm<T> = (graph: Graph<T>, pointOfChange: GraphNode<T>) => T
export type GridAdversary<T> = (grid: PartialGrid<T>) => [number, number]
export type DynamicLocal<T> = {
    locality: (nodeCount: number) => number,
    step: (graph: Graph<T>, pointOfChange: GraphNode<T>) => Map<GraphNode<T>, T>,
}

export class PartialGrid<T> {
    cells: (T | null)[][];
    rows: number;
    columns: number;

    insertionOrder: [number, number][] = []

    constructor(rows: number, columns: number) {
        this.rows = rows
        this.columns = columns
        this.cells = createEmptyGrid(this.rows, this.columns)
    }

    copy(): PartialGrid<T> {
        let result = new PartialGrid<T>(this.rows, this.columns)
        this.insertionOrder.forEach(([i, j]) => {
            result.put(i, j, this.get(i, j)!)
        })
        return result
    }

    get(x: number, y: number): T | null {
        return this.cells[x][y]
    }

    put(x: number, y: number, value: T) {
        if (this.cells[x][y] == null) {
            // only first time, dynamic algorithms overwrite values multiple times
            this.insertionOrder.push([x, y])
        }
        this.cells[x][y] = value
    }

    forEach(callback: (i: number, j: number, value: T | null) => any) {
        for (let i = 0; i < this.cells.length; i++) {
            for (let j = 0; j < this.cells[i].length; j++) {
                let value = this.cells[i][j]
                callback(i, j, value)
            }
        }
    }

    forEmpty(callback: (i: number, j: number) => any) {
        this.forEach((i, j, value) => {
            if (value === null) {
                callback(i, j)
            }
        })
    }

    forNonEmpty(callback: (i: number, j: number, value: T) => any) {
        this.forEach((i, j, value) => {
            if (value !== null) {
                callback(i, j, value)
            }
        })
    }

    emptyCells(): [number, number][] {
        let result: [number, number][] = []
        this.forEmpty((i, j) => {
            result.push([i, j])
        })
        return result
    }

    getGraph(insertPoint: [number, number]): [Graph<T>, PartialGrid<GraphNode<T>>] {
        let graph = createEmptyGraph<T>()
        let nodeGrid = new PartialGrid<GraphNode<T>>(this.rows, this.columns)

        // insert nodes for all non-empty cells
        function insertNode(i: number, j: number, value: T) {
            let node = createNode(graph, value)
            nodeGrid.put(i, j, node)
            return node
        }
        this.forNonEmpty(insertNode)

        // insert a new node such that algo can use it to traverse the graph
        let newNode = insertNode(...insertPoint, undefined as any)

        // create edges
        function connectNode(i: number, j: number, node: GraphNode<T>) {
            if (i > 0) {
                let otherNode = nodeGrid.get(i - 1, j)
                if (otherNode) {
                    createEdge(graph, node, otherNode)
                }
            }
            if (j > 0) {
                let otherNode = nodeGrid.get(i, j - 1)
                if (otherNode) {
                    createEdge(graph, node, otherNode)
                }
            }
        }
        nodeGrid.forNonEmpty(connectNode)

        // reorder according to insertion order
        console.assert(graph.nodes.length === this.insertionOrder.length + 1, graph.nodes.length, this.insertionOrder.length)
        graph.nodes = this.insertionOrder.map(([i, j]) => nodeGrid.get(i, j)!)
        graph.nodes.push(newNode)

        return [graph, nodeGrid]
    }

    onlineAlgorithmStep(i: number, j: number, algo: OnlineAlgorithm<T>) {
        // insert a new node such that algo can use it to traverse the graph
        let [graph, nodeGrid] = this.getGraph([i, j])
        let pointOfChange = nodeGrid.get(i, j)!

        let newValue = algo(graph, pointOfChange)

        console.assert(newValue !== undefined)
        this.put(i, j, newValue) // update ground truth (graph is only temporary)
    }

    dynamicAlgorithmStep(i: number, j: number, algo: DynamicLocal<T>) {
        let [graph, nodeGrid] = this.getGraph([i, j])
        let pointOfChange = nodeGrid.get(i, j)!

        let changes = algo.step(graph, pointOfChange)

        let locality = algo.locality(graph.nodes.length)
        nodeGrid.forNonEmpty((i2, j2, node) => {
            let value = changes.get(node)
            if (value !== undefined) {
                let distance = Math.abs(i2 - i) + Math.abs(j2 - j)
                if (distance <= locality) {
                    this.put(i2, j2, value)
                } else {
                    console.error(`Dynamic algorithm violates locality ${locality} around ${i}, ${j}, touching ${i2}, ${j2}`)
                }
            }
        })

        console.assert(this.get(i, j) !== undefined && this.get(i, j) !== null)
    }
}

export let randomAdversary: GridAdversary<any> = (grid) => {
    let emptyCells = grid.emptyCells()
    return emptyCells[Math.floor(Math.random() * emptyCells.length)]
}