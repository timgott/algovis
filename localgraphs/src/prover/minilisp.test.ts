import { describe, expect, test, jest } from '@jest/globals';
import { Context, evalSimpleExpression, runSimpleExpression } from './minilisp';
import { SExpr, parseLispy } from './sparser';

describe('expressions', () => {
    const emptyContext = new Context(null);
    const log = jest.fn();
    test('0', () => {
        let code: SExpr = { type: "symbol", value: "0" };
        expect(evalSimpleExpression(code, emptyContext)).toBe(0);
    })
    test('1+1+1', () => {
        let code: SExpr = {
            type: "list",
            args: [
                { type: "symbol", value: "add" },
                { type: "symbol", value: "1" },
                { type: "symbol", value: "1" },
                { type: "symbol", value: "1" },
            ]
        };
        expect(evalSimpleExpression(code, emptyContext)).toBe(3);
    })
    test('print', () => {
        let code = "(Print 1)"
        runSimpleExpression(parseLispy(code), log)
        expect(log).toHaveBeenCalledWith("1")
    })
    test('variable', () => {
        let code = "(Define x 3) (Define y 4) (Print (add x y))"
        runSimpleExpression(parseLispy(code), log)
        expect(log).toHaveBeenCalledWith("7")
    })
})