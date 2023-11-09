import { createEmptyGrid } from "../../shared/utils.js";
import { Graph, GraphNode, createEdge, createEmptyGraph, createNode } from "./graphlayout.js";

export type DynamicLOCAL<T> = (graph: Graph<T>, pointOfChange: GraphNode<T>) => T
export type GridAdversary<T> = (grid: PartialGrid<T>) => [number, number]

export class PartialGrid<T> {
    cells: (T|null)[][];
    rows: number;
    columns: number;

    constructor(rows: number, columns: number) {
        this.rows = rows
        this.columns = columns
        this.cells = createEmptyGrid(this.rows, this.columns)
    }

    get(x: number, y: number): T|null {
        return this.cells[x][y]
    }

    put(x: number, y: number, value: T) {
        this.cells[x][y] = value
    }

    forEach(callback: (i: number, j: number, value: T|null) => any) {
        for (let i=0; i < this.cells.length; i++) {
            for (let j=0; j < this.cells[i].length; j++) {
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

    getGraph(): [Graph<T>, PartialGrid<GraphNode<T>>] {
        let graph = createEmptyGraph<T>()
        let nodeGrid = new PartialGrid<GraphNode<T>>(this.rows, this.columns)
        this.forNonEmpty((i, j, cell) => {
            let node = createNode(graph, cell)
            nodeGrid.put(i, j, node)
            if (i > 0) {
                let otherNode = nodeGrid.get(i-1, j)
                if (otherNode) {
                    createEdge(graph, node, otherNode)
                }
            }
            if (j > 0) {
                let otherNode = nodeGrid.get(i, j-1)
                if (otherNode) {
                    createEdge(graph, node, otherNode)
                }
            }
        })
        return [graph, nodeGrid]
    }

    // changes a value in the grid and returns the new graph and the node at the point of change
    insertAndDiff(i: number, j: number): [Graph<T>, GraphNode<T>] {
        this.put(i, j, undefined as any) // value in node should not be used
        let [graph, nodeGrid] = this.getGraph()
        return [graph, nodeGrid.get(i, j)!]
    }

    dynamicLocalStep(i: number, j: number, algo: DynamicLOCAL<T>) {
        let [graph, pointOfChange] = this.insertAndDiff(i, j)
        let newValue = algo(graph, pointOfChange)
        this.put(pointOfChange.x, pointOfChange.y, newValue)
    }
}
