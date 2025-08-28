// /js/panel.js
import { requireAuth, auth, db } from "./auth.js";
import {
  collection, doc, getDoc, setDoc, onSnapshot, query, orderBy, limit,
  serverTimestamp, updateDoc, addDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";

const storage = getStorage();
const functions = getFunctions();

// ====== GUARD ======
const me = await requireAuth("/view/login.html");

// ====== UTIL ======
const $ = (id) => document.getElementById(id);

// ====== ROUTER + SIDEBAR ======
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
const views = Object.fromEntries(
  ["vps","repos","users","push","premium","app","firebase","auth"]
  .map(v => [v, $(`view-${v}`)])
);
function go(view){
  navLinks.forEach(a => a.classList.toggle("active", a.dataset.view === view));
  Object.entries(views).forEach(([k,el]) => el && el.classList.toggle("active", k===view));
  const vt = $("viewTitle"); if (vt) vt.textContent = titleMap[view] || "Panel";
}
navLinks.forEach(a => a.addEventListener("click", e => { e.preventDefault(); go(a.dataset.view); history.replaceState(null, "", `#${a.dataset.view}`); }));
go(location.hash.replace("#","") || "vps");

// sidebar colapsable
const APP = document.querySelector(".app");
const BTN_TOGGLE = $("btnToggleNav");
const NAV_KEY = "panel.nav.collapsed";
if (localStorage.getItem(NAV_KEY) === "1") APP?.classList.add("collapsed");
BTN_TOGGLE?.addEventListener("click", () => {
  APP?.classList.toggle("collapsed");
  localStorage.setItem(NAV_KEY, APP?.classList.contains("collapsed") ? "1" : "0");
});

// ====== HEADER INFO OPCIONAL ======
$("authInfo") && ($("authInfo").textContent = `Autenticado como ${me.email}`);
$("fbEmail")  && ( $("fbEmail").value = me.email || "" );
$("fbProject")&& ( $("fbProject").value = auth.app.options.projectId || "" );

// ====== Firebase links + copiar config ======
(function fillFirebaseLinks(){
  const pid = auth.app.options.projectId;
  const go = (id, url) => { const a = $(id); if (a) a.href = url; };
  go("lnkFs",   `https://console.firebase.google.com/project/${pid}/firestore/databases/-default-/data`);
  go("lnkRtdb", `https://console.firebase.google.com/project/${pid}/database`);
  go("lnkSt",   `https://console.firebase.google.com/project/${pid}/storage`);
  go("lnkAuth", `https://console.firebase.google.com/project/${pid}/authentication/users`);
  go("lnkMsg",  `https://console.firebase.google.com/project/${pid}/messaging`);
  go("lnkAn",   `https://analytics.google.com/analytics/web/#/p${pid}`);
})();
$("btnCopyCfg")?.addEventListener("click", async ()=>{
  const o = auth.app.options || {};
  const cfg = { apiKey:o.apiKey, authDomain:o.authDomain, projectId:o.projectId, storageBucket:o.storageBucket, messagingSenderId:o.messagingSenderId, appId:o.appId };
  const txt = "const firebaseConfig = " + JSON.stringify(cfg, null, 2) + ";";
  await navigator.clipboard.writeText(txt);
  alert("Config copiada.");
});

// ====== APP CONFIG ======
const appRef = doc(db, "config", "app");
const showMsg = (id, text, ok=true) => {
  const el = $(id); if (!el) return;
  el.textContent = text || "";
  el.style.display = text ? "inline-block" : "none";
  el.classList.toggle("ok", !!ok);
  el.classList.toggle("danger", !ok);
};

onSnapshot(appRef, (snap) => {
  const d = snap.data() || {};
  $("#appName")      && ($("#appName").value      = d.appName || "");
  $("#packageName")  && ($("#packageName").value  = d.packageName || "");
  $("#adAppOpen")    && ($("#adAppOpen").value    = d.ads?.types?.appOpen?.unitId || "");
  $("#adBanner")     && ($("#adBanner").value     = d.ads?.types?.banner?.unitId || "");
  $("#adInter")      && ($("#adInter").value      = d.ads?.types?.interstitial?.unitId || "");
  $("#adRewarded")   && ($("#adRewarded").value   = (d.ads?.types?.rewarded?.unitIds || []).join(","));
  $("#adTest")       && ($("#adTest").value       = String(d.ads?.testMode ?? false));
  $("#repoLink")     && ($("#repoLink").value     = d.repoLink || "");
  $("#srvUser")      && ($("#srvUser").value      = d.server?.user || "");
  $("#srvPass")      && ($("#srvPass").value      = d.server?.pass || "");
  $("#latestVersion")&& ($("#latestVersion").value= d.latestVersion || d.latestVersio || "");
  $("#minVersion")   && ($("#minVersion").value   = d.minVersion || "");
  $("#updateUrl")    && ($("#updateUrl").value    = d.updateUrl || "");
});
$("btnSaveApp")?.addEventListener("click", async () => {
  showMsg("appMsg", "Guardando…", true);
  const rewarded = ($("#adRewarded")?.value || "").split(",").map(s => s.trim()).filter(Boolean);
  const data = {
    appName: ($("#appName")?.value || "").trim(),
    packageName: ($("#packageName")?.value || "").trim(),
    repoLink: ($("#repoLink")?.value || "").trim(),
    server: { user: $("#srvUser")?.value || "", pass: $("#srvPass")?.value || "" },
    latestVersion: ($("#latestVersion")?.value || "").trim(),
    minVersion: ($("#minVersion")?.value || "").trim(),
    updateUrl: ($("#updateUrl")?.value || "").trim(),
    updatedAt: serverTimestamp(),
    ads: {
      testMode: ($("#adTest")?.value || "false") === "true",
      types:{
        appOpen:{ enabled:true, unitId: ($("#adAppOpen")?.value || "").trim(), minIntervalSec:180, preload:true, showOn:["coldStart","resume"] },
        banner:{ enabled:true, unitId: ($("#adBanner")?.value || "").trim(), refreshSec:30, positions:["coldStart","resume"], minIntervalSec:180 },
        interstitial:{ enabled:true, unitId: ($("#adInter")?.value || "").trim(), minIntervalSec:90, showEvery:2, capPerHour:4 },
        rewarded:{ enabled:true, unitIds: rewarded, minIntervalSec:45, capDaily:20, rotate:"round_robin" }
      }
    }
  };
  try{ await setDoc(appRef, data, { merge:true }); showMsg("appMsg", "Guardado ✔", true); }
  catch(err){ showMsg("appMsg", "Error: "+(err.message||err), false); }
});
// APK directa
$("apkFile")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  showMsg("appMsg", "Subiendo APK…", true);
  try{
    const v = ($("#latestVersion")?.value || "build").trim();
    const r = ref(storage, `apk/app-v${v}-${Date.now()}.apk`);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);
    await setDoc(appRef, { directApkUrl: url, updatedAt: serverTimestamp() }, { merge:true });
    showMsg("appMsg", "APK subida y URL guardada ✔", true);
  }catch(err){ showMsg("appMsg", "Error al subir: "+(err.message||err), false); }
});

