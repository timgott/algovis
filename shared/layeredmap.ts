interface SimpleMap<K, V> {
    get(name: K): V | undefined;
    set(name: K, value: V): void;
}

export class LayeredMap<K, V> {
    private readonly values: Map<K,V> = new Map();

    constructor(private readonly parent: SimpleMap<K,V> | null) { }

    get(name: K): V | undefined {
        return this.values.get(name) ?? this.parent?.get(name);
    }

    set(name: K, value: V): void {
        this.values.set(name, value);
    }
}
