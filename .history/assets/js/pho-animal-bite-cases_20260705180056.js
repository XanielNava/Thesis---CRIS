const rowsPerPage = 20;

let currentPage = 1;

let allCases = [];

/* DATA CARD */
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

}