/* =========================
   REPOS — Apps → Repos
   ========================= */
const appSelect=$("appSelect");
const appsCol=collection(db,"apps");

$("btnCreateApp")?.addEventListener("click",async()=>{
  const name=($("#appNameNew")?.value||"").trim(); if(!name) return alert("Nombre de app requerido.");
  const refApp=doc(appsCol); await setDoc(refApp,{name,createdAt:serverTimestamp(),owner:me.uid}); $("#appNameNew").value="";
});
function loadApps(){
  if(!appSelect) return;
  onSnapshot(query(appsCol,orderBy("name")),(snap)=>{
    const cur=appSelect.value; appSelect.innerHTML="";
    snap.forEach(d=>{const opt=document.createElement("option"); opt.value=d.id; opt.textContent=d.data().name||d.id; appSelect.appendChild(opt);});
    if(cur && [...appSelect.options].some(o=>o.value===cur)) appSelect.value=cur;
    if(appSelect.value) loadRepos(appSelect.value); else $("#tblRepos")?.querySelector("tbody").replaceChildren();
  },(err)=>alert("Error cargando Apps: "+(err.message||err)));
}
appSelect?.addEventListener("change",()=>loadRepos(appSelect.value));
loadApps();

// Subir / actualizar repo con contentType texto para visualizar en navegador
$("btnUploadRepo")?.addEventListener("click",async()=>{
  const appId=appSelect?.value; if(!appId) return alert("Selecciona una app.");
  const name=($("#repoName")?.value||"").trim(); const file=$("#repoFile")?.files?.[0];
  if(!name || !file) return alert("Nombre de repo y archivo .json requeridos.");
  const repoId=name.toLowerCase(); const repoRef=doc(db,"apps",appId,"repos",repoId); const path=`repos/${appId}/${repoId}.json`;
  await uploadBytes(ref(storage,path),file,{contentType:"text/plain; charset=utf-8",cacheControl:"no-cache"});
  const url=await getDownloadURL(ref(storage,path));
  await setDoc(repoRef,{name,storagePath:path,downloadUrl:url,size:file.size,updatedAt:serverTimestamp()},{merge:true});
  $("#repoFile").value=""; alert("Repositorio subido/actualizado.");
});

