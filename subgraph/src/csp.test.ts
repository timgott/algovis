import { describe, expect, test, jest } from '@jest/globals';
import {
    solveCsp,
    CspController,
    makeMostConstrainedOrdering,
    MultiConstraintPropagator,
    type VariableOrdering,
    type BinaryCspPropagator,
    type ConstraintArc,
} from './csp';

type V = string;
type D = number;

class NeqPropagator implements BinaryCspPropagator<V, D> {
    constructor(private neighbors: ReadonlyMap<V, ReadonlySet<V>>) {}

    propagateTo(node: V, domain: Set<D>, from: V, fromDomain: Set<D>): Set<D> {
        const newDomain = new Set(domain);
        if (fromDomain.size === 1) {
            const fv = [...fromDomain][0];
            newDomain.delete(fv);
        }
        return newDomain;
    }

    *constraints(node: V): Iterable<V> {
        yield* this.neighbors.get(node) ?? [];
    }
}

function collectSolutions(csp: CspController<V, ConstraintArc<V, D>, D>): Array<Record<V, D>> {
    return Array.from(solveCsp(csp), (sol) => Object.fromEntries(sol) as Record<V, D>);
}

describe('CSP', () => {
    const ordering: VariableOrdering<V, D> = makeMostConstrainedOrdering();

    test('CspController construction', () => {
        // complete
        let domains = new Map<V, Set<D>>([['a', new Set([1])], ['b', new Set([2])]]);
        let propagator = new MultiConstraintPropagator<V, D>([]);
        let csp = new CspController(propagator, ordering, domains);
        expect(csp.complete).toBe(true);
        expect(csp.inconsistent).toBe(false);
        expect([...csp.unassignedVars]).toEqual([]);

        // unassigned >1
        domains = new Map([['a', new Set([1, 2])], ['b', new Set([3])]]);
        csp = new CspController(propagator, ordering, domains);
        expect([...csp.unassignedVars]).toEqual(['a']);

        // inconsistent
        domains = new Map([['a', new Set([1])], ['b', new Set<D>([])]]);
        csp = new CspController(propagator, ordering, domains);
        expect(csp.inconsistent).toBe(true);
    });

    test('most constrained variable ordering', () => {
        const domains = new Map<V, Set<D>>([
            ['a', new Set([1, 2, 3])],
            ['b', new Set([1, 2])],
        ]);
        const unassigned = new Set<V>(['a', 'b']);
        expect(makeMostConstrainedOrdering<V, D>().pickNextToBranch(unassigned, domains)).toBe('b');
    });

    test('no constraints enumerates cartesian product', () => {
        const domains = new Map<V, Set<D>>([
            ['a', new Set([1, 2])],
            ['b', new Set([3, 4])],
        ]);
        const propagator = new MultiConstraintPropagator<V, D>([]);
        const csp = new CspController(propagator, ordering, domains);
        const solutions = collectSolutions(csp);
        expect(solutions).toHaveLength(4);
        expect(solutions).toEqual(
            expect.arrayContaining([
                { a: 1, b: 3 },
                { a: 1, b: 4 },
                { a: 2, b: 3 },
                { a: 2, b: 4 },
            ])
        );
    });

    test('neq constraints solve with propagation', () => {
        const graph = new Map<V, Set<V>>([
            ['a', new Set(['b'])],
            ['b', new Set(['a'])],
        ]);
        const neq = new NeqPropagator(graph);
        const propagator = new MultiConstraintPropagator([neq]);
        const domains = new Map<V, Set<D>>([
            ['a', new Set([1, 2, 3])],
            ['b', new Set([1, 2, 3])],
        ]);
        const csp = new CspController(propagator, ordering, domains);
        const solutions = collectSolutions(csp).sort((p, q) => (p.a as number) - (q.a as number) || (p.b as number) - (q.b as number));
        expect(solutions).toEqual([
            { a: 1, b: 2 },
            { a: 1, b: 3 },
            { a: 2, b: 1 },
            { a: 2, b: 3 },
            { a: 3, b: 1 },
            { a: 3, b: 2 },
        ]);
    });

    test('inconsistent CSP', () => {
        const graph = new Map<V, Set<V>>([
            ['a', new Set(['b'])],
            ['b', new Set(['a'])],
        ]);
        const neq = new NeqPropagator(graph);
        const propagator = new MultiConstraintPropagator([neq]);
        const domains = new Map<V, Set<D>>([['a', new Set([1])], ['b', new Set([1])]]);
        const csp = new CspController(propagator, ordering, domains);
        expect(collectSolutions(csp)).toEqual([]);
    });
});
