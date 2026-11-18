import { listenToProvincePopulation, fetchHeatmapCasePoints } from '../db/pvo-heatmap-db.js';

let map;
let heatmapData = [];
let totalHumanPopulation = 0;
let municipalityPopulations = {};

let biteHeatLayer = null;
let humanHeatLayer = null;
let animalHeatLayer = null;
let markerLayer = null;

let yearFilter;
let municipalityFilter;
let layerFilter;

document.addEventListener("DOMContentLoaded", async () => {
    initializeMap();
    initializeControls();

    listenToProvincePopulation(({ totalPop, muniPop }) => {
        totalHumanPopulation = totalPop;
        municipalityPopulations = muniPop;
        updateHumanPopulationCard();
        refreshMap();
    });

    heatmapData = await fetchHeatmapCasePoints();
    populateFilters();
    refreshMap();
});

function initializeMap() {
    map = L.map("map", { zoomControl: true, preferCanvas: true });
    map.setView([10.90, 122.60], 9);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap Contributors"
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
}

function initializeControls() {
    yearFilter = document.getElementById("yearFilter");
    municipalityFilter = document.getElementById("municipalityFilter");
    layerFilter = document.getElementById("layerFilter");

    yearFilter?.addEventListener("change", refreshMap);
    municipalityFilter?.addEventListener("change", refreshMap);
    layerFilter?.addEventListener("change", refreshMap);
}

function updateHumanPopulationCard() {
    const card = document.getElementById("humanPopulation");
    if (card) card.textContent = totalHumanPopulation.toLocaleString();
}

function populateFilters() {
    if (yearFilter) {
        yearFilter.innerHTML = '<option value="All">All Years</option>';
        const years = [...new Set(heatmapData.map(item => item.Year))].sort();
        years.forEach(yr => {
            const opt = document.createElement("option");
            opt.value = yr; opt.textContent = yr; yearFilter.appendChild(opt);
        });
    }

    if (municipalityFilter) {
        municipalityFilter.innerHTML = '<option value="All">All Municipalities</option>';
        const munis = [...new Set(heatmapData.map(item => item.Municipality))].sort();
        munis.forEach(m => {
            const opt = document.createElement("option");
            opt.value = m; opt.textContent = m; municipalityFilter.appendChild(opt);
        });
    }
}

function getFilteredData() {
    let filtered = [...heatmapData];
    if (yearFilter && yearFilter.value !== "All") {
        filtered = filtered.filter(item => String(item.Year) === yearFilter.value);
    }
    if (municipalityFilter && municipalityFilter.value !== "All") {
        filtered = filtered.filter(item => item.Municipality.trim().toLowerCase() === municipalityFilter.value.trim().toLowerCase());
    }
    return filtered;
}

function updateStatistics(data) {
    const prevalenceCard = document.getElementById("prevalenceRate");
    const incidentsCard = document.getElementById("incidentsRate");
    const mortalityCard = document.getElementById("mortalityRate");

    let biteTotal = 0;
    let humanTotal = 0;
    let trackedMunicipalities = new Set();

    data.forEach(row => {
        biteTotal += row["Animal Bite Cases"];
        humanTotal += row["Human Rabies Deaths"];
        if (row.Municipality) trackedMunicipalities.add(row.Municipality.trim().toLowerCase());
    });

    let activePopulation = 0;
    if (municipalityFilter && municipalityFilter.value !== "All") {
        activePopulation = municipalityPopulations[municipalityFilter.value.trim().toLowerCase()] || 0;
    } else {
        trackedMunicipalities.forEach(mun => { activePopulation += municipalityPopulations[mun] || 0; });
    }

    if (activePopulation === 0) activePopulation = totalHumanPopulation > 0 ? totalHumanPopulation : 2082616;

    if (prevalenceCard) prevalenceCard.textContent = `${((biteTotal / activePopulation) * 100).toFixed(3)}%`;
    if (incidentsCard) incidentsCard.textContent = `${((biteTotal / activePopulation) * 100).toFixed(3)}%`;
    if (mortalityCard) mortalityCard.textContent = `${((humanTotal / activePopulation) * 100).toFixed(4)}%`;
}

function drawHeatmap(data) {
    clearMap();
    if (!data.length) return;

    let bitePoints = [];
    let humanPoints = [];
    let bounds = [];

    data.forEach(row => {
        bounds.push([row.Latitude, row.Longitude]);
        if (row["Animal Bite Cases"] > 0) bitePoints.push(...generateCluster(row.Latitude, row.Longitude, row["Animal Bite Cases"], 0.020));
        if (row["Human Rabies Deaths"] > 0) humanPoints.push(...generateCluster(row.Latitude, row.Longitude, row["Human Rabies Deaths"], 0.010));

        const marker = L.circleMarker([row.Latitude, row.Longitude], { radius: 6, color: "#fff", fillColor: "#1a234e", fillOpacity: 1 });
        marker.bindPopup(`<b>${row.Municipality}</b><br>Year: ${row.Year}<br>Bites: ${row["Animal Bite Cases"]}<br>Deaths: ${row["Human Rabies Deaths"]}`);
        markerLayer.addLayer(marker);
    });

    biteHeatLayer = L.heatLayer(bitePoints, { radius: 28, blur: 18 });
    humanHeatLayer = L.heatLayer(humanPoints, { radius: 24, blur: 16 });

    const selected = layerFilter ? layerFilter.value : "bite";
    if (selected === "bite") biteHeatLayer.addTo(map);
    else humanHeatLayer.addTo(map);

    if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
}

function generateCluster(lat, lng, cases, spread) {
    const points = [];
    const count = Math.max(Math.round(cases / 5), 1);
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.sqrt(Math.random()) * spread;
        points.push([lat + Math.cos(angle) * dist, lng + Math.sin(angle) * dist, 1.0]);
    }
    return points;
}

function clearMap() {
    if (biteHeatLayer) map.removeLayer(biteHeatLayer);
    if (humanHeatLayer) map.removeLayer(humanHeatLayer);
    if (animalHeatLayer) map.removeLayer(animalHeatLayer);
    if (markerLayer) markerLayer.clearLayers();
}

function refreshMap() {
    const data = getFilteredData();
    updateStatistics(data);
    drawHeatmap(data);
}