let reposUnsub=null;
function loadRepos(appId){
  if(!$("#tblRepos")) return;
  reposUnsub && reposUnsub();
  const reposCol=collection(db,"apps",appId,"repos");
  reposUnsub=onSnapshot(query(reposCol,orderBy("name")),(snap)=>{
    const tb=$("#tblRepos").querySelector("tbody"); tb.innerHTML="";
    snap.forEach(docu=>{
      const r=docu.data(); const tr=document.createElement("tr");
      const size=r.size?Intl.NumberFormat().format(r.size)+" bytes":"—";
      tr.innerHTML=`
        <td>${r.name||docu.id}</td>
        <td>${size}</td>
        <td>${r.updatedAt?.toDate ? r.updatedAt.toDate().toLocaleString() : "—"}</td>
        <td style="max-width:380px; overflow:hidden; text-overflow:ellipsis">${r.downloadUrl||"—"}</td>
        <td class="actions">
          <button class="btn btn-info" data-view="${docu.id}">Ver</button>
          <button class="btn" data-copy="${docu.id}">Copiar URL</button>
          <label class="btn btn-warn" style="cursor:pointer">Actualizar
            <input type="file" accept=".json,application/json" data-up="${docu.id}" style="display:none" />
          </label>
          <button class="btn btn-danger" data-del="${docu.id}">Eliminar</button>
        </td>`;
      tr.dataset.url=r.downloadUrl||""; tb.appendChild(tr);
    });
  },(err)=>alert("Error cargando Repos: "+(err.message||err)));
}

// Acciones de fila (VER → redirigir a ver_raw.html)
$("#tblRepos")?.addEventListener("click",async(e)=>{
  const appId=appSelect?.value; const row=e.target.closest("tr"); if(!row || !appId) return;
  const rid=e.target.dataset.view || e.target.dataset.copy || e.target.dataset.del; if(!rid) return;
  const repoRef=doc(db,"apps",appId,"repos",rid); const repoSnap=await getDoc(repoRef); if(!repoSnap.exists()) return alert("Repositorio no encontrado.");
  const repo=repoSnap.data();

  if(e.target.dataset.view){
    const url = repo.downloadUrl;
    if(!url) return alert("No hay URL de descarga.");
    // Redirige a la vista que sólo muestra contenido
    location.href = `/view/ver_raw.html?url=${encodeURIComponent(url)}`;
    return;
  }
  if(e.target.dataset.copy){
    try{ await navigator.clipboard.writeText(repo.downloadUrl); alert("URL copiada."); }
    catch{
      const ta=document.createElement("textarea"); ta.value=repo.downloadUrl; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy"); ta.remove(); alert("URL copiada.");
    }
    return;
  }
  if(e.target.dataset.del){
    if(!confirm("Eliminar repositorio y archivo?")) return;
    try{ if(repo.storagePath) await deleteObject(ref(storage, repo.storagePath)); }catch(_){}
    await deleteDoc(repoRef);
  }
});

// Actualizar archivo desde input oculto
$("#tblRepos")?.addEventListener("change",async(e)=>{
  const up=e.target.dataset.up; if(!up) return;
  const appId=appSelect?.value; if(!appId) return;
  const file=e.target.files?.[0]; if(!file) return;
  const path=`repos/${appId}/${up}.json`;
  await uploadBytes(ref(storage,path),file,{contentType:"text/plain; charset=utf-8",cacheControl:"no-cache"});
  const url=await getDownloadURL(ref(storage,path));
  await setDoc(doc(db,"apps",appId,"repos",up),{downloadUrl:url,size:file.size,updatedAt:serverTimestamp()},{merge:true});
  e.target.value=""; alert("Actualizado.");
});

/* =========================
   VPS
   ========================= */
// ====== VPS ======
const vpsCol = collection(db, "vps");

