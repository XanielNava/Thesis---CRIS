/* ==========================================================================
   CRIS PHO MODULE — HEATMAP UI CONTROLLER (pho-heat-map-ui.js)
   Handles Leaflet Map & Basemap Switcher, Heatmap Layer Rendering, KPI Cards,
   Top Municipalities Ranking Panel, Filters, and Logout Modal.
   ========================================================================== */

import {
    loadSpatialCoordinatesMap,
    fetchHeatmapPopulationData,
    fetchLegacyHeatmapRows,
    subscribeToLiveHeatmapCases,
    signOutPhoHeatmap
} from '../db/pho-heatmap-db.js';

const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, attributes) {
    if (type === '2d') {
        attributes = Object.assign({}, attributes, { willReadFrequently: true });
    }
    return originalGetContext.call(this, type, attributes);
};

const MAP_CENTER = [10.90, 122.60];
const MAP_ZOOM = 9;
const FALLBACK_POPULATION = 2082616;
const TOP_MUNICIPALITY_COUNT = 5;

const BASEMAPS = {
    satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics',
        labelsUrl:
            'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
    },
    streets: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenStreetMap contributors',
        subdomains: 'abc'
    }
};

const LAYER_STYLES = {
    bite: {
        markerColor: '#EA6113',
        gradient: { '0.2': '#FFE082', '0.5': '#FFB300', '0.8': '#EA6113', '1.0': '#8C2F00' }
    },
    human: {
        markerColor: '#C62828',
        gradient: { '0.2': '#FFCDD2', '0.5': '#EF5350', '0.8': '#C62828', '1.0': '#7F0000' }
    },
    animal: {
        markerColor: '#1565C0',
        gradient: { '0.2': '#BBDEFB', '0.5': '#42A5F5', '0.8': '#1565C0', '1.0': '#002171' }
    }
};

let map = null;
let basemapLayer = null;
let labelLayer = null;
let legacyRows = [];
let liveRows = [];
let combinedData = [];
let totalHumanPopulation = 0;
let municipalityPopulations = {};
let currentHeatLayer = null;
let markerLayer = null;
let yearFilter = null;
let municipalityFilter = null;
let layerFilter = null;
let populationCard = null;
let redrawTimeout = null;
let casesLoaded = false;
let loadFailed = false;
let unsubscribeLive = null;

const $ = (id) => document.getElementById(id);
const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
const isValidCoord = (lat, lng) =>
    Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;

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

/* ==========================================================================
   1. MAP & BASEMAP CONTROLS
   ========================================================================== */

