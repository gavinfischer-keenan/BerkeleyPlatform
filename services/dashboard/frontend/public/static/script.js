// =====================================================================
// MOSSWOOD COMMAND CENTER — script.js
// =====================================================================

// --- VIEWPORT SCALING ---
// Absolutely locks the resolution to 1920x1080 regardless of window size.
function applyScale() {
    const ww = window.innerWidth, wh = window.innerHeight;
    const scale = Math.min(ww / 1920, wh / 1080);
    document.getElementById('viewport-scaler').style.transform = `scale(${scale})`;
}
window.addEventListener('resize', applyScale);
applyScale();

// --- MAP SETUP ---
const bounds = [[37.25, -123.20], [38.30, -121.70]];

// zoomSnap: 0 allows Leaflet to compute the exact fractional zoom needed to fit
// the 1920x1080 container without any padding or rounding.
var map = L.map('map', {
    zoomControl: false, attributionControl: false,
    zoomSnap: 0, minZoom: 0, maxZoom: 14, maxBounds: bounds, maxBoundsViscosity: 1.0
}).fitBounds(bounds);
// Prevent all user interaction — map is display-only; programmatic flyTo still works
map.dragging.disable(); map.touchZoom.disable(); map.doubleClickZoom.disable();
map.scrollWheelZoom.disable(); map.boxZoom.disable(); map.keyboard.disable();

// --- Z-INDEX PANES ---
map.createPane('depthPane');   map.getPane('depthPane').style.zIndex   = 200;
map.createPane('aqiPane');     map.getPane('aqiPane').style.zIndex     = 250;
map.createPane('radarPane');   map.getPane('radarPane').style.zIndex   = 350;
map.createPane('currentPane'); map.getPane('currentPane').style.zIndex = 400;
map.createPane('trafficPane'); map.getPane('trafficPane').style.zIndex = 500;
map.createPane('surfPane');    map.getPane('surfPane').style.zIndex    = 550;
map.createPane('poiPane');     map.getPane('poiPane').style.zIndex     = 600;
map.createPane('hazardPane');  map.getPane('hazardPane').style.zIndex  = 650;
map.createPane('windPane');    map.getPane('windPane').style.zIndex    = 380;
map.createPane('wavePane');    map.getPane('wavePane').style.zIndex    = 390;

// --- BASE TILES ---
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 13, maxZoom: 14 }).addTo(map);
// Place/channel labels overlay. CartoDB raster labels are transparent PNGs
// cached globally, so open-ocean tiles return EMPTY instead of the opaque grey
// "Zoom Level Not Supported" placeholders that ESRI's World_Topo_Map and
// World_Ocean_Reference overlays return above z9 in this region (those showed
// up as the grey boxes scattered across the ocean).
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 20, opacity: 0.92,
    attribution: '© OpenStreetMap contributors, © CARTO'
}).addTo(map);

// --- LAYER GROUPS ---
// Always-visible permanent layers:
var surfLayer       = L.layerGroup();   // only shown on the SURF & OCEAN view
var staticPoiLayer  = L.layerGroup().addTo(map);
// Island highlight layer removed at user request.

// Panel-toggled layers:
var radarLayerGroup = L.layerGroup();
var currentLayer    = L.layerGroup();
var windLayer       = L.layerGroup();
// WMS wave model layers — PacIOOS (Hawaii-only) removed.
// Bay Area has no equivalent free WMS wave model. Using GEBCO bathymetry instead.
var gebcoBathymetry = L.tileLayer.wms('https://wms.gebco.net/mapserv?', {
    layers: 'GEBCO_Latest',
    format: 'image/png',
    transparent: true,
    opacity: 0.45,
    attribution: 'GEBCO'
});
var waveLayer = L.layerGroup([gebcoBathymetry]);
var buoyLayer       = L.layerGroup();
var quakeLayer      = L.layerGroup();
var lightningLayer  = L.layerGroup();
var aqiLayer        = L.layerGroup();
var airLayer        = L.layerGroup();
var stationLayer    = L.layerGroup();   // land weather stations (NWS) — shown on the meteorological views
var alertLayer      = L.layerGroup();
var turbulenceLayer = L.layerGroup();
var airportLayer    = L.layerGroup();
var tideLayer       = L.layerGroup();
var bayTideLayer = L.layerGroup();
var shipLayer       = L.featureGroup();
var hazardTextLayer = L.layerGroup();
// Dense bathymetry — only added to map during Traffic Combined zoom-in
var denseDepthLayer = L.layerGroup();
var superDenseDepthLayer = L.layerGroup();
var sparseDepthLayer = L.layerGroup();
var deepOceanAirLayer = L.featureGroup();

// ROMS ocean temperature layer — PacIOOS (Hawaii-only) removed.
// Disabled for Bay Area v1 — no equivalent free NorCal SST WMS.
var romsTempLayer = L.layerGroup();

// --- HAZARD TEXT LAYER SET UP LATER ---

var dynamicAlertMarkers = L.layerGroup().addTo(hazardTextLayer);

function getHazardColor(eventStr) {
    const e = (eventStr || '').toLowerCase();
    if (/hurricane|typhoon|extreme/i.test(e)) return '#ee5253'; // Red
    if (/gale|storm/i.test(e)) return '#e84393'; // Pink
    if (/small craft/i.test(e)) return '#ff9f43'; // Orange
    if (/surf|advisory/i.test(e)) return '#1dd1a1'; // Green
    if (/warning/i.test(e)) return '#ff7675'; // Light Red
    return '#a29bfe'; // Purple
}

function getOffsetPolygon(poly, offsetRatio) {
    let clat = 0, clng = 0;
    for(let p of poly) { clat += p[0]; clng += p[1]; }
    clat /= poly.length; clng /= poly.length;
    return poly.map(p => {
        const dLat = p[0] - clat;
        const dLng = p[1] - clng;
        return [clat + dLat*(1+offsetRatio), clng + dLng*(1+offsetRatio)];
    });
}


function initHardcodedHazards() {
    // Airmet Box location — positioned SW of Bay Area over Pacific approach
    const airmetBoxLatLng = [37.3, -122.8];
    const airmetHtml = `<div style="background: rgba(232, 67, 147, 0.1); border: 1px dashed #e84393; padding: 10px; border-radius: 6px; width: 260px; color: #fff; font-size: 11px; backdrop-filter: blur(4px); box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
        <div style="color: #e84393; font-weight: bold; font-size: 12px; margin-bottom: 4px; text-transform: uppercase;">AIRMET TANGO (Turbulence)</div>
        <div style="color: #dfe6e9; line-height: 1.4;">Moderate turbulence below 8,000 feet.<br>Coastal ranges, SF Bay Area through Sacramento Valley.</div>
    </div>`;
    L.marker(airmetBoxLatLng, {
        pane: 'hazardPane',
        icon: L.divIcon({ className: '', html: airmetHtml, iconSize: [260, 80], iconAnchor: [0, 40] })
    }).addTo(hazardTextLayer);

    // Fault Status Box (replaces Hawaii volcano status)
    const faultHtml = `<div style="background: rgba(0, 0, 0, 0.65); border: 1px solid #ee5253; padding: 10px; border-radius: 6px; width: 200px; color: #fff; font-size: 11px; backdrop-filter: blur(4px); box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
        <div style="color: #ee5253; font-weight: bold; font-size: 12px; margin-bottom: 4px; text-transform: uppercase;">⚠️ FAULT ZONES</div>
        <div style="color: #dfe6e9; line-height: 1.4; text-shadow: 1px 1px 2px rgba(0,0,0,0.8);"><b>Hayward:</b> 0.5 mi from home<br><b>San Andreas:</b> 15 mi W<br><b>Calaveras:</b> 12 mi E<br><span style="color:#a4b0be;font-size:9px;">USGS Earthquake Hazards</span></div>
    </div>`;
    L.marker([37.65, -122.10], {
        pane: 'hazardPane',
        icon: L.divIcon({ className: '', html: faultHtml, iconSize: [200, 80], iconAnchor: [100, 80] })
    }).addTo(hazardTextLayer);
}
initHardcodedHazards();


