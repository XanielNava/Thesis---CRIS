//PART 1
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

//LEAFLET MAP
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

//FILTERS
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

//READ EXCEL FILE
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

//NORMALIZATION OF HEADERS
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

//POPULATE FILERS
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
//FILTERED DATA
function getFilteredData() {
    let filtered = [...excelData];

    // Year Filter
    if (yearFilter.value !== "All") {
        filtered = filtered.filter(function (item) {
            return String(item.Year) === yearFilter.value;
        });
    }

    // Municipality Filter
    if (municipalityFilter.value !== "All") {
        filtered = filtered.filter(function (item) {
            return String(item.Municipality) === municipalityFilter.value;
        });
    }
    return filtered;
}

// REFRESH ENTIRE MAP
function refreshMap() {
    if (excelData.length === 0) {
        return;
    }

    const filteredData = getFilteredData();
    updateStatistics(filteredData);
    updateTopMunicipalities(filteredData);
    drawHeatmap(filteredData);
}

//UPDATED STATISTICS
// ==========================================================
// EPIDEMIOLOGICAL STATISTICS
// ==========================================================

function getPopulationTotal(data){

    let totalPopulation = 0;

    const municipalities = new Set();

    data.forEach(function(row){

        if(row.Municipality){

            municipalities.add(
                String(
                    row.Municipality
                )
                .trim()
                .toUpperCase()
            );

        }

    });

    municipalities.forEach(function(municipality){

        totalPopulation +=
            populationData[
                municipality
            ] || 0;

    });

    return totalPopulation;

}

function updateStatistics(data){

    const populationCard =
    document.getElementById(
        "humanPopulation"
    );

    const prevalenceCard =
    document.getElementById(
        "prevalenceRate"
    );

    const incidenceCard =
    document.getElementById(
        "incidentsRate"
    );

    const mortalityCard =
    document.getElementById(
        "mortlityRate"
    );

    let biteCases = 0;
    let humanDeaths = 0;
    let animalDeaths = 0;

    data.forEach(function(row){

        biteCases +=
        Number(
            row["Animal Bite Cases"]
        ) || 0;

        humanDeaths +=
        Number(
            row["Human Rabies Deaths"]
        ) || 0;

        animalDeaths +=
        Number(
            row["Animal Rabies Deaths"]
        ) || 0;

    });

    const population =
    getPopulationTotal(data);

    let prevalenceRate = 0;
    let incidenceRate = 0;
    let mortalityRate = 0;

    if(population > 0){

        // Cases per 100,000 population
        prevalenceRate =
        (
            biteCases /
            population
        ) * 100000;

        // New cases per 100,000 population
        incidenceRate =
        (
            biteCases /
            population
        ) * 100000;

        // Human rabies deaths per 100,000 population
        mortalityRate =
        (
            humanDeaths /
            population
        ) * 100000;

    }

    if(populationCard){

        populationCard.textContent =
        population.toLocaleString();

    }

    if(prevalenceCard){

        prevalenceCard.textContent =
        prevalenceRate.toFixed(2);

    }

    if(incidenceCard){

        incidenceCard.textContent =
        incidenceRate.toFixed(2);

    }

    if(mortalityCard){

        mortalityCard.textContent =
        mortalityRate.toFixed(2);

    }

}

// ==========================================================
// TOP MUNICIPALITIES BY PREVALENCE RATE
// ==========================================================

function updateTopMunicipalities(data){

    const panel =
    document.getElementById(
        "topMunicipalities"
    );

    if(!panel){
        return;
    }

    panel.innerHTML = "";

    const municipalityStats = {};

    data.forEach(function(row){

        const municipality =
        String(
            row.Municipality || ""
        )
        .trim()
        .toUpperCase();

        if(!municipality){
            return;
        }

        if(!municipalityStats[municipality]){

            municipalityStats[municipality] = {

                cases:0,
                deaths:0,
                population:
                populationData[
                    municipality
                ] || 0

            };

        }

        municipalityStats[
            municipality
        ].cases +=

        Number(
            row["Animal Bite Cases"]
        ) || 0;

        municipalityStats[
            municipality
        ].deaths +=

        Number(
            row["Human Rabies Deaths"]
        ) || 0;

    });

    const ranking = [];

    Object.keys(
        municipalityStats
    ).forEach(function(municipality){

        const population =
        municipalityStats[
            municipality
        ].population;

        const cases =
        municipalityStats[
            municipality
        ].cases;

        let prevalence = 0;

        if(population > 0){

            prevalence =
            (
                cases /
                population
            ) * 100000;

        }

        ranking.push({

            municipality:
            municipality,

            prevalence:
            prevalence,

            cases:
            cases

        });

    });

    ranking.sort(function(a,b){

        return (
            b.prevalence -
            a.prevalence
        );

    });

    ranking
    .slice(0,5)
    .forEach(function(item,index){

        const div =
        document.createElement(
            "div"
        );

        div.className =
        "top-item";

        div.innerHTML =

        "<span>" +

        (index + 1) +

        ". " +

        item.municipality +

        "</span>" +

        "<strong>" +

        item.prevalence
            .toFixed(2) +

        "</strong>";

        panel.appendChild(
            div
        );

    });

}

