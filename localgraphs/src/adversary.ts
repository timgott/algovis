import { assert, assertExists, range, unreachable } from "../../shared/utils"
import { NodeColor } from "./coloring"
import { Graph, GraphEdge, GraphNode, createEdge } from "./graph"

type NodeId = number
type EdgeCommand = readonly [NodeId, NodeId]
type EdgeList = readonly EdgeCommand[]

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

interface Condition<T> {
    evaluate(labeledNodes: readonly T[]): boolean
    mapNodeIds(f: (id: NodeId) => NodeId): Condition<T>
}

class ConstantCondition<T> implements Condition<T> {
    constructor(private readonly value: boolean) {}
    evaluate(labeledNodes: readonly T[]): boolean {
        return this.value
    }
    mapNodeIds(f: (id: number) => number): Condition<T> {
        return this
    }
}

export const TrueCondition = new ConstantCondition(true)
export const FalseCondition = new ConstantCondition(false)

export class ConditionColorEqual implements Condition<NodeWithColor> {
    constructor(private idA: NodeId, private idB: NodeId) {}
    evaluate(labeledNodes: readonly NodeWithColor[]): boolean {
        return labeledNodes[this.idA].color === labeledNodes[this.idB].color
    }
    mapNodeIds(f: (id: number) => number): Condition<NodeWithColor> {
        return new ConditionColorEqual(f(this.idA), f(this.idB))
    }
}

export class ConditionMatchColor implements Condition<NodeWithColor> {
    constructor(private id: NodeId, private color: NodeColor) {}
    evaluate(labeledNodes: readonly NodeWithColor[]): boolean {
        return labeledNodes[this.id].color === this.color
    }
    mapNodeIds(f: (id: number) => number): Condition<NodeWithColor> {
        return new ConditionMatchColor(f(this.id), this.color)
    }
}

/**
 * Basic block of an adversary program.
 * Build commands are executed first, then a boolean function decides which branch is executed next.
 */
export type CommandTree<T> = {
    action: "build"
    edges: EdgeList // make this is a function to save memory?
} | {
    action: "decide"
    condition: Condition<T>
    trueBranch: CommandTree<T>
    falseBranch: CommandTree<T>
} | CommandTree<T>[] // sequence

export class CommandTreeAdversary<T> implements Adversary<T> {
    nextTree: CommandTree<T> | undefined
    currentCommands: EdgeList = []
    returnStack: CommandTree<T>[] = []

    constructor(tree: CommandTree<T> | undefined) {
        this.nextTree = tree
    }

    step(graph: Graph<T>): EdgeCommand | "exit" {
        const labeledNodes = graph.nodes.map(n => n.data)
        while (this.currentCommands.length === 0) {
            // pop next block and process
            let block = this.nextTree
            this.nextTree = undefined

            if (block === undefined) {
                // leaf
                let continuation = this.returnStack.pop()
                if (continuation) {
                    this.nextTree = continuation
                } else {
                    return "exit"
                }
            } else if (Array.isArray(block)) {
                // put on stack in reverse order, results in sequential execution
                this.returnStack.push(...block.toReversed())
            } else if (block.action === "build") {
                // simple build command
                this.currentCommands = block.edges
            } else if (block.action === "decide") {
                // boolean branch
                const decision = block.condition.evaluate(labeledNodes)
                this.nextTree = decision ? block.trueBranch : block.falseBranch
            } else {
                unreachable(block)
            }
        }

        // take the first command
        let cmd = this.currentCommands[0]
        assertExists(cmd)
        this.currentCommands = this.currentCommands.slice(1)
        return cmd
    }

    clone(): CommandTreeAdversary<T> {
        let result = new CommandTreeAdversary<T>(this.nextTree)
        result.currentCommands = this.currentCommands // readonly
        result.returnStack = [...this.returnStack] // mutable
        return result
    }
}

function pathEdges(nodes: number[]): EdgeCommand[] {
    let edges: EdgeCommand[] = []
    for (let i = 0; i < nodes.length - 1; i++) {
        edges.push([nodes[i], nodes[i+1]])
    }
    return edges
}

type NodeWithColor = { color: NodeColor }

export const pathAdv2: CommandTree<NodeWithColor> = [
    {
        action: "build",
        edges: [...pathEdges([0,1,2,3]), ...pathEdges([4,5,6,7])],
    },
    {
        action: "decide",
        condition: new ConditionColorEqual(0, 7),
        trueBranch: {
            action: "build",
            edges: [[3,4]],
        },
        falseBranch: {
            action: "build",
            edges: [[3,8],[8,4]],
        }
    }
]

