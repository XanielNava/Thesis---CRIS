// ==========================================================
// CRIS - PHO HEATMAP SYSTEM (INTEGRATED & DECOUPLED)
// ==========================================================

import { db, collection, getDocs, query, onSnapshot } from '../../settings/js/settings-firebase.js';

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

document.addEventListener("DOMContentLoaded", async () => {
    initializeMap();
    initializeControls();
    await fetchPopulationDataFromFirestore();
    await fetchLatestCaseDataFromFirestore();
});

function initializeMap() {
    map = L.map("map", { zoomControl: true, preferCanvas: true });
    map.setView([10.90, 122.60], 9);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap Contributors"
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    setTimeout(() => { map.invalidateSize(); }, 300);
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
// REAL-TIME LISTENER FOR POPULATION_DATA
// ==========================================================
async function fetchPopulationDataFromFirestore() {
    try {
        console.log("👥 Attaching real-time listener to 'population_data'...");
        const populationCollection = collection(db, "population_data");
        
        onSnapshot(populationCollection, (querySnapshot) => {
            if (querySnapshot.empty) {
                console.warn("⚠️ 'population_data' collection is empty.");
                if (populationCard) populationCard.textContent = "Empty";
                return;
            }

            let totalPopulation = 0;
            let municipalityCount = 0;
            municipalityPopulations = {}; 

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const rawMun = data.municipality || data.Municipality || "";
                const cleanMun = rawMun.toString().trim().toLowerCase();
                const population = Number(data.totalPopulation || data.Population) || 0;
                
                if (cleanMun) {
                    municipalityPopulations[cleanMun] = population;
                    totalPopulation += population;
                    municipalityCount++;
                }
            });

            totalHumanPopulation = totalPopulation;
            console.log(`⚡ Live Sync UI Push: ${totalHumanPopulation.toLocaleString()} across ${municipalityCount} towns.`);
            
            if (populationCard) {
                populationCard.textContent = totalHumanPopulation > 0 ? totalHumanPopulation.toLocaleString() : "0";
            }
            refreshMap();
        });
    } catch (error) {
        console.error("❌ Error running live population sync:", error);
    }
}

async function fetchLatestCaseDataFromFirestore() {
    try {
        console.log("🔄 Fetching cases from rabies_cases...");
        const caseCollection = collection(db, "rabies_cases");
        const querySnapshot = await getDocs(caseCollection);
        
        if (querySnapshot.empty) {
            updateStatistics([]); 
            return;
        }

        excelData = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            let rawMunName = data.municipality || data.facilityName || "";
            let cleanedMunName = rawMunName.replace(/(rhu|health center|district hospital|clinic)/gi, "").trim();

            const lat = Number(data.latitude);
            const lng = Number(data.longitude);

            excelData.push({
                Year: data.year || new Date().getFullYear(),
                Municipality: cleanedMunName || "Unknown",
                Latitude: !isNaN(lat) && lat !== 0 ? lat : 10.90,
                Longitude: !isNaN(lng) && lng !== 0 ? lng : 122.60,
                "Animal Bite Cases": Number(data.totalCases || data.biteCases) || 0,
                "Human Rabies Deaths": Number(data.humanDeaths || data.maleCases) || 0,
                "Animal Rabies Deaths": Number(data.animalDeaths || data.femaleCases) || 0
            });
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
            if (clean === "year" || clean === "years") newRow.Year = row[key];
            else if (clean === "municipality" || clean === "facilityname") newRow.Municipality = row[key];
            else if (clean === "latitude" || clean === "lat") newRow.Latitude = Number(row[key]) || 10.90;
            else if (clean === "longitude" || clean === "lng") newRow.Longitude = Number(row[key]) || 122.60;
            else if (clean.includes("bite")) newRow["Animal Bite Cases"] = Number(row[key]) || 0;
            else if (clean.includes("human")) newRow["Human Rabies Deaths"] = Number(row[key]) || 0;
            else if (clean.includes("animal")) newRow["Animal Rabies Deaths"] = Number(row[key]) || 0;
        });
        return newRow;
    });
}

