import { listenToProvincePopulation, fetchHeatmapCasePoints } from '../db/pvo-heatmap-db.js';

/* ==========================================================================
   PVO HEATMAPS — map UI controller
   Data loading and population logic are unchanged from the original file.
   This file controls the map presentation: basemaps, legend, loading and
   empty states, filters, statistics display, and the top municipalities panel.

   Sections
     1. Configuration
     2. State
     3. Helpers
     4. Map setup and basemaps
     5. Filters and controls
     6. Statistics and rankings
     7. Heatmap drawing
     8. Legend and states
     9. Refresh and initialization
   ========================================================================== */

/* ======================================================================
   1. CONFIGURATION
   ====================================================================== */

const MAP_CENTER = [10.90, 122.60];
const MAP_ZOOM = 9;
const FALLBACK_POPULATION = 2082616;
const TOP_MUNICIPALITY_COUNT = 5;

const BASEMAPS = {
    satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics',
        labelsUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
    },
    streets: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenStreetMap contributors',
        subdomains: 'abc'
    }
};

const HEAT_STYLES = {
    bite: {
        radius: 28,
        blur: 18,
        gradient: { 0.25: '#FBB931', 0.55: '#F88F22', 0.8: '#EA6113', 1.0: '#9A3412' }
    },
    human: {
        radius: 24,
        blur: 16,
        gradient: { 0.25: '#FCA5A5', 0.55: '#EF4444', 0.8: '#B71C1C', 1.0: '#4C0519' }
    }
};

/* ======================================================================
   2. STATE
   ====================================================================== */

let map = null;
let basemapLayer = null;
let labelLayer = null;
let markerLayer = null;
let biteHeatLayer = null;
let humanHeatLayer = null;

let heatmapData = [];
let totalHumanPopulation = 0;
let municipalityPopulations = {};

let yearFilter = null;
let municipalityFilter = null;
let layerFilter = null;

/* ======================================================================
   3. HELPERS
   ====================================================================== */

const $ = (id) => document.getElementById(id);

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const num = (value) => Number(value) || 0;

const normalize = (value) => String(value ?? '').trim().toLowerCase();

const isFiniteCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng);

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function setHidden(id, hidden) {
    const el = $(id);
    if (el) el.hidden = hidden;
}

function currentLayer() {
    return layerFilter ? layerFilter.value : 'bite';
}

function isMunicipalityFiltered() {
    return Boolean(municipalityFilter) && municipalityFilter.value !== 'All';
}

/* ======================================================================
   4. MAP SETUP AND BASEMAPS
   ====================================================================== */

function initializeMap() {
    map = L.map('map', {
        zoomControl: false,
        preferCanvas: true
    });

    L.control.zoom({ position: 'topleft' }).addTo(map);
    L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);

    // Labels sit above the heat layers so place names remain readable
    map.createPane('labels');
    const labelPane = map.getPane('labels');
    labelPane.style.zIndex = 650;
    labelPane.style.pointerEvents = 'none';

    markerLayer = L.layerGroup().addTo(map);
    map.setView(MAP_CENTER, MAP_ZOOM);

    setBasemap('satellite');
}

