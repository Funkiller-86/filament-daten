"use strict";
// Filament-Bestand auf dem Handy: lädt den verschlüsselten Stand von GitHub, entschlüsselt ihn hier und merkt sich den letzten Stand.
const $ = s => document.querySelector(s);
const T = { de: { bestand: "Bestand", lager: "Lager", verbrauch: "Verbrauch", rollen: "Rollen", offline: "Ohne Verbindung – zeige den zuletzt geladenen Stand.",
  nochnie: "Noch kein Stand geladen. Mit Internet öffnen und das Programm einmal synchronisieren lassen.", falsch: "Passwort stimmt nicht.", suche: "Suchen …",
  voll: "ungeöffnet", leer: "leer", stand: "Stand", keinlager: "Kein Lager eingerichtet.", ohne: "Ohne Lagerort", alleauf: "Alle aufklappen", allezu: "Alle zuklappen", platzfrei: "frei", im_drucker: "im Drucker",
  rest: "Rest", min: "Mindestbestand", keinverb: "Noch keine Drucke gebucht.", zurueck: "← Zurück", nichts: "Nichts gefunden.", imdrucker: "Im Drucker", leerrolle: "leer", keinedr: "Zurzeit ist keine Rolle einem Fach zugeordnet.",
  suche: "Marke, Material oder Farbe suchen …", farbsuche: "Farbe suchen (z. B. blau) …", aehnlich: "ähnliche Farbe", treffer: n => n + " passend",
  blinkt: "💡 Blinkt im Schrank", blinkstopp: "Blinken beenden", nichtwlan: "💡 Blinken im Schrank geht nur in der Android-App (neueste Version) im Heim-WLAN.", keineled: "Diese Rolle hat keine LED am Regal." },
  en: { bestand: "Stock", lager: "Storage", verbrauch: "Usage", rollen: "spools", offline: "Offline – showing the last loaded state.",
  nochnie: "Nothing loaded yet. Open with internet and let the program sync once.", falsch: "Wrong password.", suche: "Search …",
  voll: "unopened", leer: "empty", stand: "Updated", keinlager: "No storage set up.", ohne: "No location", alleauf: "Expand all", allezu: "Collapse all", platzfrei: "free", im_drucker: "in printer",
  rest: "Left", min: "Minimum", keinverb: "No prints booked yet.", zurueck: "← Back", nichts: "Nothing found.", imdrucker: "In the printer", leerrolle: "empty", keinedr: "No spool is assigned to a slot right now.",
  suche: "Search brand, material or colour …", farbsuche: "Find colour (e.g. blue) …", aehnlich: "similar colour", treffer: n => n + " matching",
  blinkt: "💡 Blinking on the shelf", blinkstopp: "Stop blinking", nichtwlan: "💡 Blinking on the shelf only works in the Android app (latest version) on the home Wi-Fi.", keineled: "This spool has no LED on the shelf." } };
const zuLesen = () => { try { return JSON.parse(localStorage.getItem("fb_zu") || "[]"); } catch (e) { return []; } };
const zuSpeichern = l => { try { localStorage.setItem("fb_zu", JSON.stringify(l)); } catch (e) {} };
let ZU = new Set(zuLesen());
let S = null, SPR = "de", FOTOS = {}, tab = "bestand", offline = false, suche = "", BLINK = null;
const t = (k, ...a) => { const v = (T[SPR] || T.de)[k]; return typeof v === "function" ? v(...a) : (v || k); };
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

// ---- Farbsuche (wie im Programm): 1 = passt (Name enthält das Wort oder gleiche Grundfarbe), 0..1 = ähnliche Farbe, 0 = nein
const UNBEKANNT = "#6f6a66";
function lch(h) {
  const lin = c => c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
  const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = v => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
  const L = 116 * f(y) - 16, A = 500 * (f(x) - f(y)), B = 200 * (f(y) - f(z));
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180 / Math.PI) + 360) % 360];
}
function wortInfo(q) {
  const W = S.farbwoerter || {};
  if (W[q]) return W[q];
  for (const w of q.split(/[\s\/-]+/)) if (W[w]) return W[w];
  return null;
}
function farbWert(qRoh, s) {
  const q = qRoh.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return 1;
  const name = (s.farbe || "").toLowerCase();
  if (!name) return 0;
  if (name.includes(q)) return 1;
  const info = wortInfo(q);
  if (info && info.k && s.klasse && info.k === s.klasse) return 1;
  const hq = /^#[0-9a-f]{6}$/.test(q) ? q : (info ? info.h : UNBEKANNT), hn = s.hex || UNBEKANNT;
  if (hq === UNBEKANNT || hn === UNBEKANNT) return 0;
  const [lq, cq, wq] = lch(hq), [ln, cn, wn] = lch(hn);
  if (cq < 15) return cn >= 22 ? 0 : Math.max(0, 1 - Math.abs(lq - ln) / 45) * 0.95;
  if (cn < 15) return 0;
  let dw = Math.abs(wq - wn); dw = Math.min(dw, 360 - dw);
  return Math.max(0, Math.min(0.95, 1 - dw / 80 - Math.abs(lq - ln) / 160 - Math.abs(cq - cn) / 120));
}
const SCHWELLE = () => (S && S.farbschwelle) || 0.35;
// Wert einer Sorte für die Suche im Bestand: Text in Marke/Material/Farbe = passt, sonst Farbähnlichkeit
function suchWert(q, s) {
  const k = q.trim().toLowerCase(); if (!k) return 1;
  if (`${s.marke} ${s.material} ${s.farbe}`.toLowerCase().includes(k)) return 1;
  return farbWert(k, s);
}

