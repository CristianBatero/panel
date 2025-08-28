// /js/panel.js
import {
  requireAuth, auth, db
} from "./auth.js";
import {
  collection, doc, getDoc, setDoc, onSnapshot, query, orderBy, limit,
  serverTimestamp, updateDoc, addDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";
import {
  getFunctions, httpsCallable
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";

const storage = getStorage();
const functions = getFunctions();

// ====== GUARD Y CABECERA ======
const me = await requireAuth("/view/login.html");
const who = document.getElementById("who");
if (who) who.textContent = `Sesión: ${me.email}`;

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
  Object.entries(views).forEach(([k,el]) => el && el.classList.toggle("active", k===view));
  const vt = document.getElementById("viewTitle");
  if (vt) vt.textContent = titleMap[view] || "Panel";
}
navLinks.forEach(a => a.addEventListener("click", e => { e.preventDefault(); go(a.dataset.view); history.replaceState(null, "", `#${a.dataset.view}`); }));
go(location.hash.replace("#","") || "vps");

// Utilidad de acceso a elementos
const elements = id => document.getElementById(id);
const $ = elements;

// ====== FIREBASE INFO ======
const fbEmail = elements("fbEmail");
const fbProject = elements("fbProject");
if (fbEmail) fbEmail.value = me.email || "";
if (fbProject) fbProject.value = auth.app.options.projectId || "";

// ====== APP CONFIG ======
const appRef = doc(db, "config", "app");
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
  if (elements("appName")) elements("appName").value = d.appName || "";
  if (elements("packageName")) elements("packageName").value = d.packageName || "";
  if (elements("adAppOpen")) elements("adAppOpen").value = d.ads?.types?.appOpen?.unitId || "";
  if (elements("adBanner")) elements("adBanner").value = d.ads?.types?.banner?.unitId || "";
  if (elements("adInter")) elements("adInter").value = d.ads?.types?.interstitial?.unitId || "";
  if (elements("adRewarded")) elements("adRewarded").value = (d.ads?.types?.rewarded?.unitIds || []).join(",");
  if (elements("adTest")) elements("adTest").value = String(d.ads?.testMode ?? false);
  if (elements("repoLink")) elements("repoLink").value = d.repoLink || "";
  if (elements("srvUser")) elements("srvUser").value = d.server?.user || "";
  if (elements("srvPass")) elements("srvPass").value = d.server?.pass || "";
  if (elements("latestVersion")) elements("latestVersion").value = d.latestVersion || d.latestVersio || "";
  if (elements("minVersion")) elements("minVersion").value = d.minVersion || "";
  if (elements("updateUrl")) elements("updateUrl").value = d.updateUrl || "";
});

