"use strict";
// Filament-Bestand auf dem Handy: lädt den verschlüsselten Stand von GitHub, entschlüsselt ihn hier und merkt sich den letzten Stand.
const $ = s => document.querySelector(s);
const T = { de: { bestand: "Bestand", lager: "Lager", verbrauch: "Verbrauch", rollen: "Rollen", offline: "Ohne Verbindung – zeige den zuletzt geladenen Stand.",
  nochnie: "Noch kein Stand geladen. Mit Internet öffnen und das Programm einmal synchronisieren lassen.", falsch: "Passwort stimmt nicht.", suche: "Suchen …",
  voll: "ungeöffnet", leer: "leer", stand: "Stand", keinlager: "Kein Lager eingerichtet.", ohne: "Ohne Lagerort", platzfrei: "frei", im_drucker: "im Drucker",
  rest: "Rest", min: "Mindestbestand", keinverb: "Noch keine Drucke gebucht.", zurueck: "← Zurück", nichts: "Nichts gefunden." },
  en: { bestand: "Stock", lager: "Storage", verbrauch: "Usage", rollen: "spools", offline: "Offline – showing the last loaded state.",
  nochnie: "Nothing loaded yet. Open with internet and let the program sync once.", falsch: "Wrong password.", suche: "Search …",
  voll: "unopened", leer: "empty", stand: "Updated", keinlager: "No storage set up.", ohne: "No location", platzfrei: "free", im_drucker: "in printer",
  rest: "Left", min: "Minimum", keinverb: "No prints booked yet.", zurueck: "← Back", nichts: "Nothing found." } };
let S = null, SPR = "de", FOTOS = {}, tab = "bestand", offline = false, suche = "";
const t = k => (T[SPR] || T.de)[k] || k;
const nR = n => n + " " + (n === 1 ? (SPR === "en" ? "spool" : "Rolle") : t("rollen"));
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---- kleiner Speicher (IndexedDB)
const db = new Promise(ok => { try { const r = indexedDB.open("filament", 1); r.onupgradeneeded = () => r.result.createObjectStore("k"); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); } catch (e) { ok(null); } });
const hole = async k => { const d = await db; if (!d) return undefined; return new Promise(ok => { const q = d.transaction("k").objectStore("k").get(k); q.onsuccess = () => ok(q.result); q.onerror = () => ok(undefined); }); };
const merke = async (k, v) => { const d = await db; if (!d) return; return new Promise(ok => { const x = d.transaction("k", "readwrite"); x.objectStore("k").put(v, k); x.oncomplete = ok; x.onerror = ok; }); };
const pwLesen = () => { try { return localStorage.getItem("fb_pw") || ""; } catch (e) { return ""; } };
const pwSpeichern = p => { try { localStorage.setItem("fb_pw", p); } catch (e) {} };

async function holen(url, bin) {
  const r = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return bin ? new Uint8Array(await r.arrayBuffer()) : r.json();
}

async function laden(passwort, still) {
  let cfg, meta;
  try { cfg = await (await fetch("config.json?t=" + Date.now(), { cache: "no-store" })).json(); meta = await holen(cfg.basis + "meta.json"); } catch (e) { offline = true; return false; }
  offline = false;
  const k = await FB.schluessel(passwort, FB.b64(meta.salz), meta.runden);
  try { await FB.entschluesseln(FB.b64(meta.pruef), k); } catch (e) { throw new Error("Passwort"); }
  if (S && S._stand === meta.stand) return true;
  const stand = await FB.entpacken(await FB.entschluesseln(await holen(cfg.basis + "daten.bin", true), k));
  stand._stand = meta.stand;
  const ids = new Set(); stand.sorten.forEach(s => s.rollen.forEach(r => r.foto && ids.add(r.foto)));
  const alt = (await hole("fotos")) || {};
  const neu = {};
  for (const id of ids) {
    if (alt[id]) { neu[id] = alt[id]; continue; }
    try { neu[id] = new Blob([await FB.entschluesseln(await holen(cfg.basis + "f/" + id + ".bin", true), k)], { type: "image/jpeg" }); } catch (e) {}
  }
  await merke("stand", stand); await merke("fotos", neu);
  S = stand; FOTOS = neu; SPR = stand.sprache === "en" ? "en" : "de";
  return true;
}

