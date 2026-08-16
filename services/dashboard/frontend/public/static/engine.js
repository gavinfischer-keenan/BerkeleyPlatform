/**
 * @file engine.js
 */
import { uiStates } from './ui-states.js';
import { map, stationLayer, surfLayer, currentLayer, alertLayer, turbulenceLayer, airportLayer, hazardTextLayer, quakeLayer, lightningLayer, denseDepthLayer, superDenseDepthLayer, sparseDepthLayer, deepOceanAirLayer, romsTempLayer, aqiLayer, airLayer, buoyLayer, tideLayer, bayTideLayer, radarLayerGroup, windLayer, waveLayer, liveData, setCurrentView } from './state.js';
import { declutterLabels } from './render.js';
import { bounds } from './map-setup.js';

export const PAGE_SIZE = 12;
export let currentStateIndex = 0;
export let currentPage = 0;
export let _pageTimer = null;
export let _prevStateIndex = -1;
export let lastView = 'default';

export function transitionState() {
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

    [
        stationLayer, surfLayer, currentLayer, alertLayer, turbulenceLayer, 
        airportLayer, hazardTextLayer, quakeLayer, lightningLayer, denseDepthLayer,
        superDenseDepthLayer, sparseDepthLayer, deepOceanAirLayer, romsTempLayer,
        aqiLayer, airLayer, buoyLayer, tideLayer, bayTideLayer, radarLayerGroup,
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
        map.setMaxBounds(null);
        map.setMinZoom(0);

        if (currView === 'default') {
            map.flyToBounds(bounds, { animate: true, duration: 1.5 });
            setTimeout(() => {
                if ((uiStates[currentStateIndex].view || 'default') === 'default') {
                    map.setMaxBounds(bounds);
                }
            }, 1600);
        } else if (currView === 'harbor') {
            map.flyTo([37.80, -122.28], 12, { animate: true, duration: 1.8 });
            setTimeout(() => {
                if (uiStates[currentStateIndex].view === 'harbor') {
                    map.setMaxBounds(bounds);
                }
            }, 1900);
        } else if (currView === 'bay-zoom') {
            document.getElementById('map').classList.add('bay-zoom');
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
        setCurrentView(currView);
    }

    declutterLabels();

    document.getElementById('tab-title').innerText     = state.title;
    document.getElementById('sub-indicator').innerText = state.sub;

    const hasAdvisory = (liveData.alerts?.alerts ?? []).some(a => {
        if (!/small craft|hazardous seas/i.test(a.event ?? '')) return false;
        if (state.view !== 'wide') {
            const desc = ((a.areaDesc || '') + ' ' + (a.description || '')).toLowerCase();
            if (!desc.includes('bay area') && !desc.includes('berkeley') && !desc.includes('san francisco')) {
                return false;
            }
        }
        return true;
    });
    document.getElementById('main-dash').classList.toggle('warning-active', hasAdvisory);

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
