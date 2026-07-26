// ==========================================================
// CRIS - PHO HEATMAP SYSTEM (INTEGRATED & DECOUPLED)
// ==========================================================

import { db, collection, getDocs } from '../../settings/js/settings-firebase.js';

let facilityCoordinates = {};
let map;
let excelData = [];
let totalHumanPopulation = 0;
let municipalityPopulations = {};

let biteHeatLayer = null;
let humanHeatLayer = null;
let animalHeatLayer = null;
let markerLayer = null;

let uploadInput;
let yearFilter;
let municipalityFilter;
let layerFilter;
let populationCard;
let redrawTimeout;

// ==========================================================
// 1. FACILITY COORDINATE MAPPING
// ==========================================================

async function loadFacilityCoordinates() {
    try {
        console.log("📍 Loading facility coordinates...");
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
        
        console.log(`✅ Loaded coordinates for ${Object.keys(facilityCoordinates).length} facilities`);
    } catch (error) {
        console.error("❌ Error loading facility coordinates:", error);
    }
}

function getCoordinates(facilityName) {
    if (!facilityName) return { lat: 10.90, lng: 122.60 };

    const cleanName = String(facilityName).trim().toLowerCase();
    
    // 1. Direct match
    if (facilityCoordinates[cleanName]) {
        return facilityCoordinates[cleanName];
    }
    
    // 2. Substring match
    const keys = Object.keys(facilityCoordinates);
    for (const key of keys) {
        if (cleanName.includes(key) || key.includes(cleanName)) {
            console.log(`✅ Matched "${facilityName}" to coordinate key "${key}"`);
            return facilityCoordinates[key];
        }
    }
    
    console.warn(`⚠️ No coordinate found for "${facilityName}" - using default (10.90, 122.60)`);
    return { lat: 10.90, lng: 122.60 };
}

// ==========================================================
// 2. LIFECYCLE INITIALIZATION
// ==========================================================

document.addEventListener("DOMContentLoaded", async () => {
    try {
        await loadFacilityCoordinates();
        initializeMap();
        initializeControls();
        await fetchPopulationDataFromFirestore();
        await fetchLatestCaseDataFromFirestore();
    } catch (err) {
        console.error("❌ Critical initialization failure:", err);
    }
});

function initializeMap() {
    map = L.map("map", { zoomControl: true, preferCanvas: true });
    map.setView([10.90, 122.60], 9);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap Contributors"
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
    setTimeout(() => { if (map) map.invalidateSize(); }, 300);
}

function initializeControls() {
    uploadInput = document.getElementById("excelFile");
    yearFilter = document.getElementById("yearFilter");
    municipalityFilter = document.getElementById("municipalityFilter");
    layerFilter = document.getElementById("layerFilter");
    populationCard = document.getElementById("humanPopulation");

    if (uploadInput) uploadInput.addEventListener("change", uploadExcel);
    if (yearFilter) yearFilter.addEventListener("change", refreshMap);
    if (municipalityFilter) municipalityFilter.addEventListener("change", refreshMap);
    if (layerFilter) layerFilter.addEventListener("change", refreshMap);
}

// ==========================================================
// 3. FIRESTORE DATA FETCHING
// ==========================================================

