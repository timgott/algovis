import { describe, expect, test, jest } from '@jest/globals';
import { HashSet } from './hashset';

describe('HashSet', () => {
    test('add', () => {
        let set = new HashSet<number>(x => x, (a, b) => a == b, 10)
        set.add(1)
        expect(set.has(1)).toBe(true)
        expect(Array.from(set)).toEqual([1])
    })

    test('add_twice', () => {
        let set = new HashSet<number>(x => x, (a, b) => a == b, 10)
        set.add(1)
        set.add(1)
        expect(set.has(1)).toBe(true)
        let arr = Array.from(set)
        expect(arr).toEqual([1])
        expect(arr.length).toBe(1)
    })

    test('add_twice_different', () => {
        let set = new HashSet<number>(x => x, (a, b) => a == b, 10)
        set.add(1)
        set.add(2)
        expect(set.has(1)).toBe(true)
        expect(set.has(2)).toBe(true)
        expect(Array.from(set)).toEqual([1,2])
    })

    test('add_twice_collision', () => {
        let set = new HashSet<number>(x => 0, (a, b) => a == b, 10)
        set.add(1)
        set.add(2)
        expect(set.has(1)).toBe(true)
        expect(set.has(2)).toBe(true)
        expect(Array.from(set)).toEqual([1,2])
    })

    test('add_many_resize', () => {
        let set = new HashSet<number>(x => x, (a, b) => a == b, 3)
        for (let i = 0; i < 10; i++) {
            set.add(i)
        }
        expect(Array.from(set).length).toBe(10)
    })

    test('add_many_collision', () => {
        let set = new HashSet<number>(x => x % 2, (a, b) => a == b, 3)
        for (let i = 0; i < 10; i++) {
            set.add(i)
        }
        expect(Array.from(set).length).toBe(10)
    })
})