function makePathAdversary(radius: number): CommandTree<NodeWithColor> {
    let nodeLength = radius + 2 // edge count + 1
    const middleLeft = nodeLength - 1
    const middleRight = nodeLength
    const extra = nodeLength*2
    const leftEnd = 0
    const rightEnd = nodeLength*2 - 1
    return [
        {
            action: "build",
            edges: [
                ...pathEdges([...range(0, nodeLength)]),
                ...pathEdges([...range(nodeLength, nodeLength * 2)]),
            ],
        },
        {
            action: "decide",
            condition: new ConditionColorEqual(leftEnd, rightEnd),
            trueBranch: {
                action: "build",
                edges: [[middleLeft,middleRight]],
            },
            falseBranch: {
                action: "build",
                edges: [[middleLeft,extra],[extra,middleRight]],
            }
        }
    ]
}

export function collectUsedIds<T>(block: CommandTree<T>): Set<NodeId> {
    if (Array.isArray(block)) {
        const nodeSets: number[] = block.flatMap(t => [...collectUsedIds(t)])
        return new Set(nodeSets)
    } else if (block.action === "build") {
        return new Set(block.edges.flat())
    } else if (block.action === "decide") {
        return new Set([
            ...collectUsedIds(block.trueBranch),
            ...collectUsedIds(block.falseBranch),
        ])
    } else {
        unreachable(block)
    }
}

function getRange(xs: number[]): [min: number, max: number] {
    return [Math.min(...xs), Math.max(...xs)]
}

function makeFindTree<T>(
    nodes: readonly NodeId[],
    condition: (id: NodeId) => Condition<T>,
    consequence: (id: NodeId) => CommandTree<T>,
): CommandTree<T> {
    if (nodes.length === 0) {
        return []
    }
    const id = nodes[0]
    const tail = nodes.slice(1)
    return {
        action: "decide",
        condition: condition(id),
        trueBranch: consequence(id),
        falseBranch: makeFindTree(tail, condition, consequence),
    }
}

type TranslationTable = number[] // maps old node ids to new node ids

function arrayFromPairs(pairs: [number, number][]): number[] {
    let result: number[] = []
    for (let [i, j] of pairs) {
        result[i] = j
    }
    return result
}

function arrayIndexZip<T, U>(indexes: number[], values: readonly T[]): T[] {
    let result: T[] = []
    for (let i = 0; i < indexes.length; i++) {
        result[indexes[i]] = values[i]
    }
    return result
}

function visitBuildCommands<T>(tree: CommandTree<T>, f: (edges: EdgeList) => void): void {
    if (Array.isArray(tree)) {
        tree.forEach(t => visitBuildCommands(t, f))
    } else if (tree.action === "build") {
        f(tree.edges)
    } else if (tree.action === "decide") {
        visitBuildCommands(tree.trueBranch, f)
        visitBuildCommands(tree.falseBranch, f)
    } else {
        unreachable(tree)
    }
}

function mapEdges<T>(tree: CommandTree<T>, f: (edge: EdgeCommand) => EdgeCommand): CommandTree<T> {
    if (Array.isArray(tree)) {
        return tree.map(t => mapEdges(t, f))
    } else if (tree.action === "build") {
        return {
            action: "build",
            edges: tree.edges.map(f)
        }
    } else if (tree.action === "decide") {
        return {
            action: "decide",
            condition: tree.condition,
            trueBranch: mapEdges(tree.trueBranch, f),
            falseBranch: mapEdges(tree.falseBranch, f),
        }
    } else {
        unreachable(tree)
    }
}

function mapNodeIds<T>(tree: CommandTree<T>, f: (node: NodeId) => NodeId): CommandTree<T> {
    return mapEdges(tree, ([i, j]) => [f(i), f(j)])
}

function translateEdges<T>(tree: CommandTree<T>, translation: TranslationTable): CommandTree<T> {
    return mapNodeIds(tree, i => translation[i])
}


function disjointCombine(edgesA: EdgeList, edgesB: EdgeList): [union: EdgeList, offsetB: number] {
    let maxA = Math.max(...edgesA.flat())
    let minB = Math.min(...edgesB.flat())
    const offset = (maxA + 1) - minB
    if (offset <= 0) {
        return [[...edgesA, ...edgesB], 0]
    } else {
        const newB: EdgeList = edgesB.map(([i,j]) => [i + offset, j + offset])
        return [[...edgesA, ...newB], offset]
    }
}

