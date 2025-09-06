import { assert } from "../../shared/utils"

// ensures that two keys don't point to the same value
export class InjectiveMap<S,T> {
    mapping: Map<S,T> = new Map()
    values: Map<T,S> = new Map()

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
        this.values.set(value, key)
        this.mapping.set(key, value)
    }

    get(key: S): T | undefined {
        return this.mapping.get(key)
    }

    getKey(value: T) : S | undefined {
        return this.values.get(value)
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

    static fromMap<S,T>(map: Map<S,T>): InjectiveMap<S,T> {
        // errors if not injective
        let result = new InjectiveMap<S,T>()
        for (let [k,v] of map) {
            result.set(k, v)
        }
        return result
    }
}

export type GenericMatcher<S,T,C> = {
    // Return true if value matches pattern. partialMatch includes the pattern->value mapping that is being tested.
    check(pattern: S, value: T, partialMatch: InjectiveMap<S, T>, context: C): boolean,
    // New context with pattern assigned to value
    updated(pattern: S, value: T, context: C): C,
    empty(): C,
}

export type GenericMatchWithContext<S,T,C> = {
    embedding: Map<S,T>,
    context: C,
}

// finds all possible injective maps (pattern -> value) which are accepted by the matcher
export function findInjectiveMatchesGeneric<S, T, C>(targets: T[], vars: S[], matcher: GenericMatcher<S,T,C>): GenericMatchWithContext<S,T,C>[] {
    if (vars.length === 0) {
        return []
    }

    // keeps remaining possibilities at every level
    let stack = [
        {
            options: Array.from(targets),
            context: matcher.empty(),
        }
    ]

    // search with backtracking
    let matches: GenericMatchWithContext<S,T,C>[] = []
    let partialMatch = new InjectiveMap<S, T>()
    while (stack.length > 0) {
        let i = stack.length - 1
        let next = stack[i].options.pop()
        let patternNode = vars[i]
        if (!next) {
            partialMatch.delete(patternNode)
            stack.pop()
            continue
        }
        let context = stack[i].context

        // each host node must be used at most one once (map (pattern -> host) is injective),
        // otherwise e.g. a single node with self loop would match every pattern, or a k-clique would match every k-colorable pattern
        if (!partialMatch.hasValue(next)) { 
            if (matcher.check(patternNode, next, partialMatch, context)) { // labels must match under current context (without new node)
                // Slow! .set is after calling matcher so it might not catch self loops correctly!
                partialMatch.set(patternNode, next)
                let newContext = matcher.updated(patternNode, next, context)
                if (stack.length < vars.length) {
                    stack.push({
                        options: Array.from(targets),
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

    return matches
}

export function verifyInjectiveMatchGeneric<S, T, C>(match: GenericMatchWithContext<S,T,C>, matcher: GenericMatcher<S,T,C>): boolean {
    let injectiveMap = InjectiveMap.fromMap(match.embedding)
    for (let [pattern, host] of match.embedding) {
        if (!matcher.check(pattern, host, injectiveMap, match.context)) {
            return false
        }
    }
    return true
}