// ---- Anzeige
const fmt = g => g >= 1000 ? (g / 1000).toFixed(2).replace(".", ",") + " kg" : g + " g";
const restVon = (r, s) => r.rest < 0 ? s.gewicht : r.rest;
const summe = s => s.rollen.reduce((a, r) => a + restVon(r, s), 0);
function rolleZeile(r, s) { const v = restVon(r, s); return `${r.status === "neu" ? t("voll") : fmt(v)}`; }
function bestand() {
  const q = suche.trim().toLowerCase();
  const liste = S.sorten.filter(s => !q || `${s.marke} ${s.material} ${s.farbe}`.toLowerCase().includes(q));
  if (!liste.length) return `<p class="leer-text">${t("nichts")}</p>`;
  return liste.map(s => { const g = summe(s), knapp = s.min > 0 && s.rollen.length < s.min;
    return `<button class="sorte" data-i="${s.i}"><span class="punkt" style="background:${esc(s.hex)}"></span><span class="t"><b>${esc(s.marke)} · ${esc(s.farbe)}</b>
    <small><span class="mat" style="background:${esc(s.mfarbe)}">${esc(s.material)}</span>${nR(s.rollen.length)}</small></span><span class="menge ${knapp ? "knapp" : ""}">${fmt(g)}</span></button>`; }).join("");
}
function lager() {
  if (!S.lager.length) return `<p class="leer-text">${t("keinlager")}</p>`;
  const rolle = {}; S.sorten.forEach(s => s.rollen.forEach(r => { rolle[r.uid] = { r, s }; }));
  return S.lager.map(k => `<section class="moebel"><h3>${esc(k.ohne ? t("ohne") : k.titel)}</h3>` + k.reihen.map(r => `<div class="reihe">${r.ort || r.name ? `<h4>${esc(r.ort || r.name)}</h4>` : ""}<div class="plaetze">` +
    r.slots.map(u => { if (u === "leer" || u === null) return `<span class="platz leer" title="${t("platzfrei")}"></span>`;
      const x = rolle[u]; if (!x) return `<span class="platz sperre"></span>`;
      return `<button class="platz ${x.r.drucker ? "drucker" : ""}" data-u="${esc(u)}" style="background:${esc(x.s.hex)}" aria-label="${esc(x.s.marke + " " + x.s.farbe)}"></button>`; }).join("") + `</div></div>`).join("") + `</section>`).join("");
}
function verbrauch() {
  if (!S.verbrauch.length) return `<p class="leer-text">${t("keinverb")}</p>`;
  return S.verbrauch.map(v => `<div class="zeile"><div><b>${esc(v.druck || "—")}</b><small>${esc((v.zeit || "").replace("T", " ").slice(0, 16))}</small></div><div style="text-align:right">${
    v.eintraege.map(e => `<small>${esc(e.sorte)} · ${e.gramm} g</small>`).join("")}</div></div>`).join("");
}
function zeichnen() {
  const m = $("#inhalt");
  if (!S) { m.innerHTML = `<p class="leer-text">${t("nochnie")}</p>`; return; }
  $("#stand").textContent = `${t("stand")}: ${new Date(S._stand).toLocaleString(SPR === "en" ? "en-GB" : "de-DE", { dateStyle: "short", timeStyle: "short" })}`;
  const keep = tab === "bestand" ? "" : "";
  m.innerHTML = (offline ? `<div class="hinweis">${t("offline")}</div>` : "") +
    (tab === "bestand" ? `<input type="search" id="q" placeholder="${t("suche")}" value="${esc(suche)}">` : "") +
    `<div id="liste">${tab === "bestand" ? bestand() : tab === "lager" ? lager() : verbrauch()}</div>`;
  const q = $("#q"); if (q) q.oninput = () => { suche = q.value; $("#liste").innerHTML = bestand(); bind(); };
  document.querySelectorAll("#tabs button").forEach(b => { b.classList.toggle("an", b.dataset.t === tab); b.textContent = t(b.dataset.t); });
  bind();
}
function bind() {
  document.querySelectorAll(".sorte").forEach(b => b.onclick = () => detail(+b.dataset.i));
  document.querySelectorAll(".platz[data-u]").forEach(b => b.onclick = () => { for (const s of S.sorten) if (s.rollen.some(r => r.uid === b.dataset.u)) return detail(s.i, b.dataset.u); });
}
function detail(i, uid) {
  const s = S.sorten.find(x => x.i === i), d = $("#detail");
  d.innerHTML = `<button class="zu" id="zu">${t("zurueck")}</button><h2 style="margin:0 0 4px">${esc(s.marke)} · ${esc(s.farbe)}</h2>
   <p><span class="mat" style="background:${esc(s.mfarbe)}">${esc(s.material)}</span> ${nR(s.rollen.length)} · ${fmt(summe(s))}${s.min ? ` · ${t("min")}: ${s.min}` : ""}</p>` +
    s.rollen.map(r => { const v = restVon(r, s), p = r.status === "neu" ? 100 : Math.max(0, Math.min(100, Math.round(v * 100 / s.gewicht)));
      const bild = r.foto && FOTOS[r.foto] ? `<img src="${URL.createObjectURL(FOTOS[r.foto])}" alt="">` : "";
      return `<div class="rolle" ${r.uid === uid ? 'style="border-color:var(--orange)"' : ""}><b>${rolleZeile(r, s)}</b>${r.drucker ? ` <span class="mat" style="background:var(--blau)">${t("im_drucker")}</span>` : ""}
      <div class="balken"><i style="width:${p}%"></i></div><small style="color:var(--grau)">${esc(r.lager || "")}${r.notiz ? " · " + esc(r.notiz) : ""}</small>${bild}</div>`; }).join("");
  d.hidden = false; $("#zu").onclick = () => { d.hidden = true; d.innerHTML = ""; };
}

async function aktualisieren() {
  const knopf = $("#neu"); knopf.classList.add("dreht");
  try { await laden(pwLesen()); } catch (e) { if (e.message === "Passwort") anmelden(t("falsch")); }
  knopf.classList.remove("dreht"); zeichnen();
}
function anmelden(fehler) { $("#login").hidden = false; $("#lfehler").textContent = fehler || ""; }
async function start() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => { tab = b.dataset.t; zeichnen(); window.scrollTo(0, 0); });
  $("#neu").onclick = aktualisieren;
  $("#lf").onsubmit = async e => { e.preventDefault(); const p = $("#pw").value;
    try { $("#lfehler").textContent = "…"; const ok = await laden(p); if (!ok && !S) { $("#lfehler").textContent = t("offline"); return; } pwSpeichern(p); $("#login").hidden = true; zeichnen(); }
    catch (x) { $("#lfehler").textContent = x.message === "Passwort" ? t("falsch") : String(x.message || x); } };
  S = (await hole("stand")) || null; FOTOS = (await hole("fotos")) || {}; if (S) SPR = S.sprache === "en" ? "en" : "de";
  zeichnen();
  if (!pwLesen()) { if (!S) anmelden(); return; }
  await aktualisieren();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && pwLesen()) aktualisieren(); });
window.addEventListener("online", () => { if (pwLesen()) aktualisieren(); });
start();
