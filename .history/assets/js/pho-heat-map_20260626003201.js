/**
 * CRIS - PVO Heatmap Dashboard Handler Engine
 * Integrated Epidemiological Calculation & Automation Layer
 */

// Global State Containers
let map = null;
let excelData = [];
let populationData = [];

// Heatmap Layers
let biteHeatLayer = null;
let humanHeatLayer = null;
let animalHeatLayer = null;
let markerLayer = null;

// DOM Control Nodes
let uploadInput;
let yearFilter;
let municipalityFilter;
let layerFilter;

// ==========================================================
// APPLICATION LIFECYCLE INITIALIZATION
// ==========================================================

document.addEventListener("DOMContentLoaded", async () => {
    console.log("DOM loaded. Bootstrapping CRIS dashboard assets...");
    
    initializeMap();
    initializeControls();
    
    // Smoothly load the embedded population asset file asynchronously right on startup
    await loadPopulationData();
});

// Leaflet Map Provisioning Engine
function initializeMap() {
    map = L.map("map", {
        zoomControl: true,
        preferCanvas: true
    }).setView([10.90, 122.60], 9); // Focused layout on Iloilo Province coordinates

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap Contributors'
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
    
    setTimeout(function() {
        if (map) map.invalidateSize();
    }, 300);
}

// Control Event Bindings
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

// ==========================================================
// DATA ACQUISITION & STRUCTURAL BASELINES
// ==========================================================

async function loadPopulationData() {
    try {
        // 1. Fetch the embedded Excel file as a binary array buffer
        const response = await fetch("../../assets/data/iloilo_population.xlsx");
        if (!response.ok) throw new Error(`HTTP network error! Status: ${response.status}`);
        
        const arrayBuffer = await response.arrayBuffer();
        
        // 2. Read the file content using the SheetJS library
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // 3. Convert to json rows
        const rawPopulationData = XLSX.utils.sheet_to_json(worksheet);
        
        // 4. Normalize the headers so lookups remain structurally safe
        populationData = rawPopulationData.map(function(row) {
            const normalizedRow = {};
            Object.keys(row).forEach(function(key) {
                const cleanKey = key.trim().toLowerCase();
                if (cleanKey === "municipality" || cleanKey === "municipalities") {
                    normalizedRow.Municipality = row[key];
                } else if (cleanKey === "year" || cleanKey === "years") {
                    normalizedRow.Year = row[key];
                } else if (cleanKey === "population" || cleanKey === "pop") {
                    normalizedRow.Population = row[key];
                }
            });
            return normalizedRow;
        });

        console.log("Population Excel asset synchronized & parsed successfully:", populationData.length, "records.");
    } catch (error) {
        console.error("Critical Error: Static population Excel file failed to load.", error);
    }
}

// Safe Universal Epidemiological Population Cross-Reference Lookup 
function getPopulation(municipality, year) {
    if (!populationData || populationData.length === 0) return 0;
    
    const targetMuni = String(municipality).trim().toUpperCase();
    const targetYear = String(year).trim();

    const record = populationData.find(function(item) {
        return (
            String(item.Municipality).trim().toUpperCase() === targetMuni &&
            String(item.Year).trim() === targetYear
        );
    });

    return record ? Number(record.Population) : 0;
}

// Active Case Upload Registry Parser
function uploadExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        
        excelData = XLSX.utils.sheet_to_json(worksheet);
        
        normalizeHeaders();
        populateFilters();
        refreshMap();
    };
    reader.readAsArrayBuffer(file);
}

