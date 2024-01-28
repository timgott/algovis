// Parser for S-expressions

import { unreachable } from "../../../shared/utils";

type ValueToken = {
    type: "symbol" | "string",
    value: string
}

type KeywordToken = {
    type: "(" | ")" | "EOF"
}

export type Token = KeywordToken | ValueToken

export type SList = {
    type: "list"
    args: SExpr[]
}

export type SExpr = SList | ValueToken

export class Tokenizer {
    private whitespaceRegex = RegExp(/\s/)
    private wordRegex = RegExp(/\w/)

    private position = 0
    constructor(private code: string) {}

    private isWhitespace(char: string): boolean {
        return this.whitespaceRegex.test(char);
    }

    private isWordChar(char: string): boolean {
        return this.wordRegex.test(char);
    }

    private eof(): boolean {
        return this.position >= this.code.length;
    }

    private skipWhitespace() {
        while (!this.eof() && this.isWhitespace(this.code[this.position])) {
            this.position++;
        }
    }

    private skipWord() {
        while (!this.eof() && this.isWordChar(this.code[this.position])) {
            this.position++;
        }
    }

    private skipStringLiteral() {
        this.position++;
        while (!this.eof() && this.code[this.position] != '"') {
            this.position++;
        }
        this.position++;
    }

    private skipLineComment(): void {
        if (this.code[this.position] == ';') {
            do { this.position++; }
            while (!this.eof() && this.code[this.position] != '\n')
        }
    }

    next(): Token {
        this.skipWhitespace();
        this.skipLineComment();
        this.skipWhitespace();
        if (this.eof()) {
            return { type: "EOF" };
        }
        let char = this.code[this.position];
        if (char == '(' || char == ')') {
            this.position++;
            return { type: char };
        }
        let start = this.position;
        if (char == '"') {
            this.skipStringLiteral();
            return { type: "string", value: this.code.slice(start+1, this.position-1) };
        } else {
            this.skipWord();
            return { type: "symbol", value: this.code.slice(start, this.position) };
        }
    }
}

function parseParenList(lexer: Tokenizer): SList {
    let result: SExpr = { type: "list", args: [] };
    while (true) {
        let token = lexer.next();
        switch (token.type) {
            case 'EOF':
                throw new Error("Unexpected EOF, missing ')'");
            case ')':
                return result;
            case '(':
                result.args.push(parseParenList(lexer));
                break;
            default:
                result.args.push(token);
                break;
        }
    }
}

export function parseLispy(code: string): SList[] {
    let lexer = new Tokenizer(code);

    let result: SList[] = []

    while (true) {
        let token = lexer.next();
        if (token.type === "EOF") {
            break;
        } else if (token.type === "(") {
            result.push(parseParenList(lexer));
        } else {
            throw new Error(`Unexpected ${token.type}`);
        }
    }

    return result
}
