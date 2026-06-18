/* =====================================================
   MAP INITIALIZATION
===================================================== */

const map = L.map("map", {
    zoomControl: true
}).setView([10.90, 122.60], 9);

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap Contributors"
    }
).addTo(map);


/* =====================================================
   GLOBAL VARIABLES
===================================================== */

let excelData = [];

let biteHeatLayer = null;
let humanHeatLayer = null;
let animalHeatLayer = null;

const uploadInput = document.getElementById("excelFile");
const yearFilter = document.getElementById("yearFilter");
const municipalityFilter = document.getElementById("municipalityFilter");
const layerFilter = document.getElementById("layerFilter");

const biteTotal = document.getElementById("biteTotal");
const humanTotal = document.getElementById("humanTotal");
const animalTotal = document.getElementById("animalTotal");


/* =====================================================
   EXCEL UPLOAD
===================================================== */

uploadInput.addEventListener("change", function (event) {

    const file = event.target.files[0];

    if (!file) {

        alert("Please select an Excel file.");

        return;

    }

    readExcel(file);

});


/* =====================================================
   READ EXCEL
===================================================== */

function readExcel(file) {

    const reader = new FileReader();

    reader.onload = function (e) {

        const data = new Uint8Array(e.target.result);

        const workbook = XLSX.read(data, {

            type: "array"

        });

        const sheetName = workbook.SheetNames[0];

        const worksheet = workbook.Sheets[sheetName];

        excelData = XLSX.utils.sheet_to_json(worksheet);

        cleanHeaders();

        populateYearFilter();

        populateMunicipalityFilter();

        updateStatistics(excelData);

        refreshMap();

    };

    reader.readAsArrayBuffer(file);

}


/* =====================================================
   CLEAN COLUMN NAMES
===================================================== */

function cleanHeaders() {

    excelData = excelData.map(function (row) {

        const newRow = {};

        Object.keys(row).forEach(function (key) {

            newRow[key.trim()] = row[key];

        });

        return newRow;

    });

}


/* =====================================================
   YEAR FILTER
===================================================== */

function populateYearFilter() {

    yearFilter.innerHTML = "";

    const defaultOption = document.createElement("option");

    defaultOption.value = "All";

    defaultOption.textContent = "All Years";

    yearFilter.appendChild(defaultOption);

    const years = [...new Set(

        excelData.map(item => item.Year)

    )].sort();

    years.forEach(function (year) {

        const option = document.createElement("option");

        option.value = year;

        option.textContent = year;

        yearFilter.appendChild(option);

    });

}


/* =====================================================
   MUNICIPALITY FILTER
===================================================== */

function populateMunicipalityFilter() {

    municipalityFilter.innerHTML = "";

    const defaultOption = document.createElement("option");

    defaultOption.value = "All";

    defaultOption.textContent = "All Municipalities";

    municipalityFilter.appendChild(defaultOption);

    const municipalities = [...new Set(

        excelData.map(item => item.Municipality)

    )].sort();

    municipalities.forEach(function (municipality) {

        const option = document.createElement("option");

        option.value = municipality;

        option.textContent = municipality;

        municipalityFilter.appendChild(option);

    });

}


/* =====================================================
   FILTER EVENTS
===================================================== */

yearFilter.addEventListener("change", function () {

    refreshMap();

});

municipalityFilter.addEventListener("change", function () {

    refreshMap();

});

layerFilter.addEventListener("change", function () {

    refreshMap();

});


/* =====================================================
   FILTER DATA
===================================================== */

function getFilteredData() {

    let filtered = excelData;

    if (yearFilter.value !== "All") {

        filtered = filtered.filter(function (item) {

            return String(item.Year) === yearFilter.value;

        });

    }

    if (municipalityFilter.value !== "All") {

        filtered = filtered.filter(function (item) {

            return item.Municipality === municipalityFilter.value;

        });

    }

    return filtered;

}


/* =====================================================
   UPDATE STATISTICS
===================================================== */

function updateStatistics(data) {

    let bite = 0;

    let human = 0;

    let animal = 0;

    data.forEach(function (row) {

        bite += Number(row["Animal Bite Cases"]) || 0;

        human += Number(row["Human Rabies Deaths"]) || 0;

        animal += Number(row["Animal Rabies Deaths"]) || 0;

    });

    biteTotal.textContent = bite.toLocaleString();

    humanTotal.textContent = human.toLocaleString();

    animalTotal.textContent = animal.toLocaleString();

}


/* =====================================================
   REFRESH DASHBOARD
===================================================== */

function refreshMap() {

    const filteredData = getFilteredData();

    updateStatistics(filteredData);

    drawHeatmap(filteredData);

}