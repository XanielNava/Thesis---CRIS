const rowsPerPage = 20;

let currentPage = 1;

let allCases = [];

/* FIREBASE */
import {
    collection,
    getDocs
} from "firebase/firestore";

import { db } from "./firebase-config.js";

async function loadCases(){

    const snapshot = await getDocs(collection(db,"animal_bite_cases"));

    allCases = [];

    snapshot.forEach(doc=>{

        allCases.push({

            id:doc.id,

            ...doc.data()
        });
    });

    renderTable();
    function renderTable(){

    const totalRecords = allCases.length;
    const totalPages = Math.ceil(totalRecords / rowsPerPage);
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const records = allCases.slice(start,end);



    const info = document.getElementById("recordInfo");

if(totalRecords===0){

    info.textContent="Showing 0 of 0 records";

}
else{

    info.textContent=`Showing ${start+1}-${Math.min(end,totalRecords)} of ${totalRecords} records`;

}
}

}

/* DATA TABLE */
const tbody = document.getElementById("casesTableBody");

tbody.innerHTML = "";

records.forEach(caseData=>{

    tbody.innerHTML += `

    <tr>
        <td>${caseData.abtc}</td>
        <td>${caseData.male}</td>
        <td>${caseData.female}</td>
        <td>${caseData.age}</td>
        <td>${caseData.category1}</td>
        <td>${caseData.category2}</td>
        <td>${caseData.category3}</td>
    </tr>
    `;
});

