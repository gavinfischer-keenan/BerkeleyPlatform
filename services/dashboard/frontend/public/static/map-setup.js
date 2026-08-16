/**
 * @file map-setup.js
 */
import { setMap, denseDepthLayer, superDenseDepthLayer, sparseDepthLayer, aqiLayer, radarLayerGroup, currentLayer, airLayer, surfLayer, staticPoiLayer, hazardTextLayer, windLayer, waveLayer, buoyLayer, quakeLayer, lightningLayer, stationLayer, alertLayer, turbulenceLayer, airportLayer, tideLayer, bayTideLayer, deepOceanAirLayer, romsTempLayer } from './state.js';

export function applyScale() {
    const ww = window.innerWidth, wh = window.innerHeight;
    const scale = Math.min(ww / 1920, wh / 1080);
    document.getElementById('viewport-scaler').style.transform = `scale(${scale})`;
}
window.addEventListener('resize', applyScale);
applyScale();

export const bounds = [[37.25, -123.20], [38.30, -121.70]];

var map = L.map('map', {
    zoomControl: false, attributionControl: false,
    zoomSnap: 0, minZoom: 0, maxZoom: 14, maxBounds: bounds, maxBoundsViscosity: 1.0
}).fitBounds(bounds);
setMap(map);

map.dragging.disable(); map.touchZoom.disable(); map.doubleClickZoom.disable();
map.scrollWheelZoom.disable(); map.boxZoom.disable(); map.keyboard.disable();

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

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 13, maxZoom: 14 }).addTo(map);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 20, opacity: 0.92,
    attribution: '© OpenStreetMap contributors, © CARTO'
}).addTo(map);

staticPoiLayer.addTo(map);
export { map };