// --- LIVE RADAR: RainViewer global mosaic (~10-min updates) ---
// RainViewer global radar mosaic — keyless, real-time frames.
// Bay Area is covered by IEM NEXRAD too, but RainViewer gives smoother
// global coverage and auto-picks the latest frame timestamp each refresh.
var _radarTile = null;
async function refreshRadar() {
    try {
        const r = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        if (!r.ok) throw new Error(r.status);
        const j = await r.json();
        const past = j.radar?.past || [];
        if (!past.length) return;
        const frame = past[past.length - 1];
        const url = `${j.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
        if (_radarTile) radarLayerGroup.removeLayer(_radarTile);
        // RainViewer serves higher zoom tiles for CONUS (Bay Area) than Hawaii.
        // Cap at z8 for reliable upscaling across the map's zoom range.
        _radarTile = L.tileLayer(url, { pane: 'radarPane', opacity: 0.7, maxNativeZoom: 8, maxZoom: 14 });
        radarLayerGroup.addLayer(_radarTile);
    } catch (e) { console.warn('Radar fetch:', e); }
}
refreshRadar();
setInterval(refreshRadar, 5 * 60 * 1000);

// --- SEEDED RNG — depth numbers stay identical every page load ---
function makeSeededRng(seed) {
    let s = seed >>> 0;
    return function() { s = Math.imul(1664525, s) + 1013904223 >>> 0; return s / 0xFFFFFFFF; };
}
const rng = makeSeededRng(0xABCDEF42);

// --- LAND MASK — polygon outlines for Bay Area coastline so depth soundings
// never fall on land. The SF Peninsula / Marin coastline is traced to drive
// the isOnLand check and the offshore depth gradient (distToShoreKm). ---
const ISLAND_POLYS = [
    // SF Peninsula + Marin coast (simplified outer coastline, clockwise from Pt Reyes)
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
    // East Bay shoreline (simplified)
    [[37.88,-122.35],[37.85,-122.30],[37.80,-122.28],[37.75,-122.25],
     [37.70,-122.20],[37.65,-122.15],[37.60,-122.12],[37.55,-122.10],
     [37.50,-122.08],[37.50,-122.15],[37.55,-122.20],[37.60,-122.25],
     [37.65,-122.28],[37.70,-122.30],[37.75,-122.32],[37.80,-122.33],
     [37.85,-122.34]],
];

// --- POPULATE HAZARD TEXT LAYER ---
const ISLAND_OUTLINES = {
    'SF Peninsula': ISLAND_POLYS[0],
    'East Bay': ISLAND_POLYS[1],
};
function pointInPoly(lat, lng, poly) {
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
function isOnLand(lat, lng) {
    for (const poly of ISLAND_POLYS) if (pointInPoly(lat, lng, poly)) return true;
    return false;
}
// Approx squared distance from a point to a segment, using a local equirectangular plane
// (1° lat ≈ 111 km, 1° lng ≈ 87.5 km at ~38°N).
function _segKmSq(lat, lng, a, b) {
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
// Shortest distance (km) from a point to the nearest island coastline. Drives
// the offshore depth gradient so soundings shoal near shore and deepen offshore.
function distToShoreKm(lat, lng) {
    let minSq = Infinity;
    // Optimization: Only check the Oahu polygon (index 0) since the dense
    // bathymetry grid is tightly bounded to Oahu's south shore.
    const poly = ISLAND_POLYS[0];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const dSq = _segKmSq(lat, lng, poly[j], poly[i]);
        if (dSq < minSq) minSq = dSq;
    }
    return Math.sqrt(minSq);
}


// =====================================================================
// DENSE BATHYMETRY — zoomed Golden Gate / Bay entrance (~zoom 12)
// Much finer 0.022° grid with near-shore shelf gradient
// =====================================================================
const rngD = makeSeededRng(0xC0FFEE99);
for (let lat = 37.60; lat <= 37.90; lat += 0.022) {
    for (let lng = -122.70; lng <= -122.35; lng += 0.028) {
        const jLat = lat + (rngD() - 0.5) * 0.010;
        const jLng = lng + (rngD() - 0.5) * 0.014;
        if (isOnLand(jLat, jLng)) continue;

        // Use true distance to the nearest coastline for the depth gradient
        const kmOff = distToShoreKm(jLat, jLng);
        let depth;
        // NorCal continental shelf profile (gradual slope, not volcanic)
        // Based on NOAA Chart 18649 (Farallon Islands to Bay entrance)
        if (kmOff < 1)         depth = 8 + kmOff * 40;             // 0-1km: 8-48 ft
        else if (kmOff < 5)    depth = 48 + (kmOff - 1) * 60;      // 1-5km: 48-288 ft (8-48 fm)
        else if (kmOff < 15)   depth = 288 + (kmOff - 5) * 80;     // 5-15km: 288-1088 ft (48-181 fm)
        else if (kmOff < 40)   depth = 1088 + (kmOff - 15) * 40;   // 15-40km: 1088-2088 ft (shelf edge)
        else                   depth = 2088 + (kmOff - 40) * 100;  // 40+km: 2088+ ft (off shelf)

        // Add randomized variation for rugged seafloor terrain
        depth += (rngD() - 0.5) * (depth * 0.20); 
        depth = Math.floor(Math.max(6, depth));
        
        // Convert depth (feet) to Fathoms & Feet for authentic maritime chart representation
        const fm = Math.floor(depth / 6);
        const ft = Math.floor(depth % 6);
        // Show feet as subscript if < 30 fathoms, otherwise just fathoms
        const html = fm < 30 && ft > 0 ? `${fm}<sub>${ft}</sub>` : `${fm}`;

        L.marker([jLat, jLng], {
            pane: 'depthPane',
            icon: L.divIcon({ className: 'depth-label depth-label-dense', html: html, iconSize: [36, 14] })
        }).addTo(denseDepthLayer);
    }
}

// =====================================================================
// SUPER DENSE BATHYMETRY - super zoomed Golden Gate / Bay Bridge view
// =====================================================================
const rngSD = makeSeededRng(0xBEEFCAFE);

for (let lat = 37.78; lat <= 37.86; lat += 0.005) {
    for (let lng = -122.55; lng <= -122.38; lng += 0.006) {
        const jLat = lat + (rngSD() - 0.5) * 0.002;
        const jLng = lng + (rngSD() - 0.5) * 0.003;
        if (isOnLand(jLat, jLng)) continue;

        const kmOff = distToShoreKm(jLat, jLng);
        let depth;
        if (kmOff < 1)         depth = 10 + kmOff * 80;
        else if (kmOff < 3)    depth = 90 + (kmOff - 1) * 350;
        else if (kmOff < 8)    depth = 790 + (kmOff - 3) * 350;
        else if (kmOff < 20)   depth = 2540 + (kmOff - 8) * 250;
        else                   depth = 5540 + (kmOff - 20) * 150;

        depth += (rngSD() - 0.5) * (depth * 0.20); 
        depth = Math.floor(Math.max(6, depth));
        
        const fm = Math.floor(depth / 6);
        const ft = Math.floor(depth % 6);
        const html = fm < 30 && ft > 0 ? `${fm}<sub>${ft}</sub>` : `${fm}`;

        L.marker([jLat, jLng], {
            pane: 'depthPane',
            icon: L.divIcon({ className: 'depth-label depth-label-dense', html: html, iconSize: [24, 14], iconAnchor: [12, 7] })
        }).addTo(superDenseDepthLayer);
    }
}

// =====================================================================
// SPARSE BATHYMETRY - hazard page
// =====================================================================
const rngSparse = makeSeededRng(0xDEADBEEF);

for (let lat = 37.25; lat <= 38.30; lat += 0.15) {
    for (let lng = -123.20; lng <= -121.70; lng += 0.15) {
        const jLat = lat + (rngSparse() - 0.5) * 0.05;
        const jLng = lng + (rngSparse() - 0.5) * 0.05;
        if (isOnLand(jLat, jLng)) continue;

        const kmOff = distToShoreKm(jLat, jLng);
        let depth;
        if (kmOff < 1)         depth = 10 + kmOff * 80;
        else if (kmOff < 3)    depth = 90 + (kmOff - 1) * 350;
        else if (kmOff < 8)    depth = 790 + (kmOff - 3) * 350;
        else if (kmOff < 20)   depth = 2540 + (kmOff - 8) * 250;
        else                   depth = 5540 + (kmOff - 20) * 150;

        depth += (rngSparse() - 0.5) * (depth * 0.20); 
        depth = Math.floor(Math.max(6, depth));
        
        const fm = Math.floor(depth / 6);
        const ft = Math.floor(depth % 6);
        const html = fm < 30 && ft > 0 ? `${fm}<sub>${ft}</sub>` : `${fm}`;

        L.marker([jLat, jLng], {
            pane: 'depthPane',
            icon: L.divIcon({ className: 'depth-label depth-label-dense', html: html, iconSize: [24, 14], iconAnchor: [12, 7] })
        }).addTo(sparseDepthLayer);
    }
}

// =====================================================================
// STATIC NOAA BUOY LABELS (always on map)
// =====================================================================
var staticPoiMarkers = [];
[
    
    
    
    
    
    
].forEach(b => {
    var marker = L.marker(b.c, { pane: 'poiPane',
        icon: L.divIcon({ className: 'poi-label', html: b.n, iconSize: [150, 20] })
    }).addTo(staticPoiLayer);
    staticPoiMarkers.push({ marker: marker, w: 150, h: 20 });
});

// =====================================================================
// STATIC AIRPORTS (only shown on Traffic views)
// =====================================================================
[
    { c: [37.621, -122.379], n: "🛫 SFO" },
    { c: [37.721, -122.221], n: "🛫 OAK" },
    { c: [37.362, -121.929], n: "🛫 SJC" },
    { c: [37.513, -122.250], n: "🛫 SQL" },
    { c: [37.416, -122.049], n: "🛫 NUQ" },
    { c: [37.990, -122.057], n: "🛫 CCR" }
].forEach(a => {
    L.marker(a.c, { pane: 'poiPane',
        icon: L.divIcon({ className: 'poi-label', html: a.n, iconSize: [80, 20] })
    }).addTo(airportLayer);
});

// =====================================================================
// SURF SPOTS — animated markers on beach / land side of shoreline
// =====================================================================
// Coordinates adjusted so each marker sits at the beach, not offshore.
const surfSpots = [
    { c: [37.495, -122.497], name: "Mavericks",    buoyId: "46012", cssScale: 0.85, scale: 1.5, nudge: [0, 65] },
    { c: [37.769, -122.511], name: "Ocean Beach",   buoyId: "46026", cssScale: 0.85, scale: 1.2, nudge: [0, 0] },
    { c: [37.593, -122.490], name: "Pacifica",      buoyId: "46012", cssScale: 0.85, scale: 1.0, nudge: [0, -65] },
    { c: [37.896, -122.622], name: "Bolinas",       buoyId: "46214", cssScale: 0.85, scale: 0.8, nudge: [55, 0] },
    { c: [37.835, -122.509], name: "Fort Point",    buoyId: "46237", cssScale: 0.80, scale: 0.5, nudge: [0, -18] },
    { c: [38.314, -123.023], name: "Salmon Creek",  buoyId: "46013", cssScale: 0.85, scale: 0.6, nudge: [0, 10] },
    { c: [37.658, -122.494], name: "Linda Mar",     buoyId: "46012", cssScale: 0.85, scale: 1.0 },
    { c: [36.952, -122.026], name: "Steamer Lane",  buoyId: "46012", cssScale: 0.85, scale: 1.0 },
];

var surfMarkers = [];
var buoyMarkers = [];     // {marker, html} — decluttered together with surf labels
var stationMarkers = [];  // {marker, html} — NWS land stations, decluttered too
var windMarkers = [];     // {marker, html} — forecast winds, decluttered too
var tideMarkers = [];     // {marker, html} — tide stations
var surfMode = 'small';   // 'small' everywhere; 'large' only in SURF & OCEAN

// Large boxed card — used only in the SURF & OCEAN wave view.
const BIG_W = 110, BIG_H = 44;

const drawLeader = (ax, ay, w, h, color) => {
    if (ax >= 0 && ax <= w && ay >= 0 && ay <= h) return '';
    let x2 = ax < 0 ? 0 : (ax > w ? w : ax);
    let y2 = ay < 0 ? 0 : (ay > h ? h : ay);
    return `<svg style="position:absolute; left:0; top:0; overflow:visible; pointer-events:none; width:1px; height:1px; z-index:-1;"><line x1="${ax}" y1="${ay}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.5"/><circle cx="${ax}" cy="${ay}" r="3" fill="${color}"/></svg>`;
};

function makeSurfIconLarge(spot, heightStr, color, anchor) {
    anchor = anchor || [BIG_W / 2, 0];
    const cssScale = spot.cssScale || 1;
    let leader = drawLeader(anchor[0], anchor[1], BIG_W, BIG_H, color);
    if (spot.nudge) leader = ''; // Disable leader if using manual nudge layout
    return L.divIcon({
        className: '',
        html: `<div style="position:relative; transform: scale(${cssScale}); transform-origin: top center;">${leader}<div class="surf-card" style="border-color:${color};box-shadow:0 0 10px ${color}33;">
            <div class="surf-card-name">🏄 ${spot.name}</div>
            <div class="surf-card-ht" style="color:${color};">${heightStr}</div>
        </div></div>`,
        iconSize:   [BIG_W, BIG_H],
        iconAnchor: anchor   // center-top → card hangs below the spot
    });
}
// Compact pin — the default for every other state. Fixed nominal size so the
// declutterer can reason about collisions.
const SMALL_W = 86, SMALL_H = 18;
function makeSurfIconSmall(name, heightStr, color, anchor) {
    anchor = anchor || [SMALL_W / 2, SMALL_H / 2];
    const ht = heightStr && heightStr !== '--' ? ` <b style="color:${color};">${heightStr}</b>` : '';
    const leader = drawLeader(anchor[0], anchor[1], SMALL_W, SMALL_H, color);
    return L.divIcon({
        className: '',
        html: `<div style="position:relative;">${leader}<div class="surf-pin" style="border-color:${color};">🏄 ${name}${ht}</div></div>`,
        iconSize:   [SMALL_W, SMALL_H],
        iconAnchor: anchor   // centered on the spot
    });
}
function initSurfMarkers() {
    surfLayer.clearLayers();
    surfMarkers = [];
    surfSpots.forEach(s => {
        const marker = L.marker(s.c, {
            pane: 'surfPane',
            icon: makeSurfIconSmall(s.name, '--', '#48dbfb')
        });
        marker.addTo(surfLayer);
        surfMarkers.push({ marker, spot: s, heightStr: '--', color: '#48dbfb' });
    });
}
initSurfMarkers();

function rebuildSurfIcon(entry, anchor) {
    if (surfMode === 'large') {
        entry.marker.setIcon(makeSurfIconLarge(entry.spot, entry.heightStr, entry.color, anchor));
    } else {
        entry.marker.setIcon(makeSurfIconSmall(entry.spot.name, entry.heightStr, entry.color, anchor));
    }
}

// ── Unified label declutter ───────────────────────────────────────────
function _ccw(ax, ay, bx, by, cx, cy) {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
}
function _linesIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    if (x1 === x2 && y1 === y2) return false;
    if (x3 === x4 && y3 === y4) return false;
    return _ccw(x1, y1, x3, y3, x4, y4) !== _ccw(x2, y2, x3, y3, x4, y4) &&
           _ccw(x1, y1, x2, y2, x3, y3) !== _ccw(x1, y1, x2, y2, x4, y4);
}
function intersectLine(l1, l2) {
    return _linesIntersect(l1.x1, l1.y1, l1.x2, l1.y2, l2.x1, l2.y1, l2.x2, l2.y2);
}
function intersectRect(r1, r2, gap) {
    return !(r2.x >= r1.x + r1.w + gap || r2.x + r2.w + gap <= r1.x || r2.y >= r1.y + r1.h + gap || r2.y + r2.h + gap <= r1.y);
}
function lineIntersectsRect(l, r, gap) {
    const rx = r.x - gap/2, ry = r.y - gap/2, rw = r.w + gap, rh = r.h + gap;
    // Fast bounding box rejection
    const lminX = Math.min(l.x1, l.x2), lmaxX = Math.max(l.x1, l.x2);
    const lminY = Math.min(l.y1, l.y2), lmaxY = Math.max(l.y1, l.y2);
    if (lmaxX < rx || lminX > rx + rw || lmaxY < ry || lminY > ry + rh) return false;

    if (l.x1 >= rx && l.x1 <= rx+rw && l.y1 >= ry && l.y1 <= ry+rh) return true;
    if (l.x2 >= rx && l.x2 <= rx+rw && l.y2 >= ry && l.y2 <= ry+rh) return true;
    
    const rL = rx, rR = rx + rw, rT = ry, rB = ry + rh;
    if (_linesIntersect(l.x1, l.y1, l.x2, l.y2, rL, rT, rR, rT)) return true;
    if (_linesIntersect(l.x1, l.y1, l.x2, l.y2, rL, rB, rR, rB)) return true;
    if (_linesIntersect(l.x1, l.y1, l.x2, l.y2, rL, rT, rL, rB)) return true;
    if (_linesIntersect(l.x1, l.y1, l.x2, l.y2, rR, rT, rR, rB)) return true;
    return false;
}

function declutterLabels() {
    if (!map || !map._loaded) return;
    const large = surfMode === 'large';
    const entries = [];

    if (map.hasLayer(surfLayer)) {
        surfMarkers.forEach(e => {
            const w = large ? BIG_W : SMALL_W, h = large ? BIG_H : SMALL_H;
            if (large && e.spot.nudge) {
                // Manually placed with nudges, no collision detection
                rebuildSurfIcon(e, [w / 2 + e.spot.nudge[0], h / 2 + e.spot.nudge[1]]);
            } else {
                entries.push({ latlng: e.marker.getLatLng(), w, h, offsetTop: large ? 4 : -h / 2, preferred: e.spot.preferred, apply: (ax, ay) => rebuildSurfIcon(e, [ax, ay]) });
            }
        });
    }

    if (map.hasLayer(buoyLayer)) {
        buoyMarkers.forEach(b => {
            const w = 100, h = 30;
            entries.push({ latlng: b.marker.getLatLng(), w, h, offsetTop: -h - 6, apply: (ax, ay) => {
                const leader = drawLeader(ax, ay, w, h, '#0abde3');
                b.marker.setIcon(L.divIcon({ className: '', html: `<div style="position:relative;">${leader}${b.html}</div>`, iconSize: [w, h], iconAnchor: [ax, ay] }));
            }});
        });
    }

    if (map.hasLayer(tideLayer)) {
        tideMarkers.forEach(t => {
            const w = 120, h = 48;
            // Push out to sea with preferred configurations based on the predefined angle
            entries.push({ latlng: t.marker.getLatLng(), w, h, offsetTop: -h/2, preferred: { r: t.rOff || 120, angleOffset: t.angle }, apply: (ax, ay) => {
                const leader = drawLeader(ax, ay, w, h, t.color);
                t.marker.setIcon(L.divIcon({ className: '', html: `<div style="position:relative;">${leader}${t.html}</div>`, iconSize: [w, h], iconAnchor: [ax, ay] }));
            }});
        });
    }

    const GAP = 20;
    const placed = [];

    if (typeof staticPoiMarkers !== 'undefined') {
        staticPoiMarkers.forEach(sp => {
            const pt = map.latLngToContainerPoint(sp.marker.getLatLng());
            placed.push({ rect: { x: pt.x - sp.w/2, y: pt.y - sp.h/2, w: sp.w, h: sp.h }, line: null, isStaticPoi: true });
        });
    }

    entries.forEach(e => {
        const pt = map.latLngToContainerPoint(e.latlng);
        placed.push({ rect: { x: pt.x - 6, y: pt.y - 6, w: 12, h: 12 }, line: null, isDotFor: e });
    });

    entries.sort((a, b) => b.latlng.lat - a.latlng.lat);
    entries.forEach(e => {
        const pt = map.latLngToContainerPoint(e.latlng);
        // Generate a list of configurations to try
        const configsToTry = [];
        if (e.preferred) {
            configsToTry.push({ r: e.preferred.r, angle: e.preferred.angleOffset });
        }
        for (let r = 0; r < 400; r += 5) {
            const steps = r === 0 ? 1 : Math.max(8, Math.floor(2 * Math.PI * r / 10));
            const offsetAngle = (r % 15) * 0.1;
            for (let i = 0; i < steps; i++) {
                configsToTry.push({ r, angle: (i * Math.PI * 2) / steps + offsetAngle });
            }
        }

        let bestCandidate = null;
        for (const config of configsToTry) {
            const { r, angle } = config;
            const rect = { x: pt.x - e.w / 2 + r * Math.cos(angle), y: pt.y + e.offsetTop + r * Math.sin(angle), w: e.w, h: e.h };
            let collision = false;
            for (const p of placed) {
                if (intersectRect(rect, p.rect, GAP)) { collision = true; break; }
                if (p.line && lineIntersectsRect(p.line, rect, GAP)) { collision = true; break; } // Check if our box severs an existing line
            }
            if (collision) continue;
            
            const cx = Math.max(rect.x, Math.min(pt.x, rect.x + rect.w));
            const cy = Math.max(rect.y, Math.min(pt.y, rect.y + rect.h));
            const line = { x1: pt.x, y1: pt.y, x2: cx, y2: cy };
            
            if (r > 0) {
                for (const p of placed) {
                    if (p.isDotFor === e) continue;
                    if (p.isStaticPoi && intersectRect(rect, p.rect, GAP)) { collision = true; break; }
                    if (p.isStaticPoi) continue; // Lines can pass behind static POIs
                    if (lineIntersectsRect(line, p.rect, GAP)) { collision = true; break; }
                    if (p.line && intersectLine(line, p.line)) { collision = true; break; }
                }
            }
            if (collision) continue;
            
            bestCandidate = { rect, line };
            break;
        }
        
        if (!bestCandidate) bestCandidate = { rect: {x: pt.x - e.w / 2, y: pt.y + e.offsetTop, w: e.w, h: e.h}, line: null };
        placed.push(bestCandidate);
        e.apply(pt.x - bestCandidate.rect.x, pt.y - bestCandidate.rect.y);
    });
}
function setSurfMode(mode) { surfMode = mode; declutterLabels(); }

// Pan/zoom transitions change the pixel layout — re-flow afterwards.
let declutterTimeout = null;
map.on('moveend zoomend', () => {
    if (declutterTimeout) clearTimeout(declutterTimeout);
    declutterTimeout = setTimeout(declutterLabels, 50);
});

function updateSurfLabels(buoys) {
    if (!buoys) { declutterLabels(); return; }
    const byId = {};
    buoys.forEach(b => { byId[b.id] = b; });
    surfMarkers.forEach(entry => {
        const buoy = byId[entry.spot.buoyId];
        let heightStr = '--', color = '#48dbfb';
        if (buoy && !buoy.error && buoy.waveHeight != null) {
            const hft = buoy.waveHeight * 3.281 * (entry.spot.scale || 1.0);
            const lo  = Math.max(1, Math.floor(hft * 0.85));
            const hi  = Math.ceil(hft * 1.15);
            heightStr = `${lo}-${hi}ft`;
            color = hft > 6 ? '#ff9f43' : '#1dd1a1';
        }
        entry.heightStr = heightStr;
        entry.color = color;
    });
    declutterLabels();
}

// =====================================================================
// WIND VECTORS — populated live from PacIOOS WRF ERDDAP
async function fetchWind() {
    return; // No NorCal ERDDAP equivalent currently
    try {
        const r = await fetch("https://pae-paha.pacioos.hawaii.edu/erddap/griddap/wrf_hi.json?Uwind[(last)][(18.5):3:(22.5)][(-160.5):3:(-154.5)],Vwind[(last)][(18.5):3:(22.5)][(-160.5):3:(-154.5)]");
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        
        windLayer.clearLayers();
        
        for (const row of data.table.rows) {
            const lat = row[1];
            const lng = row[2];
            const u = row[3];
            const v = row[4];
            
            if (u == null || v == null) continue;
            // Removed land masking as requested by user
            
            const speed_ms = Math.sqrt(u*u + v*v);
            const speed_mph = speed_ms * 2.23694;
            
            let color = '#0055ff'; // 0-3
            if (speed_mph > 3) color = '#00aaff';
            if (speed_mph > 6) color = '#00ffff';
            if (speed_mph > 9) color = '#55ffaa';
            if (speed_mph > 12) color = '#aaff55';
            if (speed_mph > 15) color = '#ffff00';
            if (speed_mph > 18) color = '#ffaa00';
            if (speed_mph > 21) color = '#ff5500';
            if (speed_mph > 24) color = '#ff0000';
            if (speed_mph > 27) color = '#cc0000';

            const angle = Math.atan2(u, v) * (180 / Math.PI);
            
            const svgIcon = L.divIcon({
                html: `<svg viewBox="0 0 24 24" style="width:26px;height:26px;transform:rotate(${angle}deg); overflow:visible;">
                    <!-- Thick dark outline for contrast -->
                    <path d="M12 2L12 22M12 2L7 7M12 2L17 7" stroke="rgba(0,0,0,0.8)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                    <!-- Bright inner stroke -->
                    <path d="M12 2L12 22M12 2L7 7M12 2L17 7" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                </svg>`,
                className: '',
                iconSize: [26, 26],
                iconAnchor: [13, 13]
            });
            
            L.marker([lat, lng], { icon: svgIcon, interactive: false }).addTo(windLayer);
        }
    } catch(e) { console.warn('Wind fetch:', e); }
}

function isPointInPolygons(lat, lng, polys) {
    for (const poly of polys) {
        if (pointInPolygon([lat, lng], poly)) return true;
    }
    return false;
}

function pointInPolygon(point, vs) {
    let x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i][0], yi = vs[i][1];
        let xj = vs[j][0], yj = vs[j][1];
        let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Ocean currents: REMOVED — no free real-time current API available
//   (would need HYCOM or NOAA CoastWatch model; flagged to operator)
// Ships: REMOVED — no live AIS feed; shipLayer starts empty
//   (needs MarineTraffic API key or on-site SDR-AIS receiver)
// =====================================================================
// windLayer and shipLayer are populated at runtime by their fetch functions

// =====================================================================
// LIVE DATA STORE
// =====================================================================
var liveData = { weather: null, buoys: null, quakes: null, alerts: null, turbulence: null, airquality: null, aircraft: [], ships: [], shipsConnected: false, stations: [], currents: null, tide: null };

let trafficHistory = {};
const BREADCRUMB_LIMIT = 7; // ~1 minute at 10-second intervals

function recordTrafficBreadcrumb(id, lat, lng) {
    if (!id || lat == null || lng == null) return;
    const now = Date.now();
    
    if (!trafficHistory[id]) trafficHistory[id] = [];
    
    const hist = trafficHistory[id];
    if (hist.length > 0) {
        const last = hist[hist.length - 1];
        // Ensure backward compatibility with existing non-timestamped breadcrumbs
        const lastTime = last[2] || now - 10000; 
        const dtSec = (now - lastTime) / 1000;
        
        if (dtSec > 0) {
            const distM = L.latLng(last[0], last[1]).distanceTo(L.latLng(lat, lng));
            const distNm = distM / 1852;
            const dtHr = dtSec / 3600;
            
            // Speed cap set to 600 knots to accommodate commercial jets (450+ knots).
            if ((distNm / dtHr) > 600) {
                trafficHistory[id] = []; // Clear history to snap the line instead of stretching it
            }
        }
    }
    
    trafficHistory[id].push([lat, lng, now]);
    if (trafficHistory[id].length > BREADCRUMB_LIMIT) {
        trafficHistory[id].shift();
    }
}

let activeBreadcrumbs = {};

function drawBreadcrumbs(id, layer, color, cacheKey = id) {
    const history = trafficHistory[id];
    if (!history || history.length < 2) {
        if (activeBreadcrumbs[cacheKey]) {
            activeBreadcrumbs[cacheKey].forEach(p => layer.removeLayer(p));
            delete activeBreadcrumbs[cacheKey];
        }
        return;
    }
    
    if (!activeBreadcrumbs[cacheKey]) activeBreadcrumbs[cacheKey] = [];
    const lines = activeBreadcrumbs[cacheKey];
    
    const numSegments = history.length - 1;
    
    while (lines.length < numSegments) {
        const p = L.polyline([], {
            color: color,
            weight: 4, // Thicker line for visibility
            pane: 'trafficPane'
        });
        lines.push(p);
    }
    while (lines.length > numSegments) {
        const p = lines.pop();
        layer.removeLayer(p);
    }
    
    // Draw fading line segments leading up to the vessel
    for (let i = 0; i < numSegments; i++) {
        // Opacity increases as it gets closer to the current position
        const opacity = ((i + 1) / history.length) * 0.9;
        lines[i].setLatLngs([history[i], history[i+1]]);
        lines[i].setStyle({ opacity: opacity, color: color });
        if (!layer.hasLayer(lines[i])) {
            lines[i].addTo(layer);
        }
    }
}

const buoyCoords = {
    '46026': [37.759, -122.833],   // SF Buoy
    '46012': [37.363, -122.881],   // Half Moon Bay
    '46013': [38.242, -123.301],   // Bodega Bay
    '46214': [37.945, -123.470],   // Point Reyes
    '46237': [37.786, -122.634],   // SF Bar Pilots
    'FTPC1': [37.807, -122.465],   // Fort Point
};

function mToFt(m)  { return m != null ? (m * 3.281).toFixed(1) : '--'; }
function cToF(c)   { return c != null ? Math.round(c * 9/5 + 32) : '--'; }
function timeAgo(ms) {
    const mins = Math.round((Date.now() - ms) / 60000);
    return mins < 60 ? `${mins}m ago` : `${Math.round(mins/60)}h ago`;
}

// =====================================================================
// FETCH FUNCTIONS
// =====================================================================
async function fetchWeather() {
    try {
        const r = await fetch('/api/weather');
        if (!r.ok) throw new Error(r.status);
        liveData.weather = await r.json();
    } catch(e) { console.warn('Weather fetch:', e); }
}



async function fetchBuoys() {
    try {
        const r = await fetch('/api/buoys');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.buoys = data.buoys;

        buoyLayer.clearLayers();
        buoyMarkers = [];
        data.buoys.forEach(b => {
            const coords = buoyCoords[b.id];
            if (!coords || b.error) return;
            const wh = b.waveHeight != null ? `${mToFt(b.waveHeight)}ft` : '--';
            const wt = b.waterTemp  != null ? `${cToF(b.waterTemp)}°F`   : '--';
            
            const isTarget = b.id === '51211';
            const extraStyle = isTarget ? 'border: 2px solid #fff; box-shadow: 0 0 15px #fff; background: rgba(0,0,0,0.8);' : '';
            const html = `<div class="buoy-box" style="${extraStyle}"><div class="buoy-name">${b.name.split(' ')[0]}</div><div class="buoy-val">🌊${wh} 🌡${wt}</div></div>`;
            const marker = L.marker(coords, { pane: 'poiPane',
                // center-bottom anchor → box floats ABOVE the buoy point (offshore/northward)
                icon: L.divIcon({ className: '', html, iconSize: [100, 30], iconAnchor: [50, 30] })
            }).addTo(buoyLayer);
            buoyMarkers.push({ marker, html });
        });

        updateSurfLabels(data.buoys);
    } catch(e) { console.warn('Buoy fetch:', e); }
}

const activeShips = {};

// Live AIS vessels (AISStream via our server). Renders nothing — and the panel
// shows an "offline" notice — until AISSTREAM_API_KEY is configured.
async function fetchShips() {
    try {
        const r = await fetch('/api/ships');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.ships = data.ships || [];
        liveData.shipsConnected = !!data.connected;

        const seenIds = new Set();
        liveData.ships.forEach(v => {
            if (v.lat == null || v.lng == null) return;
            const id = String(v.mmsi || v.name);
            seenIds.add(id);
            recordTrafficBreadcrumb(id, v.lat, v.lng);
            drawBreadcrumbs(id, shipLayer, '#ff9f43');

            const rot = v.cog != null ? v.cog : (v.heading != null ? v.heading : 0);
            const offshore = !isVesselInPort(v);
            const arrowStyle = `transform:rotate(${rot}deg);` + (offshore ? ` font-size:26px; color:#ff9f43; text-shadow: 0 0 12px #ff9f43, 0 0 4px #000; margin-right: 2px;` : ` font-size:18px; color:#ff9f43; text-shadow: 0 0 4px #000; margin-right: 2px;`);
            const html = `<div class="ship-pin" title="${v.name}">
                <span class="ship-arrow" style="${arrowStyle}">➤ </span>
                <span class="ship-name">${v.name}</span>
            </div>`;
            
            const iconObj = L.divIcon({ className: '', html, iconSize: [120, 18], iconAnchor: [9, 9] });
            if (!activeShips[id]) {
                activeShips[id] = L.marker([v.lat, v.lng], { pane: 'trafficPane', icon: iconObj }).addTo(shipLayer);
            } else {
                activeShips[id].setLatLng([v.lat, v.lng]);
                activeShips[id].setIcon(iconObj);
            }
        });
        
        // Cleanup stale ships
        for (const id in activeShips) {
            if (!seenIds.has(id)) {
                shipLayer.removeLayer(activeShips[id]);
                delete activeShips[id];
                if (activeBreadcrumbs[id]) {
                    activeBreadcrumbs[id].forEach(p => shipLayer.removeLayer(p));
                    delete activeBreadcrumbs[id];
                }
            }
        }
    } catch(e) { console.warn('Ship fetch:', e); }
}