function populateFilters() {
    if (yearFilter) {
        yearFilter.innerHTML = '<option value="All">All Years</option>';
        const years = [...new Set(excelData.map(item => item.Year))].sort();
        years.forEach(year => {
            const option = document.createElement("option");
            option.value = year; option.textContent = year; yearFilter.appendChild(option);
        });
    }
    if (municipalityFilter) {
        municipalityFilter.innerHTML = '<option value="All">All Municipalities</option>';
        const municipalities = [...new Set(excelData.map(item => item.Municipality))].sort();
        municipalities.forEach(mun => {
            const option = document.createElement("option");
            option.value = mun; option.textContent = mun; municipalityFilter.appendChild(option);
        });
    }
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

function updateStatistics(data) {
    const prevalenceCard = document.getElementById("prevalenceRate");
    const incidentsCard = document.getElementById("incidentsRate");
    const mortalityCard = document.getElementById("mortalityRate");
    const targetPopulationCard = document.getElementById("humanPopulation");

    let biteTotal = 0; let humanTotal = 0; let animalTotal = 0;
    let trackedMunicipalitiesInFilter = new Set();

    if (data && data.length > 0) {
        data.forEach(row => {
            biteTotal += Number(row["Animal Bite Cases"]) || 0;
            humanTotal += Number(row["Human Rabies Deaths"]) || 0;
            animalTotal += Number(row["Animal Rabies Deaths"]) || 0;
            if (row.Municipality) trackedMunicipalitiesInFilter.add(row.Municipality.trim().toLowerCase());
        });
    }

    let activePopulation = 0;
    if (municipalityFilter && municipalityFilter.value !== "All") {
        const selectedMun = municipalityFilter.value.trim().toLowerCase();
        activePopulation = municipalityPopulations[selectedMun] || 0;
    } else {
        trackedMunicipalitiesInFilter.forEach(mun => { activePopulation += municipalityPopulations[mun] || 0; });
    }

    if (activePopulation === 0 || (municipalityFilter && municipalityFilter.value === "All")) {
        activePopulation = totalHumanPopulation;
    }

    if (targetPopulationCard) {
        targetPopulationCard.textContent = activePopulation > 0 ? activePopulation.toLocaleString() : "0";
    }

    if (prevalenceCard) {
        prevalenceCard.textContent = `${((biteTotal / 1500000) * 100).toFixed(3)}%`;
    }
    if (incidentsCard) {
        incidentsCard.textContent = activePopulation > 0 ? `${((biteTotal / activePopulation) * 100).toFixed(3)}%` : "0.000%";
    }
    if (mortalityCard) {
        mortalityCard.textContent = activePopulation > 0 ? `${((humanTotal / activePopulation) * 100).toFixed(4)}%` : "0.0000%";
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
        if (!totals[municipality]) totals[municipality] = 0;
        totals[municipality] += biteCases;
    });

    const ranking = Object.entries(totals)
        .map(item => ({ municipality: item[0], total: item[1] }))
        .sort((a, b) => b.total - a.total);

    ranking.slice(0, 5).forEach((item, index) => {
        const div = document.createElement("div");
        div.className = "top-item";
        div.innerHTML = `<span>${index + 1}. ${item.municipality}</span><strong>${item.total.toLocaleString()}</strong>`;
        panel.appendChild(div);
    });
}

function drawHeatmap(data) {
    clearMap();
    if (!data || data.length === 0) return;

    let bitePoints = []; let humanPoints = []; let animalPoints = [];
    let bounds = [];

    data.forEach(row => {
        const lat = Number(row.Latitude); const lng = Number(row.Longitude);
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
        biteHeatLayer.addTo(map); humanHeatLayer.addTo(map); animalHeatLayer.addTo(map);
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
    if (biteHeatLayer) map.removeLayer(biteHeatLayer);
    if (humanHeatLayer) map.removeLayer(humanHeatLayer);
    if (animalHeatLayer) map.removeLayer(animalHeatLayer);
    if (markerLayer) markerLayer.clearLayers();
}

let redrawTimeout;
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