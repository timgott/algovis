import { createNode, attach, Side, splaySteps } from "./tree.js";
var canvas = document.getElementById('splay_canvas');
var ctx = canvas.getContext('2d');
function setCanvasSize(width, height) {
    var dpiRatio = window.devicePixelRatio;
    canvas.width = width * dpiRatio;
    canvas.height = height * dpiRatio;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.scale(dpiRatio, dpiRatio);
}
setCanvasSize(window.innerWidth, window.innerHeight);
var radius = 10;
var targetOffsetY = 30;
var targetOffsetX = 30;
var targetDistance = 50;
var rootX = canvas.clientWidth / 2;
var rootY = 80;
var dampening = 5;
var horizontalPushForce = 100;
var verticalLayoutForce = 80;
var horizontalParentForce = 40;
var horizontalChildForce = 40;
var boundaryForce = 100;
var boundaryWidth = radius * 4;
var mainCommandDelay = 100;
var subCommandDelay = 50;
var PhysicsNode = /** @class */ (function () {
    function PhysicsNode(x, y, radius) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = radius;
        this.node = createNode(this);
    }
    PhysicsNode.prototype.update = function (dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx -= this.vx * dampening * dt;
        this.vy -= this.vy * dampening * dt;
    };
    PhysicsNode.prototype.draw = function (ctx) {
        var _a;
        var parent = (_a = this.node.parent) === null || _a === void 0 ? void 0 : _a.data;
        if (parent) {
            ctx.beginPath();
            ctx.lineWidth = this.radius / 3;
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(parent.x, parent.y);
            ctx.stroke();
            ctx.closePath();
        }
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        //ctx.fillStyle = 'blue';
        ctx.fill();
        ctx.closePath();
    };
    return PhysicsNode;
}());
function findRoot(nodes) {
    for (var _i = 0, nodes_1 = nodes; _i < nodes_1.length; _i++) {
        var node = nodes_1[_i];
        if (!node.node.parent) {
            return node;
        }
    }
    throw "unrooted tree";
}
function collectLevels(root) {
    var levels = [];
    var lastLevel = [root];
    do {
        levels.push(lastLevel);
        var newLevel = [];
        for (var _i = 0, lastLevel_1 = lastLevel; _i < lastLevel_1.length; _i++) {
            var node = lastLevel_1[_i];
            for (var _a = 0, _b = Object.entries(node.node.children); _a < _b.length; _a++) {
                var _c = _b[_a], side = _c[0], child = _c[1];
                newLevel.push(child.data);
            }
        }
        lastLevel = newLevel;
    } while (lastLevel.length > 0);
    return levels;
}
function applyLayoutForces(root, dt) {
    var levels = collectLevels(root);
    for (var depth = 0; depth < levels.length; depth++) {
        var siblings = levels[depth];
        // push apart siblings
        for (var i = 1; i < siblings.length; i++) {
            var nodeA = siblings[i - 1];
            var nodeB = siblings[i];
            var diff = nodeA.x + targetDistance - nodeB.x;
            if (diff > 0) {
                var force = Math.min(diff, targetDistance) * horizontalPushForce;
                nodeA.vx -= force * dt;
                nodeB.vx += force * dt;
            }
        }
        // push to correct vertical pos
        for (var _i = 0, siblings_1 = siblings; _i < siblings_1.length; _i++) {
            var node = siblings_1[_i];
            var targetY = rootY + targetOffsetY * depth;
            var diff = targetY - node.y;
            var force = diff * verticalLayoutForce;
            node.vy += force * dt;
        }
        // center children below parent and parent above children
        for (var _a = 0, siblings_2 = siblings; _a < siblings_2.length; _a++) {
            var parent_1 = siblings_2[_a];
            for (var _b = 0, _c = Object.entries(parent_1.node.children); _b < _c.length; _b++) {
                var _d = _c[_b], side = _d[0], childNode = _d[1];
                var offsetX = (side == Side.Left.toString() ? -1 : 1) * targetOffsetX;
                var child = childNode.data;
                var diff = parent_1.x - child.x + offsetX;
                child.vx += diff * horizontalParentForce * dt;
                parent_1.vx -= diff * horizontalChildForce * dt;
            }
        }
        // push away from boundaries
        for (var _e = 0, siblings_3 = siblings; _e < siblings_3.length; _e++) {
            var node = siblings_3[_e];
            var leftBound = boundaryWidth;
            var rightBound = canvas.clientWidth - boundaryWidth;
            if (node.x < leftBound) {
                node.vx += Math.min(leftBound - node.x, 100) * boundaryForce * dt;
            }
            if (node.x > rightBound) {
                node.vx -= Math.min(node.x - rightBound, 100) * boundaryForce * dt;
            }
        }
    }
}
function findClosestNode(x, y, nodes) {
    var result = nodes[0];
    var minDistance = Number.POSITIVE_INFINITY;
    for (var _i = 0, nodes_2 = nodes; _i < nodes_2.length; _i++) {
        var node = nodes_2[_i];
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
var nodes = [];
function createRoot() {
    var root = new PhysicsNode(rootX, rootY, radius * (0.2 * Math.random() + 0.9));
    nodes.push(root);
    return root;
}
function createChild(parent, side) {
    var offsetX = (side == Side.Left ? -1 : 1) * targetOffsetX;
    var offsetY = targetOffsetY;
    var node = new PhysicsNode(parent.x + offsetX, parent.y + offsetY, radius * (0.2 * Math.random() + 0.9));
    attach(parent.node, side, node.node);
    nodes.push(node);
    return node;
}
function createTwoSpines(size) {
    var root = createRoot();
    for (var _i = 0, _a = [Side.Left, Side.Right]; _i < _a.length; _i++) {
        var side = _a[_i];
        var node = root;
        for (var i = 0; i < size; i++) {
            node = createChild(node, side);
        }
    }
}
function createTwoStrings(size) {
    var root = createRoot();
    for (var _i = 0, _a = [Side.Left, Side.Right]; _i < _a.length; _i++) {
        var side = _a[_i];
        var node = root;
        for (var i = 0; i < size; i++) {
            node = createChild(node, side);
            side = Math.random() > 0.5 ? Side.Left : Side.Right;
        }
    }
}
function heapInsert(root, value) {
    var _a;
    var next = root;
    var last;
    var side;
    console.log(value);
    do {
        side = value > next.radius ? Side.Right : Side.Left;
        last = next;
        next = (_a = next.node.children[side]) === null || _a === void 0 ? void 0 : _a.data;
    } while (next);
    var node = createChild(last, side);
    node.radius = value;
}
function createUniformsHeap(size) {
    var root = createRoot();
    root.radius = radius;
    for (var i = 0; i < size; i++) {
        var r = Math.random();
        var value = (r + 0.3) * radius;
        heapInsert(root, value);
    }
}
var commands = [];
var lastCommandExecution = Number.NEGATIVE_INFINITY;
var previousTimeStamp = undefined;
function animate(timeStamp) {
    if (!previousTimeStamp) {
        previousTimeStamp = timeStamp;
    }
    var dt = Math.min(timeStamp - previousTimeStamp, 1. / 30.);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    var root = findRoot(nodes);
    applyLayoutForces(root, dt);
    for (var _i = 0, nodes_3 = nodes; _i < nodes_3.length; _i++) {
        var node = nodes_3[_i];
        node.update(dt);
        node.draw(ctx);
    }
    while (commands.length > 0 && timeStamp > lastCommandExecution) {
        var entry = commands.shift();
        if (entry) {
            var cmd = entry[0], cmdtype = entry[1];
            cmd();
            var delay = cmdtype == "main" ? mainCommandDelay : subCommandDelay;
            lastCommandExecution = timeStamp + delay;
        }
    }
    requestAnimationFrame(animate);
}
function clicked(x, y) {
    var node = findClosestNode(x, y, nodes);
    // execute pending commands
    for (var _i = 0, commands_1 = commands; _i < commands_1.length; _i++) {
        var _a = commands_1[_i], cmd = _a[0], cmdtype = _a[1];
        cmd();
    }
    commands = splaySteps(node.node);
}
function getCursorPosition(canvas, event) {
    // https://stackoverflow.com/a/18053642/8853490
    var rect = canvas.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;
    return [x, y];
}
canvas.addEventListener("click", function (ev) {
    var _a = getCursorPosition(canvas, ev), x = _a[0], y = _a[1];
    clicked(x, y);
});
//createTwoSpines(100)
//createTwoStrings(200)
createUniformsHeap(200);
animate(performance.now());