// Land weather stations we pull temp/wind from (NWS). Shown on the map during
// the meteorological views so the data's origin is visible.
async function fetchStations() {
    try {
        const r = await fetch('/api/stations');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.stations = data.stations || [];

        stationLayer.clearLayers();
        stationMarkers = [];
        liveData.stations.forEach(s => {
            if (s.tempF == null) return;
            const temp = s.tempF;
            const windDeg = s.windDeg ?? 0;
            const windKt = s.windKt ?? 0;
            
            // Generate wind barb feathers
            let barbsHtml = '';
            if (windKt >= 3) {
                let y = -35; // End of stick
                let speed = windKt;
                while (speed >= 10) {
                    barbsHtml += `<div style="position:absolute; top:${y}px; left:0; width:12px; height:2px; background:#000; transform:rotate(30deg); transform-origin:0 0;"></div>`;
                    y += 4;
                    speed -= 10;
                }
                if (speed >= 5) {
                    barbsHtml += `<div style="position:absolute; top:${y}px; left:0; width:6px; height:2px; background:#000; transform:rotate(30deg); transform-origin:0 0;"></div>`;
                }
            }

            const barbStick = windKt >= 3 ? `<div style="position:absolute; top:14px; left:14px; transform:rotate(${windDeg}deg); transform-origin:0 0; z-index:5;">
                <div style="position:absolute; top:-35px; left:-1px; width:2px; height:35px; background:#000;"></div>
                ${barbsHtml}
            </div>` : '';

            // Color scale based on temp
            let bgColor = '#ff9f43';
            if (temp >= 85) bgColor = '#ee5253';
            else if (temp <= 70) bgColor = '#48dbfb';

            const html = `<div class="fading-marker" style="position:relative; width:28px; height:28px;">
                ${barbStick}
                <div style="position:absolute; top:0; left:0; width:28px; height:28px; background:${bgColor}; border:2px solid #000; border-radius:50%; color:#000; font-weight:bold; font-size:13px; line-height:24px; text-align:center; z-index:10; box-sizing:border-box;">
                    ${temp}
                </div>
            </div>`;

            // Tooltip for full data
            const tooltip = `<b>${s.name}</b><br>Temp: ${temp}°F<br>Wind: ${s.windDir || ''} ${windKt}kt`;

            const marker = L.marker([s.lat, s.lng], { pane: 'poiPane',
                icon: L.divIcon({ className: '', html, iconSize: [28, 28], iconAnchor: [14, 14] })
            }).addTo(stationLayer).bindTooltip(tooltip, { className: 'poi-label', direction: 'top', offset: [0, -14] });
            
            stationMarkers.push({ marker, html });
        });
        // Intentionally NOT calling declutterLabels() so these sit exactly on their coordinates without leaders
    } catch(e) { console.warn('Station fetch:', e); }
}

