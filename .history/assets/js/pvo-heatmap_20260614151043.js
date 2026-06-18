// Global State Containers
let map = null;
let excelData = [];
let biteHeatLayer = null;
let humanHeatLayer = null;
let animalHeatLayer = null;
let markerGroup = null;

// Node DOM Selectors
let uploadInput, yearFilter, municipalityFilter, layerFilter;
let biteTotal, humanTotal, animalTotal;

// SAFE INITIALIZATION: Wait for HTML elements to completely exist in the DOM
window.addEventListener("DOMContentLoaded", function () {
    // 1. MAP INITIALIZATION CONFIGURATIONS
    map = L.map("map", { 
        zoomControl: true,
        minZoom: 2
    }).setView([10.90, 122.60], 9); // Center coordinates for Iloilo Province

    // Using secure standard OpenStreetMap server production configurations
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    markerGroup = L.layerGroup().addTo(map);

    // Bind Document DOM Selectors safely
    uploadInput = document.getElementById("excelFile");
    yearFilter = document.getElementById("yearFilter");
    municipalityFilter = document.getElementById("municipalityFilter");
    layerFilter = document.getElementById("layerFilter");

    biteTotal = document.getElementById("biteTotal");
    humanTotal = document.getElementById("humanTotal");
    animalTotal = document.getElementById("animalTotal");

    // Initialize Event Listeners
    if (uploadInput) {
        uploadInput.addEventListener("change", function (event) {
            const file = event.target.files[0];
            if (!file) {
                alert("Please select an Excel or CSV file.");
                return;
            }
            readExcel(file);
        });
    }

    if (yearFilter) yearFilter.addEventListener("change", refreshMap);
    if (municipalityFilter) municipalityFilter.addEventListener("change", refreshMap);
    if (layerFilter) layerFilter.addEventListener("change", refreshMap);

    // FIX: Sequentially force layout container recalculations as rendering engines catch up
    function forceMapRender() {
        if (map) {
            map.invalidateSize();
            window.dispatchEvent(new Event('resize'));
        }
    }

    setTimeout(forceMapRender, 100);
    setTimeout(forceMapRender, 400);
    setTimeout(forceMapRender, 800);
});

// 2. EXCEL SOURCE UPLOADER PARSER 
function readExcel(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        excelData = XLSX.utils.sheet_to_json(worksheet);

        if (excelData.length === 0) {
            alert("The uploaded file is empty or could not be read properly.");
            return;
        }

        cleanHeaders();
        populateYearFilter();
        populateMunicipalityFilter();
        refreshMap();
    };
    reader.readAsArrayBuffer(file);
}

// Custom Normalization Matrix for Trial-Heamaps Structure
function cleanHeaders() {
    excelData = excelData.map(function (row) {
        const newRow = {};
        Object.keys(row).forEach(function (key) {
            const cleanKey = key.trim().toLowerCase();
            
            if (cleanKey === "years" || cleanKey === "year") {
                newRow["Year"] = row[key];
            } else if (cleanKey === "municipalities" || cleanKey === "municipality" || cleanKey === "town") {
                newRow["Municipality"] = row[key];
            } else if (cleanKey === "latitude" || cleanKey === "lat") {
                newRow["Latitude"] = row[key];
            } else if (cleanKey === "longitude" || cleanKey === "lng") {
                newRow["Longitude"] = row[key];
            } else if (cleanKey.includes("bite")) {
                newRow["Animal Bite Cases"] = row[key];
            } else if (cleanKey.includes("human") && cleanKey.includes("death")) {
                newRow["Human Rabies Deaths"] = row[key];
            } else if (cleanKey.includes("animal") && cleanKey.includes("death")) {
                newRow["Animal Rabies Deaths"] = row[key];
            } else {
                newRow[key.trim()] = row[key];
            }
        });
        return newRow;
    });
}

// 3. UI FILTERS MANAGEMENT POPULATION
function populateYearFilter() {
    if (!yearFilter) return;
    yearFilter.innerHTML = '<option value="All">All Years</option>';
    const years = [...new Set(excelData.map(item => item.Year))].filter(Boolean).sort();
    
    years.forEach(year => {
        const option = document.createElement("option");
        option.value = year;
        option.textContent = year;
        yearFilter.appendChild(option);
    });
}

function populateMunicipalityFilter() {
    if (!municipalityFilter) return;
    municipalityFilter.innerHTML = '<option value="All">All Municipalities</option>';
    const municipalities = [...new Set(excelData.map(item => item.Municipality))].filter(Boolean).sort();
    
    municipalities.forEach(muni => {
        const option = document.createElement("option");
        option.value = muni;
        option.textContent = muni;
        municipalityFilter.appendChild(option);
    });
}

