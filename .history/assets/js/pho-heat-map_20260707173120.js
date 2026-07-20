/**
 * ==========================================================
 * CRIS - PHO HEATMAP DASHBOARD
 * Community-Centric Rabies Intelligence System
 * ==========================================================
 */

/* ==========================================================
   GLOBAL VARIABLES
========================================================== */

// Leaflet Map instance
let map;

// Uploaded Animal Bite Dataset
let excelData = [];

// PSA Population Dataset
let populationData = [];

// Heatmap Layers
let biteHeatLayer = null;
let humanHeatLayer = null;
let animalHeatLayer = null;

// Marker Layer
let markerLayer = null;

// Global Investigation Layer reference (Fixed scope tracking)
let investigationCircle = null;

// DOM Controls
let uploadInput;
let yearFilter;
let municipalityFilter;
let layerFilter;

/* ==========================================================
   APPLICATION STARTUP
========================================================== */
document.addEventListener("DOMContentLoaded", async function () {
    console.log("=======================================");
    console.log("CRIS PHO Heatmap Dashboard Initializing");
    console.log("=======================================");

    initializeMap();
    initializeControls();

    // Load PSA Population Dataset automatically
    await loadPopulationData();
});

/* ==========================================================
   LEAFLET MAP INITIALIZATION
========================================================== */
function initializeMap() {
    map = L.map("map", {
        zoomControl: true,
        preferCanvas: true
    });

    map.setView([10.90, 122.60], 9);

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution: "&copy; OpenStreetMap Contributors",
            maxZoom: 19
        }
    ).addTo(map);

    // FIX: Provision a custom high-priority layout pane for vector overrides
    // This forces our 3KM ring to punch directly through dark background canvas matrices safely
    map.createPane('investigationPane');
    map.getPane('investigationPane').style.zIndex = 650;
    map.getPane('investigationPane').style.pointerEvents = 'none'; // Prevents blocking mouse triggers

    // Layer that stores all municipality markers
    markerLayer = L.layerGroup().addTo(map);

    // Fix sizing issue
    setTimeout(function () {
        if (map) map.invalidateSize();
    }, 300);
}

/* ==========================================================
   INITIALIZE CONTROLS
========================================================== */
function initializeControls() {
    uploadInput = document.getElementById("excelFile");
    yearFilter = document.getElementById("yearFilter");
    municipalityFilter = document.getElementById("municipalityFilter");
    layerFilter = document.getElementById("layerFilter");

    if (uploadInput) uploadInput.addEventListener("change", uploadExcel);
    if (yearFilter) yearFilter.addEventListener("change", refreshMap);
    if (municipalityFilter) municipalityFilter.addEventListener("change", refreshMap);
    if (layerFilter) layerFilter.addEventListener("change", refreshMap);
}

/* ==========================================================
   REMOVE PREVIOUS INVESTIGATION ZONE
========================================================== */
function clearInvestigationZone() {
    if (investigationCircle && map) {
        map.removeLayer(investigationCircle);
        investigationCircle = null;
    }
}

/* ==========================================================
   WINDOW RESIZE (FIXED SYNTAX CRASH HERE)
========================================================== */
window.addEventListener("resize", function () {
    if (map) {
        map.invalidateSize();
    }
});

/* ==========================================================
   LOAD PSA POPULATION DATASET
========================================================== */
async function loadPopulationData() {
    try {
        const response = await fetch("../../assets/data/Iloilo-Population.xlsx");
        if (!response.ok) {
            throw new Error("Unable to load PSA population file.");
        }

        const buffer = await response.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        populationData = [];

        rows.forEach(function (row) {
            if (!row || row.length < 3) return;

            const municipality = String(row[0] || "").trim();
            const population = Number(row[2]);

            if (municipality !== "" && !isNaN(population)) {
                populationData.push({
                    Municipality: municipality
                        .replace("CITY OF ", "")
                        .replace("*", "")
                        .trim()
                        .toUpperCase(),
                    Population: population
                });
            }
        });

        console.log("Population Loaded:", populationData.length, "records");
    } catch (error) {
        console.error("Critical population index tracking failure: ", error);
    }
}

