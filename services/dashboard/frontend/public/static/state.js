/**
 * @file state.js
 * Shared Mutable State
 */
export let map = null;
export function setMap(m) { map = m; }

export let liveData = { weather: null, buoys: null, quakes: null, alerts: null, turbulence: null, airquality: null, aircraft: [], stations: [], currents: null, tide: null };
export let trafficHistory = {};
export let activeBreadcrumbs = {};
export let activeAircraft = {};
export let fallbackMarkers = [];

export let surfLayer = L.layerGroup();
export let staticPoiLayer = L.layerGroup();
export let radarLayerGroup = L.layerGroup();
export let currentLayer = L.layerGroup();
export let windLayer = L.layerGroup();
export let gebcoBathymetry = L.tileLayer.wms('https://wms.gebco.net/mapserv?', {
    layers: 'GEBCO_Latest', format: 'image/png', transparent: true, opacity: 0.45, attribution: 'GEBCO'
});
export let waveLayer = L.layerGroup([gebcoBathymetry]);
export let buoyLayer = L.layerGroup();
export let quakeLayer = L.layerGroup();
export let lightningLayer = L.layerGroup();
export let aqiLayer = L.layerGroup();
export let airLayer = L.layerGroup();
export let stationLayer = L.layerGroup();
export let alertLayer = L.layerGroup();
export let turbulenceLayer = L.layerGroup();
export let airportLayer = L.layerGroup();
export let tideLayer = L.layerGroup();
export let bayTideLayer = L.layerGroup();
export let hazardTextLayer = L.layerGroup();
export let denseDepthLayer = L.layerGroup();
export let superDenseDepthLayer = L.layerGroup();
export let sparseDepthLayer = L.layerGroup();
export let deepOceanAirLayer = L.featureGroup();
export let romsTempLayer = L.layerGroup();
export let dynamicAlertMarkers = L.layerGroup().addTo(hazardTextLayer);

export let staticPoiMarkers = [];
export let surfSpots = [
    { c: [37.495, -122.497], name: "Mavericks",    buoyId: "46012", cssScale: 0.85, scale: 1.5, nudge: [0, 65] },
    { c: [37.769, -122.511], name: "Ocean Beach",   buoyId: "46026", cssScale: 0.85, scale: 1.2, nudge: [0, 0] },
    { c: [37.593, -122.490], name: "Pacifica",      buoyId: "46012", cssScale: 0.85, scale: 1.0, nudge: [0, -65] },
    { c: [37.896, -122.622], name: "Bolinas",       buoyId: "46214", cssScale: 0.85, scale: 0.8, nudge: [55, 0] },
    { c: [37.835, -122.509], name: "Fort Point",    buoyId: "46237", cssScale: 0.80, scale: 0.5, nudge: [0, -18] },
    { c: [38.314, -123.023], name: "Salmon Creek",  buoyId: "46013", cssScale: 0.85, scale: 0.6, nudge: [0, 10] },
    { c: [37.658, -122.494], name: "Linda Mar",     buoyId: "46012", cssScale: 0.85, scale: 1.0 },
    { c: [36.952, -122.026], name: "Steamer Lane",  buoyId: "46012", cssScale: 0.85, scale: 1.0 },
];
export let surfMarkers = [];
export let setSurfMarkers = (m) => { surfMarkers = m; };
export let buoyMarkers = [];
export let setBuoyMarkers = (m) => { buoyMarkers = m; };
export let stationMarkers = [];
export let setStationMarkers = (m) => { stationMarkers = m; };
export let windMarkers = [];
export let setWindMarkers = (m) => { windMarkers = m; };
export let tideMarkers = [];
export let setTideMarkers = (m) => { tideMarkers = m; };

export let surfMode = 'small';
export function updateSurfMode(m) { surfMode = m; }

// Current dashboard view — updated by engine.js, read by render.js
export let currentView = 'default';
export function setCurrentView(v) { currentView = v; }