// CALCULATE BOUNDS AND ZOOM TO DATA
function zoomToData(data) {
    if (!map) {
        return;
    }

    const bounds = [];
    data.forEach(function (row) {
        const lat = Number(row.Latitude);
        const lng = Number(row.Longitude);

        if (
            !isNaN(lat) &&
            !isNaN(lng)
        ) {
            bounds.push([lat, lng]);
        }
    });
    if (bounds.length > 0) {
        map.fitBounds(bounds, {
            padding: [50, 50]
        });
    }
}

//CLEAR MAP
function clearMap() {
    if (biteHeatLayer) {
        map.removeLayer(
            biteHeatLayer
        );
    }
    if (humanHeatLayer) {
        map.removeLayer(
            humanHeatLayer
        );
    }
    if (animalHeatLayer) {
        map.removeLayer(
            animalHeatLayer
        );
    }
    if (markerLayer) {
        markerLayer.clearLayers();
    }
}

//PART 3
//CLUSTERED POINTS
function generateCluster(lat, lng, cases, spread) {
    const points = [];

    // Number of simulated events
    // More cases = more clustered points
    const totalPoints = Math.max(
        Math.round(cases / 10),
        1
    );
    for (let i = 0; i < totalPoints; i++) {
        // Gaussian-like distribution
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random()) * spread;
        const randomLat =
            lat +
            Math.cos(angle) * distance;
        const randomLng =
            lng +
            Math.sin(angle) * distance;
        points.push([
            randomLat,
            randomLng,
            1
        ]);
    }
    return points;
}

//DRAW HEATMAPS
function drawHeatmap(data) {
    clearMap();
    let bitePoints = [];
    let humanPoints = [];
    let animalPoints = [];
    let bounds = [];
    data.forEach(function(row){
        const lat = Number(row.Latitude);
        const lng = Number(row.Longitude);

        if(
            isNaN(lat) ||
            isNaN(lng)
        ){
            return;
        }
        bounds.push([lat,lng]);
        const biteCases =
            Number(row["Animal Bite Cases"]) || 0;
        const humanDeaths =
            Number(row["Human Rabies Deaths"]) || 0;
        const animalDeaths =
            Number(row["Animal Rabies Deaths"]) || 0;

        // Generate clustered points for heatmaps
        bitePoints.push(
            ...generateCluster(
                lat,
                lng,
                biteCases,
                0.020
            )
        );

        humanPoints.push(
            ...generateCluster(
                lat,
                lng,
                humanDeaths,
                0.010
            )

        );

        animalPoints.push(
            ...generateCluster(
                lat,
                lng,
                animalDeaths,
                0.015
            )
        );


        //Municipality Marker
        const marker =
        L.circleMarker(
            [lat,lng],
            {
                radius:5,
                color:"#ffffff",
                weight:2,
                fillColor:"#1a234e",
                fillOpacity:1
            }
        );

        marker.bindPopup(
            "<b>"+
            row.Municipality+
            "</b><br><br>"+
            "<b>Year:</b> "+
            row.Year+
            "<br>"+
            "<b>Animal Bite Cases:</b> "+
            biteCases+
            "<br>"+
            "<b>Human Rabies Deaths:</b> "+
            humanDeaths+
            "<br>"+
            "<b>Animal Rabies Deaths:</b> "+
            animalDeaths
        );
        markerLayer.addLayer(marker);
    });


    //HEATMAPS
    biteHeatLayer =
    L.heatLayer(
        bitePoints,
        {
            radius:28,
            blur:18,
            maxZoom:16,
            minOpacity:.45,
            gradient:{
                0.20:"#FFE082",
                0.50:"#FFB300",
                0.75:"#EA6113",
                1.00:"#8C2F00"
            }
        }
    );

    humanHeatLayer =
    L.heatLayer(
        humanPoints,
        {
            radius:24,
            blur:16,
            maxZoom:16,
            minOpacity:.45,
            gradient:{
                0.20:"#FFCDD2",
                0.50:"#EF5350",
                0.75:"#C62828",
                1.00:"#7F0000"
            }
        }
    );


    animalHeatLayer =
    L.heatLayer(
        animalPoints,
        {
            radius:24,
            blur:16,
            maxZoom:16,
            minOpacity:.45,
            gradient:{
                0.20:"#BBDEFB",
                0.50:"#42A5F5",
                0.75:"#1565C0",
                1.00:"#002171"
            }
        }
    );


    //DISPLAY SELECTED LAYER
    const selected =
    layerFilter.value;

    if(selected==="bite"){
        biteHeatLayer.addTo(map);
    }
    else if(selected==="human"){
        humanHeatLayer.addTo(map);
    }
    else if(selected==="animal"){
        animalHeatLayer.addTo(map);
    }
    else{
        biteHeatLayer.addTo(map);
        humanHeatLayer.addTo(map);
        animalHeatLayer.addTo(map);
    }
    if(bounds.length>0){
        map.fitBounds(
            bounds,
            {
                padding:[40,40]
            }
        );
    }
}