function getFilteredData() {
    let filtered = excelData;
    if (yearFilter && yearFilter.value !== "All") {
        filtered = filtered.filter(item => String(item.Year) === yearFilter.value);
    }
    if (municipalityFilter && municipalityFilter.value !== "All") {
        filtered = filtered.filter(item => String(item.Municipality) === municipalityFilter.value);
    }
    return filtered;
}

// 4. STATISTICAL RENDERS
function updateStatistics(data) {
    let bite = 0, human = 0, animal = 0;
    
    data.forEach(row => {
        bite += Number(row["Animal Bite Cases"]) || 0;
        human += Number(row["Human Rabies Deaths"]) || 0;
        animal += Number(row["Animal Rabies Deaths"]) || 0;
    });

    if (biteTotal) biteTotal.textContent = bite.toLocaleString();
    if (humanTotal) humanTotal.textContent = human.toLocaleString();
    if (animalTotal) animalTotal.textContent = animal.toLocaleString();
}

function refreshMap() {
    const filteredData = getFilteredData();
    updateStatistics(filteredData);
    updateTopMunicipalities(filteredData);
    drawHeatmap(filteredData);
}

// 5. GEOSPATIAL VECTOR MAP LAYERING ENGINE
function drawHeatmap(data) {
    if (!map) return;
    
    if (biteHeatLayer) map.removeLayer(biteHeatLayer);
    if (humanHeatLayer) map.removeLayer(humanHeatLayer);
    if (animalHeatLayer) map.removeLayer(animalHeatLayer);
    if (markerGroup) markerGroup.clearLayers();

    let bitePoints = [], humanPoints = [], animalPoints = [], bounds = [];

    data.forEach(row => {
        const lat = Number(row.Latitude);
        const lng = Number(row.Longitude);
        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;

        bounds.push([lat, lng]);
        const bite = Number(row["Animal Bite Cases"]) || 0;
        const human = Number(row["Human Rabies Deaths"]) || 0;
        const animal = Number(row["Animal Rabies Deaths"]) || 0;

        bitePoints.push([lat, lng, Math.max(bite / 100, 0.25)]);
        humanPoints.push([lat, lng, Math.max(human / 20, 0.25)]);
        animalPoints.push([lat, lng, Math.max(animal / 50, 0.25)]);

        const marker = L.circleMarker([lat, lng], {
            radius: 7,
            fillColor: "#EA6113",
            color: "#ffffff",
            weight: 2,
            fillOpacity: 1
        });

        marker.bindPopup(
            `<b>${row.Municipality || 'Unknown'}</b><br><br>` +
            `<b>Year:</b> ${row.Year || 'N/A'}<br>` +
            `<b>Animal Bite Cases:</b> ${bite}<br>` +
            `<b>Human Rabies Deaths:</b> ${human}<br>` +
            `<b>Animal Rabies Deaths:</b> ${animal}`
        );
        if (markerGroup) markerGroup.addLayer(marker);
    });

    biteHeatLayer = L.heatLayer(bitePoints, { radius: 45, blur: 25, maxZoom: 14, minOpacity: .5, gradient: { 0.2: "#FFE082", 0.5: "#FF9800", 0.8: "#EA6113", 1: "#8C2F00" } });
    humanHeatLayer = L.heatLayer(humanPoints, { radius: 45, blur: 25, maxZoom: 14, minOpacity: .5, gradient: { 0.2: "#FFCDD2", 0.5: "#E53935", 0.8: "#B71C1C", 1: "#5D0000" } });
    animalHeatLayer = L.heatLayer(animalPoints, { radius: 45, blur: 25, maxZoom: 14, minOpacity: .5, gradient: { 0.2: "#BBDEFB", 0.5: "#42A5F5", 0.8: "#1565C0", 1: "#002171" } });

    const selectedLayer = layerFilter ? layerFilter.value : "bite";
    if (selectedLayer === "bite") biteHeatLayer.addTo(map);
    if (selectedLayer === "human") humanHeatLayer.addTo(map);
    if (selectedLayer === "animal") animalHeatLayer.addTo(map);

    if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40] });
    }
}

// 6. RANKING ENGINE PANEL DATA EXTRACTOR
function updateTopMunicipalities(data) {
    const panel = document.getElementById("topMunicipalities");
    if (!panel) return;
    panel.innerHTML = "";

    let sorted = [...data];
    sorted.sort((a, b) => (Number(b["Animal Bite Cases"]) || 0) - (Number(a["Animal Bite Cases"]) || 0));

    sorted.slice(0, 5).forEach(row => {
        if (!row.Municipality) return;
        const div = document.createElement("div");
        div.className = "top-item";
        div.innerHTML = `<span>${row.Municipality}</span><strong>${row["Animal Bite Cases"] || 0}</strong>`;
        panel.appendChild(div);
    });
}