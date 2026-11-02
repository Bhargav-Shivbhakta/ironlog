/* THE ONE PLACE the Firebase project is set.
   Every app (Hub, Diet, Gym, Chores, ...) reads this. To move the whole site to another Firebase project / account,
   replace the values below with the "Web app" config of the new project (Firebase console > Project settings >
   Your apps) and upload this one file. See MIGRATION.md. */
window.IRONLOG_FIREBASE = {
  apiKey: "AIzaSyBe01eR2RZwSbU_aoJMeh_2MMJ5mqkVuKk",
  authDomain: "iron-log-bfc55.firebaseapp.com",
  projectId: "iron-log-bfc55",
  storageBucket: "iron-log-bfc55.firebasestorage.app",
  messagingSenderId: "106586808946",
  appId: "1:106586808946:web:f4736554ba9fc82c6fd8eb"
};

/* Central tick log (assets/ticklog.js). It loads itself from here so no page needs a change.
   If you ever replace the values above for a new Firebase project, keep the lines below. */
(function(){try{var s=document.currentScript&&document.currentScript.src;if(s&&/firebase-config\.js/.test(s))document.write('<script src="'+s.replace(/firebase-config\.js(\?.*)?$/,'ticklog.js')+'"><\/script>')}catch(e){}})();