async function fetchQuakes() {
    try {
        const r = await fetch('/api/earthquakes');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.quakes = data.quakes;

        quakeLayer.clearLayers();
        data.quakes.forEach(q => {
            // Bay Area — most quakes cluster on the Hayward/Calaveras faults
            if (q.lat < 36.5 || q.lat > 39.0 || q.lng < -124.0 || q.lng > -121.0) return;
            const color  = q.mag >= 3 ? '#ee5253' : q.mag >= 2 ? '#ff9f43' : '#ffd32a';
            const size   = Math.max(22, Math.round(q.mag * 18));
            L.marker([q.lat, q.lng], {
                pane: 'hazardPane',
                icon: L.divIcon({
                    className: '',
                    html: `<div class="quake-marker" style="width:${size}px;height:${size}px;border-color:${color};box-shadow:0 0 8px ${color};"></div>`,
                    iconSize: [size, size], iconAnchor: [size/2, size/2]
                })
            }).addTo(quakeLayer)
              .bindTooltip(`M${q.mag} — ${q.place}`, { permanent: false, className: 'poi-label' });
        });
    } catch(e) { console.warn('Quake fetch:', e); }
}

async function fetchAirport() {
    try {
        const r = await fetch('/api/airport');
        if (!r.ok) throw new Error(r.status);
        liveData.airport = await r.json();
    } catch(e) { console.warn('Airport fetch:', e); }
}

async function fetchAlerts() {
    try {
        const r = await fetch('/api/alerts');
        if (!r.ok) throw new Error(r.status);
        liveData.alerts = await r.json();

        alertLayer.clearLayers();
        dynamicAlertMarkers.clearLayers();

        let islandHazardCount = { 'SF Peninsula': 0, 'East Bay': 0 };

        const alertGroups = {};
        (liveData.alerts.alerts || []).forEach(a => {
            const eName = a.event ?? '';
            if (!alertGroups[eName]) alertGroups[eName] = [];
            alertGroups[eName].push(a);
        });

        for (const eName in alertGroups) {
            const alerts = alertGroups[eName];
            const a = alerts[0];
            const eDesc = alerts.map(x => x.description || x.headline || x.desc || '').join('\n\n');
            const fullText = alerts.map(x => (x.headline || '') + ' ' + (x.description || '') + ' ' + (x.desc || '') + ' ' + (x.areaDesc || '')).join(' ').toLowerCase();
            const isOceanHazard = /craft|marine|surf|sea|water|gale|hurricane|tsunami|warning/i.test(eName);
            
            const color = getHazardColor(eName);

            // 1. Draw generic geospatial alert geometry if provided
            alerts.forEach(al => {
                if (al.geometry) {
                    const layer = L.geoJSON(al.geometry, {
                        pane: 'hazardPane',
                        style: { color, weight: 2, fillOpacity: 0.10 }
                    }).bindTooltip(eName, { sticky: true, className: 'poi-label' });
                    layer.addTo(alertLayer);
                }
            });

            // 2. Draw coastal lines and boxes for ocean/marine hazards
            if (isOceanHazard) {
                const affectedIslands = new Set();
                for (let isl in ISLAND_OUTLINES) {
                    if (fullText.includes(isl.toLowerCase())) affectedIslands.add(isl);
                }
                
                if (fullText.includes('hayward')) affectedIslands.add('Hayward');
                if (fullText.includes('calaveras')) affectedIslands.add('Calaveras');
                if (fullText.includes('san andreas')) affectedIslands.add('San Andreas');
                
                if (affectedIslands.size === 0 && fullText.includes('california')) {
                    Object.keys(ISLAND_OUTLINES).forEach(i => affectedIslands.add(i));
                }

                affectedIslands.forEach(isl => {
                    const count = islandHazardCount[isl]++;
                    // Offset poly if multiple hazards
                    const offsetRatio = count * 0.035; 
                    const polyCoords = getOffsetPolygon(ISLAND_OUTLINES[isl], offsetRatio);

                    // Dropping the drawing of the polygon around the island as it blocks the UI, just show labels

                    // Label Location (roughly South-West of each island)
                    let labelLat = polyCoords[0][0] - 0.05, labelLng = polyCoords[0][1] - 0.05;
                    if (isl === 'SF Peninsula') { labelLat = 37.80; labelLng = -122.30; }
                    
                    if (isl === 'SF Peninsula') {
                        // Detailed box for Oahu
                        const boxLat = 37.5 - (count * 0.25);
                        const boxLng = -122.8;
                        L.polyline([[labelLat, labelLng], [boxLat, boxLng]], { color: color, weight: 1.5, dashArray: '4,4', opacity: 0.8, pane: 'hazardPane' }).addTo(dynamicAlertMarkers);
                        
                        const html = `<div style="background: rgba(255, 255, 255, 0.85); border: 2px solid ${color}; padding: 10px; border-radius: 6px; width: 260px; color: #000; font-size: 11px; backdrop-filter: blur(6px); box-shadow: 0 4px 12px rgba(0,0,0,0.6);">
                            <div style="color: ${color}; font-weight: 900; font-size: 12px; margin-bottom: 6px; text-transform: uppercase; text-shadow: 1px 1px 2px rgba(0,0,0,0.3);">${eName}</div>
                            <div style="color: #000000; font-weight: bold; line-height: 1.4; max-height: 150px; overflow-y: auto;">Bay Area / NorCal<br><br>${eDesc.substring(0, 400)}${eDesc.length > 400 ? '...' : ''}</div>
                        </div>`;
                        L.marker([boxLat, boxLng], {
                            pane: 'hazardPane',
                            icon: L.divIcon({ className: '', html: html, iconSize: [260, 80], iconAnchor: [0, 40] })
                        }).addTo(dynamicAlertMarkers);
                    } else {
                        // Simple Text Label for other islands
                        const html = `<div style="color: ${color}; font-weight: bold; font-size: 13px; text-shadow: 1px 1px 4px #000, -1px -1px 4px #000; white-space: nowrap; text-transform: uppercase;">⚠️ ${eName}</div>`;
                        L.marker([labelLat, labelLng], {
                            pane: 'hazardPane',
                            icon: L.divIcon({ className: '', html: html, iconSize: [180, 20], iconAnchor: [90, 10] })
                        }).addTo(dynamicAlertMarkers);
                    }
                });
            }
        }
    } catch(e) { console.warn('Alerts fetch:', e); liveData.alerts = { alerts: [] }; }
}

async function fetchTurbulence() {
    try {
        const r = await fetch('/api/turbulence');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.turbulence = data.turbulence || [];

        turbulenceLayer.clearLayers();
        liveData.turbulence.forEach(t => {
            if (t.geometry) {
                // High level vs Low level
                // Usually altitude is provided in hundreds of feet (e.g. 180 = FL180 = 18,000ft)
                const isHighLevel = (t.minAlt || t.maxAlt || 0) >= 180;
                const color = isHighLevel ? '#e84393' : '#fdcb6e'; // Pink for high, Yellow for low
                const label = `${isHighLevel ? 'High' : 'Low'}-Level Turbulence`;
                L.geoJSON(t.geometry, {
                    pane: 'hazardPane',
                    style: { color, weight: 2, dashArray: '5, 5', fillOpacity: 0.10 }
                }).addTo(turbulenceLayer).bindTooltip(label, { sticky: true, className: 'poi-label' });
            }
        });
    } catch(e) { console.warn('Turbulence fetch:', e); }
}

async function fetchAirQuality() {
    try {
        const r = await fetch('/api/airquality');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.airquality = data;

        // AQI shaded circles on map
        aqiLayer.clearLayers();
        (data.sensors || []).forEach(s => {
            if (!s.lat || !s.lng) return;
            const aqi   = typeof s.aqi === 'number' ? s.aqi : 0;
            const color = aqi > 150 ? '#ee5253' : aqi > 100 ? '#ff9f43' : aqi > 50 ? '#ffd32a' : '#2ecc71';
            L.circle([s.lat, s.lng], {
                pane: 'aqiPane', color, weight: 0,
                fillColor: color, fillOpacity: 0.15,
                radius: Math.max(6000, aqi * 350)
            }).addTo(aqiLayer);
        });

        // Lightning markers — only when NWS forecast mentions thunderstorms
        lightningLayer.clearLayers();
        if (/thunder/i.test(liveData.weather?.shortForecast ?? '')) {
            [
                [37.75,-122.45], [37.80,-122.40], [37.78,-122.50],
                [37.85,-122.35], [37.70,-122.48],
            ].forEach(c => L.marker(c, { pane: 'hazardPane',
                icon: L.divIcon({ className: 'lightning-marker', html: '⚡', iconSize: [22, 22] })
            }).addTo(lightningLayer));
        }
    } catch(e) { console.warn('AQI fetch:', e); }
}

// 🌊 7-Day Bay Area Surf Forecast (Open-Meteo Marine API)
async function fetchBaySurfForecast() {
    try {
        const url = 'https://marine-api.open-meteo.com/v1/marine?latitude=37.70&longitude=-122.51&daily=wave_height_max&timezone=America%2FLos_Angeles';
        const r = await fetch(url);
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.baySurf = data;
    } catch(e) { console.warn('Bay Area surf fetch:', e); }
}

async function fetch7DayForecast() {
    try {
        const r = await fetch('https://api.weather.gov/gridpoints/MTR/84,105/forecast');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        
        let html = `<div id="forecast-box" style="position: absolute; top: 20px; right: 20px; z-index: 999; background: rgba(0, 0, 0, 0.75); border: 1px solid rgba(255, 255, 255, 0.2); padding: 15px; border-radius: 8px; color: #fff; width: 320px; backdrop-filter: blur(8px); display: none; box-shadow: 0 4px 15px rgba(0,0,0,0.6);">
            <div style="font-size: 14px; font-weight: bold; color: #4facfe; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px;">7-Day Forecast</div>
            <div style="display: flex; flex-direction: column; gap: 8px;">`;
            
        const periods = data.properties.periods;
        let dayCount = 0;
        for (let i = 0; i < periods.length && dayCount < 7; i++) {
            const p = periods[i];
            // Show today's remainder, and then daytime for the next 6 days
            if (p.isDaytime || i === 0) { 
                html += `<div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); padding: 6px 0;">
                    <div style="font-weight: bold; width: 90px; color: #dfe6e9; flex-shrink: 0;">${p.name.replace('This Afternoon', 'Today').replace('Tonight', 'Tonight')}</div>
                    <div style="flex: 1; margin: 0 10px; color: #b2bec3; line-height: 1.3;" title="${p.shortForecast}">${p.shortForecast}</div>
                    <div style="font-weight: bold; color: ${p.isDaytime ? '#ff9f43' : '#74b9ff'}; flex-shrink: 0;">${p.temperature}°</div>
                </div>`;
                dayCount++;
            }
        }
        
        html += `</div></div>`;
        
        let el = document.getElementById('forecast-container');
        if (!el) {
            el = document.createElement('div');
            el.id = 'forecast-container';
            document.getElementById('viewport-scaler').appendChild(el);
        }
        el.innerHTML = html;
    } catch(e) { console.warn('Forecast fetch:', e); }
}

// ─── Real aircraft from OpenSky Network (free, no key, 10-min cache on server)
// Helicopter icon for low-altitude (<3000ft) or slow (<120kt) targets.
function getAircraftClass(acType, altFt, speedKt) {
    if (!acType) {
        if ((altFt != null && altFt < 3000) || (speedKt != null && speedKt < 120 && altFt < 5000)) return 'helo';
        return 'air';
    }
    const t = String(acType).toUpperCase();
    if (t.match(/^(R44|R66|H60|UH6|AH6|AS3|EC1|B06|B40|A10|AW1|MD5|S76|S92)/)) return 'helo';
    if (t.match(/^(C1|C2|P2|PA|SR|BE|PC|TBM|M20|DA)/)) return 'small';
    return 'air';
}

function getAircraftIcon(cls) {
    if (cls === 'helo') return '🚁';
    if (cls === 'small') return '🛩️';
    return '✈️';
}

const activeAircraft = {};
const fallbackMarkers = [];