async function fetchPopulationDataFromFirestore() {
    try {
        console.log("📊 Fetching population data from Firestore...");
        const populationCollection = collection(db, "pho_population_data");
        const querySnapshot = await getDocs(populationCollection);

        if (querySnapshot.empty) {
            console.warn("⚠️ pho_population_data collection is empty.");
            totalHumanPopulation = 0;
            municipalityPopulations = {};
            updateHumanPopulationCard();
            refreshMap();
            return;
        }

        let totalPopulationAccumulator = 0;
        const updatedMunicipalities = {};

        querySnapshot.forEach((doc) => {
            const data = doc.data();

            if (doc.id === "ILOILO_TOTAL") {
                totalPopulationAccumulator = Number(data.totalPopulation) || 0;
            } else {
                const municipalityName = data.municipality || doc.id;
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

        console.log("✅ Combined Master Total Population Set To:", totalHumanPopulation);

        updateHumanPopulationCard();
        refreshMap();

    } catch (error) {
        console.error("❌ Error fetching population data:", error);
    }
}

function updateHumanPopulationCard() {
    const card = populationCard || document.getElementById("humanPopulation");
    if (card) {
        const formattedValue = totalHumanPopulation.toLocaleString();
        card.textContent = formattedValue;
        console.log("✅ Human Population Card updated to:", formattedValue);
    } else {
        console.error("❌ Element 'humanPopulation' not found!");
    }
}

async function fetchLatestCaseDataFromFirestore() {
    try {
        console.log("🔄 Fetching cases from pho_rabies_cases...");
        const caseCollection = collection(db, "pho_rabies_cases");
        const querySnapshot = await getDocs(caseCollection);

        if (querySnapshot.empty) {
            console.warn("⚠️ No case data found.");
            excelData = [];
            updateStatistics([]);
            return;
        }

        excelData = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const rawMunName = data.municipality || data.facilityName || "Unknown";
            const cleanedMunName = String(rawMunName).trim();
            const coords = getCoordinates(cleanedMunName);

            excelData.push({
                Year: data.year || new Date().getFullYear(),
                Municipality: cleanedMunName,
                Latitude: coords.lat,
                Longitude: coords.lng,
                "Animal Bite Cases": Number(data.totalCases || data.biteCases) || 0,
                "Human Rabies Deaths": Number(data.humanDeaths || data.maleCases) || 0,
                "Animal Rabies Deaths": Number(data.animalDeaths || data.femaleCases) || 0
            });
        });

        console.log(`✅ Case data loaded: ${excelData.length} records`);

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

// ==========================================================
// 4. FILE UPLOAD & NORMALIZATION
// ==========================================================

function uploadExcel(event) {
    if (typeof XLSX === "undefined") {
        console.error("❌ SheetJS (XLSX) library is missing. Make sure it's included in your HTML.");
        return;
    }

    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: "array" });
            const firstSheet = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheet];
            excelData = XLSX.utils.sheet_to_json(worksheet);
            
            normalizeHeaders();
            populateFilters();
            refreshMap();
        } catch (err) {
            console.error("❌ Error parsing uploaded Excel file:", err);
        }
    };
    reader.readAsArrayBuffer(file);
}

function normalizeHeaders() {
    excelData = excelData.map(function (row) {
        const newRow = {};
        Object.keys(row).forEach(function (key) {
            const clean = key.trim().toLowerCase();
            if (clean === "year" || clean === "years") newRow.Year = row[key];
            else if (clean === "municipality" || clean === "facilityname") newRow.Municipality = String(row[key] || "").trim();
            else if (clean === "latitude" || clean === "lat") newRow.Latitude = Number(row[key]);
            else if (clean === "longitude" || clean === "lng") newRow.Longitude = Number(row[key]);
            else if (clean.includes("bite")) newRow["Animal Bite Cases"] = Number(row[key]) || 0;
            else if (clean.includes("human")) newRow["Human Rabies Deaths"] = Number(row[key]) || 0;
            else if (clean.includes("animal")) newRow["Animal Rabies Deaths"] = Number(row[key]) || 0;
        });

        // Ensure fallback coords if not present in Excel
        const mun = newRow.Municipality || "Unknown";
        const coords = getCoordinates(mun);
        if (isNaN(newRow.Latitude)) newRow.Latitude = coords.lat;
        if (isNaN(newRow.Longitude)) newRow.Longitude = coords.lng;

        return newRow;
    });
}