function showVpsMsg(txt, ok=true){
  const el = document.getElementById("vpsMsg");
  if (!el) return;
  el.textContent = txt || "";
  el.style.display = txt ? "inline-block" : "none";
  el.classList.toggle("ok", !!ok);
  el.classList.toggle("danger", !ok);
}

function showVpsEditor(data = {}, id = null){
  document.getElementById("vpsEditor").style.display = "block";
  document.getElementById("vpsEditorTitle").textContent = id ? "Editar VPS" : "Nueva VPS";
  document.getElementById("vpsName").value  = data.name  ?? "";
  document.getElementById("vpsHost").value  = data.host  ?? "";
  document.getElementById("vpsPort").value  = data.port  ?? 22;
  document.getElementById("vpsUser").value  = data.user  ?? "root";
  document.getElementById("vpsPass").value  = data.pass  ?? "";
  document.getElementById("vpsNotes").value = data.notes ?? "";
  document.getElementById("vpsEditor").dataset.id = id || "";
  showVpsMsg("");
}

function hideVpsEditor(){
  document.getElementById("vpsEditor").style.display = "none";
  document.getElementById("vpsEditor").dataset.id = "";
  showVpsMsg("");
}

function renderVpsList(){
  const tbody = document.querySelector("#tblVps tbody");
  if (!tbody) return;
  onSnapshot(query(vpsCol, orderBy("name")), (snap) => {
    tbody.innerHTML = "";
    if (snap.empty){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="6" style="text-align:center; opacity:.7">No hay VPS registradas.</td>`;
      tbody.appendChild(tr);
      return;
    }
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
          <button class="btn btn-danger" data-del="${d.id}">Eliminar</button>
          <button class="btn" data-term="${d.id}" disabled title="Pronto">Terminal</button>
        </td>`;
      tr.dataset.id = d.id;
      tbody.appendChild(tr);
    });
  }, (err)=> alert("Error cargando VPS: " + (err.message || err)));
}
renderVpsList();

// Abrir editor en blanco
document.getElementById("btnNewVps")?.addEventListener("click", () => {
  showVpsEditor({ port:22, user:"root" }, null);
});

// Cancelar editor
document.getElementById("btnVpsCancel")?.addEventListener("click", hideVpsEditor);

// Guardar (crear/editar)
document.getElementById("btnVpsSave")?.addEventListener("click", async () => {
  const id   = document.getElementById("vpsEditor").dataset.id || null;
  const name = document.getElementById("vpsName").value.trim();
  const host = document.getElementById("vpsHost").value.trim();
  const port = Number(document.getElementById("vpsPort").value) || 22;
  const user = document.getElementById("vpsUser").value.trim() || "root";
  const pass = document.getElementById("vpsPass").value; // ⚠️ guardado simple (mejor cifrar en backend en fase 2)
  const notes= document.getElementById("vpsNotes").value.trim();

  if (!host){ showVpsMsg("El host/IP es obligatorio.", false); return; }
  if (!user){ showVpsMsg("El usuario es obligatorio.", false); return; }
  if (!pass){ showVpsMsg("La contraseña es obligatoria.", false); return; }

  const payload = {
    name: name || host,
    host, port, user, pass, notes,
    updatedAt: serverTimestamp(),
    owner: me.uid
  };

  try{
    if (id){
      await updateDoc(doc(db, "vps", id), payload);
    }else{
      payload.createdAt = serverTimestamp();
      await addDoc(vpsCol, payload);
    }
    showVpsMsg("Guardado ✔", true);
    setTimeout(hideVpsEditor, 450);
  }catch(err){
    showVpsMsg("Error: " + (err.message || err), false);
  }
});

// Editar / Eliminar desde la tabla
document.getElementById("tblVps")?.addEventListener("click", async (e) => {
  const idEdit = e.target.dataset.edit;
  const idDel  = e.target.dataset.del;

  if (idEdit){
    const ref = doc(db, "vps", idEdit);
    const snap = await getDoc(ref);
    if (!snap.exists()) return alert("VPS no encontrada.");
    showVpsEditor(snap.data(), idEdit);
    return;
  }

  if (idDel){
    if (!confirm("¿Eliminar esta VPS?")) return;
    await deleteDoc(doc(db, "vps", idDel));
  }
});


/* =========================
   USUARIOS
   ========================= */