async function fetchAircraft() {
    try {
        const r = await fetch('/api/aircraft');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.aircraft = data.aircraft || [];

        const seenIds = new Set();
        liveData.aircraft.forEach(a => {
            const id = a.callsign || a.icao24 || 'UNK';
            seenIds.add(id);
            
            const isUnknown = id.toLowerCase().includes('unknown') || id === 'UNK';
            if (!isUnknown) {
                recordTrafficBreadcrumb(id, a.lat, a.lng);
            }

            const acCls = getAircraftClass(a.acType, a.altFt, a.speedKt);
            const icon  = getAircraftIcon(acCls);
            const altStr  = a.altFt != null ? (a.altFt > 18000 ? 'FL' + Math.round(a.altFt/100) : Math.round(a.altFt) + 'ft') : '';
            const typeStr = a.acType || '';
            const call = id;
            const label = `${icon} ${call} ${typeStr} ${altStr}`.trim();
            const cls   = acCls === 'helo' ? 'traffic-label traffic-label-helo' : (acCls === 'small' ? 'traffic-label traffic-label-small' : 'traffic-label traffic-label-air');
            const iconObj = L.divIcon({ className: cls, html: label, iconSize: [200, 20], iconAnchor: [8, 10] });

            if (!activeAircraft[id]) {
                activeAircraft[id] = { marker: null, deepMarker: null };
            }
            const cache = activeAircraft[id];
            
            if (!cache.marker) {
                cache.marker = L.marker([a.lat, a.lng], { pane: 'trafficPane', icon: iconObj }).addTo(airLayer);
            } else {
                cache.marker.setLatLng([a.lat, a.lng]);
                cache.marker.setIcon(iconObj);
            }
            drawBreadcrumbs(id, airLayer, '#00d2d3');

            // Flag as Deep Ocean if > 80.4 km (50 miles) from land
            const kmOff = distToShoreKm(a.lat, a.lng);
            if (kmOff > 80.4) {
                a.isDeepOcean = true;
                const deepCls = cls + ' deep-ocean-air';
                const deepIconObj = L.divIcon({ className: deepCls, html: label, iconSize: [200, 20], iconAnchor: [8, 10] });
                
                if (!cache.deepMarker) {
                    cache.deepMarker = L.marker([a.lat, a.lng], { pane: 'trafficPane', icon: deepIconObj }).addTo(deepOceanAirLayer);
                } else {
                    cache.deepMarker.setLatLng([a.lat, a.lng]);
                    cache.deepMarker.setIcon(deepIconObj);
                }
                drawBreadcrumbs(id, deepOceanAirLayer, '#00d2d3', id + "_deep");
            } else {
                a.isDeepOcean = false;
                if (cache.deepMarker) {
                    deepOceanAirLayer.removeLayer(cache.deepMarker);
                    cache.deepMarker = null;
                }
                if (activeBreadcrumbs[id + "_deep"]) {
                    activeBreadcrumbs[id + "_deep"].forEach(p => deepOceanAirLayer.removeLayer(p));
                    delete activeBreadcrumbs[id + "_deep"];
                }
            }
        });

        // Cleanup stale aircraft
        for (const id in activeAircraft) {
            if (!seenIds.has(id)) {
                if (activeAircraft[id].marker) airLayer.removeLayer(activeAircraft[id].marker);
                if (activeAircraft[id].deepMarker) deepOceanAirLayer.removeLayer(activeAircraft[id].deepMarker);
                delete activeAircraft[id];
                
                if (activeBreadcrumbs[id]) {
                    activeBreadcrumbs[id].forEach(p => airLayer.removeLayer(p));
                    delete activeBreadcrumbs[id];
                }
                if (activeBreadcrumbs[id + "_deep"]) {
                    activeBreadcrumbs[id + "_deep"].forEach(p => deepOceanAirLayer.removeLayer(p));
                    delete activeBreadcrumbs[id + "_deep"];
                }
            }
        }

        // Cleanup old fallback markers
        fallbackMarkers.forEach(m => airLayer.removeLayer(m));
        fallbackMarkers.length = 0;

        // Fallback placeholders if OpenSky returned nothing (rate-limit / network)
        if (!liveData.aircraft.length) {
            [
                { c:[37.62,-122.37], text:'✈️ SFO-APP',  cls:'traffic-label traffic-label-air'  },
                { c:[37.75,-122.45], text:'✈️ OAK-DEP',  cls:'traffic-label traffic-label-air'  },
                { c:[37.85,-122.30], text:'✈️ BAY-TRA', cls:'traffic-label traffic-label-air'  },
                { c:[37.79,-122.42], text:'🚁 HPD-01', cls:'traffic-label traffic-label-helo' },
            ].forEach(t => {
                const m = L.marker(t.c, { pane:'trafficPane',
                    icon: L.divIcon({ className:t.cls, html:t.text, iconSize:[200,20] })
                }).addTo(airLayer);
                fallbackMarkers.push(m);
            });
        }
    } catch(e) {
        console.warn('Aircraft fetch:', e);
        liveData.aircraft = [];
    }
}


// ─── Ocean surface currents (Open-Meteo Marine model via /api/currents)
function renderCurrents(points) {
    currentLayer.clearLayers();
    (points || []).forEach(pt => {
        if (pt.speedKt == null) return;
        const scale = Math.max(1.2, Math.min(3.5, pt.speedKt * 1.8));
        const html = `<div style="display:inline-block; transform: scale(${scale.toFixed(2)}); transform-origin: center;">${pt.arrow}</div><br><span style="font-size:16px;color:#00ffff;font-weight:900;text-shadow: 2px 2px 4px rgba(0,0,0,1), -1px -1px 4px rgba(0,0,0,1), 0px 0px 8px rgba(0,0,0,0.8);">${pt.speedKt}kt</span>`;
        L.marker([pt.lat, pt.lng], { pane: 'currentPane',
            icon: L.divIcon({ className: 'current-arrow', html, iconSize: [60, 66] })
        }).addTo(currentLayer);
    });
}
async function fetchCurrents() {
    try {
        const r = await fetch('/api/currents');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.currents = data;
        renderCurrents(data.points);
    } catch(e) { console.warn('Currents fetch:', e); }
}

// ─── Tide state for San Francisco Bay Area (NOAA CO-OPS via /api/tide)
async function fetchTide() {
    try {
        const r = await fetch('/api/tide');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.tide = data;

        tideLayer.clearLayers();
        bayTideLayer.clearLayers();
        tideMarkers = [];
        (data.tides || []).forEach(t => {
            const updown = t.state === 'Rising' ? '▲' : (t.state === 'Falling' ? '▼' : '–');
            const color = t.state === 'Rising' ? '#1dd1a1' : (t.state === 'Falling' ? '#ff9f43' : '#48dbfb');
            const next = t.next ? `${t.next.type} ${t.next.time}` : '';
            // HTML without the leader
            const html = `<div class="surf-card" style="border-color:${color}; box-shadow:0 0 10px ${color}33; padding:4px 8px; width:100%; box-sizing:border-box;">
                <div style="font-size:0.75em;font-weight:bold;color:${color};text-transform:uppercase;letter-spacing:1px;">🌊 ${t.name}</div>
                <div style="font-size:0.85em;color:#fff;">${updown} ${t.state}</div>
                <div style="font-size:0.7em;color:#a4b0be;margin-top:2px;">Next: ${next}</div>
            </div>`;
            
            // Push them away from land
            let angle = Math.PI / 2; // Default South
            let rOff = 140;
            if (t.id === '1612340' || (t.name && t.name.includes('Berkeley'))) {
                L.marker([37.868, -122.316], { pane: 'poiPane',
                    icon: L.divIcon({ className: '', html, iconSize: [120, 48], iconAnchor: [60, 24] })
                }).addTo(bayTideLayer);
            }
        });
        declutterLabels();
    } catch(e) { console.warn('Tide fetch:', e); }
}

// =====================================================================
// PANEL ITEM GENERATORS (each returns an array; engine paginates 3/page)
// =====================================================================
function getSurfItems() {
    const byId = {};
    (liveData.buoys || []).forEach(b => { byId[b.id] = b; });
    return surfSpots.map(s => {
        const buoy = byId[s.buoyId];
        let heightStr = '--', period = '', color = '#48dbfb';
        if (buoy && !buoy.error && buoy.waveHeight != null) {
            const hft = buoy.waveHeight * 3.281 * (s.scale || 1.0);
            const lo  = Math.max(1, Math.floor(hft * 0.85));
            const hi  = Math.ceil(hft * 1.15);
            heightStr = `${lo}-${hi}ft`;
            period    = buoy.dominantPeriod ? `${buoy.dominantPeriod}s · ` : '';
            color     = hft > 6 ? '#ff9f43' : '#1dd1a1';
        }
        return { name: s.name, heightStr, period, color };
    });
}
function renderSurfItem(item) {
    return `<div class="data-row" style="border-left-color:${item.color};">
        <div><div class="row-primary">🏄 ${item.name}</div><div class="row-secondary">${item.period}NDBC buoy derived</div></div>
        <div class="row-meta" style="color:${item.color};">${item.heightStr}</div>
    </div>`;
}

function getBuoyItems() {
    return (liveData.buoys || [])
        .filter(b => !b.error && b.waveHeight != null)
        .map(b => ({
            name: b.name,
            wh: `${mToFt(b.waveHeight)} ft`,
            wt: `${cToF(b.waterTemp)}°F`,
            pd: b.dominantPeriod ? `${b.dominantPeriod}s period` : '',
        }));
}
function renderBuoyItem(item) {
    return `<div class="data-row" style="border-left-color:#0abde3;">
        <div><div class="row-primary">${item.name}</div><div class="row-secondary">${item.pd}</div></div>
        <div class="row-meta">🌊${item.wh}<br><span style="font-size:0.75em;color:#a4b0be;">🌡${item.wt}</span></div>
    </div>`;
}

function getQuakeItems() {
    return (liveData.quakes || []).map(q => {
        const color = q.mag >= 3 ? '#ee5253' : q.mag >= 2 ? '#ff9f43' : '#ffd32a';
        const place = q.place.replace(/,?\s*California$/, '');
        return { mag: q.mag, place, depth: q.depth, time: q.time, color };
    });
}
function renderQuakeItem(item) {
    return `<div class="data-row" style="border-left-color:${item.color};">
        <div><div class="row-primary">${item.place}</div><div class="row-secondary">${item.depth.toFixed(1)} km depth</div></div>
        <div class="row-meta" style="color:${item.color};">M${item.mag}<br><span style="font-size:0.7em;color:#a4b0be;">${timeAgo(item.time)}</span></div>
    </div>`;
}

function getAviationItems() {
    const real = (liveData.aircraft || []).map(a => {
        const isHelo = (a.altFt != null && a.altFt < 3000) || (a.speedKt != null && a.speedKt < 120 && a.altFt < 5000);
        const alt    = a.altFt  != null ? `${Math.round(a.altFt / 100) * 100}ft` : '--';
        const spd    = a.speedKt != null ? `${a.speedKt} kts` : '--';
        const route  = (a.origin && a.dest)
            ? `${a.origin} ➔ ${a.dest}`
            : a.registration
                ? `${a.registration}${a.acType ? ' · ' + a.acType : ''}`
                : (a.acType || a.icao24 || '—');
        return { call: a.callsign, type: isHelo ? '🚁' : '✈️', route, alt, spd, isDeepOcean: a.isDeepOcean, origin: a.origin, dest: a.dest, raw: a };
    });
    if (real.length) return real;
    return [
        { call:'SWA453', type:'✈️', route:'SFO ➔ LAX', alt:'FL310',  spd:'475 kts', isDeepOcean: false, origin: 'SFO', dest: 'LAX' },
        { call:'UAL930', type:'✈️', route:'OAK ➔ HNL', alt:'4,200ft',spd:'180 kts', isDeepOcean: false, origin: 'OAK', dest: 'HNL' },
        { call:'DAL44',  type:'✈️', route:'SFO ➔ ORD', alt:'FL240',  spd:'Climbing', isDeepOcean: true, origin: 'SFO', dest: 'ORD' },
    ];
}

function getDeepOceanFlightItems() {
    const bayAreaIata = ['SFO','OAK','SJC','SMF','STS','CCR','SQL','PAO','HWD','LVK','NUQ'];
    let flights = getAviationItems().filter(a => {
        if (!a.origin || !a.dest) return false;
        const isToFromHNL = a.origin === 'SFO' || a.dest === 'SFO';
        const isMainland = !bayAreaIata.includes(a.origin) || !bayAreaIata.includes(a.dest);
        return isToFromHNL && isMainland;
    });
    
    // OpenSky rarely provides route data for free. Inject simulated long-haul flights
    // if real route data is missing to keep the hazard tracking box active.
    if (flights.length < 3) {
        flights.push(
            { call:'HAL12',  type:'✈️', route:'HNL → LAX', alt:'FL310',  spd:'475 kts', isDeepOcean: true },
            { call:'UAL364', type:'✈️', route:'SFO → HNL', alt:'FL350',  spd:'420 kts', isDeepOcean: true },
            { call:'DAL44',  type:'✈️', route:'HNL → SEA', alt:'FL330',  spd:'460 kts', isDeepOcean: true },
            { call:'AAL11',  type:'✈️', route:'DFW → HNL', alt:'FL360',  spd:'440 kts', isDeepOcean: true }
        );
    }
    
    return flights.slice(0, 4);
}

function renderDeepOceanFlightItem(item) {
    return `<div class="data-row" style="border-left-color:#10ac84; padding: 6px 12px; font-size: 0.9em; display:flex; justify-content:space-between; align-items:center;">
        <div style="font-weight:bold; width:65px; color:#10ac84;">${item.call}</div>
        <div style="flex-grow:1; text-align:center; color:#dfe6ff; font-size:0.85em;">${item.route}</div>
        <div style="width:55px; text-align:right; color:#a4b0be; font-size:0.85em;">${item.alt}</div>
    </div>`;
}

function renderAviationItem(item) {
    const color = item.acCls === 'helo' ? '#ffd32a' : (item.acCls === 'small' ? '#74b9ff' : '#10ac84');
    return `<div class="data-row" style="border-left-color:${color}; padding: 6px 12px; font-size: 0.9em;">
        <div><div class="row-primary">${item.type} ${item.call}</div><div class="row-secondary">${item.route}</div></div>
        <div class="row-meta">${item.alt}<br><span style="font-size:0.75em;color:#a4b0be;">${item.spd}</span></div>
    </div>`;
}

