/**
 * CRIS - PHO Heatmap Dashboard Handler Engine (ENHANCED)
 * PHO ABTC Format Transformer & Epidemiological Calculation Layer
 * 
 * This version handles PHO's native facility-level ABTC format
 * and transforms it to municipality-level geospatial data,
 * with fully responsive 3KM interactive containment overlay layers.
 */

// Global State Containers
let map = null;
let excelData = [];
let populationData = [];
let facilityMapping = [];

// Global Hover Overlay Pointer
let activeInvestigationCircle = null; 

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
    
    // Load background datasets
    await loadFacilityMapping();
    await loadPopulationData();
});

// ==============================================================================
// LOAD FACILITY-TO-MUNICIPALITY MAPPING
// ==============================================================================
async function loadFacilityMapping() {
    try {
        const response = await fetch("../../assets/data/facility-mapping.json");
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        
        const data = await response.json();
        facilityMapping = data.facilities;
        console.log("Facility mapping loaded:", facilityMapping.length, "facilities indexed");
        
    } catch (error) {
        console.error("Critical Error: Facility mapping file failed to load.", error);
        facilityMapping = [];
    }
}

// Safe facility lookup
function getFacilityMunicipality(facilityName) {
    if (!facilityName || facilityMapping.length === 0) return null;
    
    const trimmed = String(facilityName).trim();
    const record = facilityMapping.find(f => 
        f.facility_name.toLowerCase() === trimmed.toLowerCase()
    );
    
    return record || null;
}

// Leaflet Map Provisioning Engine
function initializeMap() {
    const mapContainer = document.getElementById("map");
    if (!mapContainer) {
        console.error("CRITICAL ERROR: HTML element with id='map' was not found in the DOM!");
        return;
    }

    try {
        map = L.map("map", {
            zoomControl: true,
            preferCanvas: true
        }).setView([10.90, 122.60], 9);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap Contributors'
        }).addTo(map);

        if (map) {
            map.createPane('investigationPane');
            map.getPane('investigationPane').style.zIndex = 650;
            map.getPane('investigationPane').style.pointerEvents = 'none';
            
            markerLayer = L.layerGroup().addTo(map);
        }
        
        setTimeout(function() {
            if (map) map.invalidateSize();
        }, 300);

    } catch (initError) {
        console.error("Leaflet core initialization failed:", initError);
    }
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

// Load Population Data
async function loadPopulationData() {
    try {
        const response = await fetch("../../assets/data/Iloilo-Population.xlsx");
        if (!response.ok) throw new Error(`HTTP network error! Status: ${response.status}`);
        
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
        const firstSheetName = workbook.SheetNames[0]; 
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const parsedPopulation = [];

        rawRows.forEach(function(row) {
            if (!row || row.length < 3) return;

            const nameValue = String(row[0]).trim();
            const totalPopulationValue = Number(row[2]); 

            if (
                nameValue && 
                nameValue !== "undefined" &&
                nameValue === nameValue.toUpperCase() && 
                !nameValue.includes("TABLE") && 
                !nameValue.includes("PROVINCE") &&
                !isNaN(totalPopulationValue)
            ) {
                let cleanMuni = nameValue.replace(" *", "").trim();
                if (cleanMuni.startsWith("CITY OF ")) {
                    cleanMuni = cleanMuni.replace("CITY OF ", "").trim();
                }

                parsedPopulation.push({
                    Municipality: cleanMuni,
                    Year: "2024", 
                    Population: totalPopulationValue
                });
            }
        });

        populationData = parsedPopulation;
        console.log("Population data loaded:", populationData.length, "municipalities indexed");
        
    } catch (error) {
        console.error("Critical Error: Population Excel file failed to parse.", error);
    }
}

// ==============================================================================
// FLEXIBLE MULTI-FORMAT PARSER ENGINE
// ==============================================================================
function uploadExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        
        const rawData = XLSX.utils.sheet_to_json(worksheet);
        
        if (!rawData || rawData.length === 0) {
            alert("ERROR: The uploaded Excel file appears to be empty.");
            return;
        }

        // Get safe lowercase keys representing the file's columns
        const columns = Object.keys(rawData[0]).map(col => col.trim().toLowerCase());
        console.log("Parsing uploaded sheet columns:", columns);

        // Flexible Structural Identification Checks
        const hasABTC = columns.some(col => col.includes('abtc'));
        const hasMunicipality = columns.some(col => col.includes('municipality') || col.includes('municipalities'));
        const hasLatitude = columns.some(col => col.includes('latitude') || col.includes('lat'));
        const hasLongitude = columns.some(col => col.includes('longitude') || col.includes('lng'));

        if (hasABTC && !hasLatitude) {
            console.log("PHO ABTC format recognized via column footprint. Transforming...");
            excelData = transformPHOABTCFormat(rawData);
        } else if (hasMunicipality && hasLatitude && hasLongitude) {
            console.log("Geo-spatial standard format recognized via coordinates. Injecting directly...");
            excelData = rawData;
        } else {
            alert("ERROR: Unrecognized data format. Please upload standard PHO ABTC facility reports or clean municipality geo-spatial datasets.");
            return;
        }
        
        normalizeHeaders();
        populateFilters();
        refreshMap();
    };
    reader.readAsArrayBuffer(file);
}

