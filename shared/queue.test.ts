import { Queue } from './queue';
import { describe, expect, test, jest, it, beforeEach } from '@jest/globals';

describe('Queue', () => {
    describe('constructor', () => {
        it('should create an empty queue', () => {
            const newQueue = new Queue<string>();
            expect(newQueue.empty()).toBe(true);
            expect(newQueue.length()).toBe(0);
        });
    });

    describe('push', () => {
        it('should add a single element to the queue', () => {
            let queue = new Queue<number>();
            queue.push(1);
            expect(queue.length()).toBe(1);
            expect(queue.empty()).toBe(false);
        });

        it('should add multiple elements to the queue', () => {
            let queue = new Queue<number>();
            queue.push(1);
            queue.push(2);
            queue.push(3);
            expect(queue.length()).toBe(3);
            expect(queue.empty()).toBe(false);
        });

        it('should maintain FIFO order when pushing elements', () => {
            let queue = new Queue<string>();
            queue.push('first');
            queue.push('second');
            queue.push('third');

            expect(queue.shift()).toBe('first');
            expect(queue.shift()).toBe('second');
            expect(queue.shift()).toBe('third');
        });
    });

    describe('shift', () => {
        it('should return undefined for empty queue', () => {
            let queue = new Queue<number>();
            expect(queue.shift()).toBeUndefined();
            expect(queue.length()).toBe(0);
        });

        it('should return the first element added (FIFO)', () => {
            let queue = new Queue<number>();
            queue.push(10);
            queue.push(20);
            queue.push(30);

            expect(queue.shift()).toBe(10);
            expect(queue.length()).toBe(2);
        });

        it('should return elements in FIFO order', () => {
            let queue = new Queue<string>();
            queue.push('a');
            queue.push('b');
            queue.push('c');

            expect(queue.shift()).toBe('a');
            expect(queue.shift()).toBe('b');
            expect(queue.shift()).toBe('c');
            expect(queue.shift()).toBeUndefined();
        });

        it('should handle multiple shifts correctly', () => {
            let queue = new Queue<number>();
            // Add multiple elements
            for (let i = 0; i < 10; i++) {
                queue.push(i);
            }

            // Remove some elements
            for (let i = 0; i < 5; i++) {
                expect(queue.shift()).toBe(i);
                expect(queue.length()).toBe(9 - i);
            }

            // Queue should still have remaining elements
            expect(queue.length()).toBe(5);
            expect(queue.shift()).toBe(5);
        });
    });

    describe('length', () => {
        it('should return 0 for empty queue', () => {
            let queue = new Queue<number>();
            expect(queue.length()).toBe(0);
        });

        it('should return correct length after push operations', () => {
            let queue = new Queue<number>();
            queue.push(1);
            expect(queue.length()).toBe(1);

            queue.push(2);
            expect(queue.length()).toBe(2);

            queue.push(3);
            expect(queue.length()).toBe(3);
        });

        it('should return correct length after shift operations', () => {
            let queue = new Queue<number>();
            queue.push(1);
            queue.push(2);
            queue.push(3);

            expect(queue.length()).toBe(3);
            queue.shift();
            expect(queue.length()).toBe(2);
            queue.shift();
            expect(queue.length()).toBe(1);
            queue.shift();
            expect(queue.length()).toBe(0);
        });
    });

    describe('empty', () => {
        it('should return true for empty queue', () => {
            let queue = new Queue<number>();
            expect(queue.empty()).toBe(true);
        });

        it('should return false after adding elements', () => {
            let queue = new Queue<number>();
            queue.push(1);
            expect(queue.empty()).toBe(false);
        });

        it('should return true after removing all elements', () => {
            let queue = new Queue<number>();
            queue.push(1);
            queue.push(2);
            expect(queue.empty()).toBe(false);

            queue.shift();
            queue.shift();
            expect(queue.empty()).toBe(true);
        });

        it('should return true even after multiple push/shift cycles', () => {
            let queue = new Queue<number>();
            // Push some elements
            queue.push(1);
            queue.push(2);
            expect(queue.empty()).toBe(false);

            // Remove all elements
            queue.shift();
            queue.shift();
            expect(queue.empty()).toBe(true);

            // Push and remove again
            queue.push(3);
            queue.shift();
            expect(queue.empty()).toBe(true);
        });
    });

    describe('generic types', () => {
        it('should work with string type', () => {
            const stringQueue = new Queue<string>();
            stringQueue.push('hello');
            stringQueue.push('world');

            expect(stringQueue.shift()).toBe('hello');
            expect(stringQueue.shift()).toBe('world');
        });

        it('should work with object type', () => {
            const objectQueue = new Queue<{ id: number; name: string }>();
            const obj1 = { id: 1, name: 'test1' };
            const obj2 = { id: 2, name: 'test2' };

            objectQueue.push(obj1);
            objectQueue.push(obj2);

            expect(objectQueue.shift()).toEqual(obj1);
            expect(objectQueue.shift()).toEqual(obj2);
        });

        it('should work with mixed types using union type', () => {
            const mixedQueue = new Queue<string | number | boolean>();
            mixedQueue.push('hello');
            mixedQueue.push(42);
            mixedQueue.push(true);

            expect(mixedQueue.shift()).toBe('hello');
            expect(mixedQueue.shift()).toBe(42);
            expect(mixedQueue.shift()).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('should handle pushing and immediately shifting', () => {
            let queue = new Queue<number>();
            queue.push(100);
            expect(queue.shift()).toBe(100);
            expect(queue.empty()).toBe(true);
        });

        it('should handle large number of operations', () => {
            let queue = new Queue<number>();
            // Add many elements
            const count = 1000;
            for (let i = 0; i < count; i++) {
                queue.push(i);
            }

            expect(queue.length()).toBe(count);
            expect(queue.empty()).toBe(false);

            // Remove all elements
            for (let i = 0; i < count; i++) {
                expect(queue.shift()).toBe(i);
            }

            expect(queue.length()).toBe(0);
            expect(queue.empty()).toBe(true);
        });

        it('should handle shift on empty queue multiple times', () => {
            let queue = new Queue<number>();
            expect(queue.shift()).toBeUndefined();
            expect(queue.shift()).toBeUndefined();
            expect(queue.shift()).toBeUndefined();
            expect(queue.length()).toBe(0);
            expect(queue.empty()).toBe(true);
        });
    });

    describe('FIFO behavior verification', () => {
        it('should maintain strict FIFO order', () => {
            let queue = new Queue<number>();
            // Add elements in order
            const elements = [1, 2, 3, 4, 5];
            elements.forEach(el => queue.push(el));

            // Remove elements and verify order
            elements.forEach((expected, index) => {
                const actual = queue.shift();
                expect(actual).toBe(expected);
            });

            // Queue should be empty now
            expect(queue.shift()).toBeUndefined();
        });

        it('should work correctly with alternating push/shift operations', () => {
            let queue = new Queue<number>();
            queue.push(1);
            expect(queue.shift()).toBe(1);

            queue.push(2);
            queue.push(3);
            expect(queue.shift()).toBe(2);

            queue.push(4);
            expect(queue.shift()).toBe(3);
            expect(queue.shift()).toBe(4);

            expect(queue.empty()).toBe(true);
        });
    });
});
