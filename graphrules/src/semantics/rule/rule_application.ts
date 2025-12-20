import { ensured, mapFromFunction } from "../../../../shared/utils";
import { Label } from "../symbols";
import { RuleGraph } from "./rulegraph";

// Went overboard with generic parameters (e.g. Vp_i is not necessarily useful)
// These are for better type checking inside the function rather than at the call site.
// Vp: rule match pattern vertex
// Vp_i: rule insertion pattern vertex
// Vh: host matched vertex
// Vh_i: host new inserted vertex
export function applyRule<Vp,Vp_i=Vp,Vh=Vp,Vh_i=Vh>(rule: RuleGraph<Vp,Vp_i>, match: Map<Vp,Vh>, inserter: ConnectingLabeledGraphInserter<Vh_i,Label,Vh>) {
    // TODO: variables

    let insertedMap = mapFromFunction(
        rule.insertion.allNodes(),
        node => inserter.insertNode(rule.insertion.label(node))
    )
    // edges inside insertion
    for (let [from, to] of rule.insertion.enumerateEdges()) {
        inserter.insertEdge(ensured(insertedMap.get(from)), ensured(insertedMap.get(to)))
    }

    // edges between existing and insertion
    for (let [from, targets] of rule.connectingEdges) {
        for (let to of targets) {
            inserter.insertConnectingEdge(
                match.get(from)!,
                insertedMap.get(to)!
            )
        }
    }
}