// Guardar config
if (elements("btnSaveApp")) {
  elements("btnSaveApp").addEventListener("click", async () => {
    showMsg("appMsg", "Guardando…", true);
    const rewarded = (elements("adRewarded")?.value || "")
      .split(",").map(s => s.trim()).filter(Boolean);
    const data = {
      appName: elements("appName")?.value.trim() || "",
      packageName: elements("packageName")?.value.trim() || "",
      repoLink: elements("repoLink")?.value.trim() || "",
      server: { user: elements("srvUser")?.value || "", pass: elements("srvPass")?.value || "" },
      latestVersion: elements("latestVersion")?.value.trim() || "",
      minVersion: elements("minVersion")?.value.trim() || "",
      updateUrl: elements("updateUrl")?.value.trim() || "",
      updatedAt: serverTimestamp(),
      ads: {
        testMode: (elements("adTest")?.value || "false") === "true",
        types:{
          appOpen:{ enabled:true, unitId: (elements("adAppOpen")?.value || "").trim(), minIntervalSec:180, preload:true, showOn:["coldStart","resume"] },
          banner:{ enabled:true, unitId: (elements("adBanner")?.value || "").trim(), refreshSec:30, positions:["coldStart","resume"], minIntervalSec:180 },
          interstitial:{ enabled:true, unitId: (elements("adInter")?.value || "").trim(), minIntervalSec:90, showEvery:2, capPerHour:4 },
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
}

// Subir APK → Storage y guardar URL
if (elements("apkFile")) {
  elements("apkFile").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    showMsg("appMsg", "Subiendo APK…", true);
    try{
      const v = elements("latestVersion")?.value.trim() || "build";
      const r = ref(storage, `apk/app-v${v}-${Date.now()}.apk`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      await setDoc(appRef, { directApkUrl: url, updatedAt: serverTimestamp() }, { merge:true });
      showMsg("appMsg", "APK subida y URL guardada ✔", true);
    }catch(err){
      showMsg("appMsg", "Error al subir: "+(err.message||err), false);
    }
  });
}

/* =========================================================
   REPOSITORIOS JSON — Apps → Repositorios (Storage + Firestore)
   Estructura:
   apps/{appId} {name}
   apps/{appId}/repos/{repoId} {name, storagePath, downloadUrl, size, updatedAt}
   Archivo: Storage "repos/{appId}/{repoId}.json"
   ========================================================= */

const appSelect = $("appSelect");
const appsCol = collection(db, "apps");

// Crear app
if ($("btnCreateApp")) {
  $("btnCreateApp").addEventListener("click", async ()=>{
    const name = ($("appNameNew")?.value || "").trim();
    if(!name) return alert("Nombre de app requerido.");
    const refApp = doc(appsCol); // id autogenerado
    await setDoc(refApp, { name, createdAt: serverTimestamp(), owner: me.uid });
    $("appNameNew").value = "";
  });
}

// Cargar lista de apps
function loadApps(){
  if (!appSelect) return;
  onSnapshot(query(appsCol, orderBy("name")), (snap)=>{
    const current = appSelect.value;
    appSelect.innerHTML = "";
    snap.forEach(d=>{
      const opt = document.createElement("option");
      opt.value = d.id; opt.textContent = d.data().name || d.id;
      appSelect.appendChild(opt);
    });
    // Mantener selección si es posible
    if (current && [...appSelect.options].some(o=>o.value===current)) {
      appSelect.value = current;
    }
    if (appSelect.value) loadRepos(appSelect.value);
    else $("tblRepos")?.querySelector("tbody").replaceChildren();
  });
}
if (appSelect) {
  appSelect.addEventListener("change", ()=>loadRepos(appSelect.value));
  loadApps();
}

// Subir / Actualizar un repo
if ($("btnUploadRepo")) {
  $("btnUploadRepo").addEventListener("click", async ()=>{
    const appId = appSelect?.value;
    if(!appId) return alert("Selecciona una app.");
    const name = ($("repoName")?.value || "").trim();
    const file = $("repoFile")?.files?.[0];
    if(!name || !file) return alert("Nombre de repo y archivo .json requeridos.");

    const repoId = name.toLowerCase();
    const repoRef = doc(db, "apps", appId, "repos", repoId);
    const path = `repos/${appId}/${repoId}.json`;

    await uploadBytes(ref(storage, path), file);
    const url = await getDownloadURL(ref(storage, path));
    await setDoc(repoRef, { name, storagePath: path, downloadUrl: url, size: file.size, updatedAt: serverTimestamp() }, { merge:true });
    if ($("repoFile")) $("repoFile").value = "";
    alert("Repositorio subido/actualizado.");
  });
}

// Tabla de repos
let reposUnsub = null;
function loadRepos(appId){
  if (!$("tblRepos")) return;
  if (reposUnsub) { reposUnsub(); reposUnsub = null; }
  const reposCol = collection(db, "apps", appId, "repos");
  reposUnsub = onSnapshot(query(reposCol, orderBy("name")), (snap)=>{
    const tb = $("tblRepos").querySelector("tbody");
    tb.innerHTML = "";
    snap.forEach(docu=>{
      const r = docu.data();
      const tr = document.createElement("tr");
      const size = r.size ? Intl.NumberFormat().format(r.size)+" bytes" : "—";
      tr.innerHTML = `
        <td>${r.name||docu.id}</td>
        <td>${size}</td>
        <td>${r.updatedAt?.toDate ? r.updatedAt.toDate().toLocaleString() : "—"}</td>
        <td style="max-width:380px; overflow:hidden; text-overflow:ellipsis">${r.downloadUrl||"—"}</td>
        <td class="actions">
          <button class="btn btn-info" data-view="${docu.id}">Ver</button>
          <button class="btn" data-copy="${docu.id}">Copiar URL</button>
          <label class="btn btn-warn" style="cursor:pointer">
            Actualizar<input type="file" accept=".json,application/json" data-up="${docu.id}" style="display:none" />
          </label>
          <button class="btn btn-danger" data-del="${docu.id}">Eliminar</button>
        </td>
      `;
      tr.dataset.url = r.downloadUrl || "";
      tb.appendChild(tr);
    });
  });
}

// Acciones por fila: Ver / Copiar / Eliminar
if ($("tblRepos")) {
  $("tblRepos").addEventListener("click", async (e)=>{
    const appId = appSelect?.value;
    const row = e.target.closest("tr"); if(!row || !appId) return;
    const rid = e.target.dataset.view || e.target.dataset.copy || e.target.dataset.del;
    if(!rid) return;

    const repoRef = doc(db, "apps", appId, "repos", rid);
    const repoSnap = await getDoc(repoRef);
    if (!repoSnap.exists()) return alert("Repositorio no encontrado.");
    const repo = repoSnap.data();

    if (e.target.dataset.view){
      try{
        const res = await fetch(repo.downloadUrl);
        const txt = await res.text();
        if ($("rawView")) $("rawView").textContent = txt; // visor sin filtros
        if ($("repoViewer")) $("repoViewer").style.display = "block";
      }catch(err){ alert("No se pudo cargar el JSON: "+(err.message||err)); }
    } else if (e.target.dataset.copy){
      try{
        await navigator.clipboard.writeText(repo.downloadUrl);
        alert("URL copiada.");
      }catch{
        const ta = document.createElement("textarea");
        ta.value = repo.downloadUrl; document.body.appendChild(ta);
        ta.select(); document.execCommand("copy"); ta.remove();
        alert("URL copiada.");
      }
    } else if (e.target.dataset.del){
      if (!confirm("Eliminar repositorio y archivo?")) return;
      try{
        if (repo.storagePath) await deleteObject(ref(storage, repo.storagePath));
      }catch(_){}
      await deleteDoc(repoRef);
    }
  });

  // Actualizar archivo desde input escondido en fila
  $("tblRepos").addEventListener("change", async (e)=>{
    const up = e.target.dataset.up; if(!up) return;
    const appId = appSelect?.value; if(!appId) return;
    const file = e.target.files?.[0]; if(!file) return;
    const path = `repos/${appId}/${up}.json`;
    await uploadBytes(ref(storage, path), file);
    const url = await getDownloadURL(ref(storage, path));
    await setDoc(doc(db,"apps",appId,"repos",up), { downloadUrl:url, size:file.size, updatedAt:serverTimestamp() }, { merge:true });
    e.target.value = "";
    alert("Actualizado.");
  });
}

// Cerrar visor
if ($("btnCloseViewer")) $("btnCloseViewer").addEventListener("click", ()=>{ if ($("repoViewer")) $("repoViewer").style.display="none"; });

/* =========================================================
   VPS
   ========================================================= */
const vpsCol = collection(db, "vps");
function renderVpsList(){
  const tbody = document.querySelector("#tblVps tbody");
  if (!tbody) return;
  onSnapshot(query(vpsCol, orderBy("name")), (snap) => {
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
          <button class="btn" data-term="${d.id}" disabled title="Pronto">Terminal</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  });
}
renderVpsList();

if (elements("btnNewVps")) {
  elements("btnNewVps").addEventListener("click", async () => {
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
}

/* =========================================================
   USUARIOS
   ========================================================= */
const usersCol = collection(db, "users");
function fmt(ts){
  if (!ts) return "—";
  try{ const d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleString(); }catch{ return "—"; }
}
function renderUsers(){
  const tb = document.querySelector("#tblUsers tbody");
  if (!tb) return;
  onSnapshot(query(usersCol, orderBy("lastLoginAt","desc"), limit(100)), (snap) => {
    tb.innerHTML = "";
    snap.forEach(docu => {
      const u = docu.data();
      const state = u.blocked ? `<span class="badge" style="border-color:#6b1e2a;background:#2a0f14;color:#ffbac3">Bloqueado</span>` :
                                `<span class="badge" style="border-color:#1f3b24;background:#0f2416;color:#bfffd2">Activo</span>`;
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
          <button class="btn" data-toggle="${docu.id}">${u.blocked?"Desbloquear":"Bloquear"}</button>
          <button class="btn btn-danger" data-del="${docu.id}">Eliminar</button>
        </td>
      `;
      tb.appendChild(tr);
    });
  });
}
renderUsers();

const tblUsers = document.getElementById("tblUsers");
if (tblUsers) {
  tblUsers.addEventListener("click", async (e) => {
    const id = e.target.dataset.add15 || e.target.dataset.reset ||
               e.target.dataset.toggle || e.target.dataset.del;
    if (!id) return;
    const refUser = doc(db, "users", id);
    if (e.target.dataset.add15){
      const cur = (await getDoc(refUser)).data();
      const base = cur?.expiresAt?.toDate?.() || new Date();
      const plus = new Date(base.getTime() + 15*24*60*60*1000);
      await updateDoc(refUser, { expiresAt: plus, minutes: (cur?.minutes||0) + 15*24*60, ttlAt: plus });
    } else if (e.target.dataset.reset){
      const days = Number(prompt("¿Cuántos días dar?", "15")) || 15;
      const plus = new Date(Date.now() + days*24*60*60*1000);
      await updateDoc(refUser, { expiresAt: plus, minutes: days*24*60, blocked:false, ttlAt: plus });
    } else if (e.target.dataset.toggle){
      const cur = (await getDoc(refUser)).data();
      await updateDoc(refUser, { blocked: !cur?.blocked });
    } else if (e.target.dataset.del){
      if (confirm("¿Eliminar usuario del panel? Esto NO borra su cuenta de Auth.")){
        await updateDoc(refUser, { deleted:true, ttlAt: new Date(Date.now()+1*60*60*1000) }); // TTL opcional
      }
    }
  });
}
if (elements("btnReloadUsers")) elements("btnReloadUsers").addEventListener("click", renderUsers);

/* =========================================================
   NOTIFICACIONES — FCM vía Cloud Function callable
   ========================================================= */
const sendPush = httpsCallable(functions, "sendPush");

const fcmTargetSel = $("fcmTarget");
if (fcmTargetSel) {
  fcmTargetSel.addEventListener("change", ()=>{
    const lbl = $("fcmTargetLabel");
    if (lbl) lbl.textContent = fcmTargetSel.value === "token" ? "Token" : "Tópico";
  });
}

if ($("btnSendFCM")) {
  $("btnSendFCM").addEventListener("click", async ()=>{
    const targetType = ($("fcmTarget")?.value || "topic");
    const target = ($("fcmTargetValue")?.value || "").trim();
    const title = ($("fcmTitle")?.value || "").trim();
    const body  = ($("fcmBody")?.value || "").trim();
    const priority = ($("fcmPriority")?.value || "normal");

    if(!target || !title || !body) return alert("Completa destino, título y body.");

    try{
      await sendPush({ targetType, target, title, body, priority });
      alert("Notificación enviada.");
    }catch(err){
      alert("Error al enviar: " + (err.message || err));
    }
  });
}

/* =========================================================
   PREMIUM PRESET
   ========================================================= */
const premRef = doc(db,"config","premium");
onSnapshot(premRef, (snap)=>{ if (elements("premDays")) elements("premDays").value = snap.data()?.days ?? 15; });
if (elements("btnSavePremium")) {
  elements("btnSavePremium").addEventListener("click", async ()=>{
    await setDoc(premRef, { days: Number(elements("premDays")?.value)||15 }, { merge:true });
    alert("Guardado.");
  });
}

/* =========================================================
   AUTH INFO
   ========================================================= */
if (elements("authInfo")) elements("authInfo").textContent = `Autenticado como ${me.email}`;

/* =========================================================
   (Compat) Repositorio simple anterior (si existiera en el DOM)
   ========================================================= */
const inpRepo = elements("inpRepo");
const btnSaveRepo = elements("btnSaveRepo");
if (inpRepo || btnSaveRepo) {
  const repoRef = doc(db, "config", "repo");
  if (inpRepo) onSnapshot(repoRef, (snap) => { inpRepo.value = (snap.data()?.url || ""); });
  if (btnSaveRepo) btnSaveRepo.addEventListener("click", async () => {
    try{
      await setDoc(repoRef, { url: inpRepo.value.trim(), updatedAt: serverTimestamp() }, { merge:true });
      alert("Repositorio guardado.");
    }catch(err){ alert("Error: "+(err.message||err)); }
  });
}
