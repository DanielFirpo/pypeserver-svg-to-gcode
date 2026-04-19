import { svgPathProperties } from "svg-path-properties";

export type Point = { x: number; y: number };

export interface GCodeCoord {
    x: number;
    y: number;
    z: number;
}

function sampleSvgPaths(svg: Document): Point[][] {
    return getPaths(svg).map((pathStr) => {
        const props = new svgPathProperties(pathStr);
        const length = props.getTotalLength();

        const numPoints = Math.min(Math.ceil(length) + 1, 10_000);
        const points: Point[] = [];

        for (let i = 0; i < numPoints; i++) {
            const s = (i / (numPoints - 1)) * length;
            const { x, y } = props.getPointAtLength(s);
            points.push({ x, y });
        }

        return points;
    });
}

function rotatePaths(paths: Point[][], deg: number): Point[][] {
    if (deg === 0 || paths.length === 0) return paths;

    const flat = paths.flat();
    let cx = 0;
    let cy = 0;
    for (const p of flat) {
        cx += p.x;
        cy += p.y;
    }
    cx /= flat.length;
    cy /= flat.length;

    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return paths.map((path) =>
        path.map(({ x, y }) => {
            const dx = x - cx;
            const dy = y - cy;
            return {
                x: dx * cos - dy * sin + cx,
                y: dx * sin + dy * cos + cy,
            };
        })
    );
}

function normalizePoints(paths: Point[][], svgScale: number): Point[][] {
    if (paths.length === 0) return [];

    const flat = paths.flat();
    let minX = Infinity,
        minY = Infinity;
    let maxX = -Infinity,
        maxY = -Infinity;

    for (const { x, y } of flat) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    const scale = svgScale / Math.max(rangeX, rangeY);

    return paths.map((path) =>
        path.map(({ x, y }) => ({
            x: (x - minX) * scale,
            y: (y - minY) * scale,
        }))
    );
}

function resamplePath(path: Point[], stepSize: number): Point[] {
    if (path.length < 2) return path;

    const result: Point[] = [path[0]!];
    let accumulated = 0;

    for (let i = 1; i < path.length; i++) {
        const prev = path[i - 1]!;
        const curr = path[i]!;
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const segLen = Math.sqrt(dx * dx + dy * dy);

        accumulated += segLen;

        while (accumulated >= stepSize) {
            const overshoot = accumulated - stepSize;
            const t = 1 - overshoot / segLen;
            result.push({ x: prev.x + dx * t, y: prev.y + dy * t });
            accumulated -= stepSize;
        }
    }

    result.push(path[path.length - 1]!);

    return result;
}

//Convert 2D points to 3D vectors pointing from the center of the pipe outwards to the OD
function svgPointsToGCodeCoords(paths: Point[][], pipeOD: number, axialOffset: number, rotationDeg: number): GCodeCoord[][] {
    const rotationRad = (rotationDeg * Math.PI) / 180;

    return paths.map((path) => {
        let prevAngle: number | undefined;

        return path.map((pt) => {
            let angle = -(pt.x / (pipeOD / 2)) + rotationRad;

            if (prevAngle !== undefined) {
                while (angle - prevAngle > Math.PI) angle -= 2 * Math.PI;
                while (angle - prevAngle < -Math.PI) angle += 2 * Math.PI;
            }
            prevAngle = angle;

            return {
                x: pt.y + axialOffset,
                y: Math.cos(angle),
                z: Math.sin(angle),
            };
        });
    });
}

function getPaths(doc: Document): string[] {
    return Array.from(doc.querySelectorAll("path"))
        .filter((p) => !p.closest("defs")) // ignore paths inside <defs>
        .map((p) => p.getAttribute("d"))
        .filter((d): d is string => !!d)
        .flatMap((d) => d.match(/[Mm][^Mm]*/g)?.map((s) => s.trim()) ?? []);
}

/**
 * @param svg             SVG document
 * @param xStart          Axial offset on the pipe (how far down the length of pipe to place cut)
 * @param svgScale        Change the size of the projection onto the pipe
 * @param rotation        Cut rotation around pipe circumference in degrees
 * @param svgRotation
 * @param samplingStepSize  How often we place a point along the SVG path
 */
export function generateGCode(svg: Document, xStart: number, svgScale: number, rotation: number, pipeOD: number, svgRotation: number = 0, samplingStepSize: number = 0.5): { gcode: string; gcodeCoords: GCodeCoord[][] } {
    const rawPaths = sampleSvgPaths(svg);

    const rotatedPaths = rotatePaths(rawPaths, svgRotation);

    const normalizedPaths = normalizePoints(rotatedPaths, svgScale);

    const resampledPaths = normalizedPaths.map((p) => resamplePath(p, samplingStepSize));

    const gcodeCoords = svgPointsToGCodeCoords(resampledPaths, pipeOD, xStart, rotation);

    const gcode = [
        "COMP_RIGHT",
        "",
        "LEADIN_ON",
        "",
        "TABS 0",
        "",
        "T_PLASMA",
        "",
        "SURF_OD",
        "",
        "F 40.00",
        "",
        "TUV 0.00, 0.00 //no torch tilt (bevel)",
        "",

        ...gcodeCoords.flatMap((cut, i) => {
            const first = cut[0]!;
            const coordToStr = (c: GCodeCoord) => `G01 ${c.x.toFixed(7)}, ${c.y.toFixed(7)}, ${c.z.toFixed(7)}`;

            return [
                // Travel to start of this cut (torch off)
                ...(i > 0
                    ? [
                        "TORCH_OFF",
                        "",
                        coordToStr(first), // move to start position
                        "",
                    ]
                    : []),
                "TORCH_ON",
                "",
                ...cut.map(coordToStr),
                "",
            ];
        }),
        "TORCH_OFF",
        "",
    ].join("\n");

    return { gcode, gcodeCoords };
}
