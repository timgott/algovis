// Set size while respecting screen DPI
// necessary because canvas is unscaled by default
export function setCanvasSize(canvas: HTMLCanvasElement, width: number, height: number) {
    const dpiRatio = window.devicePixelRatio || 1;
    canvas.width = width * dpiRatio;
    canvas.height = height * dpiRatio;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D
    ctx.scale(dpiRatio, dpiRatio);
}

export function initFullscreenCanvas(canvas: HTMLCanvasElement) {
    function resize() {
        setCanvasSize(canvas, window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', resize);
    resize()
}