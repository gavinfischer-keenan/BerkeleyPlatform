/**
 * @file geo.js
 */
import { denseDepthLayer, superDenseDepthLayer, sparseDepthLayer } from './state.js';

export const ISLAND_POLYS = [
    // SF Peninsula + Marin coast
    [[38.10,-122.97],[38.00,-122.83],[37.92,-122.70],[37.87,-122.60],
     [37.83,-122.51],[37.81,-122.49],[37.80,-122.47],[37.79,-122.51],
     [37.77,-122.51],[37.75,-122.51],[37.73,-122.50],[37.71,-122.50],
     [37.65,-122.49],[37.60,-122.49],[37.55,-122.48],[37.50,-122.45],
     [37.45,-122.42],[37.40,-122.40],[37.40,-122.30],[37.45,-122.20],
     [37.50,-122.15],[37.55,-122.10],[37.60,-122.05],[37.65,-122.10],
     [37.70,-122.15],[37.75,-122.20],[37.80,-122.25],[37.85,-122.30],
     [37.87,-122.35],[37.82,-122.38],[37.80,-122.40],[37.82,-122.42],
     [37.85,-122.48],[37.90,-122.50],[37.95,-122.55],[38.00,-122.60],
     [38.05,-122.70],[38.10,-122.80]],
    // East Bay
    [[37.88,-122.35],[37.85,-122.30],[37.80,-122.28],[37.75,-122.25],
     [37.70,-122.20],[37.65,-122.15],[37.60,-122.12],[37.55,-122.10],
     [37.50,-122.08],[37.50,-122.15],[37.55,-122.20],[37.60,-122.25],
     [37.65,-122.28],[37.70,-122.30],[37.75,-122.32],[37.80,-122.33],
     [37.85,-122.34]],
];

export const ISLAND_OUTLINES = {
    'SF Peninsula': ISLAND_POLYS[0],
    'East Bay': ISLAND_POLYS[1],
};

export function pointInPoly(lat, lng, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const yi = poly[i][0], xi = poly[i][1];
        const yj = poly[j][0], xj = poly[j][1];
        const intersect = ((yi > lat) !== (yj > lat)) &&
            (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

export function isOnLand(lat, lng) {
    for (const poly of ISLAND_POLYS) if (pointInPoly(lat, lng, poly)) return true;
    return false;
}

export function _segKmSq(lat, lng, a, b) {
    const KX = 87.5, KY = 111;
    const px = lng * KX, py = lat * KY;
    const ax = a[1] * KX, ay = a[0] * KY;
    const bx = b[1] * KX, by = b[0] * KY;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-9;
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    const dx2 = px - cx, dy2 = py - cy;
    return dx2 * dx2 + dy2 * dy2;
}

export function distToShoreKm(lat, lng) {
    let minSq = Infinity;
    const poly = ISLAND_POLYS[0];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const dSq = _segKmSq(lat, lng, poly[j], poly[i]);
        if (dSq < minSq) minSq = dSq;
    }
    return Math.sqrt(minSq);
}

export function makeSeededRng(seed) {
    let s = seed >>> 0;
    return function() { s = Math.imul(1664525, s) + 1013904223 >>> 0; return s / 0xFFFFFFFF; };
}

export function generateBathymetryGrid(layer, latStart, latEnd, latStep, lngStart, lngEnd, lngStep, jLatFactor, jLngFactor, seed, getDepth, iconClass, iconSize, iconAnchor) {
    const rngGen = makeSeededRng(seed);
    for (let lat = latStart; lat <= latEnd; lat += latStep) {
        for (let lng = lngStart; lng <= lngEnd; lng += lngStep) {
            const jLat = lat + (rngGen() - 0.5) * jLatFactor;
            const jLng = lng + (rngGen() - 0.5) * jLngFactor;
            if (isOnLand(jLat, jLng)) continue;

            const kmOff = distToShoreKm(jLat, jLng);
            let depth = getDepth(kmOff);

            depth += (rngGen() - 0.5) * (depth * 0.20); 
            depth = Math.floor(Math.max(6, depth));
            
            const fm = Math.floor(depth / 6);
            const ft = Math.floor(depth % 6);
            const html = fm < 30 && ft > 0 ? `${fm}<sub>${ft}</sub>` : `${fm}`;

            const iconOpts = { className: iconClass, html: html, iconSize: iconSize };
            if (iconAnchor) iconOpts.iconAnchor = iconAnchor;

            L.marker([jLat, jLng], {
                pane: 'depthPane',
                icon: L.divIcon(iconOpts)
            }).addTo(layer);
        }
    }
}

export function getOffsetPolygon(poly, offsetRatio) {
    let clat = 0, clng = 0;
    for(let p of poly) { clat += p[0]; clng += p[1]; }
    clat /= poly.length; clng /= poly.length;
    return poly.map(p => {
        const dLat = p[0] - clat;
        const dLng = p[1] - clng;
        return [clat + dLat*(1+offsetRatio), clng + dLng*(1+offsetRatio)];
    });
}

const getDenseDepth = kmOff => {
    if (kmOff < 1) return 8 + kmOff * 40;
    if (kmOff < 5) return 48 + (kmOff - 1) * 60;
    if (kmOff < 15) return 288 + (kmOff - 5) * 80;
    if (kmOff < 40) return 1088 + (kmOff - 15) * 40;
    return 2088 + (kmOff - 40) * 100;
};
const getSuperDenseDepth = kmOff => {
    if (kmOff < 1) return 10 + kmOff * 80;
    if (kmOff < 3) return 90 + (kmOff - 1) * 350;
    if (kmOff < 8) return 790 + (kmOff - 3) * 350;
    if (kmOff < 20) return 2540 + (kmOff - 8) * 250;
    return 5540 + (kmOff - 20) * 150;
};

generateBathymetryGrid(denseDepthLayer, 37.60, 37.90, 0.022, -122.70, -122.35, 0.028, 0.010, 0.014, 0xC0FFEE99, getDenseDepth, 'depth-label depth-label-dense', [36, 14], null);
generateBathymetryGrid(superDenseDepthLayer, 37.78, 37.86, 0.005, -122.55, -122.38, 0.006, 0.002, 0.003, 0xBEEFCAFE, getSuperDenseDepth, 'depth-label depth-label-dense', [24, 14], [12, 7]);
generateBathymetryGrid(sparseDepthLayer, 37.25, 38.30, 0.15, -123.20, -121.70, 0.15, 0.05, 0.05, 0xDEADBEEF, getSuperDenseDepth, 'depth-label depth-label-dense', [24, 14], [12, 7]);
