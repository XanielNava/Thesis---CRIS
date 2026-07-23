// ==========================================================
// CRIS - PHO HEATMAP SYSTEM (INTEGRATED WITH FIREBASE)
// ==========================================================

// 1. Import Firestore DB Instance and Methods
import { db, collection, getDocs, query } from '../../settings/js/settings-firebase.js';

let map;

// Raw Excel/Case Data
let excelData = [];

// Total Human Population from Firestore
let totalHumanPopulation = 0;
// Key-value store to track population per municipality
let municipalityPopulations = {}; 

// Heat Layers
let biteHeatLayer = null;
let humanHeatLayer = null;
let animalHeatLayer = null;

// Marker Layer
let markerLayer = null;

// DOM Elements
let uploadInput;
let yearFilter;
let municipalityFilter;
let layerFilter;

// ==========================================================
// INITIALIZE APPLICATION
// ==========================================================

document.addEventListener("DOMContentLoaded", async () => {
    initializeMap();
    initializeControls();
    
    // 1. Load population census database first
    await fetchPopulationDataFromFirestore();
    
    // 2. Load the actual cases to layer on the map
    await fetchLatestCaseDataFromFirestore();
});

// LEAFLET MAP
function initializeMap() {
    map = L.map("map", {
        zoomControl: true,
        preferCanvas: true
    });

    // Default centered on Iloilo
    map.setView([10.90, 122.60], 9);
    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap Contributors"
        }
    ).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
    setTimeout(function() {
        map.invalidateSize();
    }, 300);
}

// FILTERS
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
// FETCH POPULATION DATA FROM FIRESTORE
// ==========================================================

async function fetchPopulationDataFromFirestore() {
    try {
        console.log("👥 Fetching population data from population_data collection...");
        
        const populationCollection = collection(db, "population_data");
        const querySnapshot = await getDocs(populationCollection);
        
        if (querySnapshot.empty) {
            console.warn("⚠️ No population data found in population_data collection yet.");
            return;
        }

        let totalPopulation = 0;
        let municipalityCount = 0;
        municipalityPopulations = {}; // Reset

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Clean up name variations (e.g., "Pavia " to "pavia")
            const rawMun = data.municipality || doc.id || "";
            const cleanMun = rawMun.trim().toLowerCase();
            const population = Number(data.totalPopulation || data.population) || 0;
            
            if (cleanMun) {
                municipalityPopulations[cleanMun] = population;
                totalPopulation += population;
                municipalityCount++;
                console.log(`📍 Parsed Census: ${rawMun} -> ${population.toLocaleString()}`);
            }
        });

        totalHumanPopulation = totalPopulation;
        console.log(`✅ Loaded census mapping for ${municipalityCount} municipalities.`);
        console.log(`👥 Cumulative human population: ${totalHumanPopulation.toLocaleString()}`);
        
        updateHumanPopulationCard();

    } catch (error) {
        console.error("❌ Error loading population data:", error);
    }
}

// ==========================================================
// FETCH CASE DATA FROM FIRESTORE
// ==========================================================

async function fetchLatestCaseDataFromFirestore() {
    try {
        console.log("🔄 Fetching cases from rabies_cases...");
        
        const caseCollection = collection(db, "rabies_cases");
        const querySnapshot = await getDocs(caseCollection);
        
        if (querySnapshot.empty) {
            console.warn("⚠️ No case data found in 'rabies_cases' collection.");
            return;
        }

        excelData = [];

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            
            // Extract & Clean up Municipality Name
            // Fallback chain: municipality field -> facilityName -> empty string
            let rawMunName = data.municipality || data.facilityName || "";
            
            // Clean up common facility name suffixes if they exist so they map cleanly to population
            let cleanedMunName = rawMunName
                .replace(/(rhu|health center|district hospital|clinic)/gi, "")
                .trim();

            const lat = Number(data.latitude);
            const lng = Number(data.longitude);

            // Structure the local data array
            excelData.push({
                Year: data.year || new Date().getFullYear(),
                Municipality: cleanedMunName || "Unknown",
                // Only write clean coordinates; default to general Iloilo coordinate if null/NaN
                Latitude: !isNaN(lat) && lat !== 0 ? lat : 10.90,
                Longitude: !isNaN(lng) && lng !== 0 ? lng : 122.60,
                "Animal Bite Cases": Number(data.totalCases || data.biteCases || data.animalBiteCases) || 0,
                "Human Rabies Deaths": Number(data.maleCases || data.humanDeaths) || 0,
                "Animal Rabies Deaths": Number(data.femaleCases || data.animalDeaths) || 0
            });
        });

        console.log("📊 [DEBUG] Processed Firestore cases structure sample:", excelData[0]);
        console.log(`✅ Successfully synced ${excelData.length} records into Map engine.`);
        
        if (excelData.length > 0) {
            populateFilters();
            refreshMap();
        }

    } catch (error) {
        console.error("❌ Error sync-fetching case data from Firestore:", error);
    }
}

