// ==============================================================================
// pho-heat-map.js - CRIS PHO Heatmap Controller (Weighted Intensity Architecture)
// ==============================================================================

import { auth, db } from '../firebase/firebase-config.js';
import { 
    collection, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

// Silence Chromium Canvas2D readback warning
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, attributes) {
    if (type === "2d") {
        attributes = Object.assign({}, attributes, { willReadFrequently: true });
    }
    return originalGetContext.call(this, type, attributes);
};

// Global App Variables
let facilityCoordinates = {};
let map;
let excelData = [];
let totalHumanPopulation = 0;
let municipalityPopulations = {};

let currentHeatLayer = null;
let markerLayer = null;

let yearFilter;
let municipalityFilter;
let layerFilter;
let populationCard;
let redrawTimeout;

// ================= FACILITY COORDINATE MAPPING =================
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
    if (!facilityName) return { lat: 10.90, lng: 122.60 };

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
    
    return { lat: 10.90, lng: 122.60 };
}

// ================= LOGOUT HANDLER =================
function setupLogoutHandler() {
    const logoutBtn = document.getElementById("logout-btn");
    if (!logoutBtn) return;

    logoutBtn.addEventListener("click", async (e) => {
        e.preventDefault();

        const confirmLogout = confirm("Are you sure you want to log out of the PHO Surveillance Portal?");
        if (!confirmLogout) return;

        alert("You are being logged out of the portal. Redirecting to login page...");

        try {
            await signOut(auth);
        } catch (err) {
            console.error("Sign out error:", err);
        } finally {
            window.location.href = "pho-login.html";
        }
    });
}

// ================= LIFECYCLE INITIALIZATION =================
document.addEventListener("DOMContentLoaded", async () => {
    try {
        setupLogoutHandler();
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
    yearFilter = document.getElementById("yearFilter");
    municipalityFilter = document.getElementById("municipalityFilter");
    layerFilter = document.getElementById("layerFilter");
    populationCard = document.getElementById("humanPopulation");

    if (yearFilter) yearFilter.addEventListener("change", refreshMap);
    if (municipalityFilter) municipalityFilter.addEventListener("change", refreshMap);
    if (layerFilter) layerFilter.addEventListener("change", refreshMap);
}

// ================= FIRESTORE DATA FETCHING =================
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
    const card = populationCard || document.getElementById("humanPopulation");
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

// ================= FILTERS & STATS COMPUTATION =================
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
        activePopulation = totalHumanPopulation > 0 ? totalHumanPopulation : 2082616;
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

// ================= ACCURATE WEIGHTED HEATMAP RENDERING =================
function drawHeatmap(data) {
    clearMap();
    if (!data || data.length === 0 || typeof L.heatLayer !== "function") return;

    const selectedLayer = layerFilter ? layerFilter.value : "bite";
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
        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;
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
            fillColor: selectedLayer === "human" ? "#C62828" : (selectedLayer === "animal" ? "#1565C0" : "#EA6113"),
            fillOpacity: 0.9
        });
        
        marker.bindPopup(`
            <div style="font-family: 'Lato', sans-serif; min-width: 170px;">
                <b style="font-size: 14px; color: #111625;">${row.Municipality}</b>
                <hr style="margin: 6px 0; border: none; border-top: 1px solid #ddd;">
                <div style="font-size: 12px; line-height: 1.5;">
                    <b>Year:</b> ${row.Year}<br>
                    <b>Animal Bite Cases:</b> ${biteCases.toLocaleString()}<br>
                    <b>Human Rabies Deaths:</b> ${humanDeaths.toLocaleString()}<br>
                    <b>Animal Rabies Deaths:</b> ${animalDeaths.toLocaleString()}
                </div>
            </div>
        `);
        
        if (markerLayer) markerLayer.addLayer(marker);
    });

    let gradientConfig = { '0.2': "#FFE082", '0.5': "#FFB300", '0.8': "#EA6113", '1.0': "#8C2F00" };
    if (selectedLayer === "human") {
        gradientConfig = { '0.2': "#FFCDD2", '0.5': "#EF5350", '0.8': "#C62828", '1.0': "#7F0000" };
    } else if (selectedLayer === "animal") {
        gradientConfig = { '0.2': "#BBDEFB", '0.5': "#42A5F5", '0.8': "#1565C0", '1.0': "#002171" };
    }

    currentHeatLayer = L.heatLayer(heatPoints, {
        radius: 35,
        blur: 22,
        maxZoom: 14,
        max: 1.0,
        minOpacity: 0.35,
        gradient: gradientConfig
    }).addTo(map);
    
    if (bounds.length > 0 && map) {
        map.fitBounds(bounds, { padding: [40, 40] });
    }
}

function clearMap() {
    if (!map) return;
    if (currentHeatLayer) { 
        map.removeLayer(currentHeatLayer); 
        currentHeatLayer = null; 
    }
    if (markerLayer) {
        markerLayer.clearLayers();
    }
}

function refreshMap() {
    clearTimeout(redrawTimeout);
    redrawTimeout = setTimeout(() => {
        const filteredData = getFilteredData();
        updateStatistics(filteredData);
        updateTopMunicipalities(filteredData);
        drawHeatmap(filteredData);
    }, 100);
}

window.addEventListener("resize", () => { if (map) map.invalidateSize(); });