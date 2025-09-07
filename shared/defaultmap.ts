// inspired by python's defaultdict
export class DefaultMap<K, V> {
    private readonly values: Map<K,V> = new Map();

    constructor(protected makeDefault: (key: K) => V) { }

    get(name: K): V {
        let value = this.values.get(name);
        if (value !== undefined) {
            return value;
        } else {
            let newValue = this.makeDefault(name);
            this.values.set(name, newValue); // must be saved, e.g. there can be randomness in makeDefault
            return newValue;
        }
    }

    set(name: K, value: V): void {
        this.values.set(name, value);
    }

    clone(): DefaultMap<K, V> {
        let clone = new DefaultMap<K, V>(this.makeDefault);
        for (let [key, value] of this.values) {
            clone.set(key, value);
        }
        return clone;
    }

    toMap(): Map<K, V> {
        return new Map(this.values)
    }
}

export function collectCounts<T>(items: T[]): DefaultMap<T, number> {
    let counts = new DefaultMap<T, number>(() => 0)
    for (let x of items) {
        counts.set(x, counts.get(x) + 1)
    }
    return counts
}

export function collectBins<T,K>(items: T[], keys: (x: T) => Iterable<K>): DefaultMap<K, T[]> {
    let bins = new DefaultMap<K, T[]>(() => [])
    for (let x of items) {
        for (let bin of keys(x)) {
            bins.get(bin).push(x)
        }
    }
    return bins
}