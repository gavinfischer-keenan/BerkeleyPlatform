/**
 * @file main.js
 */
import { transitionState } from './engine.js';
import { fetchAircraft, fetchStations, fetchCurrents, fetchTide, fetchWind, fetch7DayForecast, fetchBaySurfForecast, fetchWeather, fetchBuoys, fetchQuakes, fetchAlerts, fetchTurbulence, fetchAirQuality } from './fetch.js';
import './map-setup.js';
import './geo.js';
import './render.js';
import './ui-states.js';

fetchAircraft();
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
    transitionState();
    setInterval(fetchWeather,     5 * 60 * 1000);
    setTimeout(() => setInterval(fetchBuoys,       5 * 60 * 1000), 2000);
    setTimeout(() => setInterval(fetchQuakes,      5 * 60 * 1000), 4000);
    setTimeout(() => setInterval(fetchAlerts,      5 * 60 * 1000), 6000);
    setTimeout(() => setInterval(fetchTurbulence,  5 * 60 * 1000), 8000);
    setTimeout(() => setInterval(fetchAirQuality,  5 * 60 * 1000), 10000);
    setInterval(fetchAircraft,        10 * 1000);
    setTimeout(() => setInterval(fetchStations,    5 * 60 * 1000), 12000);
    setTimeout(() => setInterval(fetchCurrents,    5 * 60 * 1000), 14000);
    setTimeout(() => setInterval(fetchTide,        5 * 60 * 1000), 16000);
    setTimeout(() => setInterval(fetch7DayForecast, 60 * 60 * 1000), 18000);
    setTimeout(() => setInterval(fetchBaySurfForecast, 60 * 60 * 1000), 20000);
});

function initFPSMonitor() {
    let frameCount = 0;
    let lastTime = performance.now();
    let lowFpsTicks = 0; 
    
    function measure() {
        const now = performance.now();
        frameCount++;
        if (now - lastTime >= 1000) {
            const fps = frameCount;
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
    setTimeout(() => {
        console.warn('Executing daily 24-hour Kiosk memory flush...');
        window.location.reload();
    }, 24 * 60 * 60 * 1000);
}

initFPSMonitor();
initDailyRefresh();
