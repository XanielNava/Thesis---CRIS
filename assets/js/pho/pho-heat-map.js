// ==============================================================================
// pho-heat-map.js — CRIS PHO Heatmap Controller
//
// The data logic is unchanged from the original: Firestore reads, facility
// coordinate mapping, population lookups, filter values, and rate formulas.
// This file controls presentation only: satellite basemap, legend, loading and
// empty states, fit-to-data, ranked municipality panel, and the logout dialog.
//
// Sections
//   1. Imports and browser setup
//   2. Configuration
//   3. State
//   4. Helpers
//   5. Facility coordinate mapping
//   6. Logout dialog
//   7. Map setup and basemaps
//   8. Firestore data (unchanged)
//   9. Filters and statistics (unchanged)
//  10. Top municipalities panel
//  11. Heatmap drawing
//  12. Legend and map states
//  13. Refresh, controls, and initialization
// ==============================================================================

import { auth, db } from '../firebase/firebase-config.js';
import {
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

/* ======================================================================
   1. IMPORTS AND BROWSER SETUP
   ====================================================================== */

// Silence Chromium Canvas2D readback warning
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, attributes) {
    if (type === "2d") {
        attributes = Object.assign({}, attributes, { willReadFrequently: true });
    }
    return originalGetContext.call(this, type, attributes);
};

/* ======================================================================
   2. CONFIGURATION
   ====================================================================== */

const MAP_CENTER = [10.90, 122.60];
const MAP_ZOOM = 9;
const FALLBACK_LOCATION = { lat: 10.90, lng: 122.60 };
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

// Heat gradients and marker colours for each layer (unchanged palette)
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

/* ======================================================================
   3. STATE
   ====================================================================== */

let map = null;
let basemapLayer = null;
let labelLayer = null;

let facilityCoordinates = {};
let excelData = [];
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

/* ======================================================================
   4. HELPERS
   ====================================================================== */

const $ = (id) => document.getElementById(id);

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
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

/* ======================================================================
   5. FACILITY COORDINATE MAPPING (unchanged logic)
   ====================================================================== */

async function loadFacilityCoordinates() {
    try {
        const response = await fetch('../../assets/data/facility-mapping.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();

        if (data && Array.isArray(data.facilities)) {
            data.facilities.forEach(facility => {
                if (facility.facility_name) {
                    const cleanKey = facility.facility_name.trim().toLowerCase();
                    facilityCoordinates[cleanKey] = {
                        lat: Number(facility.latitude),
                        lng: Number(facility.longitude)
                    };
                }
            });
        }
    } catch (error) {
        console.error("❌ Error loading facility coordinates:", error);
    }
}

function getCoordinates(facilityName) {
    if (!facilityName) return FALLBACK_LOCATION;

    const cleanName = String(facilityName).trim().toLowerCase();

    if (facilityCoordinates[cleanName]) {
        return facilityCoordinates[cleanName];
    }

    const keys = Object.keys(facilityCoordinates);
    for (const key of keys) {
        if (cleanName.includes(key) || key.includes(cleanName)) {
            return facilityCoordinates[key];
        }
    }

    return FALLBACK_LOCATION;
}

/* ======================================================================
   6. LOGOUT DIALOG
   One handler replaces the two earlier handlers. Sign-out and the redirect
   to pho-login.html are unchanged.
   ====================================================================== */

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
            await signOut(auth);
        } catch (err) {
            console.error('Sign out error:', err);
        } finally {
            ['userUid', 'userEmail', 'userRole', 'userDesignation', 'userStatus']
                .forEach((key) => localStorage.removeItem(key));
            window.location.href = 'pho-login.html';
        }
    });
}

/* ======================================================================
   7. MAP SETUP AND BASEMAPS
   ====================================================================== */

