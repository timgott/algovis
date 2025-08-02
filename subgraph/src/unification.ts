import { ContextMatcher } from "./subgraph"

export function mapMatcher<S,T,C>(f: (x: S) => T, matcher: ContextMatcher<T, T, C>) : ContextMatcher<S,S,C> {
    return {
        check: (pattern: S, host: S, context: C) => matcher.check(f(pattern), f(host), context),
        updated: (pattern: S, host: S, context: C) => matcher.updated(f(pattern), f(host), context),
        empty: matcher.empty
    }
}

export function makeVariableMatcher<T>(variables: Set<T>): ContextMatcher<T, T, Map<T, T>> {
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
