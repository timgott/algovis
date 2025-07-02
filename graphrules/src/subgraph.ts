import { Graph, GraphNode } from "../../localgraphs/src/graph";
import { assert } from "../../shared/utils";

type Embedding<T> = Map<GraphNode<unknown>, GraphNode<T>>

function checkNeighborsMatch<S,T>(p: GraphNode<S>, h: GraphNode<T>, mapping: Embedding<T>) {
    for (let np of p.neighbors) {
        let nh = mapping.get(np)
        if (nh && !h.neighbors.has(nh)) {
            return false
        }
    }
    return true
}

// ensures that two keys don't point to the same value
class InjectiveEmbeddingBuilder<S,T> {
    mapping: Map<S,T> = new Map()
    values: Set<T> = new Set()

    hasKey(key: S) {
        return this.mapping.has(key)
    }

    hasValue(value: T) {
        return this.values.has(value)
    }

    set(key: S, value: T) {
        let oldValue = this.mapping.get(key)
        if (oldValue) {
            this.values.delete(oldValue)
        }
        assert(!this.values.has(value), "injectivity violated: value used twice")
        this.values.add(value)
        this.mapping.set(key, value)
    }

    delete(key: S) {
        let value = this.mapping.get(key)
        if (value) {
            this.values.delete(value)
        }
        this.mapping.delete(key)
    }

    toMap(): Map<S,T> {
        return new Map(this.mapping)
    }
}

// TODO: should be optimized for the case that pattern is a connected graph, only generate extensions that are neighbors of existing matches
// allows edges in host that do not exist in pattern
export function findSubgraphMatches<S, T>(host: Graph<T>, pattern: Graph<S>, dataMatcher: (a: S, b: T) => boolean): Embedding<T>[] {
    if (pattern.nodes.length === 0) {
        return []
    }

    let checkDataMatch = (a: GraphNode<S>, b: GraphNode<T>) => dataMatcher(a.data, b.data);
    // recursion with backtracking
    // take a partial match and find all possible extensions
    // put them into a queue
    // when match is full, return

    // keeps remaining possibilities at every level
    let stack = [Array.from(host.nodes)]

    let matches: Embedding<T>[] = []
    let partialMatch = new InjectiveEmbeddingBuilder<GraphNode<S>, GraphNode<T>>()
    while (stack.length > 0) {
        let i = stack.length - 1
        let next = stack[i].pop()
        let patternNode = pattern.nodes[i]
        if (!next) {
            partialMatch.delete(patternNode)
            stack.pop()
            continue
        }
        if (checkDataMatch(patternNode, next)
            && checkNeighborsMatch(patternNode, next, partialMatch.toMap())
            && !partialMatch.hasValue(next)) {
            partialMatch.set(patternNode, next)
            if (stack.length < pattern.nodes.length) {
                stack.push(Array.from(host.nodes))
            } else {
                matches.push(partialMatch.toMap())
            }
        }
    }

    return matches
}
