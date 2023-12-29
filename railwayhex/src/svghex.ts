import { Vector } from "../../shared/vector.js"
import { Rect } from "../../shared/rectangle.js"
import { SVGAttrs, createSvgNode } from "../../shared/svg.js"
import { HexCoordinate, HexGrid } from "./hexgrid.js"

export class HexGridSvg {
    cellPadding: number = 0
    svg: SVGSVGElement // including overlay
    hexGroup: SVGGElement
    cityMarkerGroup: SVGGElement
    cityLabelGroup: SVGGElement
    lineGroup: SVGGElement
    cellSize: number = 20
    onClick?: (i: number, j: number) => any
    cells: [HexCoordinate, SVGPathElement][] = []

    coordinateText: SVGTextElement

    origin = Vector.Zero
    axisU: Vector = Vector.fromAngle(Math.PI/3*(0.5), this.cellSize)
    axisV: Vector = Vector.fromAngle(Math.PI/3*(1.5), this.cellSize)

    createHexagon(parent: SVGElement, pos: Vector, height: number, attrs: SVGAttrs): SVGPolygonElement {
        const radius = height * 2 / Math.sqrt(3)
        let points = ""
        for (let i = 0; i < 6; i++) {
            let angle = i * Math.PI / 3
            let point = pos.add(Vector.fromAngle(angle, radius))
            points += `${point.x},${point.y} `
        }
        return createSvgNode(parent, "polygon", {
            points: points,
            ...attrs
        })
    }

    getHexPosition([u,v,w]: HexCoordinate): Vector {
        return this.origin.add(this.axisU.scale(u)).add(this.axisV.scale(v))
    }

    createPath(parent: SVGElement, coords: HexCoordinate[], attrs: SVGAttrs): SVGPathElement {
        const points = coords.map((c) => this.getHexPosition(c))
        let d = `M ${points[0].x} ${points[0].y} `
        for (let i = 1; i < points.length; i++) {
            d += `L ${points[i].x} ${points[i].y} `
        }
        return createSvgNode(parent, "path", {
            d: d,
            ...attrs
        })
    }

    createTrackPath(coords: HexCoordinate[], color: string): SVGPathElement {
        return this.createPath(this.lineGroup, coords, {
            stroke: color,
            "stroke-width": 4,
            fill: "transparent",
            "stroke-linejoin": "round",
            "stroke-linecap": "round",
        })
    }

    createCircle(parent: SVGElement, pos: Vector, radius: number, attrs: SVGAttrs): SVGCircleElement {
        return createSvgNode(parent, "circle", {
            cx: pos.x,
            cy: pos.y,
            r: radius,
            ...attrs
        })
    }

    createCityMarker(coord: HexCoordinate, name: string, capital: boolean): void {
        const pos = this.getHexPosition(coord)
        const radius = 5
        const capitalStyle = {
            fill: "white",
            stroke: "black",
            "stroke-width": 2,
        }
        const normalStyle = {
            fill: "black",
            stroke: "none",
        }
        this.createCircle(this.cityMarkerGroup, pos, radius, capital ? capitalStyle : normalStyle)
        let text = createSvgNode(this.cityLabelGroup, "text", {
            "text-anchor": "start",
            "dominant-baseline": "hanging",
            "font-family": "serif",
            "font-size": capital ? 12 : 10,
            "font-weight": capital ? "bold" : "normal",
            fill: "black",
            stroke: "#fff",
            "stroke-width": capital ? 5 : 3,
            "stroke-opacity": capital ? 0.9 : 0.8,
            "paint-order": "stroke",
            "stroke-linejoin": "bevel",
            "transform": `translate(${pos.x}, ${pos.y + radius}) rotate(10)`
        })
        text.textContent = name
    }

    constructor(parent: Element, colorMap: HexGrid<string>, width: number|string, height: number|string) {
        let svg = createSvgNode(parent, "svg", {
            width: width,
            height: height,
            "pointer-events": "none"
        })
        let mapSvg = createSvgNode(svg, "svg") // has viewbox for map
        let cellGroup = createSvgNode(mapSvg, "g")
        let markerGroup = createSvgNode(mapSvg, "g")
        let labelGroup = createSvgNode(mapSvg, "g")
        let lineGroup = createSvgNode(mapSvg, "g")
        let overlayTextGroup = createSvgNode(svg, "g")

        this.coordinateText = createSvgNode(overlayTextGroup, "text", {
            x: "100%",
            y: "100%",
            "text-anchor": "end",
            "dominant-baseline": "bottom",
            "font-family": "sans-serif",
            "font-size": 12,
            // outline
            stroke: "white",
            "stroke-width": 3,
            "stroke-opacity": 0.8,
            "paint-order": "stroke",
        })

        // bounding box
        let vbox = Rect.Empty

        for (let coord of colorMap.cells) {
            let pos = this.getHexPosition(coord)
            let hex = this.createHexagon(cellGroup, pos, this.cellSize/2-this.cellPadding, {
                fill: colorMap.get(coord) ?? "red",
                stroke: "black",
                "pointer-events": "all"
            })
            hex.addEventListener("mouseover", () => this.hover(coord))
            this.cells.push([coord, hex])
            vbox = vbox.extend(Rect.fromCenter(pos.x, pos.y, this.cellSize*2, this.cellSize*2))
        }
        mapSvg.setAttribute("viewBox", `${vbox.left} ${vbox.top} ${vbox.width} ${vbox.height}`)
        this.svg = svg
        this.hexGroup = cellGroup
        this.cityMarkerGroup = markerGroup
        this.cityLabelGroup = labelGroup
        this.lineGroup = lineGroup
    }

    hover([u,v,w]: HexCoordinate) {
        this.coordinateText.textContent = `${u} ${v} ${w}`
    }

    addCellListener(event: keyof SVGElementEventMap, listener: (coord: HexCoordinate) => any) {
        for (let [coord, cell] of this.cells) {
            cell.addEventListener(event, () => listener(coord))
        }
    }
}