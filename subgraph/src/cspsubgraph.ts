import { Graph } from "../../localgraphs/src/graph";
import { assert, assertExists, intersectAll, mapFromFunction, unionAll } from "../../shared/utils";
import { BinaryCspPropagator, CspPropagator } from "./csp";

export class EdgePropagator<V,W> implements BinaryCspPropagator<V,W> {
    constructor(private patternGraph: FinGraph<V>, private hostGraph: FinGraph<W>) {}
    propagateTo(node: V, domain: Set<W>, from: V, fromDomain: Set<W>): Set<W> {
        // domain of node = (domain of node) intersects union of neighbors of fromDomain
        let candidates = unionAll(fromDomain.map(w => this.hostGraph.neighbors(w)))
        return candidates.intersection(domain)
    }
    constraints(node: V, domains: Map<V, Set<W>>): Iterable<V> {
        return this.patternGraph.neighbors(node)
    }
}

export class DistinctnessPropagator<V, W> implements BinaryCspPropagator<V, W> {
    propagateTo(node: V, domain: Set<W>, from: V, fromDomain: Set<W>): Set<W> {
        assert(fromDomain.size === 1, "can propagate distinctness only for unique assignment")
        let [item,] = fromDomain
        if (domain.has(item)) {
            let newDomain = new Set(domain)
            newDomain.delete(item)
            return newDomain
        } else {
            return domain
        }
    }
    constraints(node: V, domains: Map<V, Set<W>>): Iterable<V> {
        let domain = domains.get(node)!
        if (domain.size === 1) {
            // Only if the node is assigned exactly this makes sense to propagate with simple methods.
            // All other nodes can be in conflict.
            let others = new Set(domains.keys())
            others.delete(node)
            return others
        } else {
            return []
        }
    }
}

export class VariablePropagator<V, Lv, W, Lw> implements BinaryCspPropagator<V, W> {
    constructor(private patternGraph: Labeling<V,Lv>, private variables: Set<Lv>, private hostGraph: Labeling<W,Lw>) {}

    propagateTo(node: V, domain: Set<W>, from: V, fromDomain: Set<W>): Set<W> {
        // TODO: track labels without recomputing over whole domain
        // (do not use BinaryCspPropagator)
        let allowedLabels = fromDomain.map(w => this.hostGraph.label(w))
        return domain.filter(w => allowedLabels.has(this.hostGraph.label(w)))
    }
    constraints(node: V, domains: Map<V, Set<W>>): Iterable<V> {
        let label = this.patternGraph.label(node)
        if (this.variables.has(label)) {
            return this.patternGraph.nodesWithLabel(label)
        }
        return []
    }
}

export class NegativeEdgePropagator<V,W> implements BinaryCspPropagator<V,W> {
    constructor(private negativeGraph: BasicGraph<V>, private hostGraph: FinGraph<W>) {}
    propagateTo(node: V, domain: Set<W>, from: V, fromDomain: Set<W>): Set<W> {
        // domain of node = (domain of node) minus intersection of negative neighbors of fromDomain
        let negative = intersectAll<W>([...fromDomain].map(w => this.hostGraph.neighbors(w)))
        assertExists(negative) // this should not be called if fromDomain is empty
        return domain.difference(negative)
    }
    constraints(node: V, domains: Map<V, Set<W>>): Iterable<V> {
        let domain = domains.get(node)!
        if (domain.size === 1) {
            return this.negativeGraph.neighbors(node)
        } else {
            // probably not worth updating if there is more than 1 node in domain
            return []
        }
    }
}

export function makeLabeledGraphDomains<V,L,W>(patternGraph: LabeledGraph<V,L>, hostGraph: LabeledGraph<W,L>, variables: Set<L>): Map<V, Set<W>> {
    // O(n*m)
    let hostNodes = new Set(hostGraph.allNodes())
    return mapFromFunction(patternGraph.allNodes(), v => {
        let label = patternGraph.label(v)
        let isVar = variables.has(label)
        let labeledNodes = isVar ? hostNodes : new Set(hostGraph.nodesWithLabel(label))
        return labeledNodes.filter(w => hostGraph.neighbors(w).size >= patternGraph.neighbors(v).size)
    })
}
