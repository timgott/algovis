import { parseLispy, SExpr, SList } from "../../localgraphs/src/prover/sparser";
import {
    checkSymbol,
    requireTag,
    requireList,
    requireSymbol,
    shiftOrFail,
    prettyPrint,
    ParsingError,
} from "../../localgraphs/src/prover/lisphelper";
import { assert, assertExists, unreachable } from "../../shared/utils";
import { Color, GameRules, PlayerDescription, PlayerRole, PlayerMoves, Stone, StoneStyle } from "./games";
import { PartialGrid } from "./partialgrid";
import { GridRule, MultiRule, Rule } from "./metagame";
import { makeDiagonalGrid, makeRule } from "./rulehelpers";

function assertExactlyOne<T>(list: T[], message: string) {
    assert(list.length == 1, message);
    return list[0];
}

function expandNoLoop(expr: SExpr, replacements: Map<string, SExpr>): SExpr {
    return assertExactlyOne(expandFor(expr, replacements), "for loop not allowed here")
}

// expand for loops by replacing a variable with every value in a list
export function expandFor(
    expr: SExpr,
    replacements: Map<string, SExpr>,
): SExpr[] {
    if (expr.type === "list") {
        let args = expr.args.slice();
        if (checkSymbol(shiftOrFail(args), "for")) {
            let binder = shiftOrFail(args);
            if (binder.type == "symbol") {
                let varName = binder.value;
                let values = requireList(
                    expandNoLoop(shiftOrFail(args), replacements),
                );
                let rest = args;
                return values.args.flatMap((val) => {
                    const subReplacements = new Map(replacements);
                    subReplacements.set(varName, val);
                    return rest.flatMap((arg) =>
                        expandFor(arg, subReplacements),
                    );
                });
            } else if (binder.type == "list") {
                let varNames = binder.args.map(requireSymbol);
                let tuples = requireList(
                    expandNoLoop(shiftOrFail(args), replacements),
                ).args.map((expr) => requireList(expr));
                let rest = args;
                return tuples.flatMap((vals) => {
                    const subReplacements = new Map(replacements);
                    varNames.forEach((x, i) => {
                        subReplacements.set(x, vals.args[i]);
                    });
                    return rest.flatMap((arg) =>
                        expandFor(arg, subReplacements),
                    );
                });
            } else {
                throw new ParsingError(`invalid binder: ${prettyPrint(binder)}`);
            }
        } else {
            return [
                {
                    type: "list",
                    args: expr.args.flatMap((arg) =>
                        expandFor(arg, replacements),
                    ),
                },
            ];
        }
    } else if (expr.type === "symbol") {
        let replaced: SExpr | undefined = replacements.get(expr.value);
        if (replaced) {
            return [replaced];
        } else {
            return [expr];
        }
    } else if (expr.type === "string") {
        return [expr];
    }
    unreachable(expr.type);
}

function parseColor(expr: SExpr): Color {
    expr = requireList(expr);
    let args = expr.args.slice();
    let tag = requireSymbol(shiftOrFail(args));
    assert(tag == "color", "not a color expression");
    let color = requireSymbol(shiftOrFail(args));
    return color;
}

function parseStoneStyle(expr: SExpr): StoneStyle {
    let args = requireList(expr).args.slice();
    let kind = requireSymbol(shiftOrFail(args));
    if (kind == "nothing") {
        return { type: kind }
    } else if (kind == "circle" || kind == "block") {
        return {
            type: kind,
            color: parseColor(shiftOrFail(args))
        }
    }
    throw new ParsingError(`invalid stone kind: ${kind}`);
}

function parseStone(expr: SExpr): [Stone, StoneStyle] {
    expr = requireList(expr);
    let args = expr.args.slice();
    let name = requireSymbol(shiftOrFail(args));
    let color = parseStoneStyle(shiftOrFail(args));
    return [name, color];
}

function parseBoardRow(row: SExpr): string[] {
    row = requireList(row);
    return row.args.map(requireSymbol);
}

function parseBoard(rows: SExpr[]): PartialGrid<Stone> {
    let board: string[][] = rows.map(parseBoardRow);
    return PartialGrid.fromArray(board);
}

function parsePlayerRole(expr: SExpr): PlayerRole {
    let args = requireList(expr).args.slice();
    let kind = requireSymbol(shiftOrFail(args))
    requireNoMoreArgs(args, expr, "role")
    if (kind !== "nature" && kind !== "human" && kind !== "robot") {
        throw new ParsingError(`unknown player kind: ${kind}`)
    }
    return kind
}

function parsePlayer(expr: SExpr): PlayerDescription {
    // actually the same
    let args = requireList(expr).args.slice();
    let name = requireSymbol(shiftOrFail(args));
    let role = parsePlayerRole(shiftOrFail(args))
    let color = parseColor(shiftOrFail(args));
    return {name, color, role};
}

