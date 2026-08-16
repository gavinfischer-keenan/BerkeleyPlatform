/**
 * @file fetch.js
 */
import {
    radarLayerGroup, buoyLayer, stationLayer, quakeLayer, alertLayer, turbulenceLayer, aqiLayer, lightningLayer,
    airLayer, deepOceanAirLayer, currentLayer, tideLayer, bayTideLayer, dynamicAlertMarkers, hazardTextLayer,
    liveData, activeAircraft, fallbackMarkers, activeBreadcrumbs, trafficHistory
} from './state.js';
import {
    getHazardColor, drawBreadcrumbs, recordTrafficBreadcrumb, 
    mToFt, cToF, getAircraftClass, getAircraftIcon, renderCurrents, updateSurfLabels, declutterLabels
} from './render.js';
import { distToShoreKm, ISLAND_OUTLINES, getOffsetPolygon } from './geo.js';

var _radarTile = null;
export async function refreshRadar() {
    try {
        const r = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        if (!r.ok) throw new Error(r.status);
        const j = await r.json();
        const past = j.radar?.past || [];
        if (!past.length) return;
        const frame = past[past.length - 1];
        const url = `${j.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
        if (_radarTile) radarLayerGroup.removeLayer(_radarTile);
        _radarTile = L.tileLayer(url, { pane: 'radarPane', opacity: 0.7, maxNativeZoom: 8, maxZoom: 14 });
        radarLayerGroup.addLayer(_radarTile);
    } catch (e) { console.warn('Radar fetch:', e); }
}
refreshRadar();
setInterval(refreshRadar, 5 * 60 * 1000);

export async function fetchWeather() {
    try {
        const r = await fetch('/api/weather');
        if (!r.ok) throw new Error(r.status);
        liveData.weather = await r.json();
    } catch(e) { console.warn('Weather fetch:', e); }
}

const buoyCoords = {
    '46026': [37.759, -122.833],
    '46012': [37.363, -122.881],
    '46013': [38.242, -123.301],
    '46214': [37.945, -123.470],
    '46237': [37.786, -122.634],
    'FTPC1': [37.807, -122.465],
};

export async function fetchBuoys() {
    try {
        const r = await fetch('/api/buoys');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.buoys = data.buoys;

        buoyLayer.clearLayers();
        import('./state.js').then(s => { s.setBuoyMarkers([]) });
        let newBuoyMarkers = [];
        data.buoys.forEach(b => {
            const coords = buoyCoords[b.id];
            if (!coords || b.error) return;
            const wh = b.waveHeight != null ? `${mToFt(b.waveHeight)}ft` : '--';
            const wt = b.waterTemp  != null ? `${cToF(b.waterTemp)}°F`   : '--';
            
            const isTarget = b.id === '51211';
            const extraStyle = isTarget ? 'border: 2px solid #fff; box-shadow: 0 0 15px #fff; background: rgba(0,0,0,0.8);' : '';
            const html = `<div class="buoy-box" style="${extraStyle}"><div class="buoy-name">${b.name.split(' ')[0]}</div><div class="buoy-val">🌊${wh} 🌡${wt}</div></div>`;
            const marker = L.marker(coords, { pane: 'poiPane',
                icon: L.divIcon({ className: '', html, iconSize: [100, 30], iconAnchor: [50, 30] })
            }).addTo(buoyLayer);
            newBuoyMarkers.push({ marker, html });
        });
        import('./state.js').then(s => { s.setBuoyMarkers(newBuoyMarkers) });

        updateSurfLabels(data.buoys);
    } catch(e) { console.warn('Buoy fetch:', e); }
}

export async function fetchStations() {
    try {
        const r = await fetch('/api/stations');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.stations = data.stations || [];

        stationLayer.clearLayers();
        import('./state.js').then(s => { s.setStationMarkers([]) });
        let newStationMarkers = [];
        liveData.stations.forEach(s => {
            if (s.tempF == null) return;
            const temp = s.tempF;
            const windDeg = s.windDeg ?? 0;
            const windKt = s.windKt ?? 0;
            
            let barbsHtml = '';
            if (windKt >= 3) {
                let y = -35;
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

            let bgColor = '#ff9f43';
            if (temp >= 85) bgColor = '#ee5253';
            else if (temp <= 70) bgColor = '#48dbfb';

            const html = `<div class="fading-marker" style="position:relative; width:28px; height:28px;">
                ${barbStick}
                <div style="position:absolute; top:0; left:0; width:28px; height:28px; background:${bgColor}; border:2px solid #000; border-radius:50%; color:#000; font-weight:bold; font-size:13px; line-height:24px; text-align:center; z-index:10; box-sizing:border-box;">
                    ${temp}
                </div>
            </div>`;

            const tooltip = `<b>${s.name}</b><br>Temp: ${temp}°F<br>Wind: ${s.windDir || ''} ${windKt}kt`;

            const marker = L.marker([s.lat, s.lng], { pane: 'poiPane',
                icon: L.divIcon({ className: '', html, iconSize: [28, 28], iconAnchor: [14, 14] })
            }).addTo(stationLayer).bindTooltip(tooltip, { className: 'poi-label', direction: 'top', offset: [0, -14] });
            
            newStationMarkers.push({ marker, html });
        });
        import('./state.js').then(s => { s.setStationMarkers(newStationMarkers) });
    } catch(e) { console.warn('Station fetch:', e); }
}

export async function fetchQuakes() {
    try {
        const r = await fetch('/api/earthquakes');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.quakes = data.quakes;

        quakeLayer.clearLayers();
        data.quakes.forEach(q => {
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

export async function fetchAirport() {
    try {
        const r = await fetch('/api/airport');
        if (!r.ok) throw new Error(r.status);
        liveData.airport = await r.json();
    } catch(e) { console.warn('Airport fetch:', e); }
}

export async function fetchAlerts() {
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

            alerts.forEach(al => {
                if (al.geometry) {
                    const layer = L.geoJSON(al.geometry, {
                        pane: 'hazardPane',
                        style: { color, weight: 2, fillOpacity: 0.10 }
                    }).bindTooltip(eName, { sticky: true, className: 'poi-label' });
                    layer.addTo(alertLayer);
                }
            });

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
                    const offsetRatio = count * 0.035; 
                    const polyCoords = getOffsetPolygon(ISLAND_OUTLINES[isl], offsetRatio);

                    let labelLat = polyCoords[0][0] - 0.05, labelLng = polyCoords[0][1] - 0.05;
                    if (isl === 'SF Peninsula') { labelLat = 37.80; labelLng = -122.30; }
                    
                    if (isl === 'SF Peninsula') {
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

export async function fetchTurbulence() {
    try {
        const r = await fetch('/api/turbulence');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.turbulence = data.turbulence || [];

        turbulenceLayer.clearLayers();
        liveData.turbulence.forEach(t => {
            if (t.geometry) {
                const isHighLevel = (t.minAlt || t.maxAlt || 0) >= 180;
                const color = isHighLevel ? '#e84393' : '#fdcb6e';
                const label = `${isHighLevel ? 'High' : 'Low'}-Level Turbulence`;
                L.geoJSON(t.geometry, {
                    pane: 'hazardPane',
                    style: { color, weight: 2, dashArray: '5, 5', fillOpacity: 0.10 }
                }).addTo(turbulenceLayer).bindTooltip(label, { sticky: true, className: 'poi-label' });
            }
        });
    } catch(e) { console.warn('Turbulence fetch:', e); }
}

export async function fetchAirQuality() {
    try {
        const r = await fetch('/api/airquality');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.airquality = data;

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

export async function fetchBaySurfForecast() {
    try {
        const url = 'https://marine-api.open-meteo.com/v1/marine?latitude=37.70&longitude=-122.51&daily=wave_height_max&timezone=America%2FLos_Angeles';
        const r = await fetch(url);
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.baySurf = data;
    } catch(e) { console.warn('Bay Area surf fetch:', e); }
}

export async function fetch7DayForecast() {
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

export async function fetchAircraft() {
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

        fallbackMarkers.forEach(m => airLayer.removeLayer(m));
        fallbackMarkers.length = 0;

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

export async function fetchCurrents() {
    try {
        const r = await fetch('/api/currents');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.currents = data;
        renderCurrents(data.points);
    } catch(e) { console.warn('Currents fetch:', e); }
}

export async function fetchTide() {
    try {
        const r = await fetch('/api/tide');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.tide = data;

        tideLayer.clearLayers();
        bayTideLayer.clearLayers();
        import('./state.js').then(s => { s.setTideMarkers([]) });
        let newTideMarkers = [];
        (data.tides || []).forEach(t => {
            const updown = t.state === 'Rising' ? '▲' : (t.state === 'Falling' ? '▼' : '–');
            const color = t.state === 'Rising' ? '#1dd1a1' : (t.state === 'Falling' ? '#ff9f43' : '#48dbfb');
            const next = t.next ? `${t.next.type} ${t.next.time}` : '';
            const html = `<div class="surf-card" style="border-color:${color}; box-shadow:0 0 10px ${color}33; padding:4px 8px; width:100%; box-sizing:border-box;">
                <div style="font-size:0.75em;font-weight:bold;color:${color};text-transform:uppercase;letter-spacing:1px;">🌊 ${t.name}</div>
                <div style="font-size:0.85em;color:#fff;">${updown} ${t.state}</div>
                <div style="font-size:0.7em;color:#a4b0be;margin-top:2px;">Next: ${next}</div>
            </div>`;
            
            if (t.id === '1612340' || (t.name && t.name.includes('Berkeley'))) {
                L.marker([37.868, -122.316], { pane: 'poiPane',
                    icon: L.divIcon({ className: '', html, iconSize: [120, 48], iconAnchor: [60, 24] })
                }).addTo(bayTideLayer);
            }
        });
        declutterLabels();
    } catch(e) { console.warn('Tide fetch:', e); }
}

export async function fetchWind() {
    return;
}
