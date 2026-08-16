/**
 * @file render.js
 */
import {
    map, hazardTextLayer, staticPoiLayer, airportLayer, surfLayer, buoyLayer, tideLayer,
    currentLayer, activeBreadcrumbs, trafficHistory, liveData,
    surfMode, updateSurfMode, surfSpots, surfMarkers, setSurfMarkers, buoyMarkers, tideMarkers, staticPoiMarkers, currentView
} from './state.js';

export function getHazardColor(eventStr) {
    const e = (eventStr || '').toLowerCase();
    if (/hurricane|typhoon|extreme/i.test(e)) return '#ee5253';
    if (/gale|storm/i.test(e)) return '#e84393';
    if (/small craft/i.test(e)) return '#ff9f43';
    if (/surf|advisory/i.test(e)) return '#1dd1a1';
    if (/warning/i.test(e)) return '#ff7675';
    return '#a29bfe';
}

export function initHardcodedHazards() {
    const airmetBoxLatLng = [37.3, -122.8];
    const airmetHtml = `<div style="background: rgba(232, 67, 147, 0.1); border: 1px dashed #e84393; padding: 10px; border-radius: 6px; width: 260px; color: #fff; font-size: 11px; backdrop-filter: blur(4px); box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
        <div style="color: #e84393; font-weight: bold; font-size: 12px; margin-bottom: 4px; text-transform: uppercase;">AIRMET TANGO (Turbulence)</div>
        <div style="color: #dfe6e9; line-height: 1.4;">Moderate turbulence below 8,000 feet.<br>Coastal ranges, SF Bay Area through Sacramento Valley.</div>
    </div>`;
    L.marker(airmetBoxLatLng, {
        pane: 'hazardPane',
        icon: L.divIcon({ className: '', html: airmetHtml, iconSize: [260, 80], iconAnchor: [0, 40] })
    }).addTo(hazardTextLayer);

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

export const BIG_W = 110, BIG_H = 44;
export const SMALL_W = 86, SMALL_H = 18;

export const drawLeader = (ax, ay, w, h, color) => {
    if (ax >= 0 && ax <= w && ay >= 0 && ay <= h) return '';
    let x2 = ax < 0 ? 0 : (ax > w ? w : ax);
    let y2 = ay < 0 ? 0 : (ay > h ? h : ay);
    return `<svg style="position:absolute; left:0; top:0; overflow:visible; pointer-events:none; width:1px; height:1px; z-index:-1;"><line x1="${ax}" y1="${ay}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.5"/><circle cx="${ax}" cy="${ay}" r="3" fill="${color}"/></svg>`;
};

export function makeSurfIconLarge(spot, heightStr, color, anchor) {
    anchor = anchor || [BIG_W / 2, 0];
    const cssScale = spot.cssScale || 1;
    let leader = drawLeader(anchor[0], anchor[1], BIG_W, BIG_H, color);
    if (spot.nudge) leader = ''; 
    return L.divIcon({
        className: '',
        html: `<div style="position:relative; transform: scale(${cssScale}); transform-origin: top center;">${leader}<div class="surf-card" style="border-color:${color};box-shadow:0 0 10px ${color}33;">
            <div class="surf-card-name">🏄 ${spot.name}</div>
            <div class="surf-card-ht" style="color:${color};">${heightStr}</div>
        </div></div>`,
        iconSize:   [BIG_W, BIG_H],
        iconAnchor: anchor
    });
}

export function makeSurfIconSmall(name, heightStr, color, anchor) {
    anchor = anchor || [SMALL_W / 2, SMALL_H / 2];
    const ht = heightStr && heightStr !== '--' ? ` <b style="color:${color};">${heightStr}</b>` : '';
    const leader = drawLeader(anchor[0], anchor[1], SMALL_W, SMALL_H, color);
    return L.divIcon({
        className: '',
        html: `<div style="position:relative;">${leader}<div class="surf-pin" style="border-color:${color};">🏄 ${name}${ht}</div></div>`,
        iconSize:   [SMALL_W, SMALL_H],
        iconAnchor: anchor
    });
}

export function initSurfMarkers() {
    surfLayer.clearLayers();
    let newSurfMarkers = [];
    surfSpots.forEach(s => {
        const marker = L.marker(s.c, {
            pane: 'surfPane',
            icon: makeSurfIconSmall(s.name, '--', '#48dbfb')
        });
        marker.addTo(surfLayer);
        newSurfMarkers.push({ marker, spot: s, heightStr: '--', color: '#48dbfb' });
    });
    setSurfMarkers(newSurfMarkers);
}
initSurfMarkers();

export function rebuildSurfIcon(entry, anchor) {
    if (surfMode === 'large') {
        entry.marker.setIcon(makeSurfIconLarge(entry.spot, entry.heightStr, entry.color, anchor));
    } else {
        entry.marker.setIcon(makeSurfIconSmall(entry.spot.name, entry.heightStr, entry.color, anchor));
    }
}

export function _ccw(ax, ay, bx, by, cx, cy) {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
}
export function _linesIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    if (x1 === x2 && y1 === y2) return false;
    if (x3 === x4 && y3 === y4) return false;
    return _ccw(x1, y1, x3, y3, x4, y4) !== _ccw(x2, y2, x3, y3, x4, y4) &&
           _ccw(x1, y1, x2, y2, x3, y3) !== _ccw(x1, y1, x2, y2, x4, y4);
}
export function intersectLine(l1, l2) {
    return _linesIntersect(l1.x1, l1.y1, l1.x2, l1.y2, l2.x1, l2.y1, l2.x2, l2.y2);
}
export function intersectRect(r1, r2, gap) {
    return !(r2.x >= r1.x + r1.w + gap || r2.x + r2.w + gap <= r1.x || r2.y >= r1.y + r1.h + gap || r2.y + r2.h + gap <= r1.y);
}
export function lineIntersectsRect(l, r, gap) {
    const rx = r.x - gap/2, ry = r.y - gap/2, rw = r.w + gap, rh = r.h + gap;
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

export function declutterLabels() {
    if (!map || !map._loaded) return;
    const large = surfMode === 'large';
    const entries = [];

    if (map.hasLayer(surfLayer)) {
        surfMarkers.forEach(e => {
            const w = large ? BIG_W : SMALL_W, h = large ? BIG_H : SMALL_H;
            if (large && e.spot.nudge) {
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
        const configsToTry = [];
        if (e.preferred) configsToTry.push({ r: e.preferred.r, angle: e.preferred.angleOffset });
        for (let r = 0; r < 400; r += 5) {
            const steps = r === 0 ? 1 : Math.max(8, Math.floor(2 * Math.PI * r / 10));
            const offsetAngle = (r % 15) * 0.1;
            for (let i = 0; i < steps; i++) configsToTry.push({ r, angle: (i * Math.PI * 2) / steps + offsetAngle });
        }

        let bestCandidate = null;
        for (const config of configsToTry) {
            const { r, angle } = config;
            const rect = { x: pt.x - e.w / 2 + r * Math.cos(angle), y: pt.y + e.offsetTop + r * Math.sin(angle), w: e.w, h: e.h };
            let collision = false;
            for (const p of placed) {
                if (intersectRect(rect, p.rect, GAP)) { collision = true; break; }
                if (p.line && lineIntersectsRect(p.line, rect, GAP)) { collision = true; break; }
            }
            if (collision) continue;
            
            const cx = Math.max(rect.x, Math.min(pt.x, rect.x + rect.w));
            const cy = Math.max(rect.y, Math.min(pt.y, rect.y + rect.h));
            const line = { x1: pt.x, y1: pt.y, x2: cx, y2: cy };
            
            if (r > 0) {
                for (const p of placed) {
                    if (p.isDotFor === e) continue;
                    if (p.isStaticPoi && intersectRect(rect, p.rect, GAP)) { collision = true; break; }
                    if (p.isStaticPoi) continue;
                    if (lineIntersectsRect(line, p.rect, GAP)) { collision = true; break; }
                    if (p.line && intersectLine(line, p.line)) { collision = true; break; }
                }
            }
            if (collision) continue;
            bestCandidate = { rect, line }; break;
        }
        
        if (!bestCandidate) bestCandidate = { rect: {x: pt.x - e.w / 2, y: pt.y + e.offsetTop, w: e.w, h: e.h}, line: null };
        placed.push(bestCandidate);
        e.apply(pt.x - bestCandidate.rect.x, pt.y - bestCandidate.rect.y);
    });
}

export function setSurfMode(mode) { updateSurfMode(mode); declutterLabels(); }

let declutterTimeout = null;
setTimeout(() => {
    map.on('moveend zoomend', () => {
        if (declutterTimeout) clearTimeout(declutterTimeout);
        declutterTimeout = setTimeout(declutterLabels, 50);
    });
}, 500);

export function updateSurfLabels(buoys) {
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

export function gcTrafficHistory() {
    const now = Date.now();
    for (const id in trafficHistory) {
        const hist = trafficHistory[id];
        if (hist.length > 0) {
            const lastTime = hist[hist.length - 1][2] || 0;
            if (now - lastTime > 30 * 60 * 1000) {
                delete trafficHistory[id];
            }
        } else {
            delete trafficHistory[id];
        }
    }
}
setInterval(gcTrafficHistory, 5 * 60 * 1000);

export const BREADCRUMB_LIMIT = 7;
export function recordTrafficBreadcrumb(id, lat, lng) {
    if (!id || lat == null || lng == null) return;
    const now = Date.now();
    if (!trafficHistory[id]) trafficHistory[id] = [];
    const hist = trafficHistory[id];
    if (hist.length > 0) {
        const last = hist[hist.length - 1];
        const lastTime = last[2] || now - 10000; 
        const dtSec = (now - lastTime) / 1000;
        if (dtSec > 0) {
            const distM = L.latLng(last[0], last[1]).distanceTo(L.latLng(lat, lng));
            const distNm = distM / 1852;
            const dtHr = dtSec / 3600;
            if ((distNm / dtHr) > 600) trafficHistory[id] = [];
        }
    }
    trafficHistory[id].push([lat, lng, now]);
    if (trafficHistory[id].length > BREADCRUMB_LIMIT) trafficHistory[id].shift();
}

export function drawBreadcrumbs(id, layer, color, cacheKey = id) {
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
        const p = L.polyline([], { color: color, weight: 4, pane: 'trafficPane' });
        lines.push(p);
    }
    while (lines.length > numSegments) {
        const p = lines.pop();
        layer.removeLayer(p);
    }
    for (let i = 0; i < numSegments; i++) {
        const opacity = ((i + 1) / history.length) * 0.9;
        lines[i].setLatLngs([history[i], history[i+1]]);
        lines[i].setStyle({ opacity: opacity, color: color });
        if (!layer.hasLayer(lines[i])) lines[i].addTo(layer);
    }
}

export function mToFt(m)  { return m != null ? (m * 3.281).toFixed(1) : '--'; }
export function cToF(c)   { return c != null ? Math.round(c * 9/5 + 32) : '--'; }
export function timeAgo(ms) {
    const mins = Math.round((Date.now() - ms) / 60000);
    return mins < 60 ? `${mins}m ago` : `${Math.round(mins/60)}h ago`;
}

export function renderCurrents(points) {
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

export function getSurfItems() {
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
export function renderSurfItem(item) {
    return `<div class="data-row" style="border-left-color:${item.color};">
        <div><div class="row-primary">🏄 ${item.name}</div><div class="row-secondary">${item.period}NDBC buoy derived</div></div>
        <div class="row-meta" style="color:${item.color};">${item.heightStr}</div>
    </div>`;
}

export function getBuoyItems() {
    return (liveData.buoys || [])
        .filter(b => !b.error && b.waveHeight != null)
        .map(b => ({
            name: b.name,
            wh: `${mToFt(b.waveHeight)} ft`,
            wt: `${cToF(b.waterTemp)}°F`,
            pd: b.dominantPeriod ? `${b.dominantPeriod}s period` : '',
        }));
}
export function renderBuoyItem(item) {
    return `<div class="data-row" style="border-left-color:#0abde3;">
        <div><div class="row-primary">${item.name}</div><div class="row-secondary">${item.pd}</div></div>
        <div class="row-meta">🌊${item.wh}<br><span style="font-size:0.75em;color:#a4b0be;">🌡${item.wt}</span></div>
    </div>`;
}

export function getQuakeItems() {
    return (liveData.quakes || []).map(q => {
        const color = q.mag >= 3 ? '#ee5253' : q.mag >= 2 ? '#ff9f43' : '#ffd32a';
        const place = q.place.replace(/,?\s*California$/, '');
        return { mag: q.mag, place, depth: q.depth, time: q.time, color };
    });
}
export function renderQuakeItem(item) {
    return `<div class="data-row" style="border-left-color:${item.color};">
        <div><div class="row-primary">${item.place}</div><div class="row-secondary">${item.depth.toFixed(1)} km depth</div></div>
        <div class="row-meta" style="color:${item.color};">M${item.mag}<br><span style="font-size:0.7em;color:#a4b0be;">${timeAgo(item.time)}</span></div>
    </div>`;
}

export function getAircraftClass(acType, altFt, speedKt) {
    if (!acType) {
        if ((altFt != null && altFt < 3000) || (speedKt != null && speedKt < 120 && altFt < 5000)) return 'helo';
        return 'air';
    }
    const t = String(acType).toUpperCase();
    if (t.match(/^(R44|R66|H60|UH6|AH6|AS3|EC1|B06|B40|A10|AW1|MD5|S76|S92)/)) return 'helo';
    if (t.match(/^(C1|C2|P2|PA|SR|BE|PC|TBM|M20|DA)/)) return 'small';
    return 'air';
}

export function getAircraftIcon(cls) {
    if (cls === 'helo') return '🚁';
    if (cls === 'small') return '🛩️';
    return '✈️';
}

export function getAviationItems() {
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

export function getDeepOceanFlightItems() {
    const bayAreaIata = ['SFO','OAK','SJC','SMF','STS','CCR','SQL','PAO','HWD','LVK','NUQ'];
    let flights = getAviationItems().filter(a => {
        if (!a.origin || !a.dest) return false;
        const isToFromHNL = a.origin === 'SFO' || a.dest === 'SFO';
        const isMainland = !bayAreaIata.includes(a.origin) || !bayAreaIata.includes(a.dest);
        return isToFromHNL && isMainland;
    });
    
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

export function renderDeepOceanFlightItem(item) {
    return `<div class="data-row" style="border-left-color:#10ac84; padding: 6px 12px; font-size: 0.9em; display:flex; justify-content:space-between; align-items:center;">
        <div style="font-weight:bold; width:65px; color:#10ac84;">${item.call}</div>
        <div style="flex-grow:1; text-align:center; color:#dfe6ff; font-size:0.85em;">${item.route}</div>
        <div style="width:55px; text-align:right; color:#a4b0be; font-size:0.85em;">${item.alt}</div>
    </div>`;
}

export function renderAviationItem(item) {
    const color = item.acCls === 'helo' ? '#ffd32a' : (item.acCls === 'small' ? '#74b9ff' : '#10ac84');
    return `<div class="data-row" style="border-left-color:${color}; padding: 6px 12px; font-size: 0.9em;">
        <div><div class="row-primary">${item.type} ${item.call}</div><div class="row-secondary">${item.route}</div></div>
        <div class="row-meta">${item.alt}<br><span style="font-size:0.75em;color:#a4b0be;">${item.spd}</span></div>
    </div>`;
}

export function getTrafficItems() {
    const items = [];
    const currView = currentView || 'default';
    let b;
    if (currView === 'harbor') b = L.latLng([37.80, -122.28]).toBounds(8000); 
    else b = L.latLngBounds([[37.5, -123.0], [38.5, -121.5]]);

    getAviationItems()
        .filter(a => a.lat != null && a.lng != null && b.contains([a.lat, a.lng]))
        .forEach(a => items.push({ icon: a.type, name: a.call, detail: `${a.alt}`, sub: a.route, color: a.type === '🚁' ? '#ffd32a' : '#1dd1a1' }));
    return items;
}

export function getBayTrafficItems() {
    const items = [];
    const b = L.latLngBounds([37.75, -122.55], [37.85, -122.35]);

    (liveData.aircraft || []).forEach(a => {
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

export function renderTrafficItem(item) {
    return `<div class="data-row" style="border-left-color:${item.color};">
        <div><div class="row-primary">${item.icon} ${item.name}</div><div class="row-secondary">${item.sub}</div></div>
        <div class="row-meta" style="color:${item.color};">${item.detail}</div>
    </div>`;
}

export function isInHarbor(lat, lng) {
    if (!lat || !lng) return false;
    return (lat >= 37.78 && lat <= 37.81 && lng >= -122.30 && lng <= -122.25);
}

export function renderBayTrafficCard(item) {
    const raw = item.raw || {};
    const imgUrl = raw.image_url;
    const visits = raw.visit_count || 1;
    const inHarbor = isInHarbor(raw.lat, raw.lng);
    const showImage = imgUrl && !inHarbor;
    const firstSeen = raw.first_seen || Date.now();
    
    let imgHtml = showImage ? `<img src="${imgUrl}" class="traffic-image">` : `<div class="traffic-image-placeholder">${item.icon}</div>`;
    let titleBadge = ((Date.now() - firstSeen) > 3 * 24 * 60 * 60 * 1000 && !imgUrl) ? `<span class="pic-wanted">PIC WANTED</span>` : '';

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

export function showFullscreenOverlay(elementId, imgId, imageUrl) {
    let el = document.getElementById(elementId);
    if (!el) {
        el = document.createElement('div');
        el.id = elementId;
        el.style.position = 'absolute';
        el.style.inset = '0';
        el.style.zIndex = '9999';
        el.style.pointerEvents = 'none';
        el.style.background = '#000';
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.8s ease-in-out';
        el.innerHTML = `<img id="${imgId}" style="width:100%; height:100%; object-fit:contain;">`;
        document.getElementById('viewport-scaler').appendChild(el);
    }
    const targetUrl = imageUrl + "?t=" + Math.floor(Date.now() / 300000);
    const img = document.getElementById(imgId);
    if (img.src !== targetUrl) img.src = targetUrl;
    el.style.display = 'block';
    void el.offsetWidth;
    el.style.opacity = '1';
    document.getElementById('main-dash').classList.add('hud-hidden');
}

export function hideFullscreenOverlay(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.style.opacity = '0';
    document.getElementById('main-dash').classList.remove('hud-hidden');
}

let _bottomHudTimer = null;

export function renderBottomTrafficItem(item) {
    const raw = item.raw || {};
    const imgUrl = raw.image_url;
    const inHarbor = isInHarbor(raw.lat, raw.lng);
    const showImage = imgUrl && !inHarbor;
    const firstSeen = raw.first_seen || Date.now();
    
    let imgHtml = showImage ? `<img src="${imgUrl}" class="btm-hud-img">` : '';
    let titleBadge = ((Date.now() - firstSeen) > 3 * 24 * 60 * 60 * 1000 && !imgUrl) ? `<span class="pic-wanted">PIC WANTED</span>` : '';
    const pl = showImage ? '65px' : '8px';
    
    return `<div class="btm-hud-item" style="border-left-color:${item.color}; padding-left: ${pl} !important;">
        ${imgHtml}
        <div class="btm-hud-title" style="color:${item.color}">${item.icon} ${item.name}${titleBadge}</div>
        <div class="btm-hud-sub">${item.sub}</div>
        <div class="btm-hud-spd">${item.detail}</div>
    </div>`;
}

export function startBottomTrafficHUD(mode) {
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

export function stopBottomTrafficHUD() {
    const hud = document.getElementById('bottom-traffic-hud');
    if (hud) hud.style.display = 'none';
    if (_bottomHudTimer) { clearInterval(_bottomHudTimer); _bottomHudTimer = null; }
}

export function updateSFOBox() {
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

export function hideSFOBox() {
    const box = document.getElementById('airport-status-box');
    if (box) box.style.display = 'none';
}

export function updateSFOBoxMet() {
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

export function hideSFOBoxMet() {
    const box = document.getElementById('airport-status-box-met');
    if (box) box.style.display = 'none';
}

export function updateLegend(type) {
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
    if (type === 'roms') {
        el.style.bottom = '250px';
    } else {
        el.style.bottom = '1%';
    }
}

// Ensure airports load here for initialization
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