// READ EXCEL FILE (LOCAL MANUAL FALLBACK)
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

// NORMALIZATION OF HEADERS
function normalizeHeaders() {
    excelData = excelData.map(function(row) {
        const newRow = {};
        Object.keys(row).forEach(function(key) {
            const clean = key.trim().toLowerCase();
            if (clean === "year" || clean === "years") {
                newRow.Year = row[key];
            }
            else if (clean === "municipality" || clean === "municipalities" || clean === "facilityname") {
                newRow.Municipality = row[key];
            }
            else if (clean === "latitude" || clean === "lat") {
                newRow.Latitude = Number(row[key]) || 10.90;
            }
            else if (clean === "longitude" || clean === "lng") {
                newRow.Longitude = Number(row[key]) || 122.60;
            }
            else if (clean.includes("bite")) {
                newRow["Animal Bite Cases"] = Number(row[key]) || 0;
            }
            else if (clean.includes("human")) {
                newRow["Human Rabies Deaths"] = Number(row[key]) || 0;
            }
            else if (clean.includes("animal")) {
                newRow["Animal Rabies Deaths"] = Number(row[key]) || 0;
            }
        });
        return newRow;
    });
}

// POPULATE FILTERS
function populateFilters() {
    if (yearFilter) {
        yearFilter.innerHTML = '<option value="All">All Years</option>';
        const years = [...new Set(excelData.map(item => item.Year))].sort();
        years.forEach(function(year) {
            const option = document.createElement("option");
            option.value = year;
            option.textContent = year;
            yearFilter.appendChild(option);
        });
    }

    if (municipalityFilter) {
        municipalityFilter.innerHTML = '<option value="All">All Municipalities</option>';
        const municipalities = [...new Set(excelData.map(item => item.Municipality))].sort();
        municipalities.forEach(function(municipality) {
            const option = document.createElement("option");
            option.value = municipality;
            option.textContent = municipality;
            municipalityFilter.appendChild(option);
        });
    }
}

// ==========================================================
// FILTERED DATA ENGINE
// ==========================================================

function getFilteredData() {
    let filtered = [...excelData];

    if (yearFilter && yearFilter.value !== "All") {
        filtered = filtered.filter(function (item) {
            return String(item.Year) === yearFilter.value;
        });
    }

    if (municipalityFilter && municipalityFilter.value !== "All") {
        filtered = filtered.filter(function (item) {
            return String(item.Municipality) === municipalityFilter.value;
        });
    }
    return filtered;
}

// ==========================================================
// UPDATE HUMAN POPULATION CARD
// ==========================================================

function updateHumanPopulationCard() {
    const populationCard = document.getElementById("humanPopulation");
    if (populationCard) {
        populationCard.textContent = totalHumanPopulation.toLocaleString();
    }
}

// ==========================================================
// DYNAMIC STATISTICS & RATIO ENGINE (DOCKING WITH POPULATION)
// ==========================================================

function updateStatistics(data) {
    const populationCard = document.getElementById("humanPopulation");
    const prevalenceCard = document.getElementById("prevalenceRate");
    const incidentsCard = document.getElementById("incidentsRate");
    const mortalityCard = document.getElementById("mortalityRate");

    let biteTotal = 0;
    let humanTotal = 0;
    let animalTotal = 0;

    // Track which municipalities are currently shown in the filtered map view
    let trackedMunicipalitiesInFilter = new Set();

    data.forEach(function (row) {
        biteTotal += Number(row["Animal Bite Cases"]) || 0;
        humanTotal += Number(row["Human Rabies Deaths"]) || 0;
        animalTotal += Number(row["Animal Rabies Deaths"]) || 0;

        if (row.Municipality) {
            trackedMunicipalitiesInFilter.add(row.Municipality.trim().toLowerCase());
        }
    });

    // Calculate active population dynamically based on current map filters
    let activePopulation = 0;
    
    if (municipalityFilter && municipalityFilter.value !== "All") {
        const selectedMun = municipalityFilter.value.trim().toLowerCase();
        activePopulation = municipalityPopulations[selectedMun] || 50000;
    } else {
        // If "All" are selected, sum the population of only the municipalities present in the current dataset
        trackedMunicipalitiesInFilter.forEach(mun => {
            activePopulation += municipalityPopulations[mun] || 50000;
        });
    }

    // Fallback if calculations yield 0
    if (activePopulation === 0) {
        activePopulation = totalHumanPopulation > 0 ? totalHumanPopulation : 2000000;
    }

    // Render Human Population Card
    if (populationCard) {
        populationCard.textContent = activePopulation.toLocaleString();
    }

    // Prevalence Rate (Relative to constant 1.5M regional capacity)
    if (prevalenceCard) {
        const prevalence = (biteTotal / 1500000) * 100;
        prevalenceCard.textContent = `${prevalence.toFixed(3)}%`;
    }

    // Incidents Rate
    if (incidentsCard) {
        const incidents = activePopulation > 0 ? (biteTotal / activePopulation) * 100 : 0;
        incidentsCard.textContent = `${incidents.toFixed(3)}%`;
    }

    // Mortality Rate
    if (mortalityCard) {
        const mortality = activePopulation > 0 ? (humanTotal / activePopulation) * 100 : 0;
        mortalityCard.textContent = `${mortality.toFixed(4)}%`;
    }
}