// ---- LED am Regal (nur Android-App mit Brücke, im Heim-WLAN): Rolle blinkt, danach der vorige Zustand
const bruecke = () => !!(window.FilamentApp && typeof window.FilamentApp.wled === "function");
function ledSenden(ip, an) {
  const L = S.leds, g = (L.geraete || {})[ip] || { ende: 4000, grund: [] }, grund = g.grund || [];
  const zus = an && BLINK ? (BLINK.proIp[ip] || []) : [];
  const daten = (grund.length || zus.length) ? { on: true, bri: L.hell, transition: 0, seg: { id: 0, fx: 0, col: [[0, 0, 0]], i: [0, g.ende, "000000", ...grund, ...zus] } } : { on: false };
  try { window.FilamentApp.wled(ip, JSON.stringify(daten)); } catch (e) {}
}
function blinkStop() {
  if (!BLINK) return;
  clearInterval(BLINK.uhr); const ips = Object.keys(BLINK.proIp); BLINK = null;
  ips.forEach(ip => ledSenden(ip, false));  // Grundzustand (Rollen im Drucker blau, Schranklicht) wiederherstellen
  const k = $("#ledinfo"); if (k) k.remove();
}
function blinkStart(uids) {
  blinkStop();
  const L = S && S.leds; if (!L || !bruecke()) return false;
  const proIp = {};
  uids.forEach(u => (L.rollen[u] || []).forEach(([ip, a, b]) => (proIp[ip] = proIp[ip] || []).push(a, b, "FFFFFF")));
  if (!Object.keys(proIp).length) return false;
  const bis = Date.now() + (L.dauer > 0 ? L.dauer * 1000 : 10 * 60 * 1000);
  let an = true;
  BLINK = { proIp, uhr: setInterval(() => { if (Date.now() > bis) return blinkStop(); an = !an; Object.keys(proIp).forEach(ip => ledSenden(ip, an)); }, L.blink_ms || 900) };
  Object.keys(proIp).forEach(ip => ledSenden(ip, true));
  return true;
}
function ledZeile(uids) {
  const L = S && S.leds; if (!L) return "";
  if (!uids.some(u => L.rollen[u])) return `<p class="ledinfo" id="ledinfo">${t("keineled")}</p>`;
  if (!bruecke()) return `<p class="ledinfo" id="ledinfo">${t("nichtwlan")}</p>`;
  return blinkStart(uids) ? `<p class="ledinfo an" id="ledinfo">${t("blinkt")} <button id="blinkaus">${t("blinkstopp")}</button></p>` : "";
}