// ==============================================================================
// TRANSFORM PHO ABTC FORMAT TO GEO-SPATIAL FORMAT
// ==============================================================================
function transformPHOABTCFormat(phoData) {
    const municipalityMap = {};
    
    phoData.forEach(function(row) {
        // Dynamically find values by checking keys flexibly
        let facilityName = "";
        let totalBiteCases = 0;
        let remarks = "";

        Object.keys(row).forEach(key => {
            const cleanKey = key.trim().toLowerCase();
            if (cleanKey.includes('abtc')) facilityName = String(row[key]);
            if (cleanKey === 'total') totalBiteCases = Number(row[key]) || 0;
            if (cleanKey.includes('remark')) remarks = String(row[key]);
        });

        if (!facilityName || facilityName.toLowerCase() === 'total' || facilityName.toLowerCase() === 'nan') return;
        
        // Look up facility in database registry
        const facilityInfo = getFacilityMunicipality(facilityName);
        if (!facilityInfo) {
            console.warn(`Facility missing from reference mapping database: ${facilityName}`);
            return;
        }
        
        const municipality = facilityInfo.municipality;
        
        // Initialize aggregation node if absent
        if (!municipalityMap[municipality]) {
            municipalityMap[municipality] = {
                Municipality: municipality,
                Latitude: facilityInfo.latitude,
                Longitude: facilityInfo.longitude,
                Year: new Date().getFullYear(),
                'Animal Bite Cases': 0,
                'Human Rabies Deaths': 0,
                'Animal Rabies Deaths': 0,
                facilitiesCount: 0
            };
        }
        
        // Aggregate statistics totals
        municipalityMap[municipality]['Animal Bite Cases'] += totalBiteCases;
        municipalityMap[municipality].facilitiesCount += 1;
        
        // Context-driven estimations
        if (remarks && remarks.toLowerCase().includes('incomplete')) {
            municipalityMap[municipality]['Human Rabies Deaths'] += Math.round(totalBiteCases * 0.02);
        }
    });
    
    const transformed = Object.values(municipalityMap);
    console.log(`Transformed ${phoData.length} facility records into ${transformed.length} municipality coordinates.`);
    
    return transformed;
}

// Normalize headers
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

// Populate filters
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

// Get population
function getPopulation(municipality, year) {
    if (!populationData || populationData.length === 0) return 0;
    
    let targetMuni = String(municipality).trim().toUpperCase();
    if (targetMuni.startsWith("CITY OF ")) targetMuni = targetMuni.replace("CITY OF ", "").trim();
    if (targetMuni.endsWith(" CITY")) targetMuni = targetMuni.replace(" CITY", "").trim();

    const record = populationData.find(function(item) {
        return String(item.Municipality).trim().toUpperCase() === targetMuni;
    });

    return record ? Number(record.Population) : 0;
}

// Get filtered data
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

// ==============================================================================
// EPIDEMIOLOGICAL CALCULATIONS
// ==============================================================================
function updateStatistics(data) {
    let totalPopulation = 0;
    let totalBites = 0;
    let totalHumanDeaths = 0;

    const popTrackingSet = new Set();

    data.forEach(function(row) {
        totalBites += Number(row["Animal Bite Cases"]) || 0;
        totalHumanDeaths += Number(row["Human Rabies Deaths"]) || 0;

        const trackingKey = `${String(row.Municipality).trim().toUpperCase()}`;
        if (!popTrackingSet.has(trackingKey)) {
            totalPopulation += getPopulation(row.Municipality, row.Year);
            popTrackingSet.add(trackingKey);
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
    if (elInc) elInc.textContent = incidenceRate.toFixed(2) + "%";
    if (elMort) elMort.textContent = mortalityRate.toFixed(2) + "%";
}

// Update top municipalities
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
        
        const prevalence = population > 0 ? (casesCount / population) * 100000 : 0;

        return {
            municipality: muniName,
            prevalence: prevalence,
            totalCases: casesCount
        };
    }).sort((a, b) => b.prevalence - a.prevalence);

    ranking.slice(0, 5).forEach(function(item, index) {
        const div = document.createElement("div");
        div.className = "top-item";
        div.innerHTML = `<span>${index + 1}. ${item.municipality}</span>
                         <strong>${item.prevalence.toFixed(2)} <small style="font-size:9px;color:#777;font-weight:normal;">/100k</small></strong>`;
        panel.appendChild(div);
    });
}

