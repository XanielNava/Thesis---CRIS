/* MAP INITIALIZATION */

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


/* GLOBAL VARIABLES */

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


/* EXCEL UPLOAD */

uploadInput.addEventListener("change", function (event) {

    const file = event.target.files[0];

    if (!file) {
        alert("Please select an Excel file.");
        return;
    }
    readExcel(file);
});


/* READ EXCEL */

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


/* CLEAN COLUMN NAMES */

function cleanHeaders() {

    excelData = excelData.map(function (row) {

        const newRow = {};

        Object.keys(row).forEach(function (key) {

            newRow[key.trim()] = row[key];

        });

        return newRow;

    });

}


/* YEAR FILTER */

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


/* MUNICIPALITY FILTER */

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


/* FILTER EVENTS */

yearFilter.addEventListener("change", function () {

    refreshMap();

});

municipalityFilter.addEventListener("change", function () {

    refreshMap();

});

layerFilter.addEventListener("change", function () {

    refreshMap();

});


/* FILTER DATA */

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


/* UPDATE STATISTICS */

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


/* REFRESH DASHBOARD */

function refreshMap() {

    const filteredData = getFilteredData();

    updateStatistics(filteredData);
    updateTopMunicipalities(filteredData);
    drawHeatmap(filteredData);

}

/* =====================================================
   PART 2
   HEATMAP + MARKERS + POPUPS
===================================================== */

/* =====================================================
   GLOBAL MARKER GROUP
===================================================== */

let markerGroup = L.layerGroup().addTo(map);


/* =====================================================
   DRAW HEATMAP
===================================================== */

function drawHeatmap(data){

    // Remove previous layers

    if(biteHeatLayer){

        map.removeLayer(biteHeatLayer);

    }

    if(humanHeatLayer){

        map.removeLayer(humanHeatLayer);

    }

    if(animalHeatLayer){

        map.removeLayer(animalHeatLayer);

    }

    markerGroup.clearLayers();


    let bitePoints=[];

    let humanPoints=[];

    let animalPoints=[];

    let bounds=[];


    data.forEach(function(row){

        const lat=Number(row.Latitude);

        const lng=Number(row.Longitude);

        if(isNaN(lat)||isNaN(lng)){

            return;

        }

        bounds.push([lat,lng]);

        const bite=Number(row["Animal Bite Cases"])||0;

        const human=Number(row["Human Rabies Deaths"])||0;

        const animal=Number(row["Animal Rabies Deaths"])||0;


        bitePoints.push([

            lat,

            lng,

            Math.max(bite/100,0.25)

        ]);


        humanPoints.push([

            lat,

            lng,

            Math.max(human/20,0.25)

        ]);


        animalPoints.push([

            lat,

            lng,

            Math.max(animal/50,0.25)

        ]);


        // ===========================
        // Municipality Marker
        // ===========================

        const marker=L.circleMarker(

            [lat,lng],

            {

                radius:7,

                fillColor:"#EA6113",

                color:"#ffffff",

                weight:2,

                fillOpacity:1

            }

        );

        marker.bindPopup(

            "<b>"+row.Municipality+"</b><br><br>"+

            "<b>Year:</b> "+row.Year+"<br>"+

            "<b>Animal Bite Cases:</b> "+bite+"<br>"+

            "<b>Human Rabies Deaths:</b> "+human+"<br>"+

            "<b>Animal Rabies Deaths:</b> "+animal

        );

        markerGroup.addLayer(marker);

    });


    /* ===========================================
       ANIMAL BITE HEATMAP
    =========================================== */

    biteHeatLayer=L.heatLayer(

        bitePoints,

        {

            radius:65,

            blur:35,

            maxZoom:14,

            minOpacity:.65,

            gradient:{

                0.2:"#FFE082",

                0.5:"#FF9800",

                0.8:"#EA6113",

                1:"#8C2F00"

            }

        }

    );


    /* ===========================================
       HUMAN RABIES DEATHS
    =========================================== */

    humanHeatLayer=L.heatLayer(

        humanPoints,

        {

            radius:65,

            blur:35,

            maxZoom:14,

            minOpacity:.70,

            gradient:{

                0.2:"#FFCDD2",

                0.5:"#E53935",

                0.8:"#B71C1C",

                1:"#5D0000"

            }

        }

    );


    /* ===========================================
       ANIMAL RABIES DEATHS
    =========================================== */

    animalHeatLayer=L.heatLayer(

        animalPoints,

        {

            radius:65,

            blur:35,

            maxZoom:14,

            minOpacity:.70,

            gradient:{

                0.2:"#BBDEFB",

                0.5:"#42A5F5",

                0.8:"#1565C0",

                1:"#002171"

            }

        }

    );


    /* ===========================================
       DISPLAY SELECTED LAYER
    =========================================== */

    const selectedLayer=layerFilter.value;


    if(selectedLayer==="bite"){

        biteHeatLayer.addTo(map);

    }

    if(selectedLayer==="human"){

        humanHeatLayer.addTo(map);

    }

    if(selectedLayer==="animal"){

        animalHeatLayer.addTo(map);

    }


    /* ===========================================
       AUTO FIT MAP
    =========================================== */

    if(bounds.length>0){

        map.fitBounds(

            bounds,

            {
                padding:[50,50]
            }
        );
    }
}

/* =====================================================

TOP MUNICIPALITIES

===================================================== */

function updateTopMunicipalities(data){

    const panel=document.getElementById("topMunicipalities");

    if(!panel){

        return;

    }

    panel.innerHTML="";

    let sorted=[...data];

    sorted.sort(function(a,b){

        return (

            Number(b["Animal Bite Cases"])-

            Number(a["Animal Bite Cases"])

        );

    });

    sorted.slice(0,5).forEach(function(row){

        const div=document.createElement("div");

        div.className="top-item";

        div.innerHTML=

        "<span>"+row.Municipality+"</span>"+

        "<strong>"+

        row["Animal Bite Cases"]+

        "</strong>";

        panel.appendChild(div);

    });

}