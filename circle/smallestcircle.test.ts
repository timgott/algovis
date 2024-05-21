import { describe, expect, test, jest } from '@jest/globals';
import { findSmallestCircle, findSmallestCircleIncremental, findSmallestCircleRec } from './smallestcircle'
import { Positioned } from '../shared/vector';

describe('Smallest circle performance', () => {
    function testRuntime(points: Positioned[]) {
        let start = performance.now()
        for (let i = 0; i < 10; i++)
            findSmallestCircle(points)
        let end = performance.now()
        return end - start
    }

    test('performance scaling 100 to 1000', () => {
        // flaky tests!
        let points: Positioned[] = []
        for (let i = 0; i < 100000; i++) {
            points.push({ x: Math.random(), y: Math.random() })
        }

        const time10 = testRuntime(points.slice(0, 10))
        const time100 = testRuntime(points.slice(0, 100))
        const time1000 = testRuntime(points.slice(0, 1000))
        const time2000 = testRuntime(points.slice(0, 2000))
        const time3000 = testRuntime(points.slice(0, 3000))
        const time4000 = testRuntime(points.slice(0, 4000))
        const time8000 = testRuntime(points.slice(0, 8000))

        const baseOffset = time100
        expect((time4000-baseOffset)/time2000).toBeLessThan(3)
        expect((time8000-baseOffset)/time4000).toBeLessThan(3)
        expect((time1000-time10)/time100).toBeLessThan(10)
    })

    test('equivalent implementations', () => {
        let points: Positioned[] = []
        for (let i = 0; i < 1000; i++) {
            points.push({ x: Math.random(), y: Math.random() })
        }

        const circle1 = findSmallestCircleRec(points, [])
        const circle2 = findSmallestCircleIncremental(points, [])
        expect(circle1.r).toBeCloseTo(circle2.r, 4)
        expect(circle1.x).toBeCloseTo(circle2.x, 4)
        expect(circle1.y).toBeCloseTo(circle2.y, 4)
    })
})