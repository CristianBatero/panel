// /js/panel.js
import {
  requireAuth, auth, db
} from "./auth.js";
import {
  collection, doc, getDoc, setDoc, onSnapshot, query, orderBy, limit, serverTimestamp, updateDoc, addDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

const storage = getStorage();

// ====== GUARD Y CABECERA ======
const me = await requireAuth("/view/login.html");
document.getElementById("who").textContent = `Sesión: ${me.email}`;

// ====== ROUTER SIMPLE (sidebar) ======
const titleMap = {
  vps: "Conexiones VPS",
  repos: "Repositorios JSON",
  users: "Usuarios",
  push: "Notificaciones",
  premium: "Premium",
  app: "App Config",
  firebase: "Firebase",
  auth: "Admin Auth"
};
const navLinks = [...document.querySelectorAll("[data-view]")];
const views = {
  vps: document.getElementById("view-vps"),
  repos: document.getElementById("view-repos"),
  users: document.getElementById("view-users"),
  push: document.getElementById("view-push"),
  premium: document.getElementById("view-premium"),
  app: document.getElementById("view-app"),
  firebase: document.getElementById("view-firebase"),
  auth: document.getElementById("view-auth"),
};
function go(view){
  navLinks.forEach(a => a.classList.toggle("active", a.dataset.view === view));
  Object.entries(views).forEach(([k,el]) => el.classList.toggle("active", k===view));
  document.getElementById("viewTitle").textContent = titleMap[view] || "Panel";
}
navLinks.forEach(a => a.addEventListener("click", e => { e.preventDefault(); go(a.dataset.view); history.replaceState(null, "", `#${a.dataset.view}`); }));
go(location.hash.replace("#","") || "vps");

// ====== FIREBASE INFO ======
document.getElementById("fbEmail").value = me.email || "";
document.getElementById("fbProject").value = auth.app.options.projectId || "";

// ====== APP CONFIG ======
const appRef = doc(db, "config", "app");
const elements = id => document.getElementById(id);
const showMsg = (id, text, ok=true) => {
  const el = elements(id);
  if (!el) return;
  el.textContent = text || "";
  el.style.display = text ? "inline-block" : "none";
  el.classList.toggle("ok", !!ok);
  el.classList.toggle("danger", !ok);
};

// Cargar en tiempo real
onSnapshot(appRef, (snap) => {
  const d = snap.data() || {};
  elements("appName").value = d.appName || "";
  elements("packageName").value = d.packageName || "";
  elements("adAppOpen").value = d.ads?.types?.appOpen?.unitId || "";
  elements("adBanner").value = d.ads?.types?.banner?.unitId || "";
  elements("adInter").value = d.ads?.types?.interstitial?.unitId || "";
  elements("adRewarded").value = (d.ads?.types?.rewarded?.unitIds || []).join(",");
  elements("adTest").value = String(d.ads?.testMode ?? false);
  elements("repoLink").value = d.repoLink || "";
  elements("srvUser").value = d.server?.user || "";
  elements("srvPass").value = d.server?.pass || "";
  elements("latestVersion").value = d.latestVersion || d.latestVersio || "";
  elements("minVersion").value = d.minVersion || "";
  elements("updateUrl").value = d.updateUrl || "";
});

// Guardar config
elements("btnSaveApp").addEventListener("click", async () => {
  showMsg("appMsg", "Guardando…", true);
  const rewarded = elements("adRewarded").value.split(",").map(s => s.trim()).filter(Boolean);
  const data = {
    appName: elements("appName").value.trim(),
    packageName: elements("packageName").value.trim(),
    repoLink: elements("repoLink").value.trim(),
    server: { user: elements("srvUser").value, pass: elements("srvPass").value },
    latestVersion: elements("latestVersion").value.trim(),
    minVersion: elements("minVersion").value.trim(),
    updateUrl: elements("updateUrl").value.trim(),
    updatedAt: serverTimestamp(),
    ads: {
      testMode: elements("adTest").value === "true",
      types:{
        appOpen:{ enabled:true, unitId: elements("adAppOpen").value.trim(), minIntervalSec:180, preload:true, showOn:["coldStart","resume"] },
        banner:{ enabled:true, unitId: elements("adBanner").value.trim(), refreshSec:30, positions:["coldStart","resume"], minIntervalSec:180 },
        interstitial:{ enabled:true, unitId: elements("adInter").value.trim(), minIntervalSec:90, showEvery:2, capPerHour:4 },
        rewarded:{ enabled:true, unitIds: rewarded, minIntervalSec:45, capDaily:20, rotate:"round_robin" }
      }
    }
  };
  try{
    await setDoc(appRef, data, { merge:true });
    showMsg("appMsg", "Guardado ✔", true);
  }catch(err){
    showMsg("appMsg", "Error: "+(err.message||err), false);
  }
});

// Subir APK → Storage y guardar URL
elements("apkFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  showMsg("appMsg", "Subiendo APK…", true);
  try{
    const v = elements("latestVersion").value.trim() || "build";
    const r = ref(storage, `apk/app-v${v}-${Date.now()}.apk`);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);
    await setDoc(appRef, { directApkUrl: url, updatedAt: serverTimestamp() }, { merge:true });
    showMsg("appMsg", "APK subida y URL guardada ✔", true);
  }catch(err){
    showMsg("appMsg", "Error al subir: "+(err.message||err), false);
  }
});

