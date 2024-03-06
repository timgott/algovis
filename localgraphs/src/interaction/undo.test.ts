import { describe, test, expect } from '@jest/globals'

import { UndoHistory } from './undo'

describe('UndoHistory', () => {
    test('undo', () => {
        let history = new UndoHistory<number>()
        history.push(1)
        history.push(2)
        history.push(3)
        expect(history.undo(4)).toBe(3)
        expect(history.undo(3)).toBe(2)
        expect(history.undo(2)).toBe(1)
        expect(history.undo(1)).toBe(null)
    })
    test('undo-redo-overwrite', () => {
        let history = new UndoHistory<number>()
        history.push(1)
        history.push(2)
        history.push(3)
        expect(history.undo(4)).toBe(3)
        expect(history.redo()).toBe(4)
        history.push(5)
        expect(history.redo()).toBe(null)
        expect(history.undo(6)).toBe(5)
        expect(history.undo(5)).toBe(3)
        expect(history.undo(3)).toBe(2)
    })
})