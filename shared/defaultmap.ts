// inspired by python's defaultdict
export class DefaultMap<K, V> {
    private readonly values: Map<K,V> = new Map();

    constructor(protected makeDefault: () => V) { }

    get(name: K): V {
        let value = this.values.get(name);
        if (value !== undefined) {
            return value;
        } else {
            let newValue = this.makeDefault();
            this.values.set(name, newValue);
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
}
