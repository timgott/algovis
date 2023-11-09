export function applyLayoutPhysics(graph, layout, width, height, dt) {
    // pull together edges
    for (var _i = 0, _a = graph.edges; _i < _a.length; _i++) {
        var edge = _a[_i];
        var dx = edge.b.x - edge.a.x;
        var dy = edge.b.y - edge.a.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        console.assert(dist > 0, "Points on same spot");
        var unitX = dx / dist;
        var unitY = dy / dist;
        var force = (layout.edgeLength - dist) * layout.edgeForce * dt;
        edge.a.vx -= force * unitX;
        edge.a.vy -= force * unitY;
        edge.b.vx += force * unitX;
        edge.b.vy += force * unitY;
    }
    // push apart nodes
    var targetDistSqr = layout.targetDistance * layout.targetDistance;
    for (var _b = 0, _c = graph.nodes; _b < _c.length; _b++) {
        var a = _c[_b];
        for (var _d = 0, _e = graph.nodes; _d < _e.length; _d++) {
            var b = _e[_d];
            var dx = b.x - a.x;
            var dy = b.y - a.y;
            var distSqr = dx * dx + dy * dy;
            if (distSqr < targetDistSqr) {
                var force = dt * layout.pushForce;
                a.vx -= force * dx;
                a.vy -= force * dy;
                b.vx += force * dx;
                b.vy += force * dy;
            }
        }
    }
    // push nodes to center
    var centerX = width / 2;
    var centerY = height / 2;
    for (var _f = 0, _g = graph.nodes; _f < _g.length; _f++) {
        var node = _g[_f];
        var dx = centerX - node.x;
        var dy = centerY - node.y;
        node.vx += dx * dt * layout.centeringForce;
        node.vy += dy * dt * layout.centeringForce;
    }
    // position and velocity integration
    for (var _h = 0, _j = graph.nodes; _h < _j.length; _h++) {
        var node = _j[_h];
        node.x += node.vx * dt;
        node.y += node.vy * dt;
        node.vx -= node.vx * layout.dampening * dt;
        node.vy -= node.vy * layout.dampening * dt;
    }
}
export function drawGraph(ctx, graph, layout) {
    // edges
    for (var _i = 0, _a = graph.edges; _i < _a.length; _i++) {
        var edge = _a[_i];
        ctx.beginPath();
        ctx.lineWidth = layout.nodeRadius / 3;
        ctx.moveTo(edge.a.x, edge.a.y);
        ctx.lineTo(edge.b.x, edge.b.y);
        ctx.stroke();
        ctx.closePath();
    }
    // nodes
    for (var _b = 0, _c = graph.nodes; _b < _c.length; _b++) {
        var node = _c[_b];
        ctx.beginPath();
        ctx.arc(node.x, node.y, layout.nodeRadius, 0, Math.PI * 2);
        //ctx.fillStyle = 'blue';
        ctx.fill();
        ctx.closePath();
    }
}
export function findClosestNode(x, y, graph) {
    var result = graph.nodes[0];
    var minDistance = Number.POSITIVE_INFINITY;
    for (var _i = 0, _a = graph.nodes; _i < _a.length; _i++) {
        var node = _a[_i];
        var dx = (node.x - x);
        var dy = (node.y - y);
        var dist = dx * dx + dy * dy;
        if (dist < minDistance) {
            result = node;
            minDistance = dist;
        }
    }
    return result;
}
export function shuffleGraphPositions(graph, width, height) {
    for (var _i = 0, _a = graph.nodes; _i < _a.length; _i++) {
        var node = _a[_i];
        node.x = Math.random() * width;
        node.y = Math.random() * height;
    }
}
export function createEmptyGraph() {
    return {
        nodes: [],
        edges: []
    };
}
export function createNode(graph, data, x, y) {
    if (x === void 0) { x = 0; }
    if (y === void 0) { y = 0; }
    var node = {
        data: data,
        x: x,
        y: y,
        vx: 0,
        vy: 0,
        neighbors: new Set()
    };
    graph.nodes.push(node);
    return node;
}
export function createEdge(graph, a, b) {
    console.assert(!a.neighbors.has(b));
    console.assert(!b.neighbors.has(a));
    graph.edges.push({ a: a, b: b });
    a.neighbors.add(b);
    b.neighbors.add(a);
}
export function createRandomGraph(size, edgesPerNode) {
    var graph = createEmptyGraph();
    createNode(graph, null);
    for (var i = 0; i < size; i++) {
        var node = createNode(graph, null);
        for (var j = 0; j < edgesPerNode; j++) {
            var otherNode = graph.nodes[Math.floor(Math.random() * (graph.nodes.length - 1))];
            if (!node.neighbors.has(otherNode)) {
                createEdge(graph, node, otherNode);
            }
        }
    }
    return graph;
}
export function createGridGraph(size, layout) {
    var graph = createEmptyGraph();
    for (var i = 0; i < size; i++) {
        for (var j = 0; j < size; j++) {
            var node = createNode(graph, null, i * layout.edgeLength, j * layout.edgeLength);
            if (i > 0) {
                createEdge(graph, node, graph.nodes[(i - 1) * size + j]);
            }
            if (j > 0) {
                createEdge(graph, node, graph.nodes[i * size + j - 1]);
            }
        }
    }
    return graph;
}