/* ==========================================================
   LOOKUP POPULATION
========================================================== */
function getPopulation(municipality) {
    if (populationData.length === 0) return 0;

    const target = String(municipality)
        .trim()
        .toUpperCase()
        .replace("CITY OF ", "");

    const found = populationData.find(function (item) {
        return item.Municipality === target;
    });

    return found ? Number(found.Population) : 0;
}

/* ==========================================================
   LOAD ANIMAL BITE DATASET
========================================================== */
function uploadExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const workbook = XLSX.read(e.target.result, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        
        excelData = XLSX.utils.sheet_to_json(sheet);
        
        normalizeHeaders();
        populateFilters();
        refreshMap();
    };
    reader.readAsArrayBuffer(file);
}

/* ==========================================================
   STANDARDIZE COLUMN NAMES
========================================================== */
function normalizeHeaders() {
    excelData = excelData.map(function (row) {
        const newRow = {};
        Object.keys(row).forEach(function (key) {
            const clean = key.trim().toLowerCase();
            if (clean === "year" || clean === "years") {
                newRow.Year = row[key];
            } else if (clean === "municipality" || clean === "municipalities") {
                newRow.Municipality = row[key];
            } else if (clean === "latitude" || clean === "lat") {
                newRow.Latitude = Number(row[key]);
            } else if (clean === "longitude" || clean === "lng") {
                newRow.Longitude = Number(row[key]);
            } else if (clean.includes("bite")) {
                newRow["Animal Bite Cases"] = Number(row[key]) || 0;
            } else if (clean.includes("human")) {
                newRow["Human Rabies Deaths"] = Number(row[key]) || 0;
            } else if (clean.includes("animal")) {
                newRow["Animal Rabies Deaths"] = Number(row[key]) || 0;
            }
        });
        return newRow;
    });
}

/* ==========================================================
   POPULATE FILTERS
========================================================== */
function populateFilters() {
    if (!yearFilter || !municipalityFilter) return;

    yearFilter.innerHTML = '<option value="All">All Years</option>';
    municipalityFilter.innerHTML = '<option value="All">All Municipalities</option>';

    const years = [...new Set(excelData.map(row => row.Year))].filter(Boolean).sort();
    const municipalities = [...new Set(excelData.map(row => row.Municipality))].filter(Boolean).sort();

    years.forEach(function (year) {
        const option = document.createElement("option");
        option.value = year;
        option.textContent = year;
        yearFilter.appendChild(option);
    });

    municipalities.forEach(function (municipality) {
        const option = document.createElement("option");
        option.value = municipality;
        option.textContent = municipality;
        municipalityFilter.appendChild(option);
    });
}

/* ==========================================================
   FILTER DATASET
========================================================== */
function getFilteredData() {
    let filtered = [...excelData];

    if (yearFilter && yearFilter.value !== "All") {
        filtered = filtered.filter(row => String(row.Year) === yearFilter.value);
    }
    if (municipalityFilter && municipalityFilter.value !== "All") {
        filtered = filtered.filter(row => row.Municipality === municipalityFilter.value);
    }
    return filtered;
}

/* ===========================================================
   STATISTICS
=========================================================== */
function updateStatistics(data) {
    let totalPopulation = 0;
    let totalBites = 0;
    let totalHumanDeaths = 0;

    const countedMunicipalities = new Set();

    data.forEach(row => {
        totalBites += Number(row["Animal Bite Cases"]) || 0;
        totalHumanDeaths += Number(row["Human Rabies Deaths"]) || 0;

        const municipality = String(row.Municipality).trim().toUpperCase();
        if (!countedMunicipalities.has(municipality)) {
            countedMunicipalities.add(municipality);
            totalPopulation += getPopulation(row.Municipality);
        }
    });

    const prevalenceRate = totalPopulation > 0 ? (totalBites / totalPopulation) * 1500000 : 0;
    const incidenceRate = totalPopulation > 0 ? (totalBites / totalPopulation) * 100000 : 0;
    const mortalityRate = totalPopulation > 0 ? (totalHumanDeaths / totalPopulation) * 100000 : 0;

    const elPop = document.getElementById("humanPopulation");
    const elPrev = document.getElementById("prevalenceRate");
    const elInc = document.getElementById("incidentsRate");
    const elMort = document.getElementById("mortalityRate");

    if (elPop) elPop.textContent = totalPopulation.toLocaleString();
    if (elPrev) elPrev.textContent = prevalenceRate.toFixed(2);
    if (elInc) elInc.textContent = incidenceRate.toFixed(2);
    if (elMort) elMort.textContent = mortalityRate.toFixed(2);
}