function initializeMap() {
    map = L.map('map', { zoomControl: false, preferCanvas: true });
    L.control.zoom({ position: 'topleft' }).addTo(map);
    L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);

    map.createPane('labels');
    const labelPane = map.getPane('labels');
    labelPane.style.zIndex = 650;
    labelPane.style.pointerEvents = 'none';

    markerLayer = L.layerGroup().addTo(map);
    map.setView(MAP_CENTER, MAP_ZOOM);
    setBasemap('satellite');
    setTimeout(() => {
        if (map) map.invalidateSize();
    }, 300);
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
        labelLayer = L.tileLayer(config.labelsUrl, { maxZoom: 19, pane: 'labels' }).addTo(map);
    }

    document.querySelectorAll('[data-basemap]').forEach((btn) => {
        const active = btn.dataset.basemap === key;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
}

function fitToData() {
    if (!map) return;
    const points = getFilteredData()
        .map((row) => [Number(row.Latitude), Number(row.Longitude)])
        .filter(([lat, lng]) => isValidCoord(lat, lng));

    if (points.length) {
        map.fitBounds(points, { padding: [40, 40] });
    } else {
        map.setView(MAP_CENTER, MAP_ZOOM);
    }
}

/* ==========================================================================
   2. DATA MERGING, FILTERS & KPI STATISTICS
   ========================================================================== */

function mergeHeatmapDatasets() {
    const mergedMap = new Map();

    [...legacyRows, ...liveRows].forEach((row) => {
        const key = `${row.Year}__${String(row.Municipality || '').trim().toLowerCase()}`;
        if (!mergedMap.has(key)) {
            mergedMap.set(key, { ...row });
        } else {
            const existing = mergedMap.get(key);
            existing['Animal Bite Cases'] += Number(row['Animal Bite Cases']) || 0;
            existing['Human Rabies Deaths'] += Number(row['Human Rabies Deaths']) || 0;
            existing['Animal Rabies Deaths'] += Number(row['Animal Rabies Deaths']) || 0;
        }
    });

    combinedData = Array.from(mergedMap.values());
    populateFilters();
    refreshMap();
}

function populateFilters() {
    const prevYear = yearFilter ? yearFilter.value : 'All';
    const prevMun = municipalityFilter ? municipalityFilter.value : 'All';

    if (yearFilter) {
        const years = [...new Set(combinedData.map((item) => item.Year))].sort((a, b) => b - a);
        yearFilter.innerHTML = '<option value="All">All Years</option>';
        years.forEach((year) => {
            const option = document.createElement('option');
            option.value = String(year);
            option.textContent = String(year);
            yearFilter.appendChild(option);
        });
        if (prevYear !== 'All' && years.map(String).includes(prevYear)) {
            yearFilter.value = prevYear;
        }
    }

    if (municipalityFilter) {
        const municipalities = [...new Set(combinedData.map((item) => item.Municipality))].sort();
        municipalityFilter.innerHTML = '<option value="All">All Municipalities</option>';
        municipalities.forEach((mun) => {
            const option = document.createElement('option');
            option.value = mun;
            option.textContent = mun;
            municipalityFilter.appendChild(option);
        });
        if (prevMun !== 'All' && municipalities.includes(prevMun)) {
            municipalityFilter.value = prevMun;
        }
    }
}

function getFilteredData() {
    let filtered = [...combinedData];
    if (yearFilter && yearFilter.value !== 'All') {
        filtered = filtered.filter((item) => String(item.Year) === yearFilter.value);
    }
    if (municipalityFilter && municipalityFilter.value !== 'All') {
        const selected = municipalityFilter.value.trim().toLowerCase();
        filtered = filtered.filter(
            (item) => String(item.Municipality).trim().toLowerCase() === selected
        );
    }
    return filtered;
}

function updateHumanPopulationCard() {
    const card = populationCard || $('humanPopulation');
    if (!card) return;

    if (municipalityFilter && municipalityFilter.value !== 'All') {
        const munPop = municipalityPopulations[municipalityFilter.value.trim().toLowerCase()] || 0;
        card.textContent = (munPop > 0 ? munPop : totalHumanPopulation).toLocaleString();
    } else {
        card.textContent = totalHumanPopulation.toLocaleString();
    }
}

function updateStatistics(data) {
    updateHumanPopulationCard();

    const prevalenceCard = $('prevalenceRate');
    const incidentsCard = $('incidentsRate');
    const mortalityCard = $('mortalityRate');

    let biteTotal = 0;
    let humanTotal = 0;
    const trackedMunicipalitiesInFilter = new Set();

    if (data && data.length > 0) {
        data.forEach((row) => {
            biteTotal += Number(row['Animal Bite Cases']) || 0;
            humanTotal += Number(row['Human Rabies Deaths']) || 0;
            if (row.Municipality) {
                trackedMunicipalitiesInFilter.add(row.Municipality.trim().toLowerCase());
            }
        });
    }

    let activePopulation = 0;
    if (municipalityFilter && municipalityFilter.value !== 'All') {
        activePopulation =
            municipalityPopulations[municipalityFilter.value.trim().toLowerCase()] || 0;
    } else if (totalHumanPopulation > 0) {
        activePopulation = totalHumanPopulation;
    } else {
        trackedMunicipalitiesInFilter.forEach((mun) => {
            activePopulation += municipalityPopulations[mun] || 0;
        });
    }

    if (activePopulation === 0) {
        activePopulation = FALLBACK_POPULATION;
    }

    const prevRate = (biteTotal / activePopulation) * 100;
    const incRate = (biteTotal / activePopulation) * 100;
    const mortRate = (humanTotal / activePopulation) * 100;

    if (prevalenceCard) prevalenceCard.textContent = `${prevRate.toFixed(2)}%`;
    if (incidentsCard) incidentsCard.textContent = `${incRate.toFixed(2)}%`;
    if (mortalityCard) mortalityCard.textContent = `${mortRate.toFixed(2)}%`;
}

function updateTopMunicipalities(data) {
    const panel = $('topMunicipalities');
    if (!panel) return;

    const totals = {};
    (data || []).forEach((row) => {
        if (!row.Municipality) return;
        totals[row.Municipality] =
            (totals[row.Municipality] || 0) + (Number(row['Animal Bite Cases']) || 0);
    });

    const ranking = Object.entries(totals)
        .map(([municipality, total]) => ({ municipality, total }))
        .filter((item) => item.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, TOP_MUNICIPALITY_COUNT);

    panel.innerHTML = ranking.length
        ? ranking
              .map(
                  (item, index) => `
        <div class="top-item">
            <span class="rank">${index + 1}</span>
            <span class="name" title="${esc(item.municipality)}">${esc(item.municipality)}</span>
            <strong class="count">${item.total.toLocaleString()}</strong>
        </div>`
              )
              .join('')
        : '<p class="panel-empty">No bite cases recorded for this selection.</p>';
}

/* ==========================================================================
   3. HEATMAP DRAWING & MARKERS
   ========================================================================== */

function buildPopup(row, biteCases, humanDeaths, animalDeaths) {
    return `
        <div class="popup-title">${esc(row.Municipality)}</div>
        <dl class="popup-grid">
            <dt>Year</dt><dd>${esc(row.Year)}</dd>
            <dt>Bite cases</dt><dd>${biteCases.toLocaleString()}</dd>
            <dt>Human deaths</dt><dd>${humanDeaths.toLocaleString()}</dd>
            <dt>Animal deaths</dt><dd>${animalDeaths.toLocaleString()}</dd>
        </dl>`;
}

function clearMap() {
    if (!map) return;
    if (currentHeatLayer) {
        map.removeLayer(currentHeatLayer);
        currentHeatLayer = null;
    }
    if (markerLayer) markerLayer.clearLayers();
}

function drawHeatmap(data) {
    clearMap();
    if (!map || !data || data.length === 0 || typeof L.heatLayer !== 'function') return;

    const selectedLayer = currentLayer();
    const style = LAYER_STYLES[selectedLayer] || LAYER_STYLES.bite;
    const bounds = [];
    const heatPoints = [];
    let maxMetric = 1;

    data.forEach((row) => {
        let val = 0;
        if (selectedLayer === 'bite') val = Number(row['Animal Bite Cases']) || 0;
        else if (selectedLayer === 'human') val = Number(row['Human Rabies Deaths']) || 0;
        else if (selectedLayer === 'animal') val = Number(row['Animal Rabies Deaths']) || 0;
        if (val > maxMetric) maxMetric = val;
    });

    data.forEach((row) => {
        const lat = Number(row.Latitude);
        const lng = Number(row.Longitude);
        if (!isValidCoord(lat, lng)) return;

        bounds.push([lat, lng]);
        const biteCases = Number(row['Animal Bite Cases']) || 0;
        const humanDeaths = Number(row['Human Rabies Deaths']) || 0;
        const animalDeaths = Number(row['Animal Rabies Deaths']) || 0;

        let activeMetric = biteCases;
        if (selectedLayer === 'human') activeMetric = humanDeaths;
        else if (selectedLayer === 'animal') activeMetric = animalDeaths;

        if (activeMetric > 0) {
            heatPoints.push([
                lat,
                lng,
                Math.min(Math.max(activeMetric / maxMetric, 0.15), 1.0)
            ]);
        }

        const markerRadius =
            activeMetric > 0
                ? Math.min(Math.max(4 + (activeMetric / maxMetric) * 8, 4), 12)
                : 4;

        const marker = L.circleMarker([lat, lng], {
            radius: markerRadius,
            color: '#ffffff',
            weight: 1.5,
            fillColor: style.markerColor,
            fillOpacity: 0.9
        });
        marker.bindPopup(buildPopup(row, biteCases, humanDeaths, animalDeaths), {
            className: 'heat-popup'
        });
        if (markerLayer) markerLayer.addLayer(marker);
    });

    currentHeatLayer = L.heatLayer(heatPoints, {
        radius: 35,
        blur: 22,
        maxZoom: 14,
        max: 1.0,
        minOpacity: 0.35,
        gradient: style.gradient
    }).addTo(map);

    if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40] });
    }
}

