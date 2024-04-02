import { assert, hasStaticType, max, min, randomChoice } from "../shared/utils";

type UnseenMCTSNode<T, A> = {
    action: A
    parent: SeenMCTSNode<T,A>
    visits: null
}

export type SeenMCTSNode<T,A> = {
    state: T;
    parent: SeenMCTSNode<T,A> | null;
    children: MCTSNode<T,A>[];
    visits: number; // >0
    score: number;
}

type MCTSNode<T,A> = SeenMCTSNode<T,A> | UnseenMCTSNode<T, A>

type TreePolicy<T,A> = (node: SeenMCTSNode<T,A>) => MCTSNode<T,A>
type PropagationStrategy<T> = (node: SeenMCTSNode<T,unknown>, value: number) => void

// UCT = v_child + c * sqrt(log(n_parent) / n_child)
// c: exploration/exploitation tradeoff factor
export function treePolicyUct<T,A>(c: number): TreePolicy<T,A> {
    return (node: SeenMCTSNode<T,A>): MCTSNode<T,A> => {
        let bestChild = node.children[0]
        let bestValue = -Infinity
        for (let child of node.children) {
            if (child.visits === null) {
                return child // always expand unvisited nodes
            } else {
                let averageReward = child.score
                let value = averageReward + c * Math.sqrt(Math.log(node.visits) / child.visits)
                if (value > bestValue) {
                    bestValue = value
                    bestChild = child
                }
            }
        }
        return bestChild
    }
}

export function findBestChild<T,A>(node: SeenMCTSNode<T,A>): MCTSNode<T,A> {
    return max(node.children, (child) => {
        return (child.visits !== null)? child.score : -Infinity;
    }) ?? randomChoice(node.children) // none has been visited
}

export function treePolicyEpsilonGreedy<T,A>(epsilon: number, fallback: TreePolicy<T,A> = findBestChild): TreePolicy<T,A> {
    if (epsilon == 0) {
        return fallback
    }
    return (node: SeenMCTSNode<T,A>): MCTSNode<T,A> => {
        if (Math.random() < epsilon) {
            return randomChoice(node.children)
        } else {
            return fallback(node)
        }
    }
}

export type MCTS<T,A> = {
    treePolicy: TreePolicy<T,A>
    rollout: (state: T, depth: number) => number
    expand: (state: T, action: A) => T
    actions: (state: T) => A[],
    propagation: PropagationStrategy<T>
}

function newCandidateNode<T,A>(action: A, parent: SeenMCTSNode<T,A>): UnseenMCTSNode<T,A> {
    return {
        action,
        parent,
        visits: null
    }
}

function expandNode<T,A>(node: UnseenMCTSNode<T,A>, depth: number, mcts: MCTS<T,A>): SeenMCTSNode<T,A> {
    let state = mcts.expand(node.parent.state, node.action)
    let actions = mcts.actions(state)
    let newNode: SeenMCTSNode<T,A> = node as unknown as SeenMCTSNode<T,A>
    newNode = Object.assign(node, {
        state: state,
        children: actions.map(a => newCandidateNode(a, newNode)),
        score: 0,
        visits: 0,
    })
    return newNode
}

export function propagateAverageValue<T>(node: SeenMCTSNode<T,unknown> | null, value: number): void {
    while (node !== null) {
        node.score = (node.score * node.visits + value) / (node.visits + 1)
        node.visits += 1
        node = node.parent
    }
}

export function propagateDecay<T>(node: SeenMCTSNode<T,unknown> | null, value: number): void {
    const f = 0.5
    while (node !== null) {
        node.score = node.score * (1 - f) + value * f
        node.visits += 1
        node = node.parent
    }
}

export function propagateMaxValue<T>(node: SeenMCTSNode<T,unknown> | null, value: number): void {
    while (node !== null) {
        node.score = Math.max(node.score, value)
        node.visits += 1
        node = node.parent
    }
}

function mctsStep<T,A>(root: MCTSNode<T,A>, mcts: MCTS<T,A>): MCTSNode<T,A> {
    let node = root
    let depth = 0
    while (node.visits !== null) {
        node = mcts.treePolicy(node)
        depth++
    }

    let newNode = expandNode(node, depth, mcts)
    let value = mcts.rollout(newNode.state, depth)
    mcts.propagation(newNode, value)

    return node
}

export function createMctsRoot<T,A>(state: T, mcts: MCTS<T,A>): SeenMCTSNode<T,A> {
    let actions = mcts.actions(state)
    let root: SeenMCTSNode<T,A> = {} as SeenMCTSNode<T,A>
    root = Object.assign(root, {
        state: state,
        parent: null,
        children: actions.map(a => newCandidateNode(a, root)),
        visits: 1,
        score: 0
    })
    return root
}

export function runMcts<T,A>(
    root: SeenMCTSNode<T,A>, mcts: MCTS<T,A>, iterations: number
): SeenMCTSNode<T,A> {
    assert(iterations > 1, "must perform some iterations")

    for (let i = 0; i < iterations; i++) {
        mctsStep(root, mcts)
    }

    return findBestChild(root) as SeenMCTSNode<T,A> // at least one must be seen because of iterations > 0
}

export function runMctsTimeout<T,A>(
    root: SeenMCTSNode<T,A>, mcts: MCTS<T,A>, minIterations: number, maxIterations: number, time: number
): SeenMCTSNode<T,A> {
    const start = performance.now()

    for (let i = 0; i < maxIterations; i++) {
        mctsStep(root, mcts)
        if (i >= minIterations && performance.now() - start > time) {
            console.log(i, "iterations")
            break
        }
    }

    return findBestChild(root) as SeenMCTSNode<T,A> // at least one must be seen because of iterations > 0
}