// ====== REPOSITORIO JSON ======
const repoRef = doc(db, "config", "repo");
onSnapshot(repoRef, (snap) => {
  elements("inpRepo").value = (snap.data()?.url || "");
});
elements("btnSaveRepo").addEventListener("click", async () => {
  try{
    await setDoc(repoRef, { url: elements("inpRepo").value.trim(), updatedAt: serverTimestamp() }, { merge:true });
    alert("Repositorio guardado.");
  }catch(err){ alert("Error: "+(err.message||err)); }
});

// ====== VPS ======
const vpsCol = collection(db, "vps");
function renderVpsList(){
  // Escucha simple
  onSnapshot(query(vpsCol, orderBy("name")), (snap) => {
    const tbody = document.querySelector("#tblVps tbody");
    tbody.innerHTML = "";
    snap.forEach(d => {
      const v = d.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${v.name||""}</td>
        <td>${v.host||""}</td>
        <td>${v.port||22}</td>
        <td>${v.user||"root"}</td>
        <td>${v.notes||""}</td>
        <td class="row">
          <button class="btn" data-edit="${d.id}">Editar</button>
          <button class="btn alt" data-term="${d.id}" disabled title="Pronto">Terminal</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  });
}
renderVpsList();

document.getElementById("btnNewVps").addEventListener("click", async () => {
  const name = prompt("Nombre de la VPS:");
  if (!name) return;
  const host = prompt("Host/IP:");
  if (!host) return;
  const port = Number(prompt("Puerto SSH:", "22")) || 22;
  const user = prompt("Usuario:", "root") || "root";
  const notes = prompt("Notas:", "") || "";
  await addDoc(vpsCol, { name, host, port, user, notes, createdAt: serverTimestamp(), owner: me.uid });
  alert("VPS guardada.");
});

// ====== USUARIOS ======
const usersCol = collection(db, "users");
function fmt(ts){
  if (!ts) return "—";
  try{ const d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleString(); }catch{ return "—"; }
}
function renderUsers(){
  onSnapshot(query(usersCol, orderBy("lastLoginAt","desc"), limit(100)), (snap) => {
    const tb = document.querySelector("#tblUsers tbody");
    tb.innerHTML = "";
    snap.forEach(docu => {
      const u = docu.data();
      const state = u.blocked ? `<span class="badge danger">Bloqueado</span>` :
                                `<span class="badge ok">Activo</span>`;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${u.email||"—"}</td>
        <td>${fmt(u.lastLoginAt)||"—"}</td>
        <td>${fmt(u.expiresAt)||"—"}</td>
        <td>${state}</td>
        <td>${u.minutes || 0}</td>
        <td class="row">
          <button class="btn" data-add15="${docu.id}">+15 días</button>
          <button class="btn" data-reset="${docu.id}">Reiniciar</button>
          <button class="btn alt" data-toggle="${docu.id}">${u.blocked?"Desbloquear":"Bloquear"}</button>
          <button class="btn danger" data-del="${docu.id}">Eliminar</button>
        </td>
      `;
      tb.appendChild(tr);
    });
  });
}
renderUsers();

document.getElementById("tblUsers").addEventListener("click", async (e) => {
  const id = e.target.dataset.add15 || e.target.dataset.reset ||
             e.target.dataset.toggle || e.target.dataset.del;
  if (!id) return;
  const ref = doc(db, "users", id);
  if (e.target.dataset.add15){
    const cur = (await getDoc(ref)).data();
    const base = cur?.expiresAt?.toDate?.() || new Date();
    const plus = new Date(base.getTime() + 15*24*60*60*1000);
    await updateDoc(ref, { expiresAt: plus, minutes: (cur?.minutes||0) + 15*24*60, ttlAt: plus });
  } else if (e.target.dataset.reset){
    const days = Number(prompt("¿Cuántos días dar?", "15")) || 15;
    const plus = new Date(Date.now() + days*24*60*60*1000);
    await updateDoc(ref, { expiresAt: plus, minutes: days*24*60, blocked:false, ttlAt: plus });
  } else if (e.target.dataset.toggle){
    const cur = (await getDoc(ref)).data();
    await updateDoc(ref, { blocked: !cur?.blocked });
  } else if (e.target.dataset.del){
    if (confirm("¿Eliminar usuario del panel? Esto NO borra su cuenta de Auth.")){
      await updateDoc(ref, { deleted:true, ttlAt: new Date(Date.now()+1*60*60*1000) }); // se autoelimina si usas TTL
    }
  }
});

document.getElementById("btnReloadUsers").addEventListener("click", renderUsers);

// ====== NOTIFICACIONES (vía colección "announcements") ======
document.getElementById("btnSendPush").addEventListener("click", async () => {
  const title = elements("pushTitle").value.trim();
  const body  = elements("pushBody").value.trim();
  const pri   = elements("pushPri").value;
  if (!title || !body) return alert("Completa título y mensaje.");
  await addDoc(collection(db,"announcements"), {
    title, body, priority: pri, createdAt: serverTimestamp(), by: me.uid
  });
  alert("Aviso enviado. La app debe escuchar la colección y mostrarlo.");
});

// ====== PREMIUM PRESET ======
const premRef = doc(db,"config","premium");
onSnapshot(premRef, (snap)=>{ elements("premDays").value = snap.data()?.days ?? 15; });
document.getElementById("btnSavePremium").addEventListener("click", async ()=>{
  await setDoc(premRef, { days: Number(elements("premDays").value)||15 }, { merge:true });
  alert("Guardado.");
});

// ====== AUTH INFO ======
document.getElementById("authInfo").textContent = `Autenticado como ${me.email}`;