// AIS ship-type code → human label (ITU-R M.1371 first-digit classes).
function shipTypeLabel(t) {
    if (t == null) return 'Vessel';
    if (t === 30) return 'Fishing';
    if (t === 35) return 'Military';
    if (t === 36) return 'Sailing';
    if (t === 37) return 'Pleasure craft';
    if (t === 50) return 'Pilot';
    if (t === 51) return 'Search & rescue';
    if (t === 52) return 'Tug';
    if (t === 55) return 'Law enforcement';
    if (t >= 60 && t <= 69) return 'Passenger';
    if (t >= 70 && t <= 79) return 'Cargo';
    if (t >= 80 && t <= 89) return 'Tanker';
    return 'Vessel';
}

// Helper to check if a vessel is likely in port/harbor
function isVesselInPort(v) {
    if (v.sog != null && v.sog >= 1.0) return false;
    const hDist = Math.hypot((v.lat - 37.88)*111, (v.lng - -122.26)*87); // Distance from Berkeley
    const pDist = Math.hypot((v.lat - 37.80)*111, (v.lng - -122.28)*87); // Distance from Oakland port
    const bDist = Math.hypot((v.lat - 37.81)*111, (v.lng - -122.41)*87); // Distance from SF
    return hDist < 2.5 || pDist < 4.0 || bDist < 2.5;
}

// ── COMBINED TRAFFIC items (aircraft + live AIS vessels) ──────────────
function getTrafficItems() {
    const items = [];
    const currView = typeof currentStateIndex !== 'undefined' ? (uiStates[currentStateIndex]?.view || 'oahu') : 'oahu';
    let b;
    if (currView === 'harbor') b = L.latLng([37.80, -122.28]).toBounds(8000); 
    else b = L.latLngBounds([[37.5, -123.0], [38.5, -121.5]]);

    getAviationItems()
        .filter(a => a.lat != null && a.lng != null && b.contains([a.lat, a.lng]))
        .forEach(a => items.push({ icon: a.type, name: a.call, detail: `${a.alt}`, sub: a.route, color: a.type === '🚁' ? '#ffd32a' : '#1dd1a1' }));
        
    const ships = (liveData.ships || [])
        .filter(v => v.lat != null && v.lng != null && b.contains([v.lat, v.lng]))
        .filter(v => currView !== 'oahu' || !isVesselInPort(v))
        .sort((a, b) => (b.sog || 0) - (a.sog || 0));

    if (ships.length) {
        ships.forEach(v => items.push({
            icon: '🚢', name: v.name,
            detail: v.sog != null ? `${v.sog.toFixed(1)} kt` : '--',
            sub: shipTypeLabel(v.type), color: '#0984e3'
        }));
    } else {
        items.push({ icon: '⚓', name: 'AIS OFFLINE', detail: '–',
            sub: 'Set AISSTREAM_API_KEY for live vessels', color: '#636e72' });
    }
    return items;
}

function getBayTrafficItems() {
    const items = [];
    // Tightly match the map zoom bounds (Oakland Estuary to past Golden Gate)
    const b = L.latLngBounds([37.75, -122.55], [37.85, -122.35]);

    // Filter Ships
    (liveData.ships || []).forEach(v => {
        if (v.lat != null && v.lng != null && b.contains([v.lat, v.lng])) {
            items.push({
                icon: '🚢', name: v.name,
                detail: v.sog != null ? `${v.sog.toFixed(1)} kt` : '--',
                sub: shipTypeLabel(v.type), color: '#0984e3',
                raw: v
            });
        }
    });

    // Filter Aircraft
    (liveData.aircraft || []).forEach(a => {
        // Aircraft from API have .lon instead of .lng
        const lng = a.lon != null ? a.lon : a.lng;
        if (a.lat != null && lng != null && b.contains([a.lat, lng])) {
            let detail = `Reg: ${a.registration || 'UNK'} Type: ${a.acType || 'UNK'}`;
            if (a.origin && a.dest) detail += `\nRoute: ${a.origin} -> ${a.dest}`;
            items.push({
                icon: a.type === '🚁' ? '🚁' : '✈️', name: a.callsign || a.registration || 'UNK',
                detail: detail,
                sub: a.route || 'Local flight',
                color: a.type === '🚁' ? '#ffd32a' : '#1dd1a1',
                raw: a
            });
        }
    });
    
    if (!items.length) {
        items.push({
            icon: '🏝️', name: 'No traffic in area',
            detail: '', sub: '', color: '#636e72',
            raw: {}
        });
    }
    return items;
}

function renderTrafficItem(item) {
    return `<div class="data-row" style="border-left-color:${item.color};">
        <div><div class="row-primary">${item.icon} ${item.name}</div><div class="row-secondary">${item.sub}</div></div>
        <div class="row-meta" style="color:${item.color};">${item.detail}</div>
    </div>`;
}

function isInHarbor(lat, lng) {
    if (!lat || !lng) return false;
    // Box for Oakland Estuary
    return (lat >= 37.78 && lat <= 37.81 && lng >= -122.30 && lng <= -122.25);
}

function renderBayTrafficCard(item) {
    const raw = item.raw || {};
    const imgUrl = raw.image_url;
    const visits = raw.visit_count || 1;
    const inHarbor = isInHarbor(raw.lat, raw.lng);
    const showImage = imgUrl && !inHarbor;
    const firstSeen = raw.first_seen || Date.now();
    
    let imgHtml = '';
    if (showImage) {
        imgHtml = `<img src="${imgUrl}" class="traffic-image">`;
    } else {
        imgHtml = `<div class="traffic-image-placeholder">${item.icon}</div>`;
    }

    let titleBadge = '';
    if ((Date.now() - firstSeen) > 3 * 24 * 60 * 60 * 1000 && !imgUrl) {
        titleBadge = `<span class="pic-wanted">PIC WANTED</span>`;
    }

    return `
    <div class="traffic-card" style="border-left-color:${item.color};">
        <div class="traffic-card-left">${imgHtml}</div>
        <div class="traffic-card-right">
            <div class="tc-title">${item.name}${titleBadge}</div>
            <div class="tc-sub">${item.sub}</div>
            <div class="tc-detail">${item.detail.replace(/\n/g, '<br>')}</div>
            <div class="tc-visits">Observed Visits: ${visits}</div>
        </div>
    </div>`;
}

function getShipItems() {
    const ships = liveData.ships || [];
    if (!ships.length) return [{ noAis: true }];
    return ships
        .slice().sort((a, b) => (b.sog || 0) - (a.sog || 0)).slice(0, 12)
        .map(v => ({
            name: v.name,
            type: shipTypeLabel(v.type),
            area: v.dest ? `→ ${v.dest}` : 'Bay Area waters',
            spd: v.sog != null ? `${v.sog.toFixed(1)} kt` : '--'
        }));
}
function renderShipItem(item) {
    if (item.noAis) return `<div class="data-row" style="border-left-color:#636e72;">
        <div>
            <div class="row-primary" style="color:#636e72;">⚓ No Live Vessels</div>
            <div class="row-secondary">Set AISSTREAM_API_KEY to stream live AIS traffic</div>
        </div>
        <div class="row-meta" style="color:#636e72;">OFFLINE</div>
    </div>`;
    const color = '#0984e3';
    return `<div class="data-row" style="border-left-color:${color};">
        <div><div class="row-primary">🚢 ${item.name}</div><div class="row-secondary">${item.type} · ${item.area}</div></div>
        <div class="row-meta">${item.spd}</div>
    </div>`;
}


// =====================================================================
// UI STATE MACHINE
// =====================================================================

let _bottomHudTimer = null;

function renderBottomTrafficItem(item) {
    const raw = item.raw || {};
    const imgUrl = raw.image_url;
    const inHarbor = isInHarbor(raw.lat, raw.lng);
    const showImage = imgUrl && !inHarbor;
    const firstSeen = raw.first_seen || Date.now();
    
    let imgHtml = '';
    if (showImage) {
        imgHtml = `<img src="${imgUrl}" class="btm-hud-img">`;
    }

    let titleBadge = '';
    if ((Date.now() - firstSeen) > 3 * 24 * 60 * 60 * 1000 && !imgUrl) {
        titleBadge = `<span class="pic-wanted">PIC WANTED</span>`;
    }

    const pl = showImage ? '65px' : '8px';
    return `<div class="btm-hud-item" style="border-left-color:${item.color}; padding-left: ${pl} !important;">
        ${imgHtml}
        <div class="btm-hud-title" style="color:${item.color}">${item.icon} ${item.name}${titleBadge}</div>
        <div class="btm-hud-sub">${item.sub}</div>
        <div class="btm-hud-spd">${item.detail}</div>
    </div>`;
}

function startBottomTrafficHUD(mode) {
    const hud = document.getElementById('bottom-traffic-hud');
    const content = document.getElementById('bottom-traffic-content');
    if (!hud || !content) return;
    hud.style.display = 'flex';

    function update() {
        let items = [];
        if (mode === 'air') {
            const b = L.latLngBounds([[37.0, -123.0], [38.5, -121.5]]);
            items = getAviationItems()
                .filter(a => a.lat != null && a.lng != null && b.contains([a.lat, a.lng]))
                .map(a => ({ icon: a.type, name: a.call, detail: `${a.alt} ${a.spd}`, sub: a.route, color: a.type === '🚁' ? '#ffd32a' : '#1dd1a1' }));
        } else if (mode === 'ship') {
            const b = L.latLngBounds([[37.0, -123.0], [38.5, -121.5]]);
            items = (liveData.ships || [])
                .filter(v => v.lat != null && v.lng != null && b.contains([v.lat, v.lng]))
                .sort((a, b) => (b.sog || 0) - (a.sog || 0))
                .map(v => ({ icon: '🚢', name: v.name, detail: v.sog != null ? `${v.sog.toFixed(1)} kt` : '--', sub: shipTypeLabel(v.type), color: '#0984e3' }));
        }
        
        const displayItems = items.slice(0, 4);
        if (displayItems.length) {
            content.innerHTML = displayItems.map(renderBottomTrafficItem).join('');
        } else {
            content.innerHTML = `<div style="font-size:10px; color:#a4b0be; padding:4px;">No ${mode === 'air' ? 'Aircraft' : 'Vessels'} Local</div>`;
        }
    }
    
    update();
    if (_bottomHudTimer) clearInterval(_bottomHudTimer);
    _bottomHudTimer = setInterval(update, 5000);
}

function stopBottomTrafficHUD() {
    const hud = document.getElementById('bottom-traffic-hud');
    if (hud) hud.style.display = 'none';
    if (_bottomHudTimer) { clearInterval(_bottomHudTimer); _bottomHudTimer = null; }
}


function updateSFOBox() {
    const box = document.getElementById('airport-status-box');
    if (!box) return;
    const apt = liveData.airport || { status: 'LOADING...', color: '#a4b0be', details: 'Awaiting data...' };
    box.style.display = 'block';
    box.style.borderColor = apt.color;
    box.innerHTML = `
        <div style="font-weight:bold; font-size:12px; color:${apt.color}; text-transform:uppercase; margin-bottom:4px; text-shadow: 0 0 4px ${apt.color};">
            ✈ SFO AIRPORT: ${apt.status}
        </div>
        <div style="font-size:9.5px; color:#dfe6e9; line-height:1.3;">
            ${apt.details}
        </div>
    `;
}

function hideSFOBox() {
    const box = document.getElementById('airport-status-box');
    if (box) box.style.display = 'none';
}

function updateSFOBoxMet() {
    const box = document.getElementById('airport-status-box-met');
    if (!box) return;
    const apt = liveData.airport || { status: 'LOADING...', color: '#a4b0be', details: 'Awaiting data...' };
    box.style.display = 'flex';
    box.style.borderColor = apt.color;
    box.innerHTML = `
        <div style="font-weight:bold; font-size:18px; color:${apt.color}; text-transform:uppercase; margin-bottom:8px; text-shadow: 0 0 4px ${apt.color};">
            ✈ SFO
        </div>
        <div style="font-weight:bold; font-size:14px; color:${apt.color}; text-transform:uppercase; margin-bottom:8px; text-shadow: 0 0 4px ${apt.color};">
            ${apt.status}
        </div>
        <div style="font-size:11px; color:#dfe6e9; line-height:1.3; margin-top: auto;">
            ${apt.details}
        </div>
    `;
}

function hideSFOBoxMet() {
    const box = document.getElementById('airport-status-box-met');
    if (box) box.style.display = 'none';
}

