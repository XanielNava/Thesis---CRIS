// ==========================================================
// CRIS - PHO HEATMAP SYSTEM (INTEGRATED & DECOUPLED)
// ==========================================================

// 1. Import Firestore DB Instance and Methods (Including onSnapshot for real-time live sync)
import { db, collection, getDocs, query, onSnapshot } from '../';

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
let populationCard; 

// ==========================================================
// INITIALIZE APPLICATION
// ==========================================================

document.addEventListener("DOMContentLoaded", async () => {
    initializeMap();
    initializeControls();
    
    // 1. Establish the live connection to your population census data
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

// FILTERS & DOM CACHING
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
        
        // Listen actively to settings uploads in real time without refreshing
        onSnapshot(populationCollection, (querySnapshot) => {
            if (querySnapshot.empty) {
                console.warn("⚠️ 'population_data' collection is empty.");
                if (populationCard) populationCard.textContent = "Empty Collection";
                return;
            }

            let totalPopulation = 0;
            let municipalityCount = 0;
            municipalityPopulations = {}; // Wipe historical mapping safely before re-parse

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                
                // Track raw logs to structural endpoints
                if (municipalityCount === 0) {
                    console.log("🔍 [Live Sync] Sample Document ID:", doc.id);
                    console.log("🔍 [Live Sync] Sample Fields:", JSON.stringify(data));
                }

                const rawMun = data.municipality || data.Municipality || doc.id || "";
                const cleanMun = rawMun.trim().toLowerCase();
                const population = Number(data.totalPopulation || data.population || data.total_population || data.Population) || 0;
                
                if (cleanMun) {
                    municipalityPopulations[cleanMun] = population;
                    totalPopulation += population;
                    municipalityCount++;
                }
            });

            totalHumanPopulation = totalPopulation;
            console.log(`⚡ Live Sync: ${municipalityCount} municipalities loaded.`);
            console.log(`👥 Explicit verification total: ${totalHumanPopulation}`);

            if (totalHumanPopulation === 0) {
                if (populationCard) {
                    populationCard.textContent = `Field Error (${municipalityCount} docs)`;
                }
                return;
            }

            // Immediately set the calculated server total to the UI
            if (populationCard) {
                populationCard.textContent = totalHumanPopulation.toLocaleString();
            } else {
                const fallbackCard = document.getElementById("humanPopulation");
                if (fallbackCard) fallbackCard.textContent = totalHumanPopulation.toLocaleString();
            }
            
            // Re-render rate computations instantly if a rabies data source is active
            if (excelData && excelData.length > 0) {
                refreshMap();
            }
        });

    } catch (error) {
        console.error("❌ Error setting up live population sync:", error);
        if (populationCard) {
            populationCard.textContent = "Connection Error";
        }
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
            updateStatistics([]); 
            return;
        }

        excelData = [];

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            
            let rawMunName = data.municipality || data.facilityName || "";
            let cleanedMunName = rawMunName
                .replace(/(rhu|health center|district hospital|clinic)/gi, "")
                .trim();

            const lat = Number(data.latitude);
            const lng = Number(data.longitude);

            excelData.push({
                Year: data.year || new Date().getFullYear(),
                Municipality: cleanedMunName || "Unknown",
                Latitude: !isNaN(lat) && lat !== 0 ? lat : 10.90,
                Longitude: !isNaN(lng) && lng !== 0 ? lng : 122.60,
                "Animal Bite Cases": Number(data.totalCases || data.biteCases || data.animalBiteCases) || 0,
                "Human Rabies Deaths": Number(data.maleCases || data.humanDeaths) || 0,
                "Animal Rabies Deaths": Number(data.femaleCases || data.animalDeaths) || 0
            });
        });

        console.log(`✅ Loaded ${excelData.length} records into map engine.`);
        
        if (excelData.length > 0) {
            populateFilters();
            refreshMap(); 
        } else {
            updateStatistics([]);
        }

    } catch (error) {
        console.error("❌ Error sync-fetching case data:", error);
        updateStatistics([]);
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

// FILTERED DATA ENGINE
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
// DYNAMIC STATISTICS & RATIO ENGINE (DECOUPLED)
// ==========================================================

function updateStatistics(data) {
    const prevalenceCard = document.getElementById("prevalenceRate");
    const incidentsCard = document.getElementById("incidentsRate");
    const mortalityCard = document.getElementById("mortalityRate");

    // INTERCEPT GUARD: If no rabies files or incidents have been loaded yet,
    // explicitly display the total active population and safely exit.
    if (!data || data.length === 0) {
        if (populationCard && totalHumanPopulation > 0) {
            populationCard.textContent = totalHumanPopulation.toLocaleString();
        }
        return;
    }

    let biteTotal = 0;
    let humanTotal = 0;
    let animalTotal = 0;

    let trackedMunicipalitiesInFilter = new Set();

    data.forEach(function (row) {
        biteTotal += Number(row["Animal Bite Cases"]) || 0;
        humanTotal += Number(row["Human Rabies Deaths"]) || 0;
        animalTotal += Number(row["Animal Rabies Deaths"]) || 0;

        if (row.Municipality) {
            trackedMunicipalitiesInFilter.add(row.Municipality.trim().toLowerCase());
        }
    });

    let activePopulation = 0;
    
    if (municipalityFilter && municipalityFilter.value !== "All") {
        const selectedMun = municipalityFilter.value.trim().toLowerCase();
        activePopulation = municipalityPopulations[selectedMun] || 0;
    } else {
        trackedMunicipalitiesInFilter.forEach(mun => {
            activePopulation += municipalityPopulations[mun] || 0;
        });
    }

    // Safeguard: Fallback to total database metrics if map subset resolves to zero
    if (activePopulation === 0) {
        activePopulation = totalHumanPopulation > 0 ? totalHumanPopulation : 0;
    }

    // Render Human Population Card securely
    if (populationCard && activePopulation > 0) {
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
        incidentsCard.textContent = activePopulation > 0 ? `${incidents.toFixed(3)}%` : "0.000%";
    }

    // Mortality Rate
    if (mortalityCard) {
        const mortality = activePopulation > 0 ? (humanTotal / activePopulation) * 100 : 0;
        mortalityCard.textContent = activePopulation > 0 ? `${mortality.toFixed(4)}%` : "0.0000%";
    }
}

// UPDATE TOP MUNICIPALITIES
function updateTopMunicipalities(data) {
    const panel = document.getElementById("topMunicipalities");
    if (!panel) return;

    panel.innerHTML = "";
    
    if (!data || data.length === 0) return;

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
    if (!data || data.length === 0) return;

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

        if (biteCases > 0) bitePoints.push(...generateCluster(lat, lng, biteCases, 0.020));
        if (humanDeaths > 0) humanPoints.push(...generateCluster(lat, lng, humanDeaths, 0.010));
        if (animalDeaths > 0) animalPoints.push(...generateCluster(lat, lng, animalDeaths, 0.015));

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

    biteHeatLayer = L.heatLayer(bitePoints, {
        radius: 28, 
        blur: 18, 
        maxZoom: 16, 
        minOpacity: 0.45,
        max: 1.0,
        gradient: { '0.4': "#FFE082", '0.6': "#FFB300", '0.8': "#EA6113", '1.0': "#8C2F00" }
    });

    humanHeatLayer = L.heatLayer(humanPoints, {
        radius: 24, 
        blur: 16, 
        maxZoom: 16, 
        minOpacity: 0.45,
        max: 1.0,
        gradient: { '0.4': "#FFCDD2", '0.6': "#EF5350", '0.8': "#C62828", '1.0': "#7F0000" }
    });

    animalHeatLayer = L.heatLayer(animalPoints, {
        radius: 24, 
        blur: 16, 
        maxZoom: 16, 
        minOpacity: 0.45,
        max: 1.0,
        gradient: { '0.4': "#BBDEFB", '0.6': "#42A5F5", '0.8': "#1565C0", '1.0': "#002171" }
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
    if (cases <= 0) return points;

    const totalPoints = Math.max(Math.round(cases / 5), 1); 
    
    for (let i = 0; i < totalPoints; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random()) * spread;
        const randomLat = lat + Math.cos(angle) * distance;
        const randomLng = lng + Math.sin(angle) * distance;
        
        points.push([randomLat, randomLng, 1.0]);
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