// Incident File Data Header Normalizer
function normalizeHeaders() {
    excelData = excelData.map(function(row) {
        const newRow = {};
        Object.keys(row).forEach(function(key) {
            const clean = key.trim().toLowerCase();
            if (clean === "year" || clean === "years") {
                newRow.Year = row[key];
            } else if (clean === "municipality" || clean === "municipalities") {
                newRow.Municipality = row[key];
            } else if (clean === "latitude" || clean === "lat") {
                newRow.Latitude = row[key];
            } else if (clean === "longitude" || clean === "lng") {
                newRow.Longitude = row[key];
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

function populateFilters() {
    if (!yearFilter || !municipalityFilter) return;
    
    yearFilter.innerHTML = '<option value="All">All Years</option>';
    municipalityFilter.innerHTML = '<option value="All">All Municipalities</option>';

    const years = [...new Set(excelData.map(item => item.Year))].filter(Boolean).sort();
    const municipalities = [...new Set(excelData.map(item => item.Municipality))].filter(Boolean).sort();

    years.forEach(function(year) {
        const option = document.createElement("option");
        option.value = year;
        option.textContent = year;
        yearFilter.appendChild(option);
    });

    municipalities.forEach(function(municipality) {
        const option = document.createElement("option");
        option.value = municipality;
        option.textContent = municipality;
        municipalityFilter.appendChild(option);
    });
}

function getFilteredData() {
    let filtered = [...excelData];

    if (yearFilter && yearFilter.value !== "All") {
        filtered = filtered.filter(item => String(item.Year) === yearFilter.value);
    }
    if (municipalityFilter && municipalityFilter.value !== "All") {
        filtered = filtered.filter(item => String(item.Municipality) === municipalityFilter.value);
    }
    return filtered;
}

// ==========================================================
// EPIDEMIOLOGICAL METRIC LOGIC CALCULATIONS
// ==========================================================

function updateStatistics(data) {
    let totalPopulation = 0;
    let totalBites = 0;
    let totalHumanDeaths = 0;

    // Track dynamic aggregated population sets safely
    const popTrackingSet = new Set();

    data.forEach(function(row) {
        totalBites += Number(row["Animal Bite Cases"]) || 0;
        totalHumanDeaths += Number(row["Human Rabies Deaths"]) || 0;

        // Prevent mathematical duplication tracking if query returns rows over matched entities
        const trackingKey = `${String(row.Municipality).trim().toUpperCase()}_${row.Year}`;
        if (!popTrackingSet.has(trackingKey)) {
            totalPopulation += getPopulation(row.Municipality, row.Year);
            popTrackingSet.add(trackingKey);
        }
    });

    // Formulate Standard Epidemiological Rates
    const prevalenceRate = totalPopulation > 0 ? (totalBites / totalPopulation) * 100 : 0;
    const incidenceRate = totalPopulation > 0 ? (totalBites / totalPopulation) * 100000 : 0;
    const mortalityRate = totalPopulation > 0 ? (totalHumanDeaths / totalPopulation) * 100000 : 0;

    // Direct UI updates
    const elPop = document.getElementById("humanPopulation");
    const elPrev = document.getElementById("prevalenceRate");
    const elInc = document.getElementById("incidentsRate");
    const elMort = document.getElementById("mortalityRate");

    if (elPop) elPop.textContent = totalPopulation.toLocaleString();
    if (elPrev) elPrev.textContent = prevalenceRate.toFixed(2) + "%";
    if (elInc) elInc.textContent = incidenceRate.toFixed(2); // Rendered per 100k population baseline
    if (elMort) elMort.textContent = mortalityRate.toFixed(2); // Rendered per 100k population baseline
}

// Top 5 Municipalities Sorting Panel Matrix
function updateTopMunicipalities(data) {
    const panel = document.getElementById("topMunicipalities");
    if (!panel) return;
    panel.innerHTML = "";

    const totals = {};

    data.forEach(function(row) {
        const municipality = row.Municipality;
        if (!municipality) return;

        const biteCases = Number(row["Animal Bite Cases"]) || 0;

        if (!totals[municipality]) {
            totals[municipality] = { cases: 0, year: row.Year };
        }
        totals[municipality].cases += biteCases;
    });

    const ranking = Object.entries(totals).map(function(item) {
        const muniName = item[0];
        const casesCount = item[1].cases;
        const lookupYear = item[1].year;
        const population = getPopulation(muniName, lookupYear);
        
        // Calculate standard prevalence rates per 100,000 baseline individuals
        const prevalence = population > 0 ? (casesCount / population) * 100000 : 0;

        return {
            municipality: muniName,
            prevalence: prevalence,
            totalCases: casesCount
        };
    }).sort((a, b) => b.prevalence - a.prevalence); // Sort lower down from maximum risk factor

    ranking.slice(0, 5).forEach(function(item, index) {
        const div = document.createElement("div");
        div.className = "top-item";
        div.innerHTML = `<span>${index + 1}. ${item.municipality}</span>
                         <strong>${item.prevalence.toFixed(2)} <small style="font-size:9px;color:#777;font-weight:normal;">/100k</small></strong>`;
        panel.appendChild(div);
    });
}

// ==========================================================
// GEOSPATIAL VECTOR MAP RENDER ENGINE
// ==========================================================

function clearMap() {
    if (biteHeatLayer && map) map.removeLayer(biteHeatLayer);
    if (humanHeatLayer && map) map.removeLayer(humanHeatLayer);
    if (animalHeatLayer && map) map.removeLayer(animalHeatLayer);
    if (markerLayer) markerLayer.clearLayers();
}

function generateCluster(lat, lng, cases, spread) {
    const points = [];
    const totalPoints = Math.max(Math.round(cases / 10), 1);
    
    for (let i = 0; i < totalPoints; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random()) * spread;
        const randomLat = lat + Math.cos(angle) * distance;
        const randomLng = lng + Math.sin(angle) * distance;
        points.push([randomLat, randomLng, 1]);
    }
    return points;
}

function drawHeatmap(data) {
    clearMap();
    if (!map) return;

    let bitePoints = [];
    let humanPoints = [];
    let animalPoints = [];
    let bounds = [];

    data.forEach(function(row) {
        const lat = Number(row.Latitude);
        const lng = Number(row.Longitude);
        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;

        bounds.push([lat, lng]);
        
        const biteCases = Number(row["Animal Bite Cases"]) || 0;
        const humanDeaths = Number(row["Human Rabies Deaths"]) || 0;
        const animalDeaths = Number(row["Animal Rabies Deaths"]) || 0;
        const population = getPopulation(row.Municipality, row.Year);

        // Generate clustered points spatial layouts
        bitePoints.push(...generateCluster(lat, lng, biteCases, 0.020));
        humanPoints.push(...generateCluster(lat, lng, humanDeaths, 0.010));
        animalPoints.push(...generateCluster(lat, lng, animalDeaths, 0.015));

        // Formulate localized epidemiological values for map popups
        const itemPrev = population > 0 ? (biteCases / population) * 100 : 0;
        const itemInc = population > 0 ? (biteCases / population) * 100000 : 0;
        const itemMort = population > 0 ? (humanDeaths / population) * 100000 : 0;

        const marker = L.circleMarker([lat, lng], {
            radius: 5,
            color: "#ffffff",
            weight: 2,
            fillColor: "#ff0000",
            fillOpacity: 0.6
        }).bindPopup