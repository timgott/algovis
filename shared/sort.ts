import { DefaultMap } from "./defaultmap";

// copy of arr sorted ascending by key
export function sortedBy<T>(arr: T[], key: (item: T) => number): T[] {
    const keys = new DefaultMap(key)
    return arr.toSorted((a,b) => keys.get(a) - keys.get(b))
}
