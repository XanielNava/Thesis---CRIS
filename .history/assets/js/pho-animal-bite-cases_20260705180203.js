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
}

}