function updateLegend() {
    const active = currentLayer();
    document.querySelectorAll('[data-legend]').forEach((item) => {
        item.classList.toggle('is-active', item.dataset.legend === active);
    });
}

function updateMapState(data) {
    if (!casesLoaded) {
        setHidden('mapLoading', false);
        setHidden('mapEmpty', true);
        return;
    }
    setHidden('mapLoading', true);
    if (loadFailed) {
        setText('mapEmptyText', 'Unable to load case data. Please refresh the page.');
        setHidden('mapEmpty', false);
        return;
    }
    if (!data || data.length === 0) {
        setText(
            'mapEmptyText',
            combinedData.length
                ? 'No cases match the selected filters.'
                : 'No case records are available yet.'
        );
        setHidden('mapEmpty', false);
        return;
    }
    setHidden('mapEmpty', true);
}

function refreshMap() {
    clearTimeout(redrawTimeout);
    redrawTimeout = setTimeout(() => {
        if (!map) return;
        const filteredData = getFilteredData();
        updateStatistics(filteredData);
        updateTopMunicipalities(filteredData);
        updateLegend();
        drawHeatmap(filteredData);
        updateMapState(filteredData);
    }, 100);
}

/* ==========================================================================
   4. CONTROLS, LOGOUT MODAL & BOOTSTRAP
   ========================================================================== */

