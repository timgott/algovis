import { describe, expect, test } from '@jest/globals';
import { SExpr, Tokenizer, parseLispy } from './sparser';

describe('tokenizer', () => {
    test('empty', () => {
        let lexer = new Tokenizer("");
        expect(lexer.next().type).toBe("EOF");
    })
    test('empty_twice', () => {
        let lexer = new Tokenizer("");
        lexer.next()
        expect(lexer.next().type).toBe("EOF");
    })
    test('symbol', () => {
        let lexer = new Tokenizer("unter_strich");
        expect(lexer.next()).toEqual({ type: "symbol", value: "unter_strich" });
        expect(lexer.next()).toEqual({ type: "EOF" });
    })
    test('quotedword', () => {
        let lexer = new Tokenizer('" leer zeichen "');
        expect(lexer.next()).toEqual({ type: "string", value: " leer zeichen " });
        expect(lexer.next()).toEqual({ type: "EOF" });
    })
    test('tokens', () => {
        let lexer = new Tokenizer(" (hallo)) welt");
        expect(lexer.next()).toEqual({ type: "(" });
        expect(lexer.next()).toEqual({ type: "symbol", value: "hallo" });
        expect(lexer.next()).toEqual({ type: ")" });
        expect(lexer.next()).toEqual({ type: ")" });
        expect(lexer.next()).toEqual({ type: "symbol", value: "welt" });
        expect(lexer.next()).toEqual({ type: "EOF" });
    })
    test('comment', () => {
        let lexer = new Tokenizer("hallo;kommentar()\nwelt");
        expect(lexer.next()).toEqual({ type: "symbol", value: "hallo" });
        expect(lexer.next()).toEqual({ type: "symbol", value: "welt" });
    })
    test('twocomments', () => {
        let lexer = new Tokenizer("hallo;kommentar()\n;welt");
        expect(lexer.next()).toEqual({ type: "symbol", value: "hallo" });
        expect(lexer.next()).toEqual({ type: "EOF" });
    })
    test('punctuation', () => {
        // every character should be accepted if it isn't (, ), ", ; or whitespace
        let lexer = new Tokenizer("+- |#")
        expect(lexer.next()).toEqual({ type: "symbol", value: "+-" });
        expect(lexer.next()).toEqual({ type: "symbol", value: "|#" });
    })
})

describe('parser', () => {
    function word(value: string): { type: "symbol", value: string } {
        return { type: "symbol", value: value };
    }

    function list(...tokens: SExpr[]): SExpr {
        return {
            type: "list",
            args: tokens
        };
    }

    test('empty', () => {
        expect(parseLispy("")).toEqual([]);
    })
    test('simple', () => {
        expect(parseLispy("(a 1 2)")).toEqual([list(word("a"), word("1"), word("2"))]);
    })
    test('linebreak', () => {
        expect(parseLispy("(a\nb)")).toEqual([list(word("a"), word("b"))]);
    })
    test('multi', () => {
        expect(parseLispy("(1 2 3) (b c d)"))
        .toEqual([
            list(word("1"), word("2"), word("3")),
            list(word("b"), word("c"), word("d")),
        ]);
    })
    test('nested', () => {
        expect(parseLispy("(a (b c))"))
        .toEqual([
            list(word("a"), list(word("b"), word("c"))),
        ]);
    })
    test('more_nested', () => {
        expect(parseLispy("((eins zwei) (drei vier))"))
        .toEqual([
            list(
                list(word("eins"), word("zwei")),
                list(word("drei"), word("vier"))
            ),
        ]);
    })
    // errors
    test('missing_closing_paren', () => {
        expect(() => parseLispy("(a 1 2")).toThrow();
    })
    test('no_paren', () => {
        expect(() => parseLispy("a")).toThrow();
    })
})