function initializeMap() {
    map = L.map('map', {
        zoomControl: false,
        preferCanvas: true
    });

    L.control.zoom({ position: 'topleft' }).addTo(map);
    L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);

    // Place labels sit above the heat layers so names stay readable
    map.createPane('labels');
    const labelPane = map.getPane('labels');
    labelPane.style.zIndex = 650;
    labelPane.style.pointerEvents = 'none';

    markerLayer = L.layerGroup().addTo(map);
    map.setView(MAP_CENTER, MAP_ZOOM);

    setBasemap('satellite');
    setTimeout(() => { if (map) map.invalidateSize(); }, 300);
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

/* ======================================================================
   8. FIRESTORE DATA (unchanged logic)
   ====================================================================== */

async function fetchPopulationDataFromFirestore() {
    try {
        const populationCollection = collection(db, "pho-database", "main", "population-data");
        const querySnapshot = await getDocs(populationCollection);

        if (querySnapshot.empty) {
            totalHumanPopulation = 0;
            municipalityPopulations = {};
            updateHumanPopulationCard();
            refreshMap();
            return;
        }

        let totalPopulationAccumulator = 0;
        const updatedMunicipalities = {};

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const docIdUpper = docSnap.id.trim().toUpperCase();

            if (docIdUpper === "ILOILO" || docIdUpper === "ILOILO_TOTAL") {
                totalPopulationAccumulator = Number(data.totalPopulation) || 0;
            } else {
                const municipalityName = data.facilityName || data.municipality || docSnap.id;
                if (municipalityName && data.totalPopulation !== undefined) {
                    const key = municipalityName.trim().toLowerCase();
                    updatedMunicipalities[key] = Number(data.totalPopulation) || 0;
                }
            }
        });

        if (totalPopulationAccumulator === 0) {
            Object.values(updatedMunicipalities).forEach(val => totalPopulationAccumulator += val);
        }

        municipalityPopulations = updatedMunicipalities;
        totalHumanPopulation = totalPopulationAccumulator;

        updateHumanPopulationCard();
        refreshMap();

    } catch (error) {
        console.error("❌ Error fetching population data:", error);
    }
}

function updateHumanPopulationCard() {
    const card = populationCard || $('humanPopulation');
    if (card) {
        card.textContent = totalHumanPopulation.toLocaleString();
    }
}

async function fetchLatestCaseDataFromFirestore() {
    try {
        let caseCollection = collection(db, "pho-database", "main", "legacy-summary");
        let querySnapshot = await getDocs(caseCollection);

        if (querySnapshot.empty) {
            caseCollection = collection(db, "pho_rabies_cases");
            querySnapshot = await getDocs(caseCollection);
        }

        if (querySnapshot.empty) {
            excelData = [];
            updateStatistics([]);
            return;
        }

        excelData = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();

            if (data.rawData && Array.isArray(data.rawData)) {
                const row = data.rawData;
                const rawMunName = row[0] || "Unknown";
                const cleanedMunName = String(rawMunName).trim();
                const coords = getCoordinates(cleanedMunName);

                const is24Col = row.length >= 17;
                const biteCases = is24Col ? (Number(row[16]) || (Number(row[1]) + Number(row[2])) || 0) : (Number(row[1]) || 0);
                const humanDeaths = is24Col ? (Number(row[12]) || 0) : (Number(row[2]) || 0);
                const animalDeaths = is24Col ? 0 : (Number(row[3]) || 0);

                excelData.push({
                    Year: data.year || new Date().getFullYear(),
                    Municipality: cleanedMunName,
                    Latitude: coords.lat,
                    Longitude: coords.lng,
                    "Animal Bite Cases": biteCases,
                    "Human Rabies Deaths": humanDeaths,
                    "Animal Rabies Deaths": animalDeaths
                });
            } else {
                const rawMunName = data.municipality || data.facilityName || "Unknown";
                const cleanedMunName = String(rawMunName).trim();
                const coords = getCoordinates(cleanedMunName);

                excelData.push({
                    Year: data.year || new Date().getFullYear(),
                    Municipality: cleanedMunName,
                    Latitude: coords.lat,
                    Longitude: coords.lng,
                    "Animal Bite Cases": Number(data.total || data.totalCases || data.biteCases) || 0,
                    "Human Rabies Deaths": Number(data.hr || data.humanDeaths) || 0,
                    "Animal Rabies Deaths": Number(data.animalDeaths) || 0
                });
            }
        });

        if (excelData.length > 0) {
            populateFilters();
            refreshMap();
        } else {
            updateStatistics([]);
        }
    } catch (error) {
        console.error("❌ Error fetching case data:", error);
        updateStatistics([]);
    }
}

