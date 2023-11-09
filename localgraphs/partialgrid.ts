import { Graph, GraphNode, createEdge, createEmptyGraph, createNode } from "./graphlayout";

function createEmptyGrid<T>(rows: number, columns: number): (T|null)[][] {
    let arr: (T|null)[][] = []
    for (let i=0; i < rows; i++) {
        arr.push([])
        for (let j=0; j < columns; j++) {
            arr[i].push(null)
        }
    }
    return arr
}

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

    getGraph(): [Graph<T>, PartialGrid<GraphNode<T>>] {
        let graph = createEmptyGraph<T>()
        let nodeGrid = new PartialGrid<GraphNode<T>>(this.rows, this.columns)
        for (let i=0; i < this.cells.length; i++) {
            for (let j=0; j < this.cells[i].length; j++) {
                let cell = this.cells[i][j]
                if (cell) {
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
                }
            }
        }
        return [graph, nodeGrid]
    }

    // changes a value in the grid and returns the new graph and the node at the point of change
    putAndDiff(x: number, y: number, value: T): [Graph<T>, GraphNode<T>] {
        this.put(x, y, value)
        let [graph, nodeGrid] = this.getGraph()
        return [graph, nodeGrid.get(x, y)!]
    }
}

type DynamicLOCAL<T> = (graph: Graph<T>, pointOfChange: GraphNode<T>) => T