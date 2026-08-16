/**
 * @file ui-states.js
 */
import {
    radarLayerGroup, stationLayer, windLayer, dynamicAlertMarkers, airLayer,
    buoyLayer, quakeLayer, lightningLayer, denseDepthLayer, surfLayer, currentLayer, tideLayer, waveLayer,
    aqiLayer, alertLayer, turbulenceLayer, hazardTextLayer, romsTempLayer,
    sparseDepthLayer, deepOceanAirLayer, airportLayer, superDenseDepthLayer, bayTideLayer, liveData, surfSpots
} from './state.js';
import { fetchAirport } from './fetch.js';
import {
    updateLegend, stopBottomTrafficHUD, hideSFOBoxMet, updateSFOBoxMet, setSurfMode, startBottomTrafficHUD,
    mToFt, cToF, getDeepOceanFlightItems, renderDeepOceanFlightItem,
    getBayTrafficItems, renderBayTrafficCard, updateSFOBox, hideSFOBox,
    showFullscreenOverlay, hideFullscreenOverlay
} from './render.js';

export const uiStates = [
    // 🟢 0: METEOROLOGICAL – STATIONS + DERIVED WIND FIELD 🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢
    {
        title: "METEOROLOGICAL", sub: "NWS RADAR · WIND VECTOR · STATIONS", duration: 17250,
        layersOn:  [radarLayerGroup, stationLayer, windLayer, dynamicAlertMarkers, airLayer],
        layersOff: [buoyLayer, quakeLayer, lightningLayer, denseDepthLayer],
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
        layersOn:  [buoyLayer, surfLayer, currentLayer, tideLayer, dynamicAlertMarkers, waveLayer],
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
        onEnter() { setSurfMode('large'); updateLegend('wave'); startBottomTrafficHUD('air'); },
        onExit()  { setSurfMode('small'); updateLegend('none'); stopBottomTrafficHUD(); }
    },
    // 🟢 2: TRAFFIC – OAKLAND ESTUARY and PORT 🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢
    {
        id: 'state-traffic',
        title: "TRAFFIC — COMBINED", sub: "OAKLAND ESTUARY and PORT", pageSize: 6, holdExtraMs: 3300,
        view: 'bay-zoom',
        layersOn:  [airLayer, superDenseDepthLayer, airportLayer, radarLayerGroup, bayTideLayer],
        layersOff: [aqiLayer, buoyLayer, quakeLayer, lightningLayer, denseDepthLayer],
        getItems: getBayTrafficItems, renderItem: renderBayTrafficCard
    },
    // ── 5: HAZARD MONITOR — SEISMIC + LIGHTNING + TURBULENCE ──────────
    {
        id: 'state-hazard',
        title: "HAZARD MONITOR", sub: "SEISMIC ∙ LIGHTNING ∙ ALERTS ∙ TURBULENCE ∙ ROMS TEMP", perPageMs: 3500, pageSize: 4, holdExtraMs: 4000,
        view: 'wide',
        layersOn:  [quakeLayer, lightningLayer, alertLayer, turbulenceLayer, hazardTextLayer, romsTempLayer],
        layersOff: [radarLayerGroup, aqiLayer, airLayer, buoyLayer, denseDepthLayer, sparseDepthLayer, deepOceanAirLayer],
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
        layersOff: [radarLayerGroup, aqiLayer, airLayer, buoyLayer, quakeLayer, lightningLayer, denseDepthLayer, alertLayer, turbulenceLayer],
        onEnter() { showFullscreenOverlay('goes-satellite', 'goes-img', 'https://cdn.star.nesdis.noaa.gov/GOES18/ABI/SECTOR/psw/GEOCOLOR/GOES18-PSW-GEOCOLOR-600x600.gif'); },
        onExit() { hideFullscreenOverlay('goes-satellite'); },
        renderStatic() { return ''; }
    },
    // ── 11: RADAR — NWS BAY AREA LOOP ────────────────────────────────────
    {
        title: "RADAR — NWS MRMS", sub: "BAY AREA REGIONAL LOOP", duration: 8000,
        view: 'wide',
        layersOn:  [],
        layersOff: [radarLayerGroup, aqiLayer, airLayer, buoyLayer, quakeLayer, lightningLayer, denseDepthLayer, alertLayer, turbulenceLayer],
        onEnter() { showFullscreenOverlay('nws-radar-loop', 'nws-radar-img', 'https://radar.weather.gov/ridge/standard/PACIFICSOUTHWEST_loop.gif'); },
        onExit() { hideFullscreenOverlay('nws-radar-loop'); },
        renderStatic() { return ''; }
    },

];
