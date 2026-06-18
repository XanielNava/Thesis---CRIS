import { auth, db }
from "./firebase-config.js";

import {
createUserWithEmailAndPassword,
signInWithEmailAndPassword
}
from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
collection,
addDoc
}
from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const signupBtn = document.getElementById("signupBtn");

if(signupBtn){

signupBtn.addEventListener("click", async()=>{

    const fullname =
    document.getElementById("fullname").value;

    const email =
    document.getElementById("email").value;

    const password =
    document.getElementById("password").value;

    const user =
    await createUserWithEmailAndPassword(
        auth,
        email,
        password
    );

    await addDoc(
        collection(db,"admins"),
        {
            uid:user.user.uid,
            fullname,
            email,
            role:"super_admin"
        }
    );

    alert("Admin Created");

});
}