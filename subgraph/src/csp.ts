// interface: query for domain given a set of constraints. don't instantiate domain before necessary

import { Queue } from "../../shared/queue"
import { assert, ensured, mapFromFunction, max, min, unionAll } from "../../shared/utils"

// (does that make much difference? maybe in trivial cases?)
interface CspState<V,C,D> {
    get vars(): Iterable<V>
    get unassignedVars(): Iterable<V> // have domain > 1
    get inconsistent(): boolean // return true if domain is empty for some variable
    get complete(): boolean // return true if no unassignedVars
    domain(node: V): Set<D> // returns remaining values for variable
    //smallDomainCount(node: V): 0 | 1 | 2 // 2 or more
    propagateTo(node: V, constraint: C): boolean // update nodes based on constraint, returns whether node changed
    constraints(node: V): Iterable<[C, Iterable<V>]> // all constraints that are incompatible with some value of node's domain together with neighbor nodes
    pickNextToBranch(): V // find next node on which to split
    copy(): CspState<V,C,D>
    assign(node: V, value: D): void
}

function propagateArcs<V,C,D>(seeds: Iterable<V>, csp: CspState<V,C,D>) {
    // put seed into queue
    // while queue has node:
    //     for all neighboring constraints:
    //         propagate constraint to neighbor
    //         if domain got smaller: put neighbor into queue
    let queue = new Queue<V>()
    for (let seed of seeds) {
        queue.push(seed)
    }
    while (!queue.empty()) {
        let node = queue.shift()!
        for (let [constraint, neighbors] of csp.constraints(node)) {
            for (let neighbor of neighbors) {
                if (csp.propagateTo(neighbor, constraint)) {
                    if (csp.inconsistent) {
                        return
                    }
                    queue.push(neighbor)
                }
            }
        }
    }
}

function extractAssignment<V,D>(csp: CspState<V,unknown,D>) {
    assert(csp.complete, "can only extract assignment from complete assignments")
    return mapFromFunction(csp.vars, v => {
        let [value, ...rest] = csp.domain(v)
        assert(rest.length === 0, "incomplete assignment")
        return value
    })
}

export function* solveCsp<V,C,D>(csp: CspState<V,C,D>) : Generator<Map<V,D>> {
    propagateArcs(csp.vars, csp)
    if (csp.inconsistent) {
        return
    }
    if (csp.complete) {
        yield extractAssignment(csp)
        return
    }

    let next = csp.pickNextToBranch()
    let domain = csp.domain(next)
    assert(domain.size > 1, "branching needs at least two values in domain, or is it already complete?")
    for (let value of domain) {
        let copy = csp.copy()
        copy.assign(next, value)
        yield* solveCsp(copy)
    }
}


export class CspController<V,C,D> implements CspState<V, C, D> {
    unassignedVars: Set<V>
    inconsistent: boolean

    constructor(
        private propagator: CspPropagator<V,C,D>,
        private ordering: VariableOrdering<V,D>,
        private domains: Map<V,Set<D>>,
    ) {
        // allowed to spend linear time in the pattern nodes here
        this.unassignedVars = new Set()
        this.inconsistent = false
        for (let [x,domain] of domains.entries()) {
            if (domain.size === 0) {
                this.inconsistent = true
            }
            else if (domain.size > 1) {
                this.unassignedVars.add(x)
            }
        }
    }

    get vars(): Iterable<V> {
        return this.domains.keys()
    }
    get complete(): boolean {
        return this.unassignedVars.size === 0
    }

    domain(node: V): Set<D> {
        return ensured(this.domains.get(node))
    }

    propagateTo(node: V, constraint: C): boolean {
        let oldSize = this.domains.get(node)!.size
        let newDomain = this.propagator.propagateTo(node, this.domains, constraint)
        if (newDomain.size < oldSize) {
            assert(newDomain !== this.domains.get(node), "do not mutate domain")
            this.domains.set(node, newDomain)
            if (newDomain.size === 0) {
                this.inconsistent = true
            }
            if (newDomain.size === 1) {
                this.unassignedVars.delete(node)
            }
            return true
        } else {
            return false
        }
    }

    constraints(node: V): Iterable<[C, Iterable<V>]> {
        return this.propagator.constraints(node, this.domains)
    }

    pickNextToBranch(): V {
        assert(this.unassignedVars.size > 0, "pick next branch without remaining variables")
        return this.ordering.pickNextToBranch(this.unassignedVars, this.domains)
    }

    copy(): CspController<V, C, D> {
        return new CspController(this.propagator, this.ordering, new Map(this.domains))
    }

    assign(node: V, value: D): void {
        assert(this.unassignedVars.has(node), "node should only be assigned if it was unassigned")
        assert(this.domain(node)!.has(value), "invalid value")
        this.domains.set(node, new Set([value]))
        this.unassignedVars.delete(node)
    }
}

export interface VariableOrdering<V,D> {
    pickNextToBranch(unassignedVars: Set<V>, domains: Map<V, Set<D>>): V
}

export function makeMostConstrainedOrdering<V,D>(): VariableOrdering<V,D> {
    return {
        pickNextToBranch(unassignedVars: Set<V>, domains: Map<unknown, Set<unknown>>): V {
            return min(unassignedVars, x => domains.get(x)!.size)!
        }
    }
}

export function makeMostConstraining<V,D>(propagator: CspPropagator<V,unknown,D>): VariableOrdering<V,D> {
    return {
        pickNextToBranch(unassignedVars: Set<V>, domains: Map<V, Set<D>>): V {
            return max(unassignedVars, x => {
                return unionAll([...propagator.constraints(x, domains)].map(([_,s]) => s)).size
            })!
        }
    }
}
export interface CspPropagator<V,C,D> {
    propagateTo(node: V, domains: Map<V,Set<D>>, constraint: C): Set<D> // update nodes based on constraint, returns whether node changed
    constraints(node: V, domains: Map<V,Set<D>>): Iterable<[C, Iterable<V>]> // all constraints that are incompatible with some value of node's domain together with neighbor nodes
}

export interface BinaryCspPropagator<V, D> {
    propagateTo(node: V, domain: Set<D>, from: V, fromDomain: Set<D>): Set<D> // update nodes based on constraint, returns whether node changed
    constraints(node: V, domains: Map<V,Set<D>>): Iterable<V> // all constraints that are incompatible with some value of node's domain together with neighbor nodes
}

export type ConstraintArc<V,D> = [BinaryCspPropagator<V,D>, from: V]
export class MultiConstraintPropagator<V,D> implements CspPropagator<V,ConstraintArc<V,D>,D> {
    constructor(private propagators: Iterable<BinaryCspPropagator<V,D>>) {
    }
    propagateTo(node: V, domains: Map<V, Set<D>>, [constraint, from]: ConstraintArc<V,D>): Set<D> {
        return constraint.propagateTo(node, domains.get(node)!, from, domains.get(from)!)
    }
    *constraints(node: V, domains: Map<V, Set<D>>): Iterable<[ConstraintArc<V,D>, Iterable<V>]> {
        for (let propagator of this.propagators) {
            yield [[propagator, node], propagator.constraints(node, domains)]
        }
    }
}