function requireNoMoreArgs(args: unknown[], expr: SExpr, context: string) {
    if (args.length > 0) {
        throw new ParsingError(`Too many arguments in ${context} expression: ${prettyPrint(expr)}`)
    }
}

function parseRule(expr: SExpr): GridRule<Stone> {
    const orthoDirs = ["E", "S", "W", "N"];
    const diagonalDirs = ["SE", "SW", "NW", "NE"];
    let args = requireList(expr).args.slice();
    let tag = requireSymbol(shiftOrFail(args));
    if (tag == "row") {
        let dir = requireSymbol(shiftOrFail(args));
        let rowBefore = parseBoardRow(shiftOrFail(args));
        let rowAfter = parseBoardRow(shiftOrFail(args));
        requireNoMoreArgs(args, expr, "rule")
        let orthoIndex = orthoDirs.indexOf(dir);
        if (orthoIndex != -1) {
            // orthogonal line
            let gridBefore = PartialGrid.fromArray([rowBefore]);
            let gridAfter = PartialGrid.fromArray([rowAfter]);
            for (let i = 0; i < orthoIndex; i++) {
                gridBefore = gridBefore.rotate();
                gridAfter = gridAfter.rotate();
            }
            return makeRule(gridBefore, gridAfter);
        }
        let diagonalIndex = diagonalDirs.indexOf(dir);
        if (diagonalIndex != -1) {
            let gridBefore = makeDiagonalGrid(rowBefore);
            let gridAfter = makeDiagonalGrid(rowAfter);
            for (let i = 0; i < diagonalIndex; i++) {
                gridBefore = gridBefore.rotate();
                gridAfter = gridAfter.rotate();
            }
            return makeRule(gridBefore, gridAfter);
        }
        throw new ParsingError(`invalid row direction: ${dir}`);
    }
    throw new ParsingError(`unknown rule type ${tag}`);
}

function parseMultiRule(expr: SExpr): [string, MultiRule<Stone>] {
    try {
        let args = requireList(expr).args.slice();
        let player = requireSymbol(shiftOrFail(args));
        let ruleExpr = requireList(shiftOrFail(args))
        requireNoMoreArgs(args, expr, "multirule")
        let tag = requireTag(ruleExpr);
        if (tag == "and") {
            let ruleArgs = requireList(ruleExpr).args.slice(1);
            let rules = ruleArgs.map(parseRule);
            return [player, rules];
        } else {
            let rule = parseRule(ruleExpr);
            return [player, [rule]];
        }
    } catch (e) {
        if (e instanceof ParsingError) {
            throw new ParsingError(`error while parsing ${prettyPrint(expr)}: ${e}`);
        }
        throw e
    }
}

function parseHeadings(exprs: SExpr[]): { [key: string]: SExpr[] } {
    let result: { [key: string]: SExpr[] } = {};
    for (let expr of exprs) {
        let args = requireList(expr).args.slice();
        result[requireSymbol(shiftOrFail(args))] = args;
    }
    return result;
}

function parseGameExpr(gameExpr: SExpr): GameRules {
    let args = requireList(gameExpr).args.slice();
    let tag = requireSymbol(shiftOrFail(args));
    assert(tag == "game", "not a game expression");

    let groups = parseHeadings(args);
    assertExists(groups.stones, "missing stones");
    assertExists(groups.initialBoard, "missing initial board");
    assertExists(groups.players, "missing players");
    assertExists(groups.rules, "missing rules");

    let stones = Object.fromEntries(groups.stones.map(parseStone));
    let initialBoard = parseBoard(groups.initialBoard);
    let playerList = groups.players.map(parsePlayer);
    let rules = new Map<string, MultiRule<Stone>[]>(
        playerList.map(p => [p.name, []]),
    );
    for (let [player, rule] of groups.rules.map(parseMultiRule)) {
        let playerRules = rules.get(player);
        assertExists(playerRules, `rule for undeclared player ${player}`);
        playerRules.push(rule);
    }

    return {
        stones,
        initialBoard,
        players: playerList.map(p => {
            return <PlayerMoves>{
                ...p,
                rules: rules.get(p.name)!,
            };
        }),
    };
}

function parseDefine(expr: SExpr): [string, GameRules] {
    let args = requireList(expr).args.slice();
    let tag = requireSymbol(shiftOrFail(args));
    assert(tag == "define", "not a define expression");
    let name = requireSymbol(shiftOrFail(args));
    let rules = parseGameExpr(shiftOrFail(args));
    return [name, rules];
}

export function parseGameDefines(exprs: SExpr[]): Map<string, GameRules> {
    let result = new Map<string, GameRules>();
    for (let expr of exprs) {
        let [name, rules] = parseDefine(expr);
        result.set(name, rules);
    }
    return result;
}

export function evalGameLisp(code: string): Map<string, GameRules> {
    let exprs: SExpr[] = parseLispy(code);
    // expand
    exprs = exprs.flatMap((expr) => expandFor(expr, new Map()));
    return parseGameDefines(exprs);
}