function setBasemap(key) {
    const config = BASEMAPS[key];
    if (!config || !map) return;

    if (basemapLayer) map.removeLayer(basemapLayer);
    if (labelLayer) {
        map.removeLayer(labelLayer);
        labelLayer = null;
    }

    basemapLayer = L.tileLayer(config.url, {
        maxZoom: 19,
        attribution: config.attribution,
        subdomains: config.subdomains || 'abc'
    }).addTo(map);

    if (config.labelsUrl) {
        labelLayer = L.tileLayer(config.labelsUrl, {
            maxZoom: 19,
            pane: 'labels'
        }).addTo(map);
    }

    document.querySelectorAll('[data-basemap]').forEach((btn) => {
        const active = btn.dataset.basemap === key;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
}

function fitToData() {
    const bounds = getFilteredData()
        .map((row) => [Number(row.Latitude), Number(row.Longitude)])
        .filter(([lat, lng]) => isFiniteCoord(lat, lng));

    if (!map) return;

    if (bounds.length) {
        map.fitBounds(bounds, { padding: [40, 40] });
    } else {
        map.setView(MAP_CENTER, MAP_ZOOM);
    }
}

/* ======================================================================
   5. FILTERS AND CONTROLS
   ====================================================================== */

function initializeControls() {
    yearFilter = $('yearFilter');
    municipalityFilter = $('municipalityFilter');
    layerFilter = $('layerFilter');

    yearFilter?.addEventListener('change', refreshMap);
    municipalityFilter?.addEventListener('change', refreshMap);
    layerFilter?.addEventListener('change', refreshMap);

    document.querySelectorAll('[data-basemap]').forEach((btn) => {
        btn.addEventListener('click', () => setBasemap(btn.dataset.basemap));
    });

    $('resetViewBtn')?.addEventListener('click', fitToData);
}

function populateFilters() {
    if (yearFilter) {
        yearFilter.innerHTML = '<option value="All">All Years</option>';
        const years = [...new Set(heatmapData.map((item) => item.Year).filter(Boolean))].sort();
        years.forEach((year) => {
            const opt = document.createElement('option');
            opt.value = String(year);
            opt.textContent = String(year);
            yearFilter.appendChild(opt);
        });
    }

    if (municipalityFilter) {
        municipalityFilter.innerHTML = '<option value="All">All Municipalities</option>';
        const municipalities = [...new Set(heatmapData.map((item) => item.Municipality).filter(Boolean))].sort();
        municipalities.forEach((name) => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            municipalityFilter.appendChild(opt);
        });
    }
}

function getFilteredData() {
    let filtered = [...heatmapData];

    if (yearFilter && yearFilter.value !== 'All') {
        filtered = filtered.filter((item) => String(item.Year) === yearFilter.value);
    }

    if (isMunicipalityFiltered()) {
        filtered = filtered.filter((item) => normalize(item.Municipality) === normalize(municipalityFilter.value));
    }

    return filtered;
}

/* ======================================================================
   6. STATISTICS AND RANKINGS
   ====================================================================== */

function updateHumanPopulationCard() {
    setText('humanPopulation', totalHumanPopulation.toLocaleString());
}

function updateStatistics(data) {
    let biteTotal = 0;
    let deathTotal = 0;
    const municipalities = new Set();

    data.forEach((row) => {
        biteTotal += num(row['Animal Bite Cases']);
        deathTotal += num(row['Human Rabies Deaths']);
        if (row.Municipality) municipalities.add(normalize(row.Municipality));
    });

    let population = 0;
    if (isMunicipalityFiltered()) {
        population = municipalityPopulations[normalize(municipalityFilter.value)] || 0;
    } else {
        municipalities.forEach((name) => {
            population += municipalityPopulations[name] || 0;
        });
    }

    if (!population) {
        population = totalHumanPopulation > 0 ? totalHumanPopulation : FALLBACK_POPULATION;
    }

    const biteRate = (biteTotal / population) * 100;
    const mortalityRate = (deathTotal / population) * 100;

    setText('prevalenceRate', `${biteRate.toFixed(3)}%`);
    setText('incidentsRate', `${biteRate.toFixed(3)}%`);
    setText('mortalityRate', `${mortalityRate.toFixed(4)}%`);
}

function updateTopMunicipalities(data) {
    const container = $('topMunicipalities');
    if (!container) return;

    const totals = new Map();
    data.forEach((row) => {
        const name = String(row.Municipality ?? '').trim();
        if (!name) return;
        totals.set(name, (totals.get(name) || 0) + num(row['Animal Bite Cases']));
    });

    const ranked = [...totals.entries()]
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_MUNICIPALITY_COUNT);

    container.innerHTML = ranked.length
        ? ranked.map(([name, count], index) => `
            <div class="top-item">
                <span class="rank">${index + 1}</span>
                <span class="name" title="${esc(name)}">${esc(name)}</span>
                <strong class="count">${count.toLocaleString()}</strong>
            </div>`).join('')
        : '<p class="panel-empty">No bite cases recorded for this selection.</p>';
}

