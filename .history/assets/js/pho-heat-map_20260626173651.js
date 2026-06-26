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

// APPLICATION LIFECYCLE INITIALIZATION
document.addEventListener("DOMContentLoaded", async () => {
    console.log("DOM loaded. Bootstrapping CRIS dashboard assets...");
    
    initializeMap();
    initializeControls();
    
    // Asynchronously loads and parses the background 'Iloilo-Population.xlsx' asset on mount
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

// BACKGROUND FIXED ASSET ACQUISITION (PSA EXCEL INTEGRATION)
async function loadPopulationData() {
    try {
        // 1. Fetch your official PSA file directly from your static asset path
        const response = await fetch("../../assets/data/Iloilo-Population.xlsx");
        if (!response.ok) throw new Error(`HTTP network error! Status: ${response.status}`);
        
        const arrayBuffer = await response.arrayBuffer();
        
        // 2. Load the binary streaming workbook using SheetJS
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
        const firstSheetName = workbook.SheetNames[0]; // Targeted to 'Table 2-Iloilo'
        const worksheet = workbook.Sheets[firstSheetName];
        
        // 3. Convert sheet to raw array matrices to easily handle the PSA layout format
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const parsedPopulation = [];

        // 4. Parse rows to isolate only Municipality total rows (skipping granular barangays)
        rawRows.forEach(function(row) {
            if (!row || row.length < 3) return;

            const nameValue = String(row[0]).trim();
            const totalPopulationValue = Number(row[2]); // Total population resides in column C (Index 2)

            // PSA Structural Filter: Grabs rows where the name is in ALL CAPS
            // while bypassing metadata rows like 'TABLE', 'PROVINCE', or empty values
            if (
                nameValue && 
                nameValue !== "undefined" &&
                nameValue === nameValue.toUpperCase() && 
                !nameValue.includes("TABLE") && 
                !nameValue.includes("PROVINCE") &&
                !isNaN(totalPopulationValue)
            ) {
                // Strip out formatting elements (like asterisks or text prefixes like 'CITY OF ')
                let cleanMuni = nameValue.replace(" *", "").trim();
                if (cleanMuni.startsWith("CITY OF ")) {
                    cleanMuni = cleanMuni.replace("CITY OF ", "").trim();
                }

                parsedPopulation.push({
                    Municipality: cleanMuni,
                    Year: "2024", // Defined baseline from PSA census context date
                    Population: totalPopulationValue
                });
            }
        });

        populationData = parsedPopulation;
        console.log("PSA Population File 'Iloilo-Population.xlsx' processed cleanly:", populationData.length, "Municipalities/Cities indexed.");
        
    } catch (error) {
        console.error("Critical Error: Static population Excel file failed to parse.", error);
    }
}

// Safe Universal Epidemiological Population Cross-Reference Lookup 
function getPopulation(municipality, year) {
    if (!populationData || populationData.length === 0) return 0;
    
    // Clean string lookups to dodge mismatch quirks
    let targetMuni = String(municipality).trim().toUpperCase();
    if (targetMuni.startsWith("CITY OF ")) targetMuni = targetMuni.replace("CITY OF ", "").trim();
    if (targetMuni.endsWith(" CITY")) targetMuni = targetMuni.replace(" CITY", "").trim();

    const record = populationData.find(function(item) {
        return String(item.Municipality).trim().toUpperCase() === targetMuni;
    });

    return record ? Number(record.Population) : 0;
}

// ==========================================================
// USER MANIFEST / ACTIVE INCIDENT FILE HANDLERS
// ==========================================================

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

    const popTrackingSet = new Set();

    data.forEach(function(row) {
        totalBites += Number(row["Animal Bite Cases"]) || 0;
        totalHumanDeaths += Number(row["Human Rabies Deaths"]) || 0;

        // Prevent mathematical replication compounding if data spans multiple data rows for the same entity
        const trackingKey = `${String(row.Municipality).trim().toUpperCase()}`;
        if (!popTrackingSet.has(trackingKey)) {
            totalPopulation += getPopulation(row.Municipality, row.Year);
            popTrackingSet.add(trackingKey);
        }
    });

    // Formulate Standard Epidemiological Rates
    const prevalenceRate = totalPopulation > 0 ? (totalBites / totalPopulation) * 100 : 0;
    const incidenceRate = totalPopulation > 0 ? (totalBites / totalPopulation) * 100000 : 0;
    const mortalityRate = totalPopulation > 0 ? (totalHumanDeaths / totalPopulation) * 100000 : 0;

    // Interface node updates
    const elPop = document.getElementById("humanPopulation");
    const elPrev = document.getElementById("prevalenceRate");
    const elInc = document.getElementById("incidentsRate");
    const elMort = document.getElementById("mortalityRate");

    if (elPop) elPop.textContent = totalPopulation.toLocaleString();
    if (elPrev) elPrev.textContent = prevalenceRate.toFixed(2) + "%";
    if (elInc) elInc.textContent = incidenceRate.toFixed(2); 
    if (elMort) elMort.textContent = mortalityRate.toFixed(2); 
}

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
        
        // Formulate risk ranking criteria via localized standard prevalence rate per 100,000 individuals
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

        // Clustered point dispersion patterns
        bitePoints.push(...generateCluster(lat, lng, biteCases, 0.020));
        humanPoints.push(...generateCluster(lat, lng, humanDeaths, 0.010));
        animalPoints.push(...generateCluster(lat, lng, animalDeaths, 0.015));

        // Popups data mapping calculations
        const itemPrev = population > 0 ? (biteCases / population) * 100 : 0;
        const itemInc = population > 0 ? (biteCases / population) * 100000 : 0;
        const itemMort = population > 0 ? (humanDeaths / population) * 100000 : 0;

        const marker = L.circleMarker([lat, lng], {
            radius: 5,
            color: "#ffffff",
            weight: 2,
            fillColor: "#1a234e",
            fillOpacity: 1
        });

        marker.bindPopup(`
            <div style="font-family:'Lato', sans-serif; min-width:180px;">
                <b style="font-size:14px; color:#1a234e;">${row.Municipality}</b><br>
                <span style="font-size:11px; color:#666;">Data Reference Timeline: Year ${row.Year}</span>
                <hr style="border:0; border-top:1px solid #eee; margin:6px 0;">
                <table style="width:100%; font-size:11px; border-collapse:collapse;">
                    <tr><td><b>Population:</b></td><td align="right">${population.toLocaleString()}</td></tr>
                    <tr><td><b>Bite Cases:</b></td><td align="right">${biteCases}</td></tr>
                    <tr><td><b>Human Deaths:</b></td><td align="right">${humanDeaths}</td></tr>
                    <tr><td><b>Prevalence:</b></td><td align="right">${itemPrev.toFixed(2)}%</td></tr>
                    <tr><td><b>Incidence Rate:</b></td><td align="right">${itemInc.toFixed(2)}</td></tr>
                    <tr><td><b>Mortality Rate:</b></td><td align="right">${itemMort.toFixed(2)}</td></tr>
                </table>
            </div>
        `);
        markerLayer.addLayer(marker);
    });

    /**
     * ADVISER RADIUS SCALING FIX:
     * Dropped radius to 10 pixels and locked maxZoom to 18. 
     * When users zoom out, clusters shrink down accurately inside their local zones 
     * instead of blobbing outwards across wide-scale regions.
     */
    const heatmapOptions = {
        radius: 10,
        blur: 8,
        maxZoom: 18,
        minOpacity: 0.50
    };

    // Layer Color Profiles with fixed scale bounds
    biteHeatLayer = L.heatLayer(bitePoints, { ...heatmapOptions, gradient: { 0.20: "#FFE082", 0.50: "#FFB300", 0.75: "#EA6113", 1.00: "#8C2F00" } });
    humanHeatLayer = L.heatLayer(humanPoints, { ...heatmapOptions, gradient: { 0.20: "#FFCDD2", 0.50: "#EF5350", 0.75: "#C62828", 1.00: "#7F0000" } });
    animalHeatLayer = L.heatLayer(animalPoints, { ...heatmapOptions, gradient: { 0.20: "#BBDEFB", 0.50: "#42A5F5", 0.75: "#1565C0", 1.00: "#002171" } });

    const selected = layerFilter ? layerFilter.value : "bite";
    if (selected === "bite") biteHeatLayer.addTo(map);
    else if (selected === "human") humanHeatLayer.addTo(map);
    else if (selected === "animal") animalHeatLayer.addTo(map);

    if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40] });
    }
}

// Map Dynamic UI Refresher Debouncer
let redrawTimeout;
function refreshMap() {
    if (excelData.length === 0) return;

    clearTimeout(redrawTimeout);
    redrawTimeout = setTimeout(function() {
        const filteredData = getFilteredData();
        updateStatistics(filteredData);
        updateTopMunicipalities(filteredData);
        drawHeatmap(filteredData);
    }, 150);
}

// Dynamic window resize re-alignments
window.addEventListener("resize", function() {
    if (map) map.invalidateSize();
});