
import { SExpr, SList } from "./sparser";

export class ParsingError extends Error { }

export function requireSymbol(expr: SExpr): string {
    if (expr.type != "symbol") {
        throw new ParsingError(`expected symbol, got: ${prettyPrint(expr)}`);
    }
    return expr.value;
}

export function requireList(expr: SExpr): SList {
    if (expr.type != "list") {
        throw new ParsingError(`expected list, got: ${prettyPrint(expr)}`);
    }
    return expr;
}

export function prettyPrint(expr: SExpr): string {
    switch (expr.type) {
        case "symbol":
            return expr.value;
        case "string":
            return `"${expr.value}"`;
        case "list":
            return `(${expr.args.map(prettyPrint).join(" ")})`;
        default:
            return JSON.stringify(expr);
    }
}

export function checkSymbol(expr: SExpr, symbol: string): boolean {
    return expr.type == "symbol" && expr.value == symbol;
}

export function requireTag(expr: SList): string {
    if (expr.args.length < 1) {
        throw new ParsingError(`missing tag`);
    }
    let tag = expr.args[0];
    if (tag.type != "symbol") {
        throw new ParsingError(`invalid tag: ${prettyPrint(expr)}`);
    }
    return tag.value;
}

export function requireArg(expr: SList, index: number): SExpr {
    if (expr.args.length <= index) {
        throw new ParsingError(`missing argument ${index}`);
    }
    return expr.args[index];
}

export function getArgs(expr: SList): SExpr[] {
    return expr.args.slice(1);
}

export function shiftOrFail<T>(args: T[]): T {
    if (args.length == 0) {
        throw new ParsingError("missing argument");
    }
    return args.shift()!;
}
