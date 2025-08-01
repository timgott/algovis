import { Graph, GraphNode } from "../../localgraphs/src/graph";
import { assert } from "../../shared/utils";

type Embedding<T> = Map<GraphNode<unknown>, GraphNode<T>>

// ensures that two keys don't point to the same value
class InjectiveMap<S,T> {
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

// checks if all neighbors of pattern node p that are matched already map to neighbors of host node h
function checkNeighborsMatch<S,T>(p: GraphNode<S>, h: GraphNode<T>, mapping: Embedding<T>) {
    for (let np of p.neighbors) {
        let nh = mapping.get(np)
        if (nh && !h.neighbors.has(nh)) {
            return false
        }
    }
    return true
}

export type DataMatcher<S,T> = (a: S, b: T) => boolean

export function findSubgraphMatches<S, T>(host: Graph<T>, pattern: Graph<S>, dataMatcher: DataMatcher<S,T>): Embedding<T>[] {
    let matches = findSubgraphMatchesWithContext(host, pattern, {
        check: (a, b) => dataMatcher(a, b),
        updated: (a, b, context) => context,
        empty: () => null,
    })
    return matches.map(m => m.embedding)
}

// context may not be mutated by the matcher
export type ContextMatcher<S,T,C> = {
    check(pattern: S, host: T, context: C): boolean,
    updated(pattern: S, host: T, context: C): C,
    empty(): C,
}

export type MatchWithContext<T,C> = {
    embedding: Embedding<T>,
    context: C,
}

// Like findSubgraphMatches, but allows the matcher to track a context, meant for allowing unification of pattern variables
// TODO: Could be optimized for the case that pattern is a connected graph. Treat components separately and only generate extensions that are neighbors of existing matches
// allows edges in host to exist that do not exist in pattern
export function findSubgraphMatchesWithContext<S, T, C>(host: Graph<T>, pattern: Graph<S>, matcher: ContextMatcher<S,T,C>): MatchWithContext<T,C>[] {
    if (pattern.nodes.length === 0) {
        return []
    }

    let checkDataMatch = (a: GraphNode<S>, b: GraphNode<T>, ctx: C) => matcher.check(a.data, b.data, ctx);

    // keeps remaining possibilities at every level
    let stack = [
        {
            options: Array.from(host.nodes),
            context: matcher.empty(),
        }
    ]

    // search with backtracking
    let matches: MatchWithContext<T,C>[] = []
    let partialMatch = new InjectiveMap<GraphNode<S>, GraphNode<T>>()
    while (stack.length > 0) {
        let i = stack.length - 1
        let next = stack[i].options.pop()
        let patternNode = pattern.nodes[i]
        if (!next) {
            partialMatch.delete(patternNode)
            stack.pop()
            continue
        }
        let context = stack[i].context

        // each host node must be used at most one once (map (pattern -> host) is injective),
        // otherwise e.g. a single node with self loop would match every pattern, or a k-clique would match every k-colorable pattern
        if (!partialMatch.hasValue(next)) { 
            if (checkDataMatch(patternNode, next, context)) { // labels must match under current context (without new node)
                // set current match before checking to match self loops correctly. If no match, this will later be overridden or cleared by backtracking
                partialMatch.set(patternNode, next)
                if (checkNeighborsMatch(patternNode, next, partialMatch.toMap())) {
                    let newContext = matcher.updated(patternNode.data, next.data, context)
                    if (stack.length < pattern.nodes.length) {
                        stack.push({
                            options: Array.from(host.nodes),
                            context: newContext,
                        })
                    } else {
                        matches.push({
                            embedding: partialMatch.toMap(),
                            context: newContext,
                        })
                    }
                }
            }
        }
    }

    return matches
}