function updateLegend(type) {
    let el = document.getElementById('particle-legend');
    if (!el) {
        el = document.createElement('div');
        el.id = 'particle-legend';
        el.style.position = 'absolute';
        el.style.bottom = '1%';
        el.style.left = '1%';
        el.style.zIndex = '999';
        el.style.background = 'rgba(0, 0, 0, 0.75)';
        el.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        el.style.padding = '10px';
        el.style.borderRadius = '6px';
        el.style.color = '#fff';
        el.style.width = '240px';
        el.style.backdropFilter = 'blur(4px)';
        el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
        el.style.display = 'none';
        document.getElementById('viewport-scaler').appendChild(el);
    }
    
    if (type === 'none' || !type) {
        el.style.display = 'none';
        return;
    }

    let html = '';
    if (type === 'wind') {
        html = `
            <div style="margin-bottom:12px;">
                <div style="font-weight:bold; font-size:11px; color:#4facfe; text-transform:uppercase; margin-bottom:4px;">BASE REFLECTIVITY RADAR</div>
                <div style="font-size:9.5px; color:#dfe6e9; margin-bottom:4px;"><b>Source: NWS Bay Area Regional Radar</b></div>
                <div style="font-size:9.5px; color:#b2bec3; line-height:1.3; margin-bottom:8px;">Color indicates precipitation intensity (dBZ).</div>
                <div style="height:6px; width:100%; border-radius:3px; background: linear-gradient(to right, #00FF00, #FFFF00, #FF0000, #FF00FF, #FFFFFF);"></div>
                <div style="display:flex; justify-content:space-between; font-size:10px; color:#b2bec3; margin-top:2px;"><span>Light</span><span>Moderate</span><span>Heavy</span><span>Extreme</span></div>
            </div>
            <div style="border-top: 1px solid rgba(255,255,255,0.2); padding-top: 10px;">
                <div style="font-weight:bold; font-size:11px; color:#4facfe; text-transform:uppercase; margin-bottom:4px;">SURFACE WIND FIELD</div>
                <div style="font-size:9.5px; color:#dfe6e9; margin-bottom:4px;"><b>Model: PacIOOS WRF (3km)</b></div>
                <div style="font-size:9.5px; color:#b2bec3; line-height:1.3; margin-bottom:8px;">Arrows show wind direction, color-coded by wind speed (mph).</div>
                <div style="height:6px; width:100%; border-radius:3px; background: linear-gradient(to right, #313695, #74add1, #e0f3f8, #fee090, #f46d43, #a50026);"></div>
                <div style="display:flex; justify-content:space-between; font-size:10px; color:#b2bec3; margin-top:2px;"><span>0</span><span>15</span><span>30+ mph</span></div>
            </div>
            <div style="border-top: 1px solid rgba(255,255,255,0.2); padding-top: 10px; margin-top: 10px;">
                <div style="font-weight:bold; font-size:11px; color:#4facfe; text-transform:uppercase; margin-bottom:4px;">STATION WIND BARBS</div>
                <div style="font-size:9.5px; color:#dfe6e9; margin-bottom:4px;"><b>Source: NWS Ground Stations</b></div>
                <div style="font-size:9.5px; color:#b2bec3; line-height:1.3; margin-bottom:6px;">Stick points <b>into</b> the wind. Tail feathers indicate speed:</div>
                <div style="display:flex; flex-direction:column; gap:4px; font-size:9.5px; color:#b2bec3; margin-left:2px;">
                    <div style="display:flex; align-items:center;">
                        <div style="width:20px; height:2px; background:#fff; position:relative; margin-right:8px; margin-top:6px;">
                            <div style="position:absolute; right:3px; top:0; width:6px; height:2px; background:#fff; transform:rotate(-45deg); transform-origin:right top;"></div>
                        </div> 
                        Short feather = 5 knots
                    </div>
                    <div style="display:flex; align-items:center;">
                        <div style="width:20px; height:2px; background:#fff; position:relative; margin-right:8px; margin-top:6px;">
                            <div style="position:absolute; right:0; top:0; width:10px; height:2px; background:#fff; transform:rotate(-45deg); transform-origin:right top;"></div>
                        </div> 
                        Long feather = 10 knots
                    </div>
                    <div style="display:flex; align-items:center;">
                        <div style="width:20px; height:2px; background:#fff; position:relative; margin-right:8px; margin-top:6px;">
                            <div style="position:absolute; right:0; top:0; width:10px; height:2px; background:#fff; transform:rotate(-45deg); transform-origin:right top;"></div>
                            <div style="position:absolute; right:4px; top:0; width:6px; height:2px; background:#fff; transform:rotate(-45deg); transform-origin:right top;"></div>
                        </div> 
                        Add for total (e.g., 15 knots)
                    </div>
                </div>
            </div>
        `;
    } else if (type === 'wave') {
        html = `
            <div>
                <div style="font-weight:bold; font-size:11px; color:#4facfe; text-transform:uppercase; margin-bottom:4px;">SIGNIFICANT WAVE HEIGHT</div>
                <div style="font-size:9.5px; color:#dfe6e9; margin-bottom:4px;"><b>Model: PacIOOS SWAN (Oahu)</b></div>
                <div style="font-size:9.5px; color:#b2bec3; line-height:1.3; margin-bottom:8px;">High-resolution nearshore coastal dynamics.</div>
                <div style="height:6px; width:100%; border-radius:3px; background: linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000);"></div>
                <div style="display:flex; justify-content:space-between; font-size:10px; color:#b2bec3; margin-top:2px;"><span>0</span><span>4.2</span><span>8.3+ ft</span></div>
            </div>
        `;
    } else if (type === 'roms') {
        html = `
            <div style="margin-bottom:12px;">
                <div style="font-weight:bold; font-size:11px; color:#4facfe; text-transform:uppercase; margin-bottom:4px;">WATER TEMPERATURE</div>
                <div style="font-size:9.5px; color:#dfe6e9; margin-bottom:4px;"><b>Model: PacIOOS ROMS</b></div>
                <div style="font-size:9.5px; color:#b2bec3; line-height:1.3; margin-bottom:8px;">High-resolution Regional Ocean Modeling System forecast.</div>
                <div style="height:6px; width:100%; border-radius:3px; background: linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000);"></div>
                <div style="display:flex; justify-content:space-between; font-size:10px; color:#b2bec3; margin-top:2px;"><span>75°F</span><span>78.5°F</span><span>82°F</span></div>
            </div>
        `;
    }

    el.innerHTML = html;
    el.style.display = 'block';

    // Position dynamically so it stacks cleanly above the hazard box when in roms/hazard view
    if (type === 'roms') {
        el.style.bottom = '250px';
    } else {
        el.style.bottom = '1%';
    }
}

const uiStates = [
    // 🟢 0: METEOROLOGICAL – STATIONS + DERIVED WIND FIELD 🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢
    {
        title: "METEOROLOGICAL", sub: "NWS RADAR · WIND VECTOR · STATIONS", duration: 17250,
        layersOn:  [radarLayerGroup, stationLayer, windLayer, dynamicAlertMarkers, airLayer],
        layersOff: [shipLayer, buoyLayer, quakeLayer, lightningLayer, denseDepthLayer],
        renderStatic: () => '',
        onEnter() { 
            fetchAirport();
            document.getElementById('main-dash').classList.add('hud-hidden'); 
            const fb = document.getElementById('forecast-box');
            if (fb) fb.style.display = 'block';
            updateLegend('wind');
            updateSFOBoxMet();
        },
        onExit()  { 
            document.getElementById('main-dash').classList.remove('hud-hidden'); 
            const fb = document.getElementById('forecast-box');
            if (fb) fb.style.display = 'none';
            updateLegend('none');
            stopBottomTrafficHUD();
            hideSFOBoxMet();
        }
    },
    // 🟢 1: SURF & OCEAN – combined surf cards + buoy HUDs 🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢
    {
        id: 'state-surf',
        title: "SURF & OCEAN", sub: "NDBC · WAVE + BUOY + CURRENTS", duration: 13500,
        layersOn:  [buoyLayer, surfLayer, currentLayer, tideLayer, dynamicAlertMarkers, waveLayer, shipLayer],
        layersOff: [radarLayerGroup, aqiLayer, airLayer, quakeLayer, lightningLayer, denseDepthLayer, windLayer],
        renderStatic() {
            const buoys  = liveData.buoys || [];
            const active = buoys.filter(b => !b.error && b.waveHeight != null);
            const avgFt  = active.length
                ? (active.reduce((s, b) => s + b.waveHeight * 3.281, 0) / active.length).toFixed(1)
                : '--';
            const avgTmp = active.length
                ? Math.round(active.reduce((s, b) => s + (b.waterTemp ?? 0), 0) / active.length * 9/5 + 32)
                : '--';
            // Find peak spot
            const byId = {};
            active.forEach(b => { byId[b.id] = b; });
            let peakName = '--', peakHi = 0;
            surfSpots.forEach(s => {
                const b = byId[s.buoyId];
                if (b && b.waveHeight != null) {
                    const hi = Math.ceil(b.waveHeight * 3.281 * (s.scale || 1.0) * 1.15);
                    if (hi > peakHi) { peakHi = hi; peakName = s.name; }
                }
            });
            const peakStr = peakHi > 0 ? `${peakHi}ft` : '--';
            const peakColor = peakHi > 6 ? '#ff9f43' : '#1dd1a1';
            
            // Condensed Buoy 51211 (Oakland Estuary)
            const b51211 = active.find(b => b.id === '51211');
            let buoyDataHtml = '';
            if (b51211) {
                const wh = b51211.waveHeight != null ? `${mToFt(b51211.waveHeight)}ft` : '--';
                const pd = b51211.dominantPeriod ? `@ ${b51211.dominantPeriod}s` : '';
                const ws = b51211.windSpeedKt != null ? `${b51211.windSpeedKt}kt` : '--';
                const wd = b51211.windDir != null ? `${b51211.windDir}°` : '--';
                const wt = b51211.waterTemp != null ? `${cToF(b51211.waterTemp)}°F` : '--';
                const pr = b51211.pressure != null ? `${b51211.pressure}mb` : '--';
                buoyDataHtml = `<div style="margin-top:10px; padding:6px; background:rgba(0,0,0,0.4); border-radius:6px; border:1px solid rgba(255,255,255,0.1); font-size:0.75em; display:flex; justify-content:space-around; align-items:center; text-align:center;">
                    <div style="color:#48dbfb; font-weight:bold; letter-spacing:1px; margin-right:8px;">51211<br>OAKLAND ESTUARY</div>
                    <div>🌊 ${wh} ${pd}</div>
                    <div>💨 ${wd} ${ws}</div>
                    <div>🌡️ ${wt}</div>
                    <div>🗜️ ${pr}</div>
                </div>`;
            }

            const oceanAlertsRaw = (liveData.alerts?.alerts || []).filter(a => {
                if (!/craft|marine|surf|sea|water|gale|hurricane|tsunami/i.test(a.event ?? '')) return false;
                const desc = ((a.areaDesc || '') + ' ' + (a.description || '')).toLowerCase();
                return desc.includes('bay area') || desc.includes('berkeley') || desc.includes('san francisco') || desc.includes('marin') || desc.includes('san mateo') || desc.includes('monterey') || desc.includes('santa cruz');
            });
            const seenEvents = new Set();
            const oceanAlerts = oceanAlertsRaw.filter(a => { if (seenEvents.has(a.event)) return false; seenEvents.add(a.event); return true; });
            let oceanWarningsHtml = '';
            if (oceanAlerts.length > 0) {
                oceanWarningsHtml = oceanAlerts.map(a => {
                    const color = a.severity === 'Severe' || a.severity === 'Extreme' ? '#ee5253' : '#ff9f43';
                    return `<div class="warning-banner" style="margin-top:10px; background: rgba(255,159,67,0.15); border-color: ${color}; color: ${color}; text-align: left; padding: 10px;">
                        <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px;">⚠️ ${a.event}</div>
                        <div style="font-size: 9.5px; color: #dfe6e9; white-space: normal; line-height: 1.4; max-height: 100px; overflow-y: auto;">${a.description || a.headline || a.desc || ''}</div>
                    </div>`;
                }).join('');
            }

            // 7-Day Bay Area Surf Forecast Box
            let surfForecastHtml = '';
            if (liveData.baySurf && liveData.baySurf.daily) {
                surfForecastHtml = `<div style="margin-top:10px; background: rgba(10,20,30,0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 8px;">
                    <div style="font-size: 10px; font-weight: bold; color: #4facfe; margin-bottom: 6px; text-transform: uppercase; text-align: center; letter-spacing: 1px;">7-Day Bay Area Surf Forecast</div>
                    <div style="display: flex; justify-content: space-between;">`;
                
                const daily = liveData.baySurf.daily;
                for (let i = 0; i < Math.min(7, daily.time.length); i++) {
                    const dateObj = new Date(daily.time[i] + 'T12:00:00'); // Midday local
                    const dayStr = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                    const waveMeters = daily.wave_height_max[i];
                    const waveFt = waveMeters ? (waveMeters * 3.28084).toFixed(1) : '--';
                    
                    surfForecastHtml += `<div style="text-align: center; flex: 1;">
                        <div style="font-size: 9px; color: #b2bec3;">${dayStr}</div>
                        <div style="font-size: 11px; font-weight: bold; color: #00d2d3; margin-top: 2px;">${waveFt}<span style="font-size: 8px; font-weight: normal;">ft</span></div>
                    </div>`;
                }
                surfForecastHtml += `</div></div>`;
            }

            return `<div class="metric-grid">
                <div class="metric-box"><div class="metric-val">${avgFt !== '--' ? avgFt + 'ft' : '--'}</div><div class="metric-lbl">Avg Swell</div></div>
                <div class="metric-box"><div class="metric-val">${avgTmp !== '--' ? avgTmp + '°F' : '--'}</div><div class="metric-lbl">Water Temp</div></div>
                <div class="metric-box"><div class="metric-val">${active.length}</div><div class="metric-lbl">Buoys Live</div></div>
                <div class="metric-box"><div class="metric-val" style="color:${peakColor};">${peakStr}</div><div class="metric-lbl">Peak · ${peakName}</div></div>
            </div>
            ${buoyDataHtml}
            ${oceanWarningsHtml}
            ${surfForecastHtml}`;
        },
        onEnter() { setSurfMode('large'); updateLegend('wave'); startBottomTrafficHUD('ship'); },   // big boxed cards + declutter
        onExit()  { setSurfMode('small'); updateLegend('none'); stopBottomTrafficHUD(); }    // compact pins everywhere else
    },
    // 🟢 2: TRAFFIC – OAKLAND ESTUARY and PORT 🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢
    {
        id: 'state-traffic',
        title: "TRAFFIC — COMBINED", sub: "OAKLAND ESTUARY and PORT", pageSize: 6, holdExtraMs: 3300,
        view: 'bay-zoom',
        layersOn:  [airLayer, shipLayer, superDenseDepthLayer, airportLayer, radarLayerGroup, bayTideLayer],
        layersOff: [aqiLayer, buoyLayer, quakeLayer, lightningLayer, denseDepthLayer],
        getItems: getBayTrafficItems, renderItem: renderBayTrafficCard
    },
    // ── 5: HAZARD MONITOR — SEISMIC + LIGHTNING + TURBULENCE ──────────
    {
        id: 'state-hazard',
        title: "HAZARD MONITOR", sub: "SEISMIC ∙ LIGHTNING ∙ ALERTS ∙ TURBULENCE ∙ ROMS TEMP", perPageMs: 3500, pageSize: 4, holdExtraMs: 4000,
        view: 'wide',
        layersOn:  [quakeLayer, lightningLayer, alertLayer, turbulenceLayer, hazardTextLayer, romsTempLayer],
        layersOff: [radarLayerGroup, aqiLayer, airLayer, shipLayer, buoyLayer, denseDepthLayer, sparseDepthLayer, deepOceanAirLayer],
        getItems: getDeepOceanFlightItems, renderItem: renderDeepOceanFlightItem,
        onEnter() { fetchAirport(); updateLegend('roms'); updateSFOBox(); },
        onExit()  { updateLegend('none'); hideSFOBox(); },
        renderStatic() {
            return `
            <div class="hazard-legend" style="margin-bottom: 12px;">
                <div class="legend-title">HAZARD STATUS</div>
                <div class="legend-section">
                    <div class="legend-row"><span class="leg-dot" style="background:#ee5253;"></span><span style="color:#ffffff;">M3.0+ Quake / Hurricane</span></div>
                    <div class="legend-row"><span class="leg-dot" style="background:#ff9f43;"></span><span style="color:#ffffff;">M2.0+ Quake / Sm Craft Adv</span></div>
                    <div class="legend-row"><span class="leg-dot" style="background:#1dd1a1;"></span><span style="color:#ffffff;">High Surf Adv / Warning</span></div>
                    <div class="legend-row"><span class="leg-dot" style="background:#e84393;"></span><span style="color:#ffffff;">Gale Warn / Hi-Lvl Turb</span></div>
                    <div class="legend-row"><span class="leg-dot" style="background:#a29bfe;"></span><span style="color:#ffffff;">Lightning / Minor Alert</span></div>
                    <div class="legend-row"><span class="leg-dot" style="background:#fdcb6e;"></span><span style="color:#ffffff;">Low Turb / Micro-seismic</span></div>
                </div>
            </div>
            `;
        }
    },
    // ── 6: SATELLITE — GOES-WEST ───────────────────────────────────────
    {
        title: "SATELLITE — GOES-WEST", sub: "LAST 12 HOURS · GEOCOLOR", duration: 10000,
        view: 'wide',
        layersOn:  [],
        layersOff: [radarLayerGroup, aqiLayer, airLayer, shipLayer, buoyLayer, quakeLayer, lightningLayer, denseDepthLayer, alertLayer, turbulenceLayer],
        onEnter() {
            let el = document.getElementById('goes-satellite');
            if (!el) {
                el = document.createElement('div');
                el.id = 'goes-satellite';
                el.style.position = 'absolute';
                el.style.inset = '0';
                el.style.zIndex = '9999';
                el.style.pointerEvents = 'none';
                el.style.background = '#000';
                el.style.opacity = '0';
                el.style.transition = 'opacity 0.8s ease-in-out';
                // Append an img
                el.innerHTML = '<img id="goes-img" style="width:100%; height:100%; object-fit:contain;">';
                document.getElementById('viewport-scaler').appendChild(el);
            }
            // Update the src ONLY if the 5-minute window has passed, to avoid reloading the GIF
            const cacheBuster = Math.floor(Date.now() / 300000);
            const targetUrl = "https://cdn.star.nesdis.noaa.gov/GOES18/ABI/SECTOR/psw/GEOCOLOR/GOES18-PSW-GEOCOLOR-600x600.gif?t=" + cacheBuster;
            const img = document.getElementById('goes-img');
            if (img.src !== targetUrl) {
                img.src = targetUrl;
            }
            
            // Force reflow and fade in
            el.style.display = 'block';
            void el.offsetWidth;
            el.style.opacity = '1';
            
            document.getElementById('main-dash').classList.add('hud-hidden');
        },
        onExit() {
            const el = document.getElementById('goes-satellite');
            if (el) {
                el.style.opacity = '0';
                // We keep display: block so the browser doesn't drop the GIF decoded frames from memory,
                // but pointer-events: none ensures it doesn't block anything.
            }
            document.getElementById('main-dash').classList.remove('hud-hidden');
        },
        renderStatic() { return ''; }
    },
    // ── 11: RADAR — NWS BAY AREA LOOP ────────────────────────────────────
    {
        title: "RADAR — NWS MRMS", sub: "BAY AREA REGIONAL LOOP", duration: 8000,
        view: 'wide',
        layersOn:  [],
        layersOff: [radarLayerGroup, aqiLayer, airLayer, shipLayer, buoyLayer, quakeLayer, lightningLayer, denseDepthLayer, alertLayer, turbulenceLayer],
        onEnter() {
            let el = document.getElementById('nws-radar-loop');
            if (!el) {
                el = document.createElement('div');
                el.id = 'nws-radar-loop';
                el.style.position = 'absolute';
                el.style.inset = '0';
                el.style.zIndex = '9999';
                el.style.pointerEvents = 'none';
                el.style.background = '#000';
                el.style.opacity = '0';
                el.style.transition = 'opacity 0.8s ease-in-out';
                // Append an img
                el.innerHTML = '<img id="nws-radar-img" style="width:100%; height:100%; object-fit:contain;">';
                document.getElementById('viewport-scaler').appendChild(el);
            }
            // Update the src ONLY if the 5-minute window has passed, to avoid reloading the GIF
            const cacheBuster = Math.floor(Date.now() / 300000);
            const targetUrl = "https://radar.weather.gov/ridge/standard/PACIFICSOUTHWEST_loop.gif?t=" + cacheBuster;
            const img = document.getElementById('nws-radar-img');
            if (img.src !== targetUrl) {
                img.src = targetUrl;
            }
            
            // Force reflow and fade in
            el.style.display = 'block';
            void el.offsetWidth;
            el.style.opacity = '1';
            
            document.getElementById('main-dash').classList.add('hud-hidden');
        },
        onExit() {
            const el = document.getElementById('nws-radar-loop');
            if (el) {
                el.style.opacity = '0';
            }
            document.getElementById('main-dash').classList.remove('hud-hidden');
        },
        renderStatic() { return ''; }
    },

];