const usersCol = collection(db, "users");
function fmt(ts){ if (!ts) return "—"; try{ const d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleString(); }catch{ return "—"; } }
function renderUsers(){
  const tb = document.querySelector("#tblUsers tbody"); if (!tb) return;
  onSnapshot(query(usersCol, orderBy("lastLoginAt","desc"), limit(100)), (snap) => {
    tb.innerHTML = "";
    snap.forEach(docu => {
      const u = docu.data();
      const state = u.blocked
        ? `<span class="badge danger">Bloqueado</span>`
        : `<span class="badge ok">Activo</span>`;
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
        </td>`;
      tb.appendChild(tr);
    });
  }, (err)=> alert("Error cargando usuarios: " + (err.message || err)));
}
renderUsers();
$("btnReloadUsers")?.addEventListener("click", renderUsers);

$("tblUsers")?.addEventListener("click", async (e) => {
  const id = e.target.dataset.add15 || e.target.dataset.reset || e.target.dataset.toggle || e.target.dataset.del;
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
      await updateDoc(refUser, { deleted:true, ttlAt: new Date(Date.now()+1*60*60*1000) });
    }
  }
});

/* =========================
   NOTIFICACIONES — FCM (con imagen)
   ========================= */
const sendPush = httpsCallable(functions, "sendPush");
$("fcmTarget")?.addEventListener("change", ()=>{
  const lbl = $("fcmTargetLabel");
  if (lbl) lbl.textContent = $("fcmTarget").value === "token" ? "Token" : "Tópico";
});
$("btnSendFCM")?.addEventListener("click", async ()=>{
  const targetType = ($("#fcmTarget")?.value || "topic");
  const target     = ($("#fcmTargetValue")?.value || "").trim();
  const title      = ($("#fcmTitle")?.value || "").trim();
  const body       = ($("#fcmBody")?.value || "").trim();
  const priority   = ($("#fcmPriority")?.value || "normal");
  const image      = ($("#fcmImage")?.value || "").trim();
  const notifName  = ($("#fcmName")?.value || "").trim();

  if(!target || !title || !body) return alert("Completa destino, título y body.");
  try{ await sendPush({ targetType, target, title, body, priority, image, notifName }); alert("Notificación enviada."); }
  catch(err){ alert("Error al enviar: " + (err.message || err)); }
});

/* =========================
   Compat: repo simple anterior (si existe en DOM)
   ========================= */
const repoRefSimple = doc(db, "config", "repo");
$("inpRepo") && onSnapshot(repoRefSimple, (snap) => { $("inpRepo").value = (snap.data()?.url || ""); });
$("btnSaveRepo")?.addEventListener("click", async () => {
  try{
    await setDoc(repoRefSimple, { url: $("inpRepo").value.trim(), updatedAt: serverTimestamp() }, { merge:true });
    alert("Repositorio guardado.");
  }catch(err){ alert("Error: "+(err.message||err)); }
});

/* =========================
   (Opcional) Terminal web cliente (fase 2)
   ========================= */
const BACKEND_URL = "https://tu-backend-terminal.tudominio.com"; // cambia cuando montes el proxy SSH
let term, socket;
function openTerminalUI(title="Terminal"){
  $("termTitle").textContent = title;
  $("termCard").style.display = "block";
  if (!term){
    term = new Terminal({ cursorBlink:true, fontFamily:'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', theme:{ background:'#000000' }});
    term.open($("xterm"));
  } else { term.clear(); }
}
$("btnTermClose")?.addEventListener("click", ()=>{
  $("termCard").style.display = "none";
  try{ socket?.disconnect(); }catch{}
});
async function connectSSH(vps){
  openTerminalUI(`${vps.name} — ${vps.user}@${vps.host}:${vps.port||22}`);
  const idToken = await auth.currentUser.getIdToken();
  socket = io(BACKEND_URL, { transports:['websocket'], auth:{ token: idToken }});
  socket.on("connect", ()=> socket.emit("ssh:connect", { host:vps.host, port:vps.port||22, username:vps.user||"root", password:vps.pass||"" }));
  socket.on("ssh:data", (d)=> term.write(d));
  socket.on("ssh:close", ()=> term.write("\r\n[CONECCIÓN CERRADA]\r\n"));
  socket.on("ssh:error", (m)=> term.write(`\r\n[ERROR] ${m}\r\n`));
  term.onData((data)=> socket.emit("ssh:stdin", data));
}
document.getElementById("tblVps")?.addEventListener("click", async (e)=>{
  const id = e.target.dataset.term;
  if(!id) return;
  const snap = await getDoc(doc(db,"vps",id));
  if(!snap.exists()) return alert("VPS no encontrada.");
  connectSSH(snap.data());
});