//PART 4
/* ==========================================================
   CRIS - PVO HEATMAP SYSTEM
   PART 4
   PERFORMANCE & ADVANCED FEATURES
========================================================== */


/* ==========================================================
   SMART INTENSITY SCALING
========================================================== */

function getMaximumCases(data){

    let maxValue = 0;

    data.forEach(function(row){

        const bite =
        Number(row["Animal Bite Cases"]) || 0;

        const human =
        Number(row["Human Rabies Deaths"]) || 0;

        const animal =
        Number(row["Animal Rabies Deaths"]) || 0;

        maxValue = Math.max(
            maxValue,
            bite,
            human,
            animal
        );

    });

    return maxValue;

}


/* ==========================================================
   BETTER TOP MUNICIPALITIES
   COMBINES ALL YEARS
========================================================== */

function updateTopMunicipalities(data){

    const panel =
    document.getElementById(
        "topMunicipalities"
    );

    if(!panel){

        return;

    }

    panel.innerHTML = "";

    const totals = {};

    data.forEach(function(row){

        const municipality =
        row.Municipality;

        if(!municipality){

            return;

        }

        const biteCases =
        Number(
            row["Animal Bite Cases"]
        ) || 0;

        if(!totals[municipality]){

            totals[municipality] = 0;

        }

        totals[municipality] += biteCases;

    });

    const ranking =
    Object.entries(totals)

    .map(function(item){

        return {

            municipality:item[0],

            total:item[1]

        };

    })

    .sort(function(a,b){

        return b.total-a.total;

    });

    ranking

    .slice(0,5)

    .forEach(function(item,index){

        const div =
        document.createElement("div");

        div.className="top-item";

        let medal="";

        if(index===0){

            medal="1.";

        }

        else if(index===1){

            medal="2.";

        }

        else if(index===2){

            medal="3.";

        }

        else if (index===3){

            medal="4.";
        }

        else if (index===4){
            medal="5.";
        }

        div.innerHTML=

        "<span>"+

        medal+

        " "+

        item.municipality+

        "</span>"+

        "<strong>"+

        item.total.toLocaleString()+

        "</strong>";

        panel.appendChild(div);

    });

}


/* ==========================================================
   REFRESH WITH LOADING LOCK
========================================================== */

let redrawTimeout;

function refreshMap(){

    if(excelData.length===0){

        return;

    }

    clearTimeout(
        redrawTimeout
    );

    redrawTimeout =
    setTimeout(function(){

        const filteredData =
        getFilteredData();

        updateStatistics(
            filteredData
        );

        updateTopMunicipalities(
            filteredData
        );

        drawHeatmap(
            filteredData
        );

    },150);

}


/* ==========================================================
   AUTO MAP RESIZE FIX
========================================================== */

window.addEventListener(

    "resize",

    function(){

        if(map){

            map.invalidateSize();

        }

    }

);


/* ==========================================================
   QUICK RECORD COUNT
========================================================== */

function getDatasetSummary(){

    return {

        records:

        excelData.length,

        municipalities:

        new Set(

            excelData.map(

                row => row.Municipality

            )

        ).size,

        years:

        new Set(

            excelData.map(

                row => row.Year

            )

        ).size

    };

}