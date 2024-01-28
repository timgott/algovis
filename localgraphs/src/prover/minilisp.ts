import { SExpr, SList } from "./sparser";

function requireSymbol(expr: SExpr): string {
    if (expr.type != "symbol") {
        throw "expected symbol";
    }
    return expr.value;
}

function requireTag(expr: SList): string {
    if (expr.args.length < 1) {
        throw `missing tag`;
    }
    let tag = expr.args[0];
    if (tag.type != "symbol") {
        throw `invalid tag ${expr}`;
    }
    return tag.value;
}

function requireArg(expr: SList, index: number): SExpr {
    if (expr.args.length <= index) {
        throw `missing argument ${index}`;
    }
    return expr.args[index];
}

function getArgs(expr: SList): SExpr[] {
    return expr.args.slice(1);
}

export class Context<V> {
    private readonly values: Map<string, number> = new Map();

    constructor(private readonly parent: Context<V> | null) { }

    get(name: string): number | undefined {
        return this.values.get(name) ?? this.parent?.get(name);
    }

    set(name: string, value: number): void {
        this.values.set(name, value);
    }
}

export function evalSimpleExpression(expr: SExpr, context: Context<number>): number {
    if (expr.type == "symbol") {
        let value = context.get(expr.value) ?? parseInt(expr.value);
        if (value === undefined) {
            throw "unknown value: " + expr.value;
        }
        return value;
    } else if (expr.type == "list") {
        let name = requireTag(expr);
        let op: (a: number, b: number) => number;
        if (name == "add") {
            op = (a, b) => a + b;
        } else if (name == "sub") {
            op = (a, b) => a - b;
        } else if (name == "mul") {
            op = (a, b) => a * b;
        } else if (name == "div") {
            op = (a, b) => a / b;
        } else {
            throw "unknown operator: " + name;
        }
        return getArgs(expr)
            .map(arg => evalSimpleExpression(arg, context))
            .reduce(op);
    } else {
        throw "unknown expression: " + expr;
    }
}

export function runSimpleExpression(statements: SList[], log: (message: string) => void): void {
    let vars = new Context<number>(null);
    for (let expr of statements) {
        let name = requireTag(expr);
        if (name == "Define") {
            let varName = requireSymbol(requireArg(expr, 1));
            let value = evalSimpleExpression(requireArg(expr, 2), vars);
            vars.set(varName, value);
        } else if (name == "Print") {
            let value = evalSimpleExpression(requireArg(expr, 1), vars);
            log(value.toString());
        }
    }
}
