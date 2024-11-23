export interface BaseRelation<K, V> {
    get(name: K): Set<V> | undefined;
    keys(): Iterable<K>;
}

export interface Relation<K, V> extends Iterable<[K, V]> {
    has(name: K, value: V): boolean;
    get(name: K): Iterable<V>;
    keys(): Iterable<K>;
}

export function mkRelation<K, V>(base: BaseRelation<K,V>): Relation<K, V> {
    return {
        get: (k: K) => base.get(k) ?? [],
        keys: base.keys,
        has(name: K, value: V): boolean {
            return base.get(name)?.has(value) ?? false
        },
        *[Symbol.iterator]() {
            for (const name of base.keys()) {
                const values = base.get(name);
                if (values) {
                    for (const value of values) {
                        yield [name, value] as [K, V]
                    }
                }
            }
        }
    }
}

export type MutRelation<K,V> = Relation<K,V> & {
    add(name: K, value: V): void;
    size: number;
}

export function mkMutRelation<K, V>(): MutRelation<K, V> {
    const values: Map<K,Set<V>> = new Map();
    return Object.assign(
        mkRelation({
            get: (name: K) => values.get(name),
            keys: () => values.keys(),
        }),
        {
            add(name: K, value: V) {
                let set = values.get(name);
                if (!set) {
                    set = new Set();
                    values.set(name, set);
                }
                if (!set.has(value)) {
                    this.size++;
                    set.add(value);
                }
            },
            size: 0
        }
    )
}

export function relationUnionLazy<K,V>(a: Relation<K,V>, b: Relation<K,V>): Relation<K,V> {
    return {
        has: function(name: K, value: V): boolean {
            return a.has(name, value) || b.has(name, value)
        },
        get: function*(name: K): Iterable<V> {
            yield* a.get(name)
            yield* b.get(name)
        },
        keys: function*() {
            yield* a.keys()
            yield* b.keys()
        },
        *[Symbol.iterator]() {
            yield* a
            yield* b
        }
    }
}

export function relationProduct<U,V,W>(a: Relation<U,V>, b: Relation<V,W>): MutRelation<U,W> {
    let rel = mkMutRelation<U,W>()
    for (let [u, v] of a) {
        for (let w of b.get(v)) {
            rel.add(u,w)
        }
    }
    return rel
}

export function relationDifference<U,V>(a: Relation<U,V>, b: Relation<U,V>): MutRelation<U,V> {
    let rel = mkMutRelation<U,V>()
    for (let [u, v] of a) {
        if (!b.has(u,v)) {
            rel.add(u,v)
        }
    }
    return rel
}

export function relationOneWay<U>(sym: Relation<U,U>): Relation<U,U> {
    let rel = mkMutRelation<U,U>()
    for (let [u, v] of sym) {
        if (!rel.has(v,u)) {
            rel.add(u,v)
        }
    }
    return rel
}

export function relationDedup<K,V>(rel: Relation<K,V>): MutRelation<K,V> {
    let result = mkMutRelation<K,V>()
    for (let [k, v] of rel) {
        result.add(k, v)
    }
    return result
}
