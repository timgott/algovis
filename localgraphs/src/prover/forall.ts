type SymbolNode = string

type ForallTypeNode = {
    tag: "forall"
    args: [args: SymbolNode[], result: TypeExprNode]
}

type ConstructorTypeNode = {
    tag: "constructor"
    args: [args: [name: SymbolNode, TypeExprNode][], result: TypeExprNode]
}

type AxiomNode = {
    tag: "axiom"
    args: [name: SymbolNode, TypeExprNode]
}

type DefineNode = {
    tag: "define"
    args: [name: SymbolNode, TypeExprNode, ExprNode]
}

type VarnodeNode = {
    tag: "varnode"
    args: [name: SymbolNode, connectors: SymbolNode[]]
}

type NodeNode = {
    tag: "node",
    args: [name: SymbolNode]
}

type EdgeNode = {
    tag: "edge"
    args: [a: SymbolNode, b: SymbolNode]
}

type LabelNode = {
    tag: "label"
    args: [node: SymbolNode, value: ExprNode]
}

type VargraphNode = {
    tag: "vargraph"
    args: [VarnodeNode | NodeNode | EdgeNode | LabelNode][]
}

type TypeExprNode = ForallTypeNode | ConstructorTypeNode;

type ToplevelNode = AxiomNode | DefineNode;

type BindingsNode = [name: SymbolNode, value: ExprNode][]

type ApplyNode = {
    tag: "apply",
    args: [ExprNode, BindingsNode]
}

type SpecializeNode = {
    tag: "specialize",
    args: [ExprNode, BindingsNode]
}

type ExprNode = ApplyNode | SpecializeNode