/* ======================================================================
   9. FILTERS AND STATISTICS (unchanged logic)
   ====================================================================== */

function populateFilters() {
    if (yearFilter) {
        yearFilter.innerHTML = '<option value="All">All Years</option>';
        const years = [...new Set(excelData.map(item => item.Year))].sort();
        years.forEach(year => {
            const option = document.createElement("option");
            option.value = year;
            option.textContent = year;
            yearFilter.appendChild(option);
        });
    }

    if (municipalityFilter) {
        municipalityFilter.innerHTML = '<option value="All">All Municipalities</option>';
        const municipalities = [...new Set(excelData.map(item => item.Municipality))].sort();

        municipalities.forEach(mun => {
            const option = document.createElement("option");
            option.value = mun;
            option.textContent = mun;
            municipalityFilter.appendChild(option);
        });
    }
}

function getFilteredData() {
    let filtered = [...excelData];
    if (yearFilter && yearFilter.value !== "All") {
        filtered = filtered.filter(item => String(item.Year) === yearFilter.value);
    }
    if (municipalityFilter && municipalityFilter.value !== "All") {
        const selected = municipalityFilter.value.trim().toLowerCase();
        filtered = filtered.filter(item => String(item.Municipality).trim().toLowerCase() === selected);
    }
    return filtered;
}

function updateStatistics(data) {
    const prevalenceCard = $("prevalenceRate");
    const incidentsCard = $("incidentsRate");
    const mortalityCard = $("mortalityRate");

    let biteTotal = 0;
    let humanTotal = 0;
    const trackedMunicipalitiesInFilter = new Set();

    if (data && data.length > 0) {
        data.forEach(row => {
            biteTotal += Number(row["Animal Bite Cases"]) || 0;
            humanTotal += Number(row["Human Rabies Deaths"]) || 0;
            if (row.Municipality) {
                trackedMunicipalitiesInFilter.add(row.Municipality.trim().toLowerCase());
            }
        });
    }

    let activePopulation = 0;
    if (municipalityFilter && municipalityFilter.value !== "All") {
        const selectedMun = municipalityFilter.value.trim().toLowerCase();
        activePopulation = municipalityPopulations[selectedMun] || 0;
    } else {
        trackedMunicipalitiesInFilter.forEach(mun => {
            activePopulation += municipalityPopulations[mun] || 0;
        });
    }

    if (activePopulation === 0) {
        activePopulation = totalHumanPopulation > 0 ? totalHumanPopulation : FALLBACK_POPULATION;
    }

    if (activePopulation === 0) {
        if (prevalenceCard) prevalenceCard.textContent = "0.000%";
        if (incidentsCard) incidentsCard.textContent = "0.0 /100k";
        if (mortalityCard) mortalityCard.textContent = "0.00 /100k";
        return;
    }

    if (prevalenceCard) {
        prevalenceCard.textContent = `${((biteTotal / activePopulation) * 100).toFixed(3)}%`;
    }

    if (incidentsCard) {
        incidentsCard.textContent = `${((biteTotal / activePopulation) * 100000).toFixed(1)} /100k`;
    }

    if (mortalityCard) {
        mortalityCard.textContent = `${((humanTotal / activePopulation) * 100000).toFixed(2)} /100k`;
    }
}

/* ======================================================================
   10. TOP MUNICIPALITIES PANEL
   ====================================================================== */

