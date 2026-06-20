/* ==========================================================
   CRIS - PVO HEATMAP SYSTEM
   PART 1
   INITIALIZATION + EXCEL READER
========================================================== */

// ==========================================================
// GLOBAL VARIABLES
// ==========================================================

let map;

// Raw Excel Data
let excelData = [];

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

document.addEventListener("DOMContentLoaded", () => {

    initializeMap();

    initializeControls();

});

// ==========================================================
// CREATE LEAFLET MAP
// ==========================================================

function initializeMap() {

    map = L.map("map", {

        zoomControl: true,

        preferCanvas: true

    });

    map.setView([10.90, 122.60], 9);

    L.tileLayer(

        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",

        {

            maxZoom: 19,

            attribution:

            "&copy; OpenStreetMap Contributors"

        }

    ).addTo(map);

    markerLayer = L.layerGroup().addTo(map);

    setTimeout(function(){

        map.invalidateSize();

    },300);

}

// ==========================================================
// INITIALIZE CONTROLS
// ==========================================================

function initializeControls(){

    uploadInput=document.getElementById("excelFile");

    yearFilter=document.getElementById("yearFilter");

    municipalityFilter=document.getElementById("municipalityFilter");

    layerFilter=document.getElementById("layerFilter");

    uploadInput.addEventListener(

        "change",

        uploadExcel

    );

    yearFilter.addEventListener(

        "change",

        refreshMap

    );

    municipalityFilter.addEventListener(

        "change",

        refreshMap

    );

    layerFilter.addEventListener(

        "change",

        refreshMap

    );

}

// ==========================================================
// READ EXCEL FILE
// ==========================================================

function uploadExcel(event){

    const file=event.target.files[0];

    if(!file){

        return;

    }

    const reader=new FileReader();

    reader.onload=function(e){

        const data=new Uint8Array(

            e.target.result

        );

        const workbook=XLSX.read(

            data,

            {

                type:"array"

            }

        );

        const firstSheet=

        workbook.SheetNames[0];

        const worksheet=

        workbook.Sheets[firstSheet];

        excelData=

        XLSX.utils.sheet_to_json(

            worksheet

        );

        normalizeHeaders();

        populateFilters();

        refreshMap();

    };

    reader.readAsArrayBuffer(file);

}

// ==========================================================
// NORMALIZE EXCEL HEADERS
// ==========================================================

function normalizeHeaders(){

    excelData=excelData.map(function(row){

        const newRow={};

        Object.keys(row).forEach(function(key){

            const clean=

            key.trim().toLowerCase();

            if(

                clean==="year" ||

                clean==="years"

            ){

                newRow.Year=row[key];

            }

            else if(

                clean==="municipality" ||

                clean==="municipalities"

            ){

                newRow.Municipality=row[key];

            }

            else if(

                clean==="latitude" ||

                clean==="lat"

            ){

                newRow.Latitude=row[key];

            }

            else if(

                clean==="longitude" ||

                clean==="lng"

            ){

                newRow.Longitude=row[key];

            }

            else if(

                clean.includes("bite")

            ){

                newRow["Animal Bite Cases"]=

                Number(row[key])||0;

            }

            else if(

                clean.includes("human")

            ){

                newRow["Human Rabies Deaths"]=

                Number(row[key])||0;

            }

            else if(

                clean.includes("animal")

            ){

                newRow["Animal Rabies Deaths"]=

                Number(row[key])||0;

            }

        });

        return newRow;

    });

}

// ==========================================================
// POPULATE FILTERS
// ==========================================================

function populateFilters(){

    yearFilter.innerHTML=

    '<option value="All">All Years</option>';

    municipalityFilter.innerHTML=

    '<option value="All">All Municipalities</option>';

    const years=

    [...new Set(

        excelData.map(

            item=>item.Year

        )

    )].sort();

    const municipalities=

    [...new Set(

        excelData.map(

            item=>item.Municipality

        )

    )].sort();

    years.forEach(function(year){

        const option=

        document.createElement("option");

        option.value=year;

        option.textContent=year;

        yearFilter.appendChild(option);

    });

    municipalities.forEach(function(municipality){

        const option=

        document.createElement("option");

        option.value=municipality;

        option.textContent=municipality;

        municipalityFilter.appendChild(option);

    });

}

//PART 2 

