function createBins<T>(size: number): T[][] {
    return new Array(size).fill([]);
}

export class HashSet<T> {
    private bins: T[][] = [];
    private size: number = 0;
    private loadFactor: number = 2;

    constructor(protected hash: (item: T) => number, protected equals: (a: T, b: T) => boolean, capacity: number) {
        this.bins = createBins(capacity);
    }

    resize(size: number): void {
        const oldBins = this.bins;
        this.bins = createBins(size);
        for (const bin of oldBins) {
            for (const item of bin) {
                this.add(item);
            }
        }
    }

    index(value: T): number {
        return this.hash(value) % this.bins.length;
    }
    has(value: T): boolean {
        const bin = this.bins[this.index(value)]
        return bin.some(item => this.equals(item, value));
    }
    add(item: T): void {
        if (this.has(item)) {
            return;
        }
        if (this.size > this.bins.length * this.loadFactor) {
            this.resize(this.bins.length * 2);
        }
        const i = this.index(item);
        this.bins[i] = [...this.bins[i], item];
        this.size++;
    }
    get(item: T): T | undefined {
        const bin = this.bins[this.index(item)];
        return bin.find(i => this.equals(i, item));
    }

    *[Symbol.iterator]() {
        for (const bin of this.bins) {
            for (const item of bin) {
                yield item
            }
        }
    }
}

type HashMapEntry<K,V> = [K, V|undefined]

export class HashMap<K,V> {
    private entrySet: HashSet<HashMapEntry<K,V>>

    constructor(hash: (key: K) => number, equals: (a: K, b: K) => boolean, capacity: number) {
        this.entrySet = new HashSet<HashMapEntry<K,V>>(
            ([k,_]) => hash(k),
            ([a,_], [b,__]) => equals(a,b),
            capacity
        )
    }

    has(key: K): boolean {
        return this.entrySet.has([key, undefined]);
    }

    set(key: K, value: V): void {
        let entry = this.entrySet.get([key, undefined]);
        if (entry) {
            entry[1] = value;
        } else {
            this.entrySet.add([key, value]);
        }
    }

    get(key: K): V | undefined {
        let entry = this.entrySet.get([key, undefined]);
        return entry?.[1];
    }
}