function disjointCombineTree<T>(treeA: CommandTree<T>, treeB: CommandTree<T>): [union: CommandTree<T>, offsetB: number] {
    const nodesA = collectUsedIds(treeA)
    const nodesB = collectUsedIds(treeB)
    const maxA = Math.max(...nodesA)
    const minB = Math.min(...nodesB)
    const offset = (maxA + 1) - minB
    if (offset <= 0) {
        return [[treeA, treeB], 0]
    } else {
        const newB = mapNodeIds(treeB, i => i + offset)
        return [[treeA, newB], offset]
    }
}

function duplicate(nodeTemplate: EdgeList, count: number): [EdgeList, copies: TranslationTable[]] {
    let result: EdgeList = []
    let translations: TranslationTable[] = []
    let nodes = [...new Set(nodeTemplate.flat())]
    for (let i = 0; i < count; i++) {
        const [newEdges, offset] = disjointCombine(result, nodeTemplate)
        result = newEdges
        const translation: TranslationTable = arrayIndexZip(nodes, nodes.map(n => n + offset))
        translations.push(translation)
    }
    return [result, translations]
}

export function duplicateTree<T>(tree: CommandTree<T>, count: number): [CommandTree<T>, copies: TranslationTable[]] {
    let resultTree: CommandTree<T> = []
    let translations: TranslationTable[] = []
    let nodes = [...collectUsedIds(tree)]
    let minId = Math.min(...nodes)
    let maxId = Math.max(...nodes)
    let idBound = maxId + 1 // assume template is already built
    for (let i = 0; i < count; i++) {
        // shift to ensure disjoint ids
        let offset: number
        offset = idBound - minId
        idBound += maxId - minId + 1
        let newTree = mapNodeIds(tree, id => id + offset)

        const translation: TranslationTable = arrayIndexZip(nodes, nodes.map(n => n + offset))
        resultTree.push(newTree)
        translations.push(translation)
    }
    return [resultTree, translations]
}

export function macroApply<T>(macro: CommandTree<T>, template: CommandTree<T>, hookNode: NodeId): [CommandTree<T>, copies: TranslationTable[]] {
    const macroNodes = [...collectUsedIds(macro)].sort()
    const [buildCommand, nodeCopies] = duplicateTree(template, macroNodes.length)
    const macroToHooks: number[] = arrayIndexZip(macroNodes, nodeCopies.map(t => t[hookNode]))
    const macroTranslated = translateEdges(macro, macroToHooks)
    const tree: CommandTree<T> = [
        buildCommand,
        macroTranslated
    ]
    return [tree, nodeCopies]
}

function validateUniqueEdges<T>(previousEdges: Set<string>, tree: CommandTree<T>): Set<string> {
    const seenEdges = new Set<string>([...previousEdges])
    if (Array.isArray(tree)) {
        return tree.reduce(validateUniqueEdges, seenEdges)
    } else if (tree.action === "build") {
        for (let edge of tree.edges) {
            const key = edge.join(",")
            assert(!seenEdges.has(key), `duplicate edge: ${key}`)
            seenEdges.add(key)
        }
        return seenEdges
    } else if (tree.action === "decide") {
        const trueEdges = validateUniqueEdges(seenEdges, tree.trueBranch)
        const falseEdges = validateUniqueEdges(seenEdges, tree.falseBranch)
        return new Set([...trueEdges, ...falseEdges]) // may have duplicates between branches of course
    } else {
        unreachable(tree)
    }
}

export function validateTree<T>(tree: CommandTree<T>): CommandTree<T> {
    validateUniqueEdges(new Set(), tree)
    return tree
}

export function make3Tree(radius: 1 | 2) {
    const baseElement: CommandTree<NodeWithColor> = {
        action: "build",
        edges: [[0,1], [0,2], [0,3]]
    }
    const pathAdv = makePathAdversary(radius)
    const [make1, copies1] = macroApply(pathAdv, baseElement, 1)
    const hooks1 = copies1.map(t => t[1])
    return validateTree([
        validateTree(make1),
        makeFindTree<NodeWithColor>(hooks1, id => new ConditionMatchColor(id, 0), 
                found1 => {
                const translated2 = found1 + 1
                const [make2, copies2] = macroApply(pathAdv, make1, translated2)
                const hooks2 = copies2.map(t => t[translated2])
                return validateTree([
                    validateTree(make2),
                    makeFindTree(hooks2, id => new ConditionMatchColor(id, 1),
                        found2 => {
                            const translated3 = found2 + 1
                            const [make3, copies3] = macroApply(pathAdv, make2, translated3)
                            return validateTree(make3)
                        }
                    )
                ])
            }
        )
    ])
}

