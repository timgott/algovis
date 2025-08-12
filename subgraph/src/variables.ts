import { ContextDataMatcher } from "./subgraph"

export function mapMatcher<S,T,C>(f: (x: S) => T, matcher: ContextDataMatcher<T, T, C>) : ContextDataMatcher<S,S,C> {
    return {
        check: (pattern: S, host: S, context: C) => matcher.check(f(pattern), f(host), context),
        updated: (pattern: S, host: S, context: C) => matcher.updated(f(pattern), f(host), context),
        empty: matcher.empty
    }
}

export function makeVariableMatcher<T>(variables: Set<T>): ContextDataMatcher<T, T, Map<T, T>> {
    return {
        check(patternLabel: T, hostLabel: T, context: Map<T, T>): boolean {
            let pl: T
            if (variables.has(patternLabel)) {
                pl = context.get(patternLabel) ?? hostLabel
            } else {
                pl = patternLabel
            }
            return pl === hostLabel
        },
        updated(patternLabel: T, hostLabel: T, context: Map<T, T>): Map<T, T> {
            if (patternLabel === hostLabel || context.has(patternLabel)) {
                return context
            } else {
                return new Map(context).set(patternLabel, hostLabel)
            }
        },
        empty(): Map<T, T> {
            return new Map();
        }
    }
}

export function makeWildcardVariableMatcher<T>(variables: Set<T>, wildcard: string | null): ContextDataMatcher<T, T, Map<T, T>> {
    return {
        check(patternLabel: T, hostLabel: T, context: Map<T, T>): boolean {
            if (patternLabel == wildcard) {
                return true
            }
            let pl: T
            if (variables.has(patternLabel)) {
                pl = context.get(patternLabel) ?? hostLabel
            } else {
                pl = patternLabel
            }
            return pl === hostLabel
        },
        updated(patternLabel: T, hostLabel: T, context: Map<T, T>): Map<T, T> {
            if (patternLabel === hostLabel || patternLabel == wildcard || context.has(patternLabel)) {
                return context
            } else {
                return new Map(context).set(patternLabel, hostLabel)
            }
        },
        empty(): Map<T, T> {
            return new Map();
        }
    }
}

export function makeWildcardVariableMatcherWithNegDomain<T>(variables: Set<T>, wildcard: string | null, excludedDomain: Set<T>): ContextDataMatcher<T, T, Map<T, T>> {
    return {
        check(patternLabel: T, hostLabel: T, context: Map<T, T>): boolean {
            if (patternLabel == wildcard) {
                return true
            }
            let pl: T
            if (variables.has(patternLabel)) {
                if (excludedDomain.has(hostLabel)) {
                    return false
                }
                pl = context.get(patternLabel) ?? hostLabel
            } else {
                pl = patternLabel
            }
            return pl === hostLabel
        },
        updated(patternLabel: T, hostLabel: T, context: Map<T, T>): Map<T, T> {
            if (patternLabel === hostLabel || patternLabel == wildcard || context.has(patternLabel)) {
                return context
            } else {
                return new Map(context).set(patternLabel, hostLabel)
            }
        },
        empty(): Map<T, T> {
            return new Map();
        }
    }
}
