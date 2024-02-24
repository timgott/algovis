import { assert, assertExists } from "../../shared/utils"
import { NodeColor } from "./coloring"
import { Graph, GraphEdge, GraphNode, createEdge } from "./graph"

type EdgeCommand = [number, number]
type BuildCommands = EdgeCommand[]

export interface Adversary<T> {
    step(graph: Graph<T>): EdgeCommand | "exit" /* returns null for termination */
    clone(): Adversary<T>
}

export function executeEdgeCommand<T>([i, j]: EdgeCommand, graph: Graph<T>, newNode: (graph: Graph<T>) => GraphNode<T>): GraphEdge<T> {
    while (graph.nodes.length <= Math.max(i, j)) {
        newNode(graph)
    }
    let a = graph.nodes[i]
    let b = graph.nodes[j]
    return createEdge(graph, a, b)
}

export function runAdversary<T>(adversary: Adversary<T>, graph: Graph<T>, newNode: (graph: Graph<T>) => GraphNode<T>) {
    let cmd = adversary.step(graph)
    while (cmd !== "exit") {
        executeEdgeCommand(cmd, graph, newNode)
        cmd = adversary.step(graph)
    }
}

/**
 * Basic block of an adversary program.
 * Build commands are executed first, then a boolean function decides which branch is executed next.
 */
export type CommandTree<T> = {
    commands(preGraph: Graph<T>): BuildCommands
} & (
    {
        exit: true
    } | {
        exit: false,
        decide(labeledGraph: Graph<T>): boolean
        trueBranch: CommandTree<T>
        falseBranch: CommandTree<T>
    }
)

export class CommandTreeAdversary<T> implements Adversary<T> {
    currentTree: CommandTree<T>
    currentCommands: BuildCommands | null = null

    constructor(tree: CommandTree<T>) {
        this.currentTree = tree
    }

    step(graph: Graph<T>): EdgeCommand | "exit" {
        if (this.currentCommands === null) {
            // initialization
            this.currentCommands = this.currentTree.commands(graph)
        }
        while (this.currentCommands.length === 0) {
            if (this.currentTree.exit) {
                // termination
                return "exit"
            } else {
                // end of basic block, do branch
                let oldTree = this.currentTree
                const decision = oldTree.decide(graph)
                this.currentTree = decision ? oldTree.trueBranch : oldTree.falseBranch
                this.currentCommands = this.currentTree.commands(graph)
            }
        }

        // take the first command
        let cmd = this.currentCommands[0]
        assertExists(cmd)
        this.currentCommands = this.currentCommands.slice(1)
        return cmd
    }

    clone(): CommandTreeAdversary<T> {
        let result = new CommandTreeAdversary<T>(this.currentTree)
        result.currentCommands = this.currentCommands
        return result
    }
}

function pathEdges(nodes: number[]) {
    let edges: EdgeCommand[] = []
    for (let i = 0; i < nodes.length - 1; i++) {
        edges.push([nodes[i], nodes[i+1]])
    }
    return edges
}

type NodeWithColor = { color: NodeColor }

export function makePathAdversary(radius: 2) {
    const pathAdv2: CommandTree<NodeWithColor> = {
        commands: (graph) => [...pathEdges([0,1,2,3]), ...pathEdges([4,5,6,7])],
        exit: false,
        decide: (graph) => graph.nodes[0].data.color === graph.nodes[7].data.color,
        trueBranch: {
            commands: (graph) => [[3,4]],
            exit: true
        },
        falseBranch: {
            commands: (graph) => [[3,8],[8,4]],
            exit: true
        }
    }
    return new CommandTreeAdversary(pathAdv2)
}