/* ===========================================================
   TOP MUNICIPALITIES
=========================================================== */
function updateTopMunicipalities(data) {
    const container = document.getElementById("topMunicipalities");
    if (!container) return;
    container.innerHTML = "";

    const totals = {};

    data.forEach(row => {
        const municipality = row.Municipality;
        if (!municipality) return;

        if (!totals[municipality]) totals[municipality] = 0;
        totals[municipality] += Number(row["Animal Bite Cases"]) || 0;
    });

    const ranking = Object.entries(totals)
        .map(([municipality, cases]) => {
            const population = getPopulation(municipality);
            const prevalence = population > 0 ? (cases / population) * 100000 : 0;
            return { municipality, prevalence, cases };
        })
        .sort((a, b) => b.prevalence - a.prevalence)
        .slice(0, 5);

    ranking.forEach(item => {
        const div = document.createElement("div");
        div.className = "top-item";
        div.innerHTML = `
            <span>${item.municipality}</span>
            <strong>
                ${item.prevalence.toFixed(2)}
                <small>/100k</small>
            </strong>
        `;
        container.appendChild(div);
    });
}

/* ===========================================================
   MAP UTILITIES
=========================================================== */
function clearMap() {
    if (biteHeatLayer && map) map.removeLayer(biteHeatLayer);
    if (humanHeatLayer && map) map.removeLayer(humanHeatLayer);
    if (animalHeatLayer && map) map.removeLayer(animalHeatLayer);
    if (markerLayer) markerLayer.clearLayers();
    clearInvestigationZone();
}

/* ===========================================================
   GENERATE HEAT CLUSTER
=========================================================== */
function generateCluster(lat, lng, value, spread) {
    const points = [];
    const count = Math.max(Math.round(value / 10), 1);

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random()) * spread;
        const randomLat = lat + Math.cos(angle) * distance;
        const randomLng = lng + Math.sin(angle) * distance;
        points.push([randomLat, randomLng, 1]);
    }
    return points;
}

