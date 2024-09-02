import { Rect } from "../../../shared/rectangle"

import { Positioned } from "../../../shared/vector"

/* Decision operators */

export type InputNode = Positioned

export type OutputNode = Positioned & {
    branch: number
}

function createInputNode(): InputNode {
    return {
        x: 0, y: 0
    }
}

function createOutputNode(branch: number): OutputNode {
    return {
        x: 0, y: 0,
        branch
    }
}

// TOOD: multiInputs for find operator?
export const operators = {
    equality: {
        inputs: ["a", "b"],
        outputs: [ // array of branches
            ["trueA", "trueB"],
            ["falseA", "falseB"]
        ],
    }
} as const

// Typing
export type OperatorKind = keyof typeof operators
type Operator = typeof operators[OperatorKind]
type ArrayToProperties<A extends readonly string[],T> = { [K in A[number]]: T }
type OperatorNodeOf<K extends OperatorKind, Op extends Operator> = Readonly<
    {
        kind: K,
        inputs: Readonly<ArrayToProperties<Op["inputs"], InputNode>>
        outputs: Readonly<ArrayToProperties<Op["outputs"][number], OutputNode>>
    }
> & Positioned
type OperatorNodeOfKind<K extends OperatorKind> = OperatorNodeOf<K, typeof operators[K]>
export type OperatorNode = OperatorNodeOfKind<OperatorKind>
export type EqualityNode = OperatorNodeOfKind<"equality">

function arrayToProperties<A extends readonly string[], T>(names: A, init: () => T): ArrayToProperties<A, T> {
    return Object.fromEntries(names.map(name => [name, init()])) as ArrayToProperties<A, T>
}

export function createEqualityNode(): EqualityNode {
    return {
        kind: "equality",
        x: 0,
        y: 0,
        inputs: {
            a: createInputNode(),
            b: createInputNode(),
        },
        outputs: {
            trueA: createOutputNode(0),
            trueB: createOutputNode(0),
            falseA: createOutputNode(1),
            falseB: createOutputNode(1)
        }
    }
}

export function createOperatorNode<K extends OperatorKind>(kind: K, x: number = 0, y: number = 0): OperatorNodeOfKind<K> {
    const op = operators[kind]
    const outputBranches = op.outputs.map((outputs, branch) => arrayToProperties(outputs, () => createOutputNode(branch)))
    const outputNodes = Object.assign({}, ...outputBranches) as ArrayToProperties<typeof operators[K]["outputs"][number], OutputNode>
    return {
        kind,
        x,
        y,
        inputs: arrayToProperties(op.inputs, createInputNode),
        outputs: outputNodes
    }
}


function putAttachPoint(ctx: CanvasRenderingContext2D, x: number, y: number, node: Positioned) {
    const radius = 10
    ctx.fillStyle = "black"
    ctx.circle(x, y, radius)
    ctx.fill()
    node.x = x
    node.y = y
}

function drawBinOp(ctx: CanvasRenderingContext2D,
    pos: Positioned, offset: number,
    left: Positioned, operator: string, right: Positioned
) {
    putAttachPoint(ctx, pos.x - offset, pos.y, left)
    putAttachPoint(ctx, pos.x + offset, pos.y, right)
    ctx.fillText(operator, pos.x, pos.y)
}

function drawEqualityWindow(ctx: CanvasRenderingContext2D,
    op: EqualityNode, bounds: Rect, titleArea: Rect
): void {
    const opOffset = 25
    const argOffset = 30

    ctx.font = "bold 12pt monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    drawBinOp(
        ctx, Rect.center(titleArea), argOffset,
        op.inputs.a, "?", op.inputs.b
    )

    const [trueBox, falseBox] = Rect.splitHorizontal(bounds, 0.5)

    ctx.beginPath()
    ctx.strokeStyle = `rgba(0,0,0,0.3)`
    ctx.fillStyle = "black"
    ctx.lineWidth = 1
    ctx.moveTo(falseBox.left, falseBox.top)
    ctx.lineTo(falseBox.left, falseBox.bottom)
    ctx.stroke()
    drawBinOp(ctx, Rect.center(trueBox), opOffset,
        op.outputs.trueA, "=", op.outputs.trueB)
    drawBinOp(ctx, Rect.center(falseBox), opOffset,
        op.outputs.falseA, "≠", op.outputs.falseB)
}

const operatorWindows = {
    equality: {
        draw: drawEqualityWindow,
        width: 200,
        height: 80
    }
} as const

export function getInputs(op: OperatorNode): InputNode[] {
    return Object.values(op.inputs)
}

export function getOutputs(op: OperatorNode): OutputNode[] {
    return Object.values(op.outputs)
}
