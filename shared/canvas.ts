// Set size while respecting screen DPI
// necessary because canvas is unscaled by default
export function setCanvasSize(canvas: HTMLCanvasElement, width: number, height: number) {
    const dpiRatio = window.devicePixelRatio || 1;
    canvas.width = width * dpiRatio;
    canvas.height = height * dpiRatio;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.style.touchAction = "none";
    canvas.style.userSelect = "none";
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

export function getCursorPosition(canvas: HTMLCanvasElement, event: MouseEvent): [number, number] {
    // https://stackoverflow.com/a/18053642/8853490
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    return [x, y]
}

declare global {
    interface CanvasRenderingContext2D {
        circle(x: number, y: number, radius: number): void
    }
}

CanvasRenderingContext2D.prototype.circle = function (x: number, y: number, radius: number) {
    this.beginPath()
    this.arc(x, y, radius, 0, 2 * Math.PI)
    this.closePath()
}