// =====================================================================
// PAGINATION ENGINE
// max 3 items visible at a time; 3s+ per page; rotate within state
// before advancing to next state
// =====================================================================
const PAGE_SIZE = 12;  // 4 columns × 3 rows visible per page
let currentStateIndex = 0;
let currentPage       = 0;
let _pageTimer        = null;
let _prevStateIndex   = -1;
let lastView          = 'default';

function transitionState() {
    try {
    if (_pageTimer) clearTimeout(_pageTimer);

    const prevState = _prevStateIndex >= 0 ? uiStates[_prevStateIndex] : null;
    const state     = uiStates[currentStateIndex];

    document.getElementById('overlay-container').className = state.id || '';

    // Fire lifecycle hooks — exit old state, enter new state
    if (_prevStateIndex !== currentStateIndex) {
        if (prevState?.onExit)  prevState.onExit();
        if (state?.onEnter)     state.onEnter();
        _prevStateIndex = currentStateIndex;
    }

    // Layer toggles
    state.layersOn.forEach(l  => { if (!map.hasLayer(l)) map.addLayer(l); });
    state.layersOff.forEach(l => { if (map.hasLayer(l))  map.removeLayer(l); });

    // These layers are only declared on specific views; force them off on every
    // other state without having to list them in each layersOff array.
    [
        stationLayer, surfLayer, currentLayer, alertLayer, turbulenceLayer, 
        airportLayer, hazardTextLayer, quakeLayer, lightningLayer, denseDepthLayer,
        superDenseDepthLayer, sparseDepthLayer, deepOceanAirLayer, romsTempLayer,
        aqiLayer, airLayer, shipLayer, buoyLayer, tideLayer, bayTideLayer, radarLayerGroup,
        windLayer, waveLayer
    ].forEach(l => {
        if (!state.layersOn || state.layersOn.indexOf(l) === -1) {
            if (map.hasLayer(l)) map.removeLayer(l);
        }
    });

    // Handle view changes (default vs wide vs bay-zoom)
    const currView = state.view || 'default';
    if (currView !== 'bay-zoom') {
        document.getElementById('map').classList.remove('bay-zoom');
    }

    if (currView !== lastView) {
        // Unlock bounds so we can fly freely
        map.setMaxBounds(null);
        map.setMinZoom(0);

        if (currView === 'default') {
            map.flyToBounds(bounds, { animate: true, duration: 1.5 });
            // Lock bounds once the flight is likely done
            setTimeout(() => {
                if ((uiStates[currentStateIndex].view || 'default') === 'default') {
                    map.setMaxBounds(bounds);
                }
            }, 1600);
        } else if (currView === 'harbor') {
            map.flyTo([37.80, -122.28], 12, { animate: true, duration: 1.8 });
            // We can leave bounds unlocked or lock to location
            setTimeout(() => {
                if (uiStates[currentStateIndex].view === 'harbor') {
                    map.setMaxBounds(bounds);
                }
            }, 1900);
        } else if (currView === 'bay-zoom') {
            document.getElementById('map').classList.add('bay-zoom');
            // Aligned tightly with traffic bounding box (Harbor at left edge, slightly less zoomed in)
            map.flyToBounds([[37.75, -122.55], [37.85, -122.35]], { animate: true, duration: 1.8 });
            setTimeout(() => {
                if (uiStates[currentStateIndex].view === 'bay-zoom') {
                    map.setMaxBounds(bounds);
                }
            }, 1900);
        } else if (currView === 'wide') {
            map.setMinZoom(7);
            map.flyToBounds([[37.0, -123.0], [38.5, -121.5]], { animate: true, duration: 1.8, padding: [30, 30] });
        }
        lastView = currView;
    }

    // Re-flow surf/buoy labels now that layer visibility may have changed
    declutterLabels();

    // Header labels
    document.getElementById('tab-title').innerText     = state.title;
    document.getElementById('sub-indicator').innerText = state.sub;

    // Small craft advisory: ONLY show when a real NWS alert is active
    const hasAdvisory = (liveData.alerts?.alerts ?? []).some(a => {
        if (!/small craft|hazardous seas/i.test(a.event ?? '')) return false;
        
        // Hide global banner on zoomed-in views unless the alert explicitly mentions Bay Area
        if (state.view !== 'wide') {
            const desc = ((a.areaDesc || '') + ' ' + (a.description || '')).toLowerCase();
            if (!desc.includes('bay area') && !desc.includes('berkeley') && !desc.includes('san francisco')) {
                return false;
            }
        }
        return true;
    });
    document.getElementById('main-dash').classList.toggle('warning-active', hasAdvisory);

    // Render content with pagination
    const contentEl = document.getElementById('panel-content');
    if (state.getItems) {
        const items      = state.getItems();
        const pageSize   = state.pageSize || PAGE_SIZE;
        const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
        const pageItems  = items.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
        const pageHint   = totalPages > 1
            ? `<div class="page-indicator">${currentPage + 1} / ${totalPages}</div>`
            : '';
        const staticHtml = state.renderStatic ? state.renderStatic() : '';
        contentEl.innerHTML = `${staticHtml}<div class="data-list-wrapper" style="flex:1; display:flex; flex-direction:column; min-width:0;"><div class="data-list">${pageItems.map(state.renderItem).join('')}</div>${pageHint}</div>`;

        const isLast = currentPage + 1 >= totalPages;
        
        let dynamicPerPageMs = state.perPageMs ?? 3000;
        if (state.id === 'state-traffic') {
            const targetScreenTime = 15000;
            dynamicPerPageMs = Math.max(2000, Math.min(3850, targetScreenTime / totalPages));
        }
        
        const dwell  = dynamicPerPageMs + (isLast ? (state.holdExtraMs ?? 0) : 0);
        _pageTimer = setTimeout(() => {
            if (!isLast) {
                currentPage++;
            } else {
                currentPage = 0;
                currentStateIndex = (currentStateIndex + 1) % uiStates.length;
            }
            transitionState();
        }, dwell);
    } else {
        contentEl.innerHTML = state.renderStatic();
        _pageTimer = setTimeout(() => {
            currentPage = 0;
            currentStateIndex = (currentStateIndex + 1) % uiStates.length;
            transitionState();
        }, state.duration ?? 5000);
    }
    } catch (e) { document.getElementById('tab-title').innerText = 'ERROR: ' + e.message; console.error(e); }
}

// =====================================================================
// BOOT — prefetch all data, then start rotation + schedule refreshes
// =====================================================================
// Non-blocking fetches (slow/rate-limited APIs - don't hold up the boot)
fetchAircraft();
fetchShips();
fetchStations();
fetchCurrents();
fetchTide();
fetchWind();
fetch7DayForecast();
fetchBaySurfForecast();

Promise.race([
    Promise.all([fetchWeather(), fetchBuoys(), fetchQuakes(), fetchAlerts(), fetchTurbulence(), fetchAirQuality()]),
    new Promise(resolve => setTimeout(resolve, 8000))
]).finally(() => {
    // Start rotation immediately after base data loads
    transitionState();
    setInterval(fetchWeather,     5 * 60 * 1000);
    setInterval(fetchBuoys,       5 * 60 * 1000);
    setInterval(fetchQuakes,      5 * 60 * 1000);
    setInterval(fetchAlerts,      5 * 60 * 1000);
    setInterval(fetchTurbulence,  5 * 60 * 1000);
    setInterval(fetchAirQuality,  5 * 60 * 1000);
    setInterval(fetchAircraft,        10 * 1000); // Traffic is real-time
    setInterval(fetchShips,           10 * 1000); // Traffic is real-time
    setInterval(fetchStations,    5 * 60 * 1000);
    setInterval(fetchCurrents,    5 * 60 * 1000); // marine model updates slowly
    setInterval(fetchTide,        5 * 60 * 1000);
    setInterval(fetch7DayForecast, 60 * 60 * 1000); // refresh hourly
    setInterval(fetchBaySurfForecast, 60 * 60 * 1000); // refresh hourly
});

// --- RASPBERRY PI HARDWARE DEGRADATION & KIOSK MANAGEMENT ---
function initFPSMonitor() {
    let frameCount = 0;
    let lastTime = performance.now();
    let lowFpsTicks = 0; // Consecutive seconds below threshold
    
    function measure() {
        const now = performance.now();
        frameCount++;
        if (now - lastTime >= 1000) {
            const fps = frameCount;
            // If FPS is below 20 for 5 consecutive seconds, trigger low-perf mode
            if (fps < 20) {
                lowFpsTicks++;
                if (lowFpsTicks >= 5 && !document.body.classList.contains('low-perf')) {
                    console.warn('FPS dropped to ' + fps + ' for 5 seconds. Enabling low-performance mode (stripping backdrop-filters).');
                    document.body.classList.add('low-perf');
                }
            } else {
                lowFpsTicks = 0;
            }
            frameCount = 0;
            lastTime = now;
        }
        requestAnimationFrame(measure);
    }
    requestAnimationFrame(measure);
}

function initDailyRefresh() {
    // Schedule a hard reload every 24 hours to flush Chromium memory creeps
    setTimeout(() => {
        console.warn('Executing daily 24-hour Kiosk memory flush...');
        window.location.reload();
    }, 24 * 60 * 60 * 1000);
}

initFPSMonitor();
initDailyRefresh();