// ---- Anzeige
const fmt = g => g >= 1000 ? (g / 1000).toFixed(2).replace(".", ",") + " kg" : g + " g";
const restVon = (r, s) => r.rest < 0 ? s.gewicht : r.rest;
const summe = s => s.rollen.reduce((a, r) => a + restVon(r, s), 0);
function rolleZeile(r, s) { const v = restVon(r, s); return `${r.status === "neu" ? t("voll") : fmt(v)}`; }
const imDrucker = s => s.rollen.some(r => r.drucker);
function druckerBereich() {
  const f = (S.drucker || []);
  if (!f.length) return "";
  const rolle = {}; S.sorten.forEach(s => s.rollen.forEach(r => { rolle[r.uid] = { r, s }; }));
  return `<section class="imdr"><h3>${t("imdrucker")}</h3>` + f.map(x => {
    const y = x.uid ? rolle[x.uid] : null;
    const ort = [x.drucker, x.ams, x.fach ? (SPR === "en" ? "Slot " : "Fach ") + x.fach : ""].filter(Boolean).join(" · ");
    if (y) return `<button class="dr" data-u="${esc(x.uid)}"><span class="punkt" style="background:${esc(y.s.hex)}"></span><span class="t"><small>${esc(ort)}</small><b>${esc(y.s.marke)} · ${esc(y.s.farbe)}</b><small><span class="mat" style="background:${esc(y.s.mfarbe)}">${esc(y.s.material)}</span>${y.r.status === "neu" ? t("voll") : fmt(restVon(y.r, y.s))}</small></span></button>`;
    return `<div class="dr"><span class="punkt" style="background:#444"></span><span class="t"><small>${esc(ort)}</small><b>${esc(x.sorte || "—")}</b></span></div>`;
  }).join("") + `</section>`;
}
function bestand() {
  const q = suche.trim(), w = new Map(S.sorten.map(s => [s, suchWert(q, s)]));
  const liste = S.sorten.filter(s => w.get(s) >= SCHWELLE()).sort((a, b) => (w.get(b) - w.get(a)) || (imDrucker(b) - imDrucker(a)));
  if (!liste.length) return `<p class="leer-text">${t("nichts")}</p>`;
  const passend = liste.filter(s => w.get(s) >= 1).length;
  return (q ? `<p class="trefferzahl">${t("treffer", passend)}${liste.length > passend ? ` · ${liste.length - passend} ${t("aehnlich")}` : ""}</p>` : "") +
    liste.map(s => { const g = summe(s), knapp = s.min > 0 && s.rollen.length < s.min, dr = imDrucker(s), aehnl = w.get(s) < 1;
    return `<button class="sorte ${dr ? "indr" : ""} ${aehnl ? "aehnlich" : ""}" data-i="${s.i}"><span class="punkt" style="background:${esc(s.hex)}"></span><span class="t"><b>${esc(s.marke)} · ${esc(s.farbe)}</b>
    <small><span class="mat" style="background:${esc(s.mfarbe)}">${esc(s.material)}</span>${nR(s.rollen.length)}${dr ? ` · <span class="blau">${t("imdrucker")}</span>` : ""}${aehnl ? ` · ${t("aehnlich")}` : ""}</small></span><span class="menge ${knapp ? "knapp" : ""}">${fmt(g)}</span></button>`; }).join("");
}
let lagerSuche = "";
function box(x) {
  const { r, s } = x, v = restVon(r, s), neu = r.status === "neu";
  const fw = lagerSuche.trim() ? farbWert(lagerSuche, s) : -1, such = fw < 0 ? "" : fw >= 1 ? "treffer" : fw >= SCHWELLE() ? "" : "blass";
  const p = neu ? 100 : Math.max(0, Math.min(100, Math.round(v * 100 / s.gewicht)));
  const [bas, ...rest] = (s.material || "").split(" "), variante = rest.join(" ");
  const wenig = !neu && p <= 20;
  return `<button class="box ${r.drucker ? "drucker" : ""} ${such}" data-u="${esc(r.uid)}" style="--c:${esc(s.hex)};--m:${esc(s.mfarbe)}" aria-label="${esc(s.marke + " " + s.farbe)}">
    <span class="bk"><b>${esc(bas.slice(0, 9))}</b>${variante ? `<i>${esc(variante.length > 12 ? variante.slice(0, 11) + "…" : variante)}</i>` : ""}</span>
    <span class="fw"><span class="fu" style="height:${p}%"></span></span>
    <span class="gw ${wenig ? "wenig" : ""}">${neu ? fmt(s.gewicht) : fmt(v)}</span><span class="fn">${esc(s.farbe)}</span></button>`;
}
function lager() {
  if (!S.lager.length) return `<p class="leer-text">${t("keinlager")}</p>`;
  const rolle = {}; S.sorten.forEach(s => s.rollen.forEach(r => { rolle[r.uid] = { r, s }; }));
  const kopf = `<input type="search" id="lq" placeholder="${t("farbsuche")}" value="${esc(lagerSuche)}"><div class="aufzu"><button data-aufzu="auf">${t("alleauf")}</button><button data-aufzu="zu">${t("allezu")}</button></div>`;
  return kopf + S.lager.map((k, n) => {
    const name = k.ohne ? t("ohne") : k.titel, id = k.ohne ? "#ohne" : name, zu = ZU.has(id);
    const anzahl = k.reihen.reduce((a, r) => a + r.slots.filter(u => u && u !== "leer" && rolle[u]).length, 0);
    const imdr = k.reihen.some(r => r.slots.some(u => u && rolle[u] && rolle[u].r.drucker));
    return `<section class="moebel ${zu ? "eingeklappt" : ""}"><button class="mk" data-m="${esc(id)}" aria-expanded="${!zu}"><span class="pf">▾</span><span class="mn">${esc(name)}</span>${imdr ? `<span class="mdr"></span>` : ""}<small>${anzahl}</small></button>` +
      `<div class="mi">` + k.reihen.map(r => `<div class="reihe">${r.ort || r.name ? `<h4>${esc(r.ort || r.name)}</h4>` : ""}<div class="regal">` +
      r.slots.map(u => { if (u === null) return `<span class="box frei"></span>`;
        if (u === "leer") return `<span class="box leerrolle"><span>${t("leerrolle")}</span></span>`;
        const x = rolle[u]; return x ? box(x) : `<span class="box frei"></span>`; }).join("") + `</div></div>`).join("") + `</div></section>`;
  }).join("");
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
    (tab === "bestand" ? druckerBereich() + `<input type="search" id="q" placeholder="${t("suche")}" value="${esc(suche)}">` : "") +
    `<div id="liste">${tab === "bestand" ? bestand() : tab === "lager" ? lager() : verbrauch()}</div>`;
  const q = $("#q"); if (q) q.oninput = () => { suche = q.value; $("#liste").innerHTML = bestand(); bind(); };
  document.querySelectorAll("#tabs button").forEach(b => { b.classList.toggle("an", b.dataset.t === tab); b.textContent = t(b.dataset.t); });
  bind();
}
function bind() {
  const lq = $("#lq"); if (lq) lq.oninput = () => { lagerSuche = lq.value; const pos = lq.selectionStart; $("#liste").innerHTML = lager(); bind();
    const n = $("#lq"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } };
  document.querySelectorAll(".mk").forEach(b => b.onclick = () => { const id = b.dataset.m, sec = b.parentElement;
    if (ZU.has(id)) ZU.delete(id); else ZU.add(id); zuSpeichern([...ZU]); sec.classList.toggle("eingeklappt", ZU.has(id)); b.setAttribute("aria-expanded", !ZU.has(id)); });
  document.querySelectorAll("[data-aufzu]").forEach(b => b.onclick = () => { ZU = b.dataset.aufzu === "zu" ? new Set([...S.lager.map(k => k.ohne ? "#ohne" : k.titel)]) : new Set(); zuSpeichern([...ZU]); zeichnen(); });
  document.querySelectorAll(".sorte").forEach(b => b.onclick = () => detail(+b.dataset.i));
  document.querySelectorAll("[data-u]").forEach(b => b.onclick = () => { for (const s of S.sorten) if (s.rollen.some(r => r.uid === b.dataset.u)) return detail(s.i, b.dataset.u); });
}
function detail(i, uid) {
  const s = S.sorten.find(x => x.i === i), d = $("#detail");
  d.innerHTML = `<button class="zu" id="zu">${t("zurueck")}</button><h2 style="margin:0 0 4px">${esc(s.marke)} · ${esc(s.farbe)}</h2>
   <p><span class="mat" style="background:${esc(s.mfarbe)}">${esc(s.material)}</span> ${nR(s.rollen.length)} · ${fmt(summe(s))}${s.min ? ` · ${t("min")}: ${s.min}` : ""}</p>` +
    s.rollen.map(r => { const v = restVon(r, s), p = r.status === "neu" ? 100 : Math.max(0, Math.min(100, Math.round(v * 100 / s.gewicht)));
      const bild = r.foto && FOTOS[r.foto] ? `<img src="${URL.createObjectURL(FOTOS[r.foto])}" alt="">` : "";
      return `<div class="rolle" ${r.uid === uid ? 'style="border-color:var(--orange)"' : ""}><b>${rolleZeile(r, s)}</b>${r.drucker ? ` <span class="mat" style="background:var(--blau)">${t("im_drucker")}</span>` : ""}
      <div class="balken"><i style="width:${p}%"></i></div><small style="color:var(--grau)">${esc(r.lager || "")}${r.notiz ? " · " + esc(r.notiz) : ""}</small>${bild}</div>`; }).join("");
  const uids = uid ? [uid] : s.rollen.map(r => r.uid);  // angeklickte Rolle – bei einer Sorte alle ihre Rollen
  const led = ledZeile(uids);
  if (led) d.querySelector("h2").insertAdjacentHTML("afterend", led);
  const aus = $("#blinkaus"); if (aus) aus.onclick = () => blinkStop();
  d.hidden = false; $("#zu").onclick = () => { blinkStop(); d.hidden = true; d.innerHTML = ""; };
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
document.addEventListener("visibilitychange", () => { if (document.hidden) blinkStop(); else if (pwLesen()) aktualisieren(); });
window.addEventListener("online", () => { if (pwLesen()) aktualisieren(); });
start();
