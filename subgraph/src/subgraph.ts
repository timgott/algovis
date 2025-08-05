import { Graph, GraphNode } from "../../localgraphs/src/graph";
import { DefaultMap } from "../../shared/defaultmap";
import { assert } from "../../shared/utils";
import { findInjectiveMatchesGeneric, GenericMatcher, InjectiveMap } from "./matching";

type Embedding<T> = Map<GraphNode<unknown>, GraphNode<T>>

// checks whether all neighbors of pattern node p that are matched already map to neighbors of host node h
function checkNeighborsMatch<S,T>(p: GraphNode<S>, h: GraphNode<T>, mapping: InjectiveMap<GraphNode<unknown>, GraphNode<T>>) {
    for (let vp of p.neighbors) {
        let vh = mapping.get(vp)
        if (vh && !h.neighbors.has(vh)) {
            return false
        }
    }
    return true
}

// checks whether none of the negative neighbors of pattern node p map to neighbors of host node h
function checkNegativeNeighborsMatch<S,T>(p: GraphNode<S>, negativeNeighbors: Set<GraphNode<S>> | undefined, h: GraphNode<T>, mapping: InjectiveMap<GraphNode<unknown>, GraphNode<T>>) {
    if (negativeNeighbors) {
        for (let vp of negativeNeighbors) {
            let vh = mapping.get(vp)
            if (vh && h.neighbors.has(vh)) {
                return false
            }
        }
    }
    return true
}


export type DataMatcher<S,T> = (a: S, b: T) => boolean

// context may not be mutated by the matcher
export type ContextDataMatcher<S,T,C> = {
    check(pattern: S, host: T, context: C): boolean,
    updated(pattern: S, host: T, context: C): C,
    empty(): C,
}

export function simpleDataMatcher<S,T>(isMatch: DataMatcher<S,T>): ContextDataMatcher<S,T,null> {
    return {
        check: (pattern, host, context) => isMatch(pattern, host),
        empty: () => null,
        updated: () => null,
    }
}

export type SubgraphMatcher<S,T,C> = GenericMatcher<GraphNode<S>, GraphNode<T>, C>

export type MatchWithContext<T,C> = {
    embedding: Embedding<T>,
    context: C,
}

export type EdgeList<T> = [GraphNode<T>, GraphNode<T>][]

export function makeSubgraphMatcher<S,T,C>(dataMatcher: ContextDataMatcher<S,T,C>): SubgraphMatcher<S, T, C> {
    return {
        check(pattern, host, partialMatch, context) {
            return dataMatcher.check(pattern.data, host.data, context)
                && checkNeighborsMatch(pattern, host, partialMatch)
        },
        empty: dataMatcher.empty,
        updated: (pattern, host, context) => dataMatcher.updated(pattern.data, host.data, context),
    }
}

function neighborMapFromEdges<T>(edges: [T, T][]): Map<T, Set<T>> {
    let map = new DefaultMap<T, Set<T>>(() => new Set())
    for (let [a,b] of edges) {
        map.get(a).add(b)
        map.get(b).add(a)
    }
    return map.toMap()
}

// does not allow the edges from negative edges to occur in host
export function makeSubgraphMatcherWithNegative<S,T,C>(dataMatcher: ContextDataMatcher<S,T,C>, negativeEdges: EdgeList<S>): SubgraphMatcher<S, T, C> {
    let negativeNeighbors = neighborMapFromEdges(negativeEdges)
    return {
        check(pattern, host, partialMatch, context) {
            return dataMatcher.check(pattern.data, host.data, context)
                && checkNeighborsMatch(pattern, host, partialMatch)
                && checkNegativeNeighborsMatch(pattern, negativeNeighbors.get(pattern), host, partialMatch)
        },
        empty: dataMatcher.empty,
        updated: (pattern, host, context) => dataMatcher.updated(pattern.data, host.data, context),
    }
}

// Finds occurrences of the graph pattern in host, under a provided test for node data equality.
// Allows edges in host to exist that do not exist in pattern.
export function findSubgraphMatches<S, T>(host: Graph<T>, pattern: Graph<S>, dataMatcher: DataMatcher<S,T>): Embedding<T>[] {
    let matches = findSubgraphMatchesWithContext(host, pattern, {
        check: (a, b) => dataMatcher(a, b),
        updated: (a, b, context) => context,
        empty: () => null,
    })
    return matches.map(m => m.embedding)
}

// Like findSubgraphMatches, but allows the matcher to track a context, meant for allowing unification of pattern variables
export function findSubgraphMatchesWithContext<S, T, C>(host: Graph<T>, pattern: Graph<S>, matcher: ContextDataMatcher<S,T,C>): MatchWithContext<T,C>[] {
    // TODO: Could be optimized for the case that pattern is a connected graph. Treat components separately and only generate extensions that are neighbors of existing matches
    return findInjectiveMatchesGeneric(host.nodes, pattern.nodes, makeSubgraphMatcher(matcher))
}

// Like findSubgraphMatchesWithContext, but does not match if a negative edges exists in the host
export function findSubgraphMatchesWithNegative<S, T, C>(host: Graph<T>, pattern: Graph<S>, matcher: ContextDataMatcher<S,T,C>, negativeEdges: EdgeList<S>): MatchWithContext<T,C>[] {
    // TODO: Could be optimized for the case that pattern is a connected graph. Treat components separately and only generate extensions that are neighbors of existing matches
    return findInjectiveMatchesGeneric(host.nodes, pattern.nodes, makeSubgraphMatcherWithNegative(matcher, negativeEdges))
}
