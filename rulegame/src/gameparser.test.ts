import { describe, expect, test, jest } from '@jest/globals';
import { evalGameLisp, expandFor, parseGameDefines } from './gameparser';
import { parseLispy } from '../../localgraphs/src/prover/sparser';
import { prettyPrint } from '../../localgraphs/src/prover/lisphelper';

describe('parsing', () => {
    test('simple game definition', () => {
        let code = `
            (define bling
                (game
                    (stones (r (circle (color red))) (b (block (color blue))))
                    (initialBoard (r _) (_ b))
                    (players (human (human) (color green)) (bot (robot) (color red)))
                    (rules
                        (human (row E (r) (b)))
                        (bot (and
                            (row N (b) (r))
                            (row S (r) (b))
                        ))
                        (human (row W (r) (b)))
                    )
                )
            )
        `
        let games = evalGameLisp(code)
        expect(games.size).toBe(1)
        let bling = games.get("bling")
        expect(bling).toBeDefined()
    })
    test('for loop', () => {
        let code = `
            (for i (a b c)
                (print i)
                (print2 i)
            )
        `
        let expectedCode = `
            (print a)
            (print2 a)
            (print b)
            (print2 b)
            (print c)
            (print2 c)
        `
        let sexprs = parseLispy(code)
        let expanded = expandFor(sexprs[0], new Map())
        expect(expanded.length).toBe(6)
        let expected = parseLispy(expectedCode)
        expect(expanded.map(prettyPrint)).toEqual(expected.map(prettyPrint))
    })
    test('for loop 2', () => {
        let code = `
            (print (for x (a b c) x x))
        `
        let expectedCode = `
            (print a a b b c c)
        `
        let sexprs = parseLispy(code)
        let expanded = expandFor(sexprs[0], new Map())
        let expected = parseLispy(expectedCode)
        expect(expanded.map(prettyPrint)).toEqual(expected.map(prettyPrint))
    })
    test('for loop paired', () => {
        let code = `
            (print (for (x y) ((a b) (c d)) y x))
        `
        let expectedCode = `
            (print b a d c)
        `
        let sexprs = parseLispy(code)
        let expanded = expandFor(sexprs[0], new Map())
        let expected = parseLispy(expectedCode)
        expect(expanded.map(prettyPrint)).toEqual(expected.map(prettyPrint))
    })
    test('for loop nested', () => {
        let code = `
            (print (for x ((a b) (c d)) (for y x y y)))
        `
        let expectedCode = `
            (print a a b b c c d d)
        `
        let sexprs = parseLispy(code)
        let expanded = expandFor(sexprs[0], new Map())
        let expected = parseLispy(expectedCode)
        expect(expanded.map(prettyPrint)).toEqual(expected.map(prettyPrint))
    })
    test('for loop nested paired', () => {
        let code = `
            (print (for (x arr) ((a (1 2)) (c (3 4))) (for n arr x n)))
        `
        let expectedCode = `
            (print a 1 a 2 c 3 c 4)
        `
        let sexprs = parseLispy(code)
        let expanded = expandFor(sexprs[0], new Map())
        let expected = parseLispy(expectedCode)
        expect(expanded.map(prettyPrint)).toEqual(expected.map(prettyPrint))
    })
})