function setupLogoutModal() {
    const logoutBtn = $('logout-btn');
    const modal = $('logoutModal');
    const cancelBtn = $('logoutCancelBtn');
    const confirmBtn = $('logoutConfirmBtn');
    if (!modal) return;

    const openModal = () => {
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
    };
    const closeModal = () => {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    };

    logoutBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
    });
    cancelBtn?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });

    confirmBtn?.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Logging out...';
        try {
            await signOutPhoHeatmap();
        } catch (err) {
            console.error('Sign out error:', err);
        } finally {
            ['userUid', 'userEmail', 'userRole', 'userDesignation', 'userStatus'].forEach((key) =>
                localStorage.removeItem(key)
            );
            window.location.href = 'pho-login.html';
        }
    });
}

function initializeControls() {
    yearFilter = $('yearFilter');
    municipalityFilter = $('municipalityFilter');
    layerFilter = $('layerFilter');
    populationCard = $('humanPopulation');

    yearFilter?.addEventListener('change', refreshMap);
    municipalityFilter?.addEventListener('change', refreshMap);
    layerFilter?.addEventListener('change', refreshMap);

    document.querySelectorAll('[data-basemap]').forEach((btn) =>
        btn.addEventListener('click', () => setBasemap(btn.dataset.basemap))
    );
    $('resetViewBtn')?.addEventListener('click', fitToData);
}

window.addEventListener('resize', () => {
    if (map) map.invalidateSize();
});

document.addEventListener('DOMContentLoaded', async () => {
    setupLogoutModal();
    updateMapState(null);

    try {
        const spatialMaps = await loadSpatialCoordinatesMap();
        initializeMap();
        initializeControls();

        const popResult = await fetchHeatmapPopulationData();
        totalHumanPopulation = popResult.totalHumanPopulation;
        municipalityPopulations = popResult.municipalityPopulations;
        updateHumanPopulationCard();

        legacyRows = await fetchLegacyHeatmapRows(spatialMaps.coordsMap);

        if (unsubscribeLive) unsubscribeLive();
        unsubscribeLive = subscribeToLiveHeatmapCases(
            spatialMaps,
            (liveCases) => {
                liveRows = liveCases;
                casesLoaded = true;
                mergeHeatmapDatasets();
            },
            () => {
                liveRows = [];
                casesLoaded = true;
                mergeHeatmapDatasets();
            }
        );
    } catch (err) {
        console.error('Critical initialization failure:', err);
        loadFailed = true;
        casesLoaded = true;
        refreshMap();
    }
});