// ==========================================================
// 5. FILTERS & STATS COMPUTATION
// ==========================================================

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
        
        console.log(`✅ Municipality filter populated with ${municipalities.length} items`);
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
    const prevalenceCard = document.getElementById("prevalenceRate");
    const incidentsCard = document.getElementById("incidentsRate");
    const mortalityCard = document.getElementById("mortalityRate");

    let biteTotal = 0;
    let humanTotal = 0;
    let trackedMunicipalitiesInFilter = new Set();

    if (data && data.length > 0) {
        data.forEach(row => {
            biteTotal += Number(row["Animal Bite Cases"]) || 0;
            humanTotal += Number(row["Human Rabies Deaths"]) || 0;
            if (row.Municipality) trackedMunicipalitiesInFilter.add(row.Municipality.trim().toLowerCase());
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
        activePopulation = totalHumanPopulation > 0 ? totalHumanPopulation : 2082616;
    }

    if (activePopulation === 0 || totalHumanPopulation === 0) {
        if (prevalenceCard) prevalenceCard.textContent = "0.000%";
        if (incidentsCard) incidentsCard.textContent = "0.000%";
        if (mortalityCard) mortalityCard.textContent = "0.0000%";
        return;
    }

    if (prevalenceCard) {
        prevalenceCard.textContent = `${((biteTotal / activePopulation) * 100).toFixed(3)}%`;
    }
    if (incidentsCard) {
        incidentsCard.textContent = `${((biteTotal / activePopulation) * 100).toFixed(3)}%`;
    }
    if (mortalityCard) {
        mortalityCard.textContent = `${((humanTotal / activePopulation) * 100).toFixed(4)}%`;
    }
}

function updateTopMunicipalities(data) {
    const panel = document.getElementById("topMunicipalities");
    if (!panel) return;
    panel.innerHTML = "";
    if (!data || data.length === 0) return;

    const totals = {};
    data.forEach(row => {
        const municipality = row.Municipality;
        if (!municipality) return;
        const biteCases = Number(row["Animal Bite Cases"]) || 0;
        totals[municipality] = (totals[municipality] || 0) + biteCases;
    });

    const ranking = Object.entries(totals)
        .map(([municipality, total]) => ({ municipality, total }))
        .sort((a, b) => b.total - a.total);

    ranking.slice(0, 5).forEach((item, index) => {
        const div = document.createElement("div");
        div.className = "top-item";
        div.innerHTML = `<span>${index + 1}. ${item.municipality}</span><strong>${item.total.toLocaleString()}</strong>`;
        panel.appendChild(div);
    });
}

// ==========================================================
// 6. HEATMAP & LEAFLET RENDERING
// ==========================================================

function drawHeatmap(data) {
    clearMap();
    if (!data || data.length === 0) return;

    const bitePoints = [];
    const humanPoints = [];
    const animalPoints = [];
    const bounds = [];

    data.forEach(row => {
        const lat = Number(row.Latitude);
        const lng = Number(row.Longitude);
        if (isNaN(lat) || isNaN(lng)) return;
        bounds.push([lat, lng]);

        const biteCases = Number(row["Animal Bite Cases"]) || 0;
        const humanDeaths = Number(row["Human Rabies Deaths"]) || 0;
        const animalDeaths = Number(row["Animal Rabies Deaths"]) || 0;

        if (biteCases > 0) bitePoints.push(...generateCluster(lat, lng, biteCases, 0.020));
        if (humanDeaths > 0) humanPoints.push(...generateCluster(lat, lng, humanDeaths, 0.010));
        if (animalDeaths > 0) animalPoints.push(...generateCluster(lat, lng, animalDeaths, 0.015));

        const marker = L.circleMarker([lat, lng], {
            radius: 6, color: "#ffffff", weight: 2, fillColor: "#1a234e", fillOpacity: 1
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

    biteHeatLayer = L.heatLayer(bitePoints, { radius: 28, blur: 18, maxZoom: 16, minOpacity: 0.45, max: 1.0, gradient: { '0.4': "#FFE082", '0.6': "#FFB300", '0.8': "#EA6113", '1.0': "#8C2F00" } });
    humanHeatLayer = L.heatLayer(humanPoints, { radius: 24, blur: 16, maxZoom: 16, minOpacity: 0.45, max: 1.0, gradient: { '0.4': "#FFCDD2", '0.6': "#EF5350", '0.8': "#C62828", '1.0': "#7F0000" } });
    animalHeatLayer = L.heatLayer(animalPoints, { radius: 24, blur: 16, maxZoom: 16, minOpacity: 0.45, max: 1.0, gradient: { '0.4': "#BBDEFB", '0.6': "#42A5F5", '0.8': "#1565C0", '1.0': "#002171" } });

    const selected = layerFilter ? layerFilter.value : "bite";
    if (selected === "bite") biteHeatLayer.addTo(map);
    else if (selected === "human") humanHeatLayer.addTo(map);
    else if (selected === "animal") animalHeatLayer.addTo(map);
    else {
        biteHeatLayer.addTo(map);
        humanHeatLayer.addTo(map);
        animalHeatLayer.addTo(map);
    }
    
    if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
}

function generateCluster(lat, lng, cases, spread) {
    const points = [];
    if (cases <= 0) return points;
    const totalPoints = Math.max(Math.round(cases / 5), 1);
    for (let i = 0; i < totalPoints; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random()) * spread;
        points.push([lat + Math.cos(angle) * distance, lng + Math.sin(angle) * distance, 1.0]);
    }
    return points;
}

function clearMap() {
    if (biteHeatLayer) { map.removeLayer(biteHeatLayer); biteHeatLayer = null; }
    if (humanHeatLayer) { map.removeLayer(humanHeatLayer); humanHeatLayer = null; }
    if (animalHeatLayer) { map.removeLayer(animalHeatLayer); animalHeatLayer = null; }
    if (markerLayer) markerLayer.clearLayers();
}

function refreshMap() {
    clearTimeout(redrawTimeout);
    redrawTimeout = setTimeout(() => {
        const filteredData = getFilteredData();
        updateStatistics(filteredData);
        updateTopMunicipalities(filteredData);
        drawHeatmap(filteredData);
    }, 150);
}

window.addEventListener("resize", () => { if (map) map.invalidateSize(); });

hello bi