// UPDATE TOP MUNICIPALITIES
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
            totals[municipality] = 0;
        }
        totals[municipality] += biteCases;
    });

    const ranking = Object.entries(totals)
        .map(function(item) {
            return { municipality: item[0], total: item[1] };
        })
        .sort(function(a, b) {
            return b.total - a.total;
        });

    ranking.slice(0, 5).forEach(function(item, index) {
        const div = document.createElement("div");
        div.className = "top-item";

        let medal = `${index + 1}.`;

        div.innerHTML = `
            <span>${medal} ${item.municipality}</span>
            <strong>${item.total.toLocaleString()}</strong>
        `;
        panel.appendChild(div);
    });
}

// DRAW HEATMAPS
function drawHeatmap(data) {
    clearMap();
    let bitePoints = [];
    let humanPoints = [];
    let animalPoints = [];
    let bounds = [];

    data.forEach(function(row) {
        const lat = Number(row.Latitude);
        const lng = Number(row.Longitude);

        if (isNaN(lat) || isNaN(lng)) return;
        bounds.push([lat, lng]);

        const biteCases = Number(row["Animal Bite Cases"]) || 0;
        const humanDeaths = Number(row["Human Rabies Deaths"]) || 0;
        const animalDeaths = Number(row["Animal Rabies Deaths"]) || 0;

        // Generate coordinates for the heatmap cluster
        if (biteCases > 0) bitePoints.push(...generateCluster(lat, lng, biteCases, 0.020));
        if (humanDeaths > 0) humanPoints.push(...generateCluster(lat, lng, humanDeaths, 0.010));
        if (animalDeaths > 0) animalPoints.push(...generateCluster(lat, lng, animalDeaths, 0.015));

        // Create UI Pin on map
        const marker = L.circleMarker([lat, lng], {
            radius: 6,
            color: "#ffffff",
            weight: 2,
            fillColor: "#1a234e",
            fillOpacity: 1
        });

        marker.bindPopup(`
            <b style="font-size: 14px;">${row.Municipality}</b><br><hr style="margin: 5px 0;">
            <b>Year:</b> ${row.Year}<br>
            <b>Animal Bite Cases:</b> ${biteCases.toLocaleString()}<br>
            <b>Human Rabies Deaths:</b> ${humanDeaths.toLocaleString()}<br>
            <b>Animal Rabies Deaths:</b> ${animalDeaths.toLocaleString()}
        `);
        markerLayer.addLayer(marker);
    });

    // HEATMAP GRADIENTS
    biteHeatLayer = L.heatLayer(bitePoints, {
        radius: 28, blur: 18, maxZoom: 16, minOpacity: 0.45,
        gradient: { 0.20: "#FFE082", 0.50: "#FFB300", 0.75: "#EA6113", 1.00: "#8C2F00" }
    });

    humanHeatLayer = L.heatLayer(humanPoints, {
        radius: 24, blur: 16, maxZoom: 16, minOpacity: 0.45,
        gradient: { 0.20: "#FFCDD2", 0.50: "#EF5350", 0.75: "#C62828", 1.00: "#7F0000" }
    });

    animalHeatLayer = L.heatLayer(animalPoints, {
        radius: 24, blur: 16, maxZoom: 16, minOpacity: 0.45,
        gradient: { 0.20: "#BBDEFB", 0.50: "#42A5F5", 0.75: "#1565C0", 1.00: "#002171" }
    });

    const selected = layerFilter ? layerFilter.value : "bite";
    if (selected === "bite") {
        biteHeatLayer.addTo(map);
    } else if (selected === "human") {
        humanHeatLayer.addTo(map);
    } else if (selected === "animal") {
        animalHeatLayer.addTo(map);
    } else {
        biteHeatLayer.addTo(map);
        humanHeatLayer.addTo(map);
        animalHeatLayer.addTo(map);
    }

    if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40] });
    }
}

// AUXILIARY UTILITIES
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

function clearMap() {
    if (biteHeatLayer) map.removeLayer(biteHeatLayer);
    if (humanHeatLayer) map.removeLayer(humanHeatLayer);
    if (animalHeatLayer) map.removeLayer(animalHeatLayer);
    if (markerLayer) markerLayer.clearLayers();
}

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

window.addEventListener("resize", function() {
    if (map) map.invalidateSize();
});