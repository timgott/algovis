import { mapFromFunction } from "../../../../shared/utils";
import { Label } from "../symbols";
import { RuleGraph } from "./rulegraph";

function applyRule<V,I=V,W=V>(rule: RuleGraph<V,I>, match: Map<V,W>, inserter: LabeledGraphInserter<W,Label>) {
    let insertedMap = mapFromFunction(
        rule.insertion.allNodes(),
        node => inserter.insertNode(rule.insertion.label(node))
    )
    for (let [from, targets] of rule.connectingEdges) {
        for (let to of targets) {
            inserter.insertEdge(
                match.get(from)!,
                insertedMap.get(to)!
            )
        }
    }
}