// ==============================================================================
// HEATMAP & INTERACTIVE RADIAL SYSTEM LAYER RENDERING
// ==============================================================================
function clearMap() {
    if (biteHeatLayer && map) map.removeLayer(biteHeatLayer);
    if (humanHeatLayer && map) map.removeLayer(humanHeatLayer);
    if (animalHeatLayer && map) map.removeLayer(animalHeatLayer);
    
    // Completely wipe lingering vector paths out of DOM memory context
    if (activeInvestigationCircle && map) {
        map.removeLayer(activeInvestigationCircle);
        activeInvestigationCircle = null;
    }
    
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

        bitePoints.push(...generateCluster(lat, lng, biteCases, 0.020));
        humanPoints.push(...generateCluster(lat, lng, humanDeaths, 0.010));
        animalPoints.push(...generateCluster(lat, lng, animalDeaths, 0.015));

        const itemPrev = population > 0 ? (biteCases / population) * 1500000 : 0;
        const itemInc = population > 0 ? (biteCases / population) * 100000 : 0;
        const itemMort = population > 0 ? (humanDeaths / population) * 100000 : 0;

        // Render target anchor marker node
        const marker = L.circleMarker([lat, lng], {
            radius: 6,
            color: "#ffffff",
            weight: 2,
            fillColor: "#1a234e",
            fillOpacity: 1
        }).addTo(markerLayer);

        // Bind interactive descriptive metadata popups
        marker.bindPopup(`
            <div style="font-family:'Lato', sans-serif; min-width:190px;">
                <b style="font-size:14px; color:#1a234e;">${row.Municipality}</b><br>
                <span style="font-size:11px; color:#666;">Reference Timeline: Year ${row.Year || new Date().getFullYear()}</span>
                <hr style="border:0; border-top:1px solid #eee; margin:6px 0;">
                <table style="width:100%; font-size:11px; border-collapse:collapse;">
                    <tr><td><b>Population:</b></td><td align="right">${population.toLocaleString()}</td></tr>
                    <tr><td><b>Bite Cases:</b></td><td align="right">${biteCases}</td></tr>
                    <tr><td><b>Human Deaths:</b></td><td align="right">${humanDeaths}</td></tr>
                    <tr><td><b>Prevalence (per 1.5M):</b></td><td align="right">${itemPrev.toFixed(2)}</td></tr>
                    <tr><td><b>Incidence Rate:</b></td><td align="right">${itemInc.toFixed(2)}</td></tr>
                    <tr><td><b>Mortality Rate:</b></td><td align="right">${itemMort.toFixed(2)}</td></tr>
                </table>
                <div style="margin-top: 8px; font-size: 10px; color: #EA6113; font-weight: bold; text-align: center; border-top: 1px dashed #ffdcc4; padding-top: 4px;">
                    📍 3KM Containment Radius Active
                </div>
            </div>
        `);

        // DECOUPLED HOVER OVERLAY HOOKS (Bypasses Canvas Blockers)
        marker.on('mouseover', function(e) {
            if (activeInvestigationCircle && map) {
                map.removeLayer(activeInvestigationCircle);
            }

            // Force draw the 3KM circle natively over top maps layer space
            activeInvestigationCircle = L.circle([lat, lng], {
                radius: 3000,           // Exactly 3 Kilometers
                color: "#EA6113",       // Sunset Orange
                weight: 3,              // High-visibility boundary line thickness
                fillColor: "#FBB931",   // Yellow Fill Core
                fillOpacity: 0.30,      // Opaque layout block
                dashArray: "6, 8",
                interactive: false      // Passing false prevents layout tracking collisions
            }).addTo(map);

            if (!this.isPopupOpen()) {
                this.openPopup();
            }
        });

        marker.on('mouseout', function(e) {
            const movingTo = e.originalEvent.relatedTarget;
            
            if (movingTo && (movingTo === this._container || this._popup?._container?.contains(movingTo))) {
                return;
            }

            if (activeInvestigationCircle && map) {
                map.removeLayer(activeInvestigationCircle);
                activeInvestigationCircle = null;
            }
            this.closePopup();
        });
    });

    const heatmapOptions = {
        radius: 10,
        blur: 8,
        maxZoom: 18,
        minOpacity: 0.50
    };

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

// Refresh map with debounce
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

// Handle window resize
window.addEventListener("resize", function() {
    if (map) map.invalidateSize();
});