/* ======================================================================
   7. HEATMAP DRAWING
   ====================================================================== */

function generateCluster(lat, lng, cases, spread) {
    const points = [];
    const count = Math.max(Math.round(cases / 5), 1);

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.sqrt(Math.random()) * spread;
        points.push([lat + Math.cos(angle) * dist, lng + Math.sin(angle) * dist, 1.0]);
    }
    return points;
}

function buildPopup(row) {
    return `
        <div class="popup-title">${esc(row.Municipality)}</div>
        <dl class="popup-grid">
            <dt>Year</dt><dd>${esc(row.Year)}</dd>
            <dt>Bite cases</dt><dd>${num(row['Animal Bite Cases']).toLocaleString()}</dd>
            <dt>Rabies deaths</dt><dd>${num(row['Human Rabies Deaths']).toLocaleString()}</dd>
        </dl>`;
}

function clearMap() {
    if (biteHeatLayer) map.removeLayer(biteHeatLayer);
    if (humanHeatLayer) map.removeLayer(humanHeatLayer);
    biteHeatLayer = null;
    humanHeatLayer = null;
    if (markerLayer) markerLayer.clearLayers();
}

function drawHeatmap(data) {
    clearMap();
    setEmptyState(data.length === 0);

    if (!data.length) return;

    const bitePoints = [];
    const humanPoints = [];
    const bounds = [];

    data.forEach((row) => {
        const lat = Number(row.Latitude);
        const lng = Number(row.Longitude);
        if (!isFiniteCoord(lat, lng)) return;

        bounds.push([lat, lng]);

        const bites = num(row['Animal Bite Cases']);
        const deaths = num(row['Human Rabies Deaths']);

        if (bites > 0) bitePoints.push(...generateCluster(lat, lng, bites, 0.020));
        if (deaths > 0) humanPoints.push(...generateCluster(lat, lng, deaths, 0.010));

        const marker = L.circleMarker([lat, lng], {
            radius: 6,
            color: '#ffffff',
            weight: 2,
            fillColor: '#0b132b',
            fillOpacity: 1
        });
        marker.bindPopup(buildPopup(row), { className: 'heat-popup' });
        markerLayer.addLayer(marker);
    });

    biteHeatLayer = L.heatLayer(bitePoints, { ...HEAT_STYLES.bite });
    humanHeatLayer = L.heatLayer(humanPoints, { ...HEAT_STYLES.human });

    // Selection logic is unchanged from the original file
    if (currentLayer() === 'bite') {
        biteHeatLayer.addTo(map);
    } else {
        humanHeatLayer.addTo(map);
    }

    if (bounds.length) {
        map.fitBounds(bounds, { padding: [40, 40] });
    }
}

/* ======================================================================
   8. LEGEND AND STATES
   ====================================================================== */

function updateLegend() {
    const active = currentLayer();
    document.querySelectorAll('[data-legend]').forEach((item) => {
        item.classList.toggle('is-active', item.dataset.legend === active);
    });
}

function setMapLoading(isLoading) {
    setHidden('mapLoading', !isLoading);
}

function setEmptyState(isEmpty, message) {
    if (message) setText('mapEmptyText', message);
    setHidden('mapEmpty', !isEmpty);
}

/* ======================================================================
   9. REFRESH AND INITIALIZATION
   ====================================================================== */

function refreshMap() {
    const data = getFilteredData();
    updateStatistics(data);
    updateTopMunicipalities(data);
    updateLegend();
    drawHeatmap(data);
}

document.addEventListener('DOMContentLoaded', async () => {
    initializeMap();
    initializeControls();
    setMapLoading(true);

    listenToProvincePopulation(({ totalPop, muniPop }) => {
        totalHumanPopulation = totalPop || 0;
        municipalityPopulations = muniPop || {};
        updateHumanPopulationCard();
        refreshMap();
    });

    try {
        heatmapData = (await fetchHeatmapCasePoints()) || [];
        populateFilters();
        refreshMap();
    } catch (error) {
        console.error('Heatmap data failed to load:', error);
        setEmptyState(true, 'Unable to load case data. Please refresh the page.');
    } finally {
        setMapLoading(false);
    }
});