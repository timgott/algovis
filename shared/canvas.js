// Set size while respecting screen DPI
// necessary because canvas is unscaled by default
export function setCanvasSize(canvas, width, height) {
    const dpiRatio = window.devicePixelRatio || 1;
    canvas.width = width * dpiRatio;
    canvas.height = height * dpiRatio;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(dpiRatio, dpiRatio);
}
export function initFullscreenCanvas(canvas) {
    function resize() {
        setCanvasSize(canvas, window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', resize);
    resize();
}
export function getCursorPosition(canvas, event) {
    // https://stackoverflow.com/a/18053642/8853490
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return [x, y];
}