/* ===========================================================
   DRAW HEATMAP
=========================================================== */
function drawHeatmap(data) {
    clearMap();
    if (!map) return;

    const bitePoints = [];
    const humanPoints = [];
    const animalPoints = [];
    const bounds = [];

    data.forEach(row => {
        const lat = Number(row.Latitude);
        const lng = Number(row.Longitude);

        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;
        bounds.push([lat, lng]);

        const biteCases = Number(row["Animal Bite Cases"]) || 0;
        const humanDeaths = Number(row["Human Rabies Deaths"]) || 0;
        const animalDeaths = Number(row["Animal Rabies Deaths"]) || 0;
        const population = getPopulation(row.Municipality);

        bitePoints.push(...generateCluster(lat, lng, biteCases, 0.020));
        humanPoints.push(...generateCluster(lat, lng, humanDeaths, 0.010));
        animalPoints.push(...generateCluster(lat, lng, animalDeaths, 0.015));

        const prevalence = population > 0 ? (biteCases / population) * 1500000 : 0;
        const incidence = population > 0 ? (biteCases / population) * 100000 : 0;
        const mortality = population > 0 ? (humanDeaths / population) * 100000 : 0;

        // Vector Marker Node Base Configuration
        const marker = L.circleMarker([lat, lng], {
            radius: 6,
            color: "#ffffff",
            weight: 2,
            fillColor: "#1a234e",
            fillOpacity: 1
        });

        marker.bindPopup(`
            <div style="font-family:'Lato', sans-serif;min-width:200px;">
                <b style="font-size:15px;color:#1a234e;">${row.Municipality}</b>
                <hr style="border:0; border-top:1px solid #eee; margin:6px 0;">
                <table style="width:100%;font-size:12px;border-collapse:collapse;">
                    <tr><td><b>Population</b></td><td align="right">${population.toLocaleString()}</td></tr>
                    <tr><td><b>Bite Cases</b></td><td align="right">${biteCases}</td></tr>
                    <tr><td><b>Human Deaths</b></td><td align="right">${humanDeaths}</td></tr>
                    <tr><td><b>Animal Deaths</b></td><td align="right">${animalDeaths}</td></tr>
                    <tr><td><b>Prevalence</b></td><td align="right">${prevalence.toFixed(2)}</td></tr>
                    <tr><td><b>Incidence</b></td><td align="right">${incidence.toFixed(2)}</td></tr>
                    <tr><td><b>Mortality</b></td><td align="right">${mortality.toFixed(2)}</td></tr>
                </table>
                <hr style="border:0; border-top:1px dashed #ffdcc4; margin:6px 0;">
                <center><b style="color:#EA6113; font-size:11px;">⚡ 3 Kilometer Investigation Zone</b></center>
            </div>
        `);

        // FIX: Binding mouse triggers directly to global pointer instances smoothly
        marker.on("mouseover", function () {
            marker.openPopup();
            
            // Clean out old references before drawing a fresh tracking ring
            clearInvestigationZone();

            // FIX: Linked explicitly to 'investigationPane' to pass through heat overlay safely
            investigationCircle = L.circle([lat, lng], {
                radius: 3000,
                color: "#EA6113",
                weight: 3,
                opacity: 1,
                fillColor: "#FBB931",
                fillOpacity: 0.18,
                dashArray: "8, 8",
                pane: 'investigationPane' 
            }).addTo(map);
        });

        marker.on("mouseout", function (e) {
            const movingTo = e.originalEvent.relatedTarget;
            // Prevent clearing ring if cursor moves smoothly directly into popup menu container box
            if (movingTo && (movingTo === this._container || this._popup._container?.contains(movingTo))) {
                return;
            }
            
            marker.closePopup();
            clearInvestigationZone();
        });

        markerLayer.addLayer(marker);
    });

    const settings = {
        radius: 10,
        blur: 8,
        maxZoom: 18,
        minOpacity: 0.45
    };

    biteHeatLayer = L.heatLayer(bitePoints, { ...settings, gradient: { 0.2: "#FFE082", 0.5: "#FFB300", 0.75: "#EA6113", 1: "#8C2F00" } });
    humanHeatLayer = L.heatLayer(humanPoints, { ...settings, gradient: { 0.2: "#FFCDD2", 0.5: "#EF5350", 0.75: "#C62828", 1: "#7F0000" } });
    animalHeatLayer = L.heatLayer(animalPoints, { ...settings, gradient: { 0.2: "#BBDEFB", 0.5: "#42A5F5", 0.75: "#1565C0", 1: "#002171" } });

    const selectedType = layerFilter ? layerFilter.value : "bite";
    if (selectedType === "human") humanHeatLayer.addTo(map);
    else if (selectedType === "animal") animalHeatLayer.addTo(map);
    else biteHeatLayer.addTo(map);

    if (bounds.length) {
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

/* ===========================================================
   REFRESH MAP
=========================================================== */
let refreshTimeout = null;
function refreshMap() {
    if (excelData.length === 0) return;

    clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => {
        const filteredData = getFilteredData();
        updateStatistics(filteredData);
        updateTopMunicipalities(filteredData);
        drawHeatmap(filteredData);
    }, 150);
}

/* ===========================================================
   OPTIONAL INTERFACE RESET ACTION TRIGGERS
=========================================================== */
function resetMapView() {
    if (map) map.setView([10.90, 122.60], 9);
}

function reloadDashboard() {
    if (excelData.length > 0) refreshMap();
}

console.log(
    "%cCRIS Heatmap Engine Loaded Successfully",
    "color:#EA6113;font-size:16px;font-weight:bold;"
);