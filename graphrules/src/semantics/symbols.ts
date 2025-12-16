export type Label = string

export const SYMBOL_FORALL="\u2200" // ∀
export const OPERATOR_NEW = "new"
export const OPERATOR_SET = "set"
export const OPERATOR_DEL = "del"
export const OPERATOR_CONNECT = "con"
export const OPERATOR_DISCONNECT = "dis"
export const SYMBOL_PROGRAM_POINTER = "\u261b" // ☛
export const SYMBOL_IN = "in"
export const SYMBOL_OUT_STEP = "step" // ✔
export const SYMBOL_OUT_EXHAUSTED = "ex" // ✗
export const SYMBOL_ERROR = "ERR"

export const SYMBOL_RULE_OUTSIDE = "RULE_OUTSIDE"
export const SYMBOL_RULE_PATTERN = "RULE_PATTERN"
export const SYMBOL_RULE_META = "RULE_META"
export const SYMBOL_RULE_INSERTION = "RULE_INSERTION"
export const SYMBOL_RULE_NEGATIVE = "RULE_NEGATIVE"

export const WILDCARD_SYMBOL = "_" // empty string matches everything

export const operatorSymbols = new Set([
    OPERATOR_NEW,
    OPERATOR_DEL,
    OPERATOR_SET,
    OPERATOR_CONNECT,
    OPERATOR_DISCONNECT
])

export const operatorsWithArgSymbols = new Set([
    OPERATOR_NEW,
    OPERATOR_SET,
])

export const controlOutSymbols = new Set([
    SYMBOL_OUT_STEP,
    SYMBOL_OUT_EXHAUSTED
])

export const controlPortSymbols = new Set([
    SYMBOL_IN,
    SYMBOL_OUT_STEP,
    SYMBOL_OUT_EXHAUSTED,
])

export const ruleMetaSymbols = new Set([
    ...controlPortSymbols,
    SYMBOL_FORALL,
])

export const metaSymbols = new Set([
    ...ruleMetaSymbols,
    SYMBOL_PROGRAM_POINTER
])