function updateTopMunicipalities(data) {
    const panel = $("topMunicipalities");
    if (!panel) return;

    const totals = {};
    (data || []).forEach(row => {
        const municipality = row.Municipality;
        if (!municipality) return;
        totals[municipality] = (totals[municipality] || 0) + (Number(row["Animal Bite Cases"]) || 0);
    });

    const ranking = Object.entries(totals)
        .map(([municipality, total]) => ({ municipality, total }))
        .filter(item => item.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, TOP_MUNICIPALITY_COUNT);

    panel.innerHTML = ranking.length
        ? ranking.map((item, index) => `
            <div class="top-item">
                <span class="rank">${index + 1}</span>
                <span class="name" title="${esc(item.municipality)}">${esc(item.municipality)}</span>
                <strong class="count">${item.total.toLocaleString()}</strong>
            </div>`).join('')
        : '<p class="panel-empty">No bite cases recorded for this selection.</p>';
}

/* ======================================================================
   11. HEATMAP DRAWING (weighted intensity, unchanged logic)
   ====================================================================== */

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
    if (!map || !data || data.length === 0 || typeof L.heatLayer !== "function") return;

    const selectedLayer = currentLayer();
    const style = LAYER_STYLES[selectedLayer] || LAYER_STYLES.bite;
    const bounds = [];
    const heatPoints = [];

    let maxMetric = 1;
    data.forEach(row => {
        let val = 0;
        if (selectedLayer === "bite") val = Number(row["Animal Bite Cases"]) || 0;
        else if (selectedLayer === "human") val = Number(row["Human Rabies Deaths"]) || 0;
        else if (selectedLayer === "animal") val = Number(row["Animal Rabies Deaths"]) || 0;
        if (val > maxMetric) maxMetric = val;
    });

    data.forEach(row => {
        const lat = Number(row.Latitude);
        const lng = Number(row.Longitude);
        if (!isValidCoord(lat, lng)) return;
        bounds.push([lat, lng]);

        const biteCases = Number(row["Animal Bite Cases"]) || 0;
        const humanDeaths = Number(row["Human Rabies Deaths"]) || 0;
        const animalDeaths = Number(row["Animal Rabies Deaths"]) || 0;

        let activeMetric = biteCases;
        if (selectedLayer === "human") activeMetric = humanDeaths;
        else if (selectedLayer === "animal") activeMetric = animalDeaths;

        if (activeMetric > 0) {
            const intensity = Math.min(Math.max(activeMetric / maxMetric, 0.15), 1.0);
            heatPoints.push([lat, lng, intensity]);
        }

        const markerRadius = activeMetric > 0
            ? Math.min(Math.max(4 + (activeMetric / maxMetric) * 8, 4), 12)
            : 4;

        const marker = L.circleMarker([lat, lng], {
            radius: markerRadius,
            color: "#ffffff",
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

/* ======================================================================
   12. LEGEND AND MAP STATES
   ====================================================================== */

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
        setText('mapEmptyText', excelData.length
            ? 'No cases match the selected filters.'
            : 'No case records are available yet.');
        setHidden('mapEmpty', false);
        return;
    }

    setHidden('mapEmpty', true);
}

/* ======================================================================
   13. REFRESH, CONTROLS, AND INITIALIZATION
   ====================================================================== */

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

function initializeControls() {
    yearFilter = $("yearFilter");
    municipalityFilter = $("municipalityFilter");
    layerFilter = $("layerFilter");
    populationCard = $("humanPopulation");

    yearFilter?.addEventListener("change", refreshMap);
    municipalityFilter?.addEventListener("change", refreshMap);
    layerFilter?.addEventListener("change", refreshMap);

    document.querySelectorAll('[data-basemap]').forEach((btn) => {
        btn.addEventListener('click', () => setBasemap(btn.dataset.basemap));
    });

    $('resetViewBtn')?.addEventListener('click', fitToData);
}

window.addEventListener("resize", () => {
    if (map) map.invalidateSize();
});

document.addEventListener("DOMContentLoaded", async () => {
    setupLogoutModal();
    updateMapState(null);

    try {
        await loadFacilityCoordinates();
        initializeMap();
        initializeControls();
        await fetchPopulationDataFromFirestore();
        await fetchLatestCaseDataFromFirestore();
    } catch (err) {
        console.error("❌ Critical initialization failure:", err);
        loadFailed = true;
    } finally {
        casesLoaded = true;
        refreshMap();
    }
});