/* 🧰 Tools-Tab: fertige Generatoren für beliebte Server-Anpassungen.
 *
 * Jedes Tool erzeugt "Pläne": {path, summary[], transform(alterText)->neuerText}.
 * Ablauf: Formular → Vorschau (Diff) → Übernehmen (Staging) → Speichern
 * (lädt jede Datei frisch, wendet alle vorgemerkten Transformationen an und
 * schreibt sie mit automatischem Backup über /api/file zurück).
 *
 * Alles läuft über api() aus app.js und funktioniert damit im PC-Modus wie
 * im Handy-Direktmodus identisch.
 */
"use strict";

const Tools = (() => {

  /* ================================================== Kleine DOM-Helfer */

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined) continue;
      el.append(child.nodeType ? child : document.createTextNode(child));
    }
    return el;
  }

  const num = (value, fallback) => {
    const s = String(value).trim().replace(",", ".");
    if (s === "") return fallback;   // Number("") wäre 0 – hier Fallback
    const n = Number(s);
    return Number.isFinite(n) ? n : fallback;
  };

  /* Gas-Partikel-Effekte (auswählbar im Gaszonen-Tool) */
  const GAS_PARTICLES = [
    ["graphics/particles/contaminated_area_gas_bigass", "Groß (Standard)"],
    ["graphics/particles/contaminated_area_gas", "Mittel"],
    ["graphics/particles/contaminated_area_gas_small", "Klein"],
  ];

  /* Bewegungsstil einer Zombie-Horde → smin/smax/dmin/dmax */
  const HORDE_MOVEMENT = {
    stationary: { label: "Stehend (bleibt am Ort)", smin: 0, smax: 0, dmin: 30, dmax: 30 },
    patrol: { label: "Patrouille (läuft umher)", smin: 2, smax: 5, dmin: 10, dmax: 50 },
    dynamic: { label: "Aggressiv (verfolgt weit)", smin: 5, smax: 10, dmin: 5, dmax: 20 },
  };

  /* Zombie-Klassen nach Kategorie – damit niemand Klassennamen tippen muss */
  const ZOMBIE_DATA = {
    InfectedArmy: ["ZmbM_PatrolNormal_Autumn", "ZmbM_PatrolNormal_Flat", "ZmbM_PatrolNormal_PautRev", "ZmbM_PatrolNormal_Summer", "ZmbM_SoldierNormal", "ZmbM_usSoldier_normal_Desert", "ZmbM_usSoldier_normal_Woodland"],
    InfectedArmyHard: ["ZmbM_PatrolNormal_Autumn", "ZmbM_PatrolNormal_Flat", "ZmbM_PatrolNormal_PautRev", "ZmbM_PatrolNormal_Summer", "ZmbM_SoldierNormal", "ZmbM_usSoldier_Heavy_Woodland", "ZmbM_usSoldier_Officer_Desert", "ZmbM_usSoldier_normal_Desert", "ZmbM_usSoldier_normal_Woodland"],
    InfectedCity: ["ZmbF_CitizenANormal_Blue", "ZmbF_CitizenBSkinny", "ZmbF_Clerk_Normal_Blue", "ZmbF_JournalistNormal_Blue", "ZmbF_ShortSkirt_beige", "ZmbF_SkaterYoung_Brown", "ZmbF_SurvivorNormal_Blue", "ZmbM_CitizenASkinny_Blue", "ZmbM_CitizenBFat_Blue", "ZmbM_ClerkFat_Grey", "ZmbM_CommercialPilotOld_Blue", "ZmbM_Gamedev_Black", "ZmbM_JournalistSkinny", "ZmbM_SkaterYoung_Brown"],
    InfectedFirefighter: ["ZmbM_FirefighterNormal", "ZmbM_NBC_Yellow"],
    InfectedIndustrial: ["ZmbF_BlueCollarFat_Blue", "ZmbF_MechanicNormal_Beige", "ZmbM_ConstrWorkerNormal_Beige", "ZmbM_HandymanNormal_Beige", "ZmbM_HeavyIndustryWorker", "ZmbM_MechanicSkinny_Blue", "ZmbM_OffshoreWorker_Green"],
    InfectedMedic: ["ZmbF_DoctorSkinny", "ZmbF_NurseFat", "ZmbF_ParamedicNormal_Blue", "ZmbM_DoctorFat", "ZmbM_ParamedicNormal_Black", "ZmbM_PatientSkinny"],
    InfectedNBC: ["ZmbM_NBC_Grey", "ZmbM_NBC_Yellow"],
    InfectedPolice: ["ZmbF_PoliceWomanNormal", "ZmbM_PolicemanFat", "ZmbM_PolicemanSpecForce", "ZmbM_PolicemanSpecForce_Heavy"],
    InfectedPrisoner: ["ZmbM_PrisonerSkinny"],
    InfectedReligious: ["ZmbM_priestPopSkinny"],
    InfectedSanta: ["ZmbM_Santa"],
    InfectedSolitude: ["ZmbF_HikerSkinny_Blue", "ZmbM_FishermanOld_Blue", "ZmbM_HermitSkinny_Beige", "ZmbM_HikerSkinny_Blue", "ZmbM_HunterOld_Autumn"],
    InfectedVillage: ["ZmbF_JoggerSkinny_Blue", "ZmbF_MilkMaidOld_Beige", "ZmbF_VillagerOld_Green", "ZmbM_FarmerFat_Blue", "ZmbM_Jacket_beige", "ZmbM_JoggerSkinny_Blue", "ZmbM_VillagerOld_Blue"],
  };

  /* ===================================================== Loadout-Daten */

  /* Die 14 Ausrüstungs-Slots (id = interner Schlüssel, slotName = exakt wie
   * DayZ es erwartet, bucket = Katalog-Kategorie in loadout-catalog.js). */
  const LOADOUT_SLOTS = [
    { id: "Headgear",  label: "Kopfbedeckung", slotName: "Headgear",  bucket: "Headgear" },
    { id: "Mask",      label: "Maske",         slotName: "Mask",      bucket: "Mask" },
    { id: "Eyewear",   label: "Brille",        slotName: "Eyewear",   bucket: "Eyewear" },
    { id: "Body",      label: "Oberteil",      slotName: "Body",      bucket: "Body" },
    { id: "Vest",      label: "Weste",         slotName: "Vest",      bucket: "Vest" },
    { id: "Gloves",    label: "Handschuhe",    slotName: "Gloves",    bucket: "Gloves" },
    { id: "Armband",   label: "Armband",       slotName: "Armband",   bucket: "Armband" },
    { id: "Hands",     label: "Hände (Waffe)", slotName: "Hands",     bucket: "Hands" },
    { id: "shoulderL", label: "Schulter L",    slotName: "shoulderL", bucket: "Hands" },
    { id: "shoulderR", label: "Schulter R",    slotName: "shoulderR", bucket: "Hands" },
    { id: "Back",      label: "Rucksack",      slotName: "Back",      bucket: "Back" },
    { id: "Hips",      label: "Gürtel",        slotName: "Hips",      bucket: "Hips" },
    { id: "Legs",      label: "Hose",          slotName: "Legs",      bucket: "Legs" },
    { id: "Feet",      label: "Schuhe",        slotName: "Feet",      bucket: "Feet" },
  ];

  /* Zustand-Presets → [healthMin, healthMax] (wie im Vorbild) */
  const LOADOUT_CONDITIONS = [
    ["pristine", "Neuwertig (1.0)",        1.0, 1.0],
    ["worn",     "Gebraucht (0.7–0.9)",    0.7, 0.9],
    ["damaged",  "Beschädigt (0.5–0.7)",   0.5, 0.7],
    ["badly",    "Stark beschädigt (0.3–0.5)", 0.3, 0.5],
    ["random",   "Zufällig (0.5–1.0)",     0.5, 1.0],
    ["custom",   "Eigene Werte…",          null, null],
  ];

  /* Alle spielbaren Charaktermodelle (Survivor) */
  const CHARACTER_TYPES = [
    "SurvivorM_Boris", "SurvivorM_Cyril", "SurvivorM_Denis", "SurvivorM_Elias",
    "SurvivorM_Francis", "SurvivorM_Guo", "SurvivorM_Hassan", "SurvivorM_Indar",
    "SurvivorM_Jose", "SurvivorM_Kaito", "SurvivorM_Lewis", "SurvivorM_Manua",
    "SurvivorM_Mirek", "SurvivorM_Niki", "SurvivorM_Oliver", "SurvivorM_Peter",
    "SurvivorM_Quinn", "SurvivorM_Rolf", "SurvivorM_Seth", "SurvivorM_Taiki",
    "SurvivorF_Baty", "SurvivorF_Eva", "SurvivorF_Frida", "SurvivorF_Gabi",
    "SurvivorF_Helga", "SurvivorF_Irena", "SurvivorF_Judy", "SurvivorF_Keiko",
    "SurvivorF_Linda", "SurvivorF_Maria", "SurvivorF_Naomi",
  ];

  /* Bildpfad zu einem Item (Kleinschreibung), mit Platzhalter-Fallback */
  const itemImg = (cls) => {
    const img = h("img", {
      class: "item-img", loading: "lazy", alt: cls,
      src: "images/items/" + String(cls).toLowerCase() + ".avif",
    });
    img.addEventListener("error", () => img.classList.add("noimg"));
    return img;
  };

  /* Hübscher Anzeigename aus einem Klassennamen */
  const prettyName = (cls) => String(cls).replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  /* ===================================================== XML-Werkzeuge */

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, "text/xml");
    if (doc.querySelector("parsererror")) throw new Error("Datei enthält fehlerhaftes XML.");
    return doc;
  }

  function dumpXml(doc) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      new XMLSerializer().serializeToString(doc.documentElement) + "\n";
  }

  /* Ein fertig eingerücktes XML-Schnipsel in ein Dokument importieren */
  function importSnippet(doc, snippet) {
    const frag = new DOMParser().parseFromString(snippet, "text/xml");
    if (frag.querySelector("parsererror")) throw new Error("Interner XML-Fehler im Generator.");
    return doc.importNode(frag.documentElement, true);
  }

  /* Element mit Namen ersetzen oder ans Ende der Wurzel anhängen */
  function upsertRootChild(doc, matchSelector, snippet) {
    const node = importSnippet(doc, snippet);
    const existing = doc.querySelector(matchSelector);
    if (existing) {
      const prev = existing.previousSibling;
      if (prev && prev.nodeType === 3) prev.remove();
      existing.replaceWith(doc.createTextNode("\n    "), node);
    } else {
      const root = doc.documentElement;
      const last = root.lastChild;
      if (last && last.nodeType === 3) last.remove();
      root.append(doc.createTextNode("\n    "), node, doc.createTextNode("\n"));
    }
  }

  const fmtNum = (v) => {
    const n = Number(v) || 0;
    return n === Math.trunc(n) ? String(n) : n.toFixed(1);
  };

  const escXml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /* events.xml: Event komplett anlegen/ersetzen */
  function upsertEvent(text, def) {
    const doc = parseXml(text);
    const flags = def.flags || { deletable: 0, init_random: 0, remove_damaged: 1 };
    const kids = (def.children || []).map((c) =>
      `        <child lootmax="${c.lootmax ?? 0}" lootmin="${c.lootmin ?? 0}" ` +
      `max="${c.max}" min="${c.min}" type="${escXml(c.type)}"/>`).join("\n");
    const snippet =
`<event name="${escXml(def.name)}">
        <nominal>${def.nominal}</nominal>
        <min>${def.min}</min>
        <max>${def.max}</max>
        <lifetime>${def.lifetime}</lifetime>
        <restock>${def.restock}</restock>
        <saferadius>${def.saferadius}</saferadius>
        <distanceradius>${def.distanceradius}</distanceradius>
        <cleanupradius>${def.cleanupradius}</cleanupradius>
        <flags deletable="${flags.deletable}" init_random="${flags.init_random}" remove_damaged="${flags.remove_damaged}"/>
        <position>${def.position || "fixed"}</position>
        <limit>${def.limit || "custom"}</limit>
        <active>${def.active ?? 1}</active>
        <children>
${kids}
        </children>
    </event>`;
    upsertRootChild(doc, `event[name="${def.name}"]`, snippet);
    return dumpXml(doc);
  }

  /* events.xml: nur Zahlenfelder eines vorhandenen Events ändern */
  function updateEventCounts(text, name, values) {
    const doc = parseXml(text);
    const event = doc.querySelector(`event[name="${name}"]`);
    if (!event) throw new Error(`Event "${name}" nicht in events.xml gefunden.`);
    for (const [field, value] of Object.entries(values)) {
      let child = event.querySelector(":scope > " + field);
      if (!child) {
        child = doc.createElement(field);
        event.prepend(child);
      }
      child.textContent = String(value);
    }
    return dumpXml(doc);
  }

  /* cfgeventspawns.xml: Positionen eines Events setzen/ergänzen */
  function upsertEventspawns(text, name, positions, mode) {
    const doc = parseXml(text);
    let event = doc.querySelector(`event[name="${name}"]`);
    if (!event) {
      event = doc.createElement("event");
      event.setAttribute("name", name);
      const root = doc.documentElement;
      const last = root.lastChild;
      if (last && last.nodeType === 3) last.remove();
      root.append(doc.createTextNode("\n    "), event, doc.createTextNode("\n"));
    }
    const existing = new Set(Array.from(event.querySelectorAll("pos")).map(
      (p) => Math.round(p.getAttribute("x")) + "/" + Math.round(p.getAttribute("z"))));
    if (mode === "replace") {
      event.querySelectorAll("pos").forEach((p) => {
        if (p.previousSibling && p.previousSibling.nodeType === 3) p.previousSibling.remove();
        p.remove();
      });
      existing.clear();
    }
    let added = 0;
    for (const point of positions) {
      const key = Math.round(point.x) + "/" + Math.round(point.z);
      if (existing.has(key)) continue;
      existing.add(key);
      const pos = doc.createElement("pos");
      pos.setAttribute("x", fmtNum(point.x));
      pos.setAttribute("z", fmtNum(point.z));
      pos.setAttribute("a", fmtNum(point.a || 0));
      event.append(doc.createTextNode("\n        "), pos);
      added += 1;
    }
    if (added || mode === "replace") {
      const last = event.lastChild;
      if (!(last && last.nodeType === 3 && last.textContent.includes("\n")))
        event.append(doc.createTextNode("\n    "));
    }
    return { text: dumpXml(doc), added };
  }

  /* cfgeventspawns.xml: Zonen (<zone> mit Bewegungsradius) eines Events setzen –
     korrektes Format für Zombie-Horden. Ersetzt vorhandene zone/pos des Events. */
  function writeEventZones(text, name, zones) {
    const doc = parseXml(text);
    let event = doc.querySelector(`event[name="${name}"]`);
    if (!event) {
      event = doc.createElement("event");
      event.setAttribute("name", name);
      const root = doc.documentElement;
      const last = root.lastChild;
      if (last && last.nodeType === 3) last.remove();
      root.append(doc.createTextNode("\n    "), event, doc.createTextNode("\n"));
    }
    event.querySelectorAll("zone, pos").forEach((z) => {
      if (z.previousSibling && z.previousSibling.nodeType === 3) z.previousSibling.remove();
      z.remove();
    });
    for (const z of zones) {
      const zone = doc.createElement("zone");
      zone.setAttribute("smin", z.smin); zone.setAttribute("smax", z.smax);
      zone.setAttribute("dmin", z.dmin); zone.setAttribute("dmax", z.dmax);
      zone.setAttribute("r", z.r);
      zone.setAttribute("x", fmtNum(z.x));
      zone.setAttribute("y", fmtNum(z.y || 0));
      zone.setAttribute("z", fmtNum(z.z));
      event.append(doc.createTextNode("\n        "), zone);
    }
    event.append(doc.createTextNode("\n    "));
    return dumpXml(doc);
  }

  /* cfgspawnabletypes.xml: <type>-Eintrag anlegen/ersetzen.
     rows: [{kind:"attachments"|"cargo", item, chance(0-1)}] */
  function upsertSpawnableType(text, name, rows) {
    const doc = parseXml(text);
    const blocks = rows.map((r) =>
      `        <${r.kind} chance="${(Number(r.chance) || 0).toFixed(2)}">\n` +
      `            <item name="${escXml(r.item)}" chance="1.00"/>\n` +
      `        </${r.kind}>`).join("\n");
    const snippet = `<type name="${escXml(name)}">\n${blocks}\n    </type>`;
    upsertRootChild(doc, `type[name="${name}"]`, snippet);
    return dumpXml(doc);
  }

  /* ================================================== Datei-Zugriff */

  const mission = (rel) => (App.state.mission_dir || "") + "/" + rel;

  async function readOrNull(path) {
    try {
      return (await api("/api/file?path=" + encodeURIComponent(path))).content;
    } catch (err) {
      const msg = String(err.message || "");
      if (/404|nicht gefunden|fehlgeschlagen \(4/i.test(msg)) return null;
      throw err;
    }
  }

  let itemCache = null;
  async function itemNames() {
    if (!itemCache) {
      try {
        itemCache = (await api("/api/types")).types.map((t) => t.name);
      } catch (err) {
        itemCache = [];
      }
    }
    return itemCache;
  }

  async function ensureDatalists() {
    if (document.getElementById("dl-items")) return;
    const names = await itemNames();
    const all = h("datalist", { id: "dl-items" });
    const zmb = h("datalist", { id: "dl-zmb" });
    for (const name of names) {
      all.append(h("option", { value: name }));
      if (name.startsWith("Zmb")) zmb.append(h("option", { value: name }));
    }
    document.body.append(all, zmb);
  }

  /* =============================================== Formular-Bausteine */

  function field(label, input) {
    return h("div", { class: "field" }, h("label", { class: "fl" }, label), input);
  }

  function textInput(id, value, placeholder, datalist) {
    const attrs = { id, value: value ?? "", placeholder: placeholder ?? "" };
    if (datalist) attrs.list = datalist;
    return h("input", attrs);
  }

  function numInput(id, value, step) {
    return h("input", { id, type: "number", value, step: step ?? "1" });
  }

  /* Item-Zeilen-Liste: [{item, num}] mit + / – Knöpfen */
  function itemList(opts) {
    const wrap = h("div", { class: "itemlist" });
    const rows = h("div");
    function addRow(item, value) {
      const row = h("div", { class: "row" },
        h("input", { class: "item-name", list: opts.datalist || "dl-items",
                     placeholder: opts.placeholder || "Item-Name…", value: item ?? "" }),
        h("input", { class: "num", type: "number", step: opts.step ?? "1",
                     min: "0", title: opts.numLabel, value: value ?? opts.numDefault }),
        h("span", { class: "hint" }, opts.numLabel),
        h("button", { class: "small", onclick: () => row.remove() }, "✕"));
      rows.append(row);
    }
    (opts.initial || [["", undefined]]).forEach(([i, v]) => addRow(i, v));
    wrap.append(rows, h("button", { class: "small", onclick: () => addRow() }, "+ Item"));
    wrap.values = () => Array.from(rows.children).map((row) => ({
      item: row.querySelector(".item-name").value.trim(),
      num: num(row.querySelector(".num").value, opts.numDefault),
    })).filter((r) => r.item);
    return wrap;
  }

  /* Zombie-Auswahl: Kategorie- + Typ-Dropdown, ausgewählte Zombies mit Anzahl */
  function zombiePicker() {
    const wrap = h("div");
    const cat = h("select", {});
    const char = h("select", {});
    Object.keys(ZOMBIE_DATA).forEach((c) => cat.append(h("option", { value: c }, c)));
    function fillChars() {
      char.innerHTML = "";
      (ZOMBIE_DATA[cat.value] || []).forEach((z) => char.append(h("option", { value: z }, z)));
    }
    cat.addEventListener("change", fillChars);
    fillChars();
    const rows = h("div");
    function addZombie(type, count) {
      if (!type) return;
      if (Array.from(rows.children).some((r) => r.dataset.type === type)) return;
      const row = h("div", { class: "row" },
        h("span", { style: "flex:1 1 180px" }, type),
        h("input", { class: "num", type: "number", min: "1",
                     value: count || 3, title: "Anzahl pro Zone" }),
        h("button", { class: "small", onclick: () => row.remove() }, "✕"));
      row.dataset.type = type;
      rows.append(row);
    }
    wrap.append(
      field("Zombie-Kategorie", cat),
      field("Zombie-Typ", char),
      h("button", { class: "small",
                    onclick: () => addZombie(char.value) }, "+ Zombie hinzufügen"),
      h("div", { class: "grp" }, h("h4", {}, "Ausgewählte Zombies (Anzahl je Zone)"), rows));
    wrap.values = () => Array.from(rows.children).map((r) => ({
      item: r.dataset.type, num: num(r.querySelector(".num").value, 3),
    }));
    wrap.add = addZombie;
    return wrap;
  }

  /* Positions-Liste: X/Z(/Ausrichtung) + Mini-Karten-Picker */
  function posList(opts) {
    const withAngle = !!(opts && opts.angle);
    const wrap = h("div", { class: "poslist" });
    const rows = h("div");
    function addRow(x, z, a) {
      const row = h("div", { class: "row" },
        "X:", h("input", { class: "px", type: "number", value: x ?? "" }),
        "Z:", h("input", { class: "pz", type: "number", value: z ?? "" }),
        withAngle ? "Drehung:" : null,
        withAngle ? h("input", { class: "pa", type: "number", value: a ?? 0 }) : null,
        h("button", { class: "small", onclick: () => row.remove() }, "✕"));
      rows.append(row);
    }
    if (opts && opts.startEmpty) { /* keine Startzeile */ } else addRow();
    wrap.append(rows,
      h("div", { class: "row" },
        h("button", { class: "small", onclick: () => addRow() }, "+ Position"),
        h("button", { class: "small", onclick: () => openMapPicker(wrap) },
          "🗺️ Auf Karte wählen")));
    wrap.values = () => Array.from(rows.children).map((row) => ({
      x: num(row.querySelector(".px").value, NaN),
      z: num(row.querySelector(".pz").value, NaN),
      a: withAngle ? num(row.querySelector(".pa").value, 0) : 0,
    })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
    wrap.setValues = (points) => {
      rows.innerHTML = "";
      points.forEach((p) => addRow(p.x, p.z, p.a || 0));
      if (!points.length) addRow();
    };
    return wrap;
  }

  /* --------------------------- Mini-Karten-Picker (Modal) */

  let pickMap = null, pickGroup = null, pickTarget = null, pickMapKey = null;

  function openMapPicker(target) {
    pickTarget = target;
    $("#mappick-overlay").classList.remove("hidden");
    const shared = window.DayZMapShared;
    const key = shared.currentKey();
    const cfg = shared.MAPS[key];
    // Bei Kartenwechsel die gecachte Picker-Karte verwerfen und neu bauen
    if (pickMap && pickMapKey !== key) {
      pickMap.remove();
      pickMap = null;
    }
    if (!pickMap) {
      pickMapKey = key;
      const WORLD = cfg.size;
      pickMap = L.map("mappick-map", {
        crs: shared.makeCrs(WORLD), minZoom: 1, maxZoom: 8,
        maxBounds: [[-2000, -2000], [WORLD + 2000, WORLD + 2000]],
        attributionControl: false,
      });
      L.tileLayer(shared.tileUrl(cfg.slug, "topographic"), {
        noWrap: true, minNativeZoom: 0, maxNativeZoom: 8,
        bounds: [[0, 0], [WORLD, WORLD]],
      }).addTo(pickMap);
      new shared.GridBackdrop({ noWrap: true, opacity: 0.35, world: WORLD }).addTo(pickMap);
      pickGroup = L.layerGroup().addTo(pickMap);
      pickMap.on("click", (ev) => {
        const x = Math.round(ev.latlng.lng * 10) / 10;
        const z = Math.round(ev.latlng.lat * 10) / 10;
        const size = shared.MAPS[pickMapKey].size;
        if (x < 0 || z < 0 || x > size || z > size) return;
        addPickMarker({ x, z, a: 0 });
      });
    }
    // Umschalt-Buttons im Modal markieren
    $$("#map-switch-pick button").forEach((btn) =>
      btn.classList.toggle("active", btn.dataset.mapkey === key));
    pickGroup.clearLayers();
    (target.values() || []).forEach(addPickMarker);
    // Die Karte wird im gerade sichtbar gewordenen Modal mehrfach neu
    // vermessen, damit Klick-Koordinaten von Anfang an stimmen.
    [30, 150, 400].forEach((ms) => setTimeout(() => {
      pickMap.invalidateSize();
      pickMap.setView([cfg.size / 2, cfg.size / 2], 2);
    }, ms));
  }

  function addPickMarker(point) {
    const marker = L.marker([point.z, point.x], {
      draggable: true,
      icon: L.divIcon({
        className: "",
        html: '<span style="display:block;width:16px;height:16px;border-radius:50%;' +
              'background:#e0a24d;border:2px solid #000c;box-shadow:0 0 4px #000"></span>',
        iconSize: [16, 16], iconAnchor: [8, 8],
      }),
    });
    marker._point = point;
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      point.x = Math.round(pos.lng * 10) / 10;
      point.z = Math.round(pos.lat * 10) / 10;
    });
    marker.on("click", () => pickGroup.removeLayer(marker));
    pickGroup.addLayer(marker);
  }

  function bindPickerButtons() {
    $$("#map-switch-pick button").forEach((btn) => {
      btn.addEventListener("click", () => {
        // Wechselt die globale Kartenwahl (eine Quelle der Wahrheit)
        window.DayZMapShared.setMap(btn.dataset.mapkey);
        if (pickTarget) openMapPicker(pickTarget);
      });
    });
    $("#btn-mappick-ok").addEventListener("click", () => {
      const points = pickGroup.getLayers().map((m) => m._point);
      if (pickTarget) pickTarget.setValues(points);
      $("#mappick-overlay").classList.add("hidden");
    });
    $("#btn-mappick-cancel").addEventListener("click", () =>
      $("#mappick-overlay").classList.add("hidden"));
  }

  /* ====================================================== Zeilen-Diff */

  function lineDiff(oldText, newText) {
    const a = (oldText || "").split("\n");
    const b = (newText || "").split("\n");
    if (a.length * b.length > 4_000_000) {
      // Zu groß für LCS: nur hinzugefügte/entfernte Zeilen zählen
      const counts = new Map();
      a.forEach((l) => counts.set(l, (counts.get(l) || 0) - 1));
      b.forEach((l) => counts.set(l, (counts.get(l) || 0) + 1));
      const out = [];
      for (const [line, c] of counts) {
        if (c > 0) for (let i = 0; i < c; i++) out.push(["add", line]);
        if (c < 0) for (let i = 0; i < -c; i++) out.push(["del", line]);
      }
      return out;
    }
    // Klassisches LCS
    const m = a.length, n = b.length;
    const lcs = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1
                                  : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    const out = [];
    let i = 0, j = 0;
    while (i < m && j < n) {
      if (a[i] === b[j]) { out.push(["ctx", a[i]]); i++; j++; }
      else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push(["del", a[i]]); i++; }
      else { out.push(["add", b[j]]); j++; }
    }
    while (i < m) out.push(["del", a[i++]]);
    while (j < n) out.push(["add", b[j++]]);
    return out;
  }

  function renderDiff(ops) {
    const box = h("div", { class: "diff" });
    let ctxRun = [];
    const flushCtx = (isEdge) => {
      if (ctxRun.length <= 4) {
        ctxRun.forEach((l) => box.append(h("div", { class: "ctx" }, l)));
      } else {
        box.append(h("div", { class: "ctx" }, ctxRun[0]),
                   h("div", { class: "ctx" }, ctxRun[1]),
                   h("div", { class: "skip" },
                     "… " + (ctxRun.length - 4) + " unveränderte Zeilen …"),
                   h("div", { class: "ctx" }, ctxRun[ctxRun.length - 2]),
                   h("div", { class: "ctx" }, ctxRun[ctxRun.length - 1]));
      }
      ctxRun = [];
    };
    for (const [kind, line] of ops) {
      if (kind === "ctx") { ctxRun.push(line); continue; }
      flushCtx();
      box.append(h("div", { class: kind }, (kind === "add" ? "+ " : "− ") + line));
    }
    flushCtx(true);
    return box;
  }

  /* ============================================== Vorschau & Staging */

  const staged = [];   // {path, summary, transform, tool}
  let pendingPlans = null;

  async function showPreview(tool) {
    let plans;
    try {
      plans = await tool.generate();
    } catch (err) {
      return toast(err.message, "error");
    }
    if (!plans || !plans.length) return;
    const box = $("#preview-files");
    box.innerHTML = "";
    try {
      for (const plan of plans) {
        const current = await readOrNull(plan.path);
        const next = plan.transform(current);
        const fileBox = h("div", { class: "preview-file" },
          h("div", { class: "pf-head" },
            h("span", { class: "badge " + (current === null ? "new" : "mod") },
              current === null ? "NEU" : "GEÄNDERT"),
            h("span", { class: "mono" }, plan.path.split("/").slice(-2).join("/"))),
          h("ul", { class: "pf-summary" }, plan.summary.map((s) => h("li", {}, s))));
        const details = h("details", { class: "pf-diff-toggle" },
          h("summary", {}, "Änderungen im Detail (Diff) anzeigen"));
        details.addEventListener("toggle", () => {
          if (details.open && !details.querySelector(".diff"))
            details.append(renderDiff(lineDiff(current, next)));
        }, { once: false });
        fileBox.append(details);
        box.append(fileBox);
      }
    } catch (err) {
      return toast("Vorschau fehlgeschlagen: " + err.message, "error");
    }
    pendingPlans = plans.map((p) => ({ ...p, tool: tool.title }));
    $("#preview-overlay").classList.remove("hidden");
  }

  function updateStagingBar() {
    const bar = $("#staging-bar");
    bar.classList.toggle("hidden", staged.length === 0);
    const files = [...new Set(staged.map((s) => s.path.split("/").pop()))];
    $("#staging-info").textContent =
      "● " + staged.length + " Änderung(en) vorgemerkt: " + files.join(", ");
  }

  async function saveStaged() {
    if (!staged.length) return;
    const files = [...new Set(staged.map((s) => s.path))];
    if (!confirm("Jetzt " + files.length + " Datei(en) auf den Server hochladen?\n\n" +
                 files.map((f) => "• " + f.split("/").slice(-2).join("/")).join("\n") +
                 "\n\n(Vorher wird automatisch ein Backup angelegt.)")) return;
    const btn = $("#btn-staging-save");
    btn.disabled = true;
    try {
      const contents = new Map();
      for (const entry of staged) {
        if (!contents.has(entry.path)) contents.set(entry.path, await readOrNull(entry.path));
        contents.set(entry.path, entry.transform(contents.get(entry.path)));
      }
      for (const [path, content] of contents) {
        await api("/api/file", { path, content });
      }
      staged.length = 0;
      updateStagingBar();
      toast("Gespeichert: " + files.map((f) => f.split("/").pop()).join(", ") +
            " (Backups angelegt)");
      setTimeout(() => {
        if (confirm("Änderungen sind hochgeladen. Server jetzt neu starten, " +
                    "damit sie in Kraft treten?")) {
          api("/api/server/restart", {})
            .then(() => toast("Neustart ausgelöst – in ein paar Minuten ist alles live."))
            .catch((err) => toast(err.message, "error"));
        }
      }, 300);
    } catch (err) {
      toast("Speichern fehlgeschlagen: " + err.message, "error");
    } finally {
      btn.disabled = false;
    }
  }

  /* ========================================================= Die Tools */

  const registry = [];
  let currentTool = null;

  /* ------------------------------------------------ 1. Loadout Generator */

  /* Katalog-Zugriff (aus loadout-catalog.js; Fallbacks falls nicht geladen) */
  const catBucket = (b) => (window.LOADOUT_CATALOG && window.LOADOUT_CATALOG[b]) || [];
  const catContent = (c) => (window.LOADOUT_CONTENT && window.LOADOUT_CONTENT[c]) || [];
  const catAll = () => window.LOADOUT_ALL || [];
  /* Anzeigename aus DB, sonst aus dem Klassennamen ableiten */
  const dispName = (cls) =>
    (window.LOADOUT_NAMES && window.LOADOUT_NAMES[String(cls).toLowerCase()]) ||
    String(cls).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const searchAll = (term) => {
    const t = term.toLowerCase();
    return catAll().filter((c) => c.toLowerCase().includes(t));
  };

  /* Die 8 Inhalt-Kategorien des Aufsatz-/Inhalt-Editors (wie im Vorbild) */
  const LOADOUT_CONTENT_CATS = [
    ["simple", "Aufsätze"], ["complex", "Magazine"], ["food", "Nahrung"],
    ["openedFood", "Geöffnet"], ["drinks", "Getränke"], ["looseAmmo", "Munition"],
    ["boxedAmmo", "Mun.-Boxen"], ["misc", "Sonstiges"],
  ];
  const catLabel = (id) => (LOADOUT_CONTENT_CATS.find((x) => x[0] === id) || [id, id])[1];

  /* Zufallsgenerator: realistische Pro-Slot-Wahrscheinlichkeiten */
  const RANDOM_SLOT_PROB = {
    Body: 1, Legs: 1, Feet: 1, Vest: 0.9, Headgear: 0.8, Hands: 0.8,
    Gloves: 0.8, Back: 0.8, Hips: 0.7, shoulderL: 0.6, shoulderR: 0.6,
    Mask: 0.6, Eyewear: 0.5, Armband: 0.5,
  };
  const RN_A = ["Survivor", "Wanderer", "Hunter", "Nomad", "Ranger", "Ghost",
    "Stalker", "Drifter", "Outlaw", "Raider", "Scout", "Rogue", "Phantom",
    "Reaper", "Wolf", "Viper", "Bandit", "Marauder"];
  const RN_B = ["Alpha", "Bravo", "Delta", "Echo", "Storm", "Titan", "Fury",
    "Onyx", "Raven", "Cobra", "Havoc", "Venom", "Blaze", "Frost", "Shadow",
    "Iron", "Steel", "Thunder"];
  const randomName = () => {
    const p = (a) => a[Math.floor(Math.random() * a.length)];
    return p(RN_A) + "_" + p(RN_B) + "_" + Math.floor(Math.random() * 1000);
  };

  /* Dateibasis aus dem Preset-Namen (unzulässige Zeichen → _) */
  const loFileBase = (name) => (name || "").trim()
    .replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "loadout";

  /* --- Grobe Waffen-Kompatibilität (Datenbasis: Magazin-Benennung) ---
   * mag_<familie>_<größe>rnd → Familien-Token; Aufsätze per Präfix-Token. */
  const WEAPON_FAMILY = [
    [/^(m4a1|m16|colt)/, ["stanag", "cmag"], ["m4_"]],
    [/^aks?74u/, ["ak74"], ["aks74u", "ak_"]],
    [/^ak74/, ["ak74"], ["ak_"]], [/^ak101/, ["ak101"], ["ak_"]],
    [/^akm/, ["akm"], ["ak_"]],
    [/^(vss|asval|as_val)/, ["vss", "val"], []], [/^svd/, ["svd"], []],
    [/^saiga/, ["saiga"], []], [/^famas/, ["famas"], []], [/^aug/, ["aug"], []],
    [/^(fal|lar)/, ["fal"], []], [/^scout/, ["scout"], []],
    [/^ruger/, ["ruger1022"], []], [/^cz527/, ["cz527"], []],
    [/^cz550/, ["cz550"], []], [/^cz61/, ["cz61"], []], [/^cz75/, ["cz75"], []],
    [/^glock/, ["glock"], []], [/^fnx/, ["fnx45"], []],
    [/^(engraved)?1911/, ["1911"], []], [/^mkii/, ["mkii"], []],
    [/^deagle/, ["deagle"], []], [/^mp5/, ["mp5"], []], [/^ump/, ["ump"], []],
    [/^(pp19|bizon)/, ["pp19"], []], [/^pm73/, ["pm73"], []],
    [/^vikhr/, ["vikhr"], []], [/^ssg82/, ["ssg82"], []], [/^sv98/, ["sv98"], []],
    [/^m14/, ["m14"], []], [/^p1_?/, ["p1"], []], [/^ij70/, ["ij70"], []],
    [/^mosin/, [], ["mosin"]], [/^sks/, [], ["sks"]],
  ];
  function weaponFamily(cls) {
    const c = String(cls).toLowerCase();
    for (const [re, mags, attach] of WEAPON_FAMILY)
      if (re.test(c)) return { mags, attach };
    return null;
  }
  const isWeapon = (cls) =>
    (window.LOADOUT_WEAPONS || []).includes(cls) ||
    ((window.LOADOUT_CATALOG && window.LOADOUT_CATALOG.Hands) || []).includes(cls);

  /* Pool einer Inhalt-Kategorie, für Waffen grob auf die Familie gefiltert */
  function contentPool(cat, parentCls, showAll) {
    const pool = catContent(cat);
    if (showAll || !parentCls || !isWeapon(parentCls)) return pool;
    const fam = weaponFamily(parentCls);
    if (cat === "complex") {                       // Magazine
      if (!fam || !fam.mags.length) return [];      // interner Lader → keine
      return pool.filter((c) =>
        fam.mags.some((t) => c.toLowerCase().includes("_" + t + "_")));
    }
    if (cat === "simple") {                          // Optiken universell + Familie
      if (!fam) return pool;
      const lc = (x) => x.toLowerCase();
      return pool.filter((x) =>
        /optic|scope|sight|reflex/.test(lc(x)) ||
        fam.attach.some((t) => lc(x).includes(t)));
    }
    return pool;                                     // Food/Ammo/Misc: universell
  }

  /* Zustand-Preset → [healthMin, healthMax] für einen Eintrag */
  function condHealth(entry) {
    if (entry.cond === "custom") return [num(entry.hMin, 1), num(entry.hMax, 1)];
    const c = LOADOUT_CONDITIONS.find((x) => x[0] === entry.cond) || LOADOUT_CONDITIONS[0];
    return [c[2], c[3]];
  }
  function entryAttrs(entry) {
    const [hMin, hMax] = condHealth(entry);
    return { healthMin: hMin, healthMax: hMax,
             quantityMin: num(entry.qMin, -1), quantityMax: num(entry.qMax, -1) };
  }
  /* Kind-Items in simple/complex aufteilen (wie im Vorbild: complex, wenn
   * ein QuickBar-Slot gesetzt ist oder eigene Unter-Aufsätze existieren). */
  function splitChildren(children, attrs) {
    const simple = [], complex = [];
    (children || []).forEach((ch) => {
      const hasSub = ch.children && ch.children.length;
      if (ch.cat === "complex" || (ch.quickBar != null && ch.quickBar >= 0) || hasSub) {
        const cx = { itemType: ch.cls, attributes: attrs,
                     quickBarSlot: ch.quickBar >= 0 ? ch.quickBar : -1 };
        if (hasSub) {
          cx.simpleChildrenTypes = ch.children.map((s) => s.cls || s);
          cx.simpleChildrenUseDefaultAttributes = false;
        }
        complex.push(cx);
      } else {
        simple.push(ch.cls);
      }
    });
    return { simple, complex };
  }
  function buildItemSet(entry) {
    const a = entryAttrs(entry);
    const { simple, complex } = splitChildren(entry.children, a);
    return { itemType: entry.cls, spawnWeight: num(entry.spawnWeight, 1),
             attributes: a, quickBarSlot: entry.quickBar >= 0 ? entry.quickBar : -1,
             simpleChildrenTypes: simple, simpleChildrenUseDefaultAttributes: false,
             complexChildrenTypes: complex };
  }
  function buildCargoSet(c) {
    const a = entryAttrs(c);
    const { simple, complex } = splitChildren(c.items, a);
    return { name: c.name || "Cargo", spawnWeight: num(c.spawnWeight, 1),
             attributes: a, simpleChildrenTypes: simple,
             simpleChildrenUseDefaultAttributes: false, complexChildrenTypes: complex };
  }

  registry.push({
    id: "loadout", icon: "🧍", title: "Loadout Generator",
    desc: "Start-Ausrüstung frisch gespawnter Spieler – 14 Slots mit Bild-Auswahl, gewichteten Alternativen, Aufsätzen/Inhalt, Cargo-Sets und Charaktertypen. (Ab DayZ 1.20 auch auf Konsole.)",

    /* --- Ausgabe (custom_spawngear.json) aus dem aktuellen Zustand bauen */
    buildPreset() {
      const s = this.lo;
      const slotSets = [];
      for (const slot of LOADOUT_SLOTS) {
        const entries = s.slots[slot.id];
        if (entries && entries.length)
          slotSets.push({ slotName: slot.slotName,
                          discreteItemSets: entries.map(buildItemSet) });
      }
      const cargo = s.cargo.filter((c) => (c.items || []).length).map(buildCargoSet);
      return { spawnWeight: 1, name: s.name || "MeinLoadout",
               characterTypes: s.characters.include ? Array.from(s.characters.set) : [],
               attachmentSlotItemSets: slotSets, discreteUnsortedItemSets: cargo };
    },

    render(form) {
      const self = this;
      /* Zustand für dieses Tool */
      const s = this.lo = { name: "MeinLoadout",
        characters: { include: false, set: new Set() },
        slots: {}, cargo: [] };
      LOADOUT_SLOTS.forEach((sl) => (s.slots[sl.id] = []));

      /* -- kleine Bausteine ------------------------------------------- */
      const qbSelect = (val, onChange) => {
        const sel = h("select", { class: "lo-qb", title: "QuickBar-Slot" });
        sel.append(h("option", { value: "-1" }, "QB –"));
        for (let i = 0; i <= 9; i++) sel.append(h("option", { value: String(i) }, "QB " + i));
        sel.value = String(val == null ? -1 : val);
        sel.addEventListener("change", () => onChange(parseInt(sel.value, 10)));
        return sel;
      };
      const card = (cls, onclick) =>
        h("div", { class: "item-card", title: cls, onclick },
          itemImg(cls), h("span", { class: "nm" }, dispName(cls)));

      /* wiederverwendbarer Bild-Picker (Suche + Karten-Grid, für Slot-Items) */
      function pickerGrid(baseList, onPick) {
        const search = h("input", { class: "lo-search", placeholder: "Suchen… (Name eintippen)" });
        const grid = h("div", { class: "lo-grid" });
        function fill(term) {
          grid.innerHTML = "";
          const list = term && term.length >= 2 ? searchAll(term) : baseList();
          const shown = list.slice(0, 300);
          shown.forEach((cls) => grid.append(card(cls, () => onPick(cls))));
          if (!shown.length) grid.append(h("p", { class: "hint" }, "Keine Treffer."));
        }
        search.addEventListener("input", () => fill(search.value.trim()));
        fill("");
        return h("div", { class: "lo-picker" }, search, grid);
      }

      /* Aufsatz-/Inhalt-Editor pro Item: 8 Kategorie-Reiter + Filter +
       * QuickSlot je Eintrag. parentCls = übergeordnetes Item (für Waffen-
       * Kompatibilität); null bei Cargo-Sets. */
      function contentPicker(arr, parentCls) {
        const box = h("div", { class: "lo-childbox" });
        const list = h("div", { class: "lo-childlist" });
        function renderList() {
          list.innerHTML = "";
          arr.forEach((ch, i) => {
            list.append(h("div", { class: "lo-childrow" },
              itemImg(ch.cls), h("span", { class: "cls" }, dispName(ch.cls)),
              h("span", { class: "lo-cattag" }, catLabel(ch.cat || "misc")),
              qbSelect(ch.quickBar, (v) => { ch.quickBar = v; refreshJson(); }),
              h("button", { class: "small",
                onclick: () => { arr.splice(i, 1); renderList(); refreshJson(); } }, "✕")));
          });
          if (!arr.length) list.append(h("p", { class: "hint" }, "Noch nichts hinzugefügt."));
        }
        let activeCat = "simple", showAll = false;
        const catbar = h("div", { class: "lo-catbar" });
        const catButtons = {};
        LOADOUT_CONTENT_CATS.forEach(([id, label]) => {
          const b = h("button", { class: "lo-catbtn", onclick: () => {
            activeCat = id; showAll = false; showAllBtn.classList.remove("on");
            search.value = ""; syncCats(); fillGrid("");
          } }, label);
          catButtons[id] = b; catbar.append(b);
        });
        const showAllBtn = h("button", { class: "small lo-showall", onclick: () => {
          showAll = !showAll; showAllBtn.classList.toggle("on", showAll);
          fillGrid(search.value.trim());
        } }, "Alle anzeigen");
        const search = h("input", { class: "lo-search", placeholder: "Filter / Suche…" });
        const grid = h("div", { class: "lo-grid" });
        function syncCats() {
          LOADOUT_CONTENT_CATS.forEach(([id]) =>
            catButtons[id].classList.toggle("active", id === activeCat));
        }
        function fillGrid(term) {
          grid.innerHTML = "";
          const listv = (term && term.length >= 2)
            ? searchAll(term) : contentPool(activeCat, parentCls, showAll);
          const shown = listv.slice(0, 300);
          shown.forEach((cls) => grid.append(card(cls, () => {
            arr.push({ cls, cat: activeCat, quickBar: -1 }); renderList(); refreshJson();
          })));
          if (!shown.length) grid.append(h("p", { class: "hint" },
            (activeCat === "complex" && parentCls && !showAll)
              ? "Keine passenden Magazine (evtl. interner Lader) – „Alle anzeigen“."
              : "Keine Treffer."));
        }
        search.addEventListener("input", () => fillGrid(search.value.trim()));
        syncCats(); fillGrid("");
        box.append(list, h("details", { class: "lo-addbox" },
          h("summary", {}, "+ Aufsatz / Inhalt hinzufügen"),
          catbar, h("div", { class: "row lo-addctl" }, search, showAllBtn), grid));
        box.render = renderList; renderList();
        return box;
      }

      /* Konfig-Block für ein gewähltes Slot-Item */
      function entryRow(slotId, entry) {
        const head = h("div", { class: "lo-entryhead" },
          itemImg(entry.cls), h("b", { class: "cls" }, entry.cls),
          h("label", {}, "Gewicht ",
            h("input", { class: "lo-weight", type: "number", min: "1",
              value: String(entry.spawnWeight),
              oninput: (e) => { entry.spawnWeight = num(e.target.value, 1); refreshJson(); } })),
          qbSelect(entry.quickBar, (v) => { entry.quickBar = v; refreshJson(); }),
          h("button", { class: "small danger",
            onclick: () => {
              const arr = s.slots[slotId];
              arr.splice(arr.indexOf(entry), 1); renderSlot(slotId); refreshJson();
            } }, "✕ Item"));

        /* Zustand */
        const condSel = h("select", { class: "lo-cond" },
          ...LOADOUT_CONDITIONS.map(([k, l]) => h("option", { value: k }, l)));
        condSel.value = entry.cond;
        const hMin = h("input", { type: "number", step: "0.1", min: "0", max: "1",
          value: String(entry.hMin), placeholder: "min",
          oninput: (e) => { entry.hMin = num(e.target.value, 1); refreshJson(); } });
        const hMax = h("input", { type: "number", step: "0.1", min: "0", max: "1",
          value: String(entry.hMax), placeholder: "max",
          oninput: (e) => { entry.hMax = num(e.target.value, 1); refreshJson(); } });
        const customWrap = h("span", { class: "lo-custom" }, "Health ", hMin, "–", hMax);
        const syncCustom = () => customWrap.classList.toggle("hidden", entry.cond !== "custom");
        condSel.addEventListener("change", () => {
          entry.cond = condSel.value; syncCustom(); refreshJson();
        });
        syncCustom();

        const details = h("details", { class: "lo-details" },
          h("summary", {}, "Aufsätze / Inhalt (" + (entry.children.length || 0) + ")"),
          contentPicker(entry.children, entry.cls));

        return h("div", { class: "lo-entry" }, head,
          h("div", { class: "lo-entryrow" }, "Zustand:", condSel, customWrap),
          details);
      }

      /* -- Kopfbereich: Name + Aktionen ------------------------------- */
      const nameInput = textInput("lo-name", s.name);
      nameInput.addEventListener("input", () => { s.name = nameInput.value.trim(); refreshJson(); });
      form.append(field("Name des Presets", nameInput));

      const fileInput = h("input", { type: "file", accept: ".json,application/json",
        style: "display:none", onchange: (e) => importFile(e.target.files[0]) });
      form.append(h("div", { class: "row lo-actions" },
        h("button", { class: "small", onclick: () => randomize() }, "🎲 Zufälliges Loadout"),
        h("button", { class: "small", onclick: () => fileInput.click() }, "📥 Importieren"),
        h("button", { class: "small", onclick: () => copyJson() }, "📋 JSON kopieren"),
        h("button", { class: "small", onclick: () => downloadJson() }, "⬇️ JSON speichern"),
        fileInput));

      /* -- Slot-Reiter ------------------------------------------------ */
      const tabBar = h("div", { class: "lo-tabs" });
      const slotPanel = h("div", { class: "lo-slotpanel" });
      let activeSlot = LOADOUT_SLOTS[0].id;
      const tabButtons = {};
      LOADOUT_SLOTS.forEach((sl) => {
        const b = h("button", { class: "lo-tab",
          onclick: () => { activeSlot = sl.id; updateTabs(); renderSlot(sl.id); } }, sl.label);
        tabButtons[sl.id] = b; tabBar.append(b);
      });
      function updateTabs() {
        LOADOUT_SLOTS.forEach((sl) => {
          const n = s.slots[sl.id].length;
          tabButtons[sl.id].classList.toggle("active", sl.id === activeSlot);
          tabButtons[sl.id].classList.toggle("has", n > 0);
          tabButtons[sl.id].textContent = sl.label + (n ? " (" + n + ")" : "");
        });
      }
      function renderSlot(slotId) {
        const sl = LOADOUT_SLOTS.find((x) => x.id === slotId);
        slotPanel.innerHTML = "";
        slotPanel.append(h("p", { class: "hint" },
          "Item anklicken = zu „" + sl.label + "“ hinzufügen. Mehrere Items = " +
          "gewichtete Zufallsauswahl. Suche findet auch Items anderer Kategorien."));
        const picker = pickerGrid(() => catBucket(sl.bucket), (cls) => {
          if (s.slots[slotId].some((e) => e.cls === cls)) return;
          s.slots[slotId].push({ cls, spawnWeight: 1, cond: "pristine",
            hMin: 1, hMax: 1, qMin: -1, qMax: -1, quickBar: -1, children: [] });
          renderSlot(slotId); refreshJson();
        });
        slotPanel.append(picker);
        const chosen = h("div", { class: "lo-chosen" });
        s.slots[slotId].forEach((entry) => chosen.append(entryRow(slotId, entry)));
        if (!s.slots[slotId].length)
          chosen.append(h("p", { class: "hint" }, "Noch kein Item in diesem Slot."));
        slotPanel.append(chosen);
        updateTabs();
      }
      form.append(h("div", { class: "grp" }, h("h4", {}, "Ausrüstung nach Slot"),
        tabBar, slotPanel));

      /* -- Cargo-Sets ------------------------------------------------- */
      const cargoWrap = h("div", { class: "lo-cargo" });
      function renderCargo() {
        cargoWrap.innerHTML = "";
        s.cargo.forEach((c, i) => {
          const nameIn = h("input", { value: c.name, placeholder: "Set-Name",
            oninput: (e) => { c.name = e.target.value; refreshJson(); } });
          const wIn = h("input", { type: "number", min: "1", value: String(c.spawnWeight),
            title: "Gewicht", oninput: (e) => { c.spawnWeight = num(e.target.value, 1); refreshJson(); } });
          const condSel = h("select", {},
            ...LOADOUT_CONDITIONS.filter((x) => x[0] !== "custom")
              .map(([k, l]) => h("option", { value: k }, l)));
          condSel.value = c.cond;
          condSel.addEventListener("change", () => { c.cond = condSel.value; refreshJson(); });
          cargoWrap.append(h("div", { class: "lo-cargoset" },
            h("div", { class: "lo-entryhead" }, "📦 ", nameIn, "Gewicht ", wIn, "Zustand ", condSel,
              h("button", { class: "small danger",
                onclick: () => { s.cargo.splice(i, 1); renderCargo(); refreshJson(); } }, "✕ Set")),
            contentPicker(c.items, null)));
        });
        if (!s.cargo.length)
          cargoWrap.append(h("p", { class: "hint" }, "Keine Cargo-Sets. Cargo landet lose im Inventar des Spielers."));
      }
      form.append(h("div", { class: "grp" }, h("h4", {}, "Cargo-Sets (lose Inventar-Items)"),
        cargoWrap,
        h("button", { class: "small", onclick: () => {
          s.cargo.push({ name: "Set" + (s.cargo.length + 1), spawnWeight: 1,
            cond: "pristine", items: [] });
          renderCargo(); refreshJson();
        } }, "+ Cargo-Set")));

      /* -- Charaktertypen -------------------------------------------- */
      const charGrid = h("div", { class: "lo-chars hidden" });
      CHARACTER_TYPES.forEach((ct) => {
        const cb = h("input", { type: "checkbox", value: ct,
          onchange: (e) => {
            if (e.target.checked) s.characters.set.add(ct); else s.characters.set.delete(ct);
            refreshJson();
          } });
        charGrid.append(h("label", { class: "lo-char" }, cb, ct.replace("Survivor", "")));
      });
      const charToggle = h("input", { type: "checkbox",
        onchange: (e) => {
          s.characters.include = e.target.checked;
          charGrid.classList.toggle("hidden", !e.target.checked);
          refreshJson();
        } });
      form.append(h("div", { class: "grp" },
        h("label", { class: "row" }, charToggle,
          " Nur für bestimmte Charaktermodelle (sonst alle)"),
        charGrid));

      /* -- Live-JSON-Vorschau ---------------------------------------- */
      const jsonBox = h("pre", { class: "lo-json" });
      const jsonHead = h("h4", {}, "Vorschau");
      form.append(h("div", { class: "grp" }, jsonHead, jsonBox));

      /* -- Aktionen: Import / Export / Randomize ---------------------- */
      function refreshJson() {
        jsonHead.textContent = "Vorschau · Datei: custom/" + loFileBase(s.name) + ".json";
        jsonBox.textContent = JSON.stringify(self.buildPreset(), null, 2);
      }
      function copyJson() {
        navigator.clipboard.writeText(jsonBox.textContent)
          .then(() => toast("JSON in die Zwischenablage kopiert."))
          .catch(() => toast("Kopieren nicht möglich – bitte manuell markieren.", "warn"));
      }
      function downloadJson() {
        const blob = new Blob([jsonBox.textContent], { type: "application/json" });
        const a = h("a", { href: URL.createObjectURL(blob),
          download: (s.name || "loadout") + ".json" });
        a.click(); URL.revokeObjectURL(a.href);
      }
      function loadPreset(p) {
        s.name = p.name || "MeinLoadout";
        nameInput.value = s.name;
        LOADOUT_SLOTS.forEach((sl) => (s.slots[sl.id] = []));
        s.cargo = []; s.characters = { include: false, set: new Set() };
        const bySlotName = {};
        LOADOUT_SLOTS.forEach((sl) => (bySlotName[sl.slotName.toLowerCase()] = sl.id));
        (p.attachmentSlotItemSets || []).forEach((set) => {
          const slotId = bySlotName[String(set.slotName).toLowerCase()];
          if (!slotId) return;
          (set.discreteItemSets || []).forEach((it) =>
            s.slots[slotId].push(importEntry(it)));
        });
        (p.discreteUnsortedItemSets || []).forEach((set) => {
          s.cargo.push({ name: set.name || "Set", spawnWeight: set.spawnWeight || 1,
            cond: "custom", hMin: set.attributes?.healthMin ?? 1,
            hMax: set.attributes?.healthMax ?? 1,
            qMin: set.attributes?.quantityMin ?? -1, qMax: set.attributes?.quantityMax ?? -1,
            items: importChildren(set) });
        });
        if ((p.characterTypes || []).length) {
          s.characters.include = true;
          p.characterTypes.forEach((ct) => s.characters.set.add(ct));
        }
        charToggle.checked = s.characters.include;
        charGrid.classList.toggle("hidden", !s.characters.include);
        charGrid.querySelectorAll("input").forEach((cb) => {
          cb.checked = s.characters.set.has(cb.value);
        });
        renderSlot(activeSlot); renderCargo(); refreshJson();
      }
      function importEntry(it) {
        const at = it.attributes || {};
        return { cls: it.itemType, spawnWeight: it.spawnWeight || 1, cond: "custom",
          hMin: at.healthMin ?? 1, hMax: at.healthMax ?? 1,
          qMin: at.quantityMin ?? -1, qMax: at.quantityMax ?? -1,
          quickBar: it.quickBarSlot ?? -1, children: importChildren(it) };
      }
      function importChildren(it) {
        const out = [];
        (it.simpleChildrenTypes || []).forEach((c) => out.push({ cls: c, quickBar: -1 }));
        (it.complexChildrenTypes || []).forEach((c) => out.push({ cls: c.itemType,
          quickBar: c.quickBarSlot ?? -1,
          children: (c.simpleChildrenTypes || []).map((x) => ({ cls: x })) }));
        return out;
      }
      function importFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try { loadPreset(JSON.parse(reader.result));
            toast("Loadout importiert."); }
          catch (err) { toast("Import fehlgeschlagen: " + err.message, "error"); }
        };
        reader.readAsText(file);
      }
      function randomize() {
        const hasAny = LOADOUT_SLOTS.some((sl) => s.slots[sl.id].length);
        if (hasAny && !confirm(
          "Zufälliges Loadout erzeugen? Ersetzt die aktuelle Slot-Auswahl."))
          return;
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
        LOADOUT_SLOTS.forEach((sl) => (s.slots[sl.id] = []));
        s.name = randomName(); nameInput.value = s.name;
        LOADOUT_SLOTS.forEach((sl) => {
          if (Math.random() > (RANDOM_SLOT_PROB[sl.id] ?? 0.5)) return;
          const pool = catBucket(sl.bucket);
          if (!pool.length) return;
          const cls = pick(pool);
          if (s.slots[sl.id].some((e) => e.cls === cls)) return;
          const cond = pick(["pristine", "pristine", "worn", "worn", "damaged", "random"]);
          s.slots[sl.id].push({ cls, spawnWeight: 1, cond,
            hMin: 1, hMax: 1, qMin: -1, qMax: -1,
            quickBar: Math.random() < 0.8 ? -1 : Math.floor(Math.random() * 10),
            children: [] });
        });
        s.characters = { include: false, set: new Set() };
        if (Math.random() < 0.5) {
          s.characters.include = true;
          const shuffled = CHARACTER_TYPES.slice().sort(() => Math.random() - 0.5);
          shuffled.slice(0, 1 + Math.floor(Math.random() * 3))
            .forEach((ct) => s.characters.set.add(ct));
        }
        charToggle.checked = s.characters.include;
        charGrid.classList.toggle("hidden", !s.characters.include);
        charGrid.querySelectorAll("input").forEach((cb) => {
          cb.checked = s.characters.set.has(cb.value);
        });
        renderSlot(activeSlot); updateTabs(); refreshJson();
        toast("Zufälliges Loadout erzeugt – nach Wunsch anpassen.");
      }
      this._loadPreset = loadPreset;

      /* Initialdarstellung */
      updateTabs(); renderSlot(activeSlot); renderCargo(); refreshJson();
    },

    async generate() {
      const preset = this.buildPreset();
      // Dateiname = Preset-Name (nur unzulässige Zeichen ersetzt), Ordner „custom“
      const fileName = loFileBase(preset.name) + ".json";
      const filePath = "custom/" + fileName;
      const items = preset.attachmentSlotItemSets.length;
      const cargo = preset.discreteUnsortedItemSets.length;
      if (!items && !cargo)
        throw new Error("Bitte mindestens ein Item auswählen.");
      return [
        {
          path: mission(filePath),
          summary: ["Preset „" + preset.name + "“ mit " + items +
                    " Slot-Gruppe(n) und " + cargo + " Cargo-Set(s) → " + filePath + "."],
          transform: () => JSON.stringify(preset, null, 4) + "\n",
        },
        {
          path: mission("cfggameplay.json"),
          summary: ["Trägt „" + fileName + "“ bei PlayerData → spawnGearPresetFiles ein" +
                    " (falls noch nicht vorhanden)."],
          transform: (current) => {
            if (current === null) throw new Error("cfggameplay.json wurde auf dem Server nicht gefunden.");
            const data = JSON.parse(current);
            if (!data.PlayerData) data.PlayerData = {};
            if (!Array.isArray(data.PlayerData.spawnGearPresetFiles))
              data.PlayerData.spawnGearPresetFiles = [];
            if (!data.PlayerData.spawnGearPresetFiles.includes(fileName))
              data.PlayerData.spawnGearPresetFiles.push(fileName);
            return JSON.stringify(data, null, 4) + "\n";
          },
        },
      ];
    },
  });

  /* ------------------------------------------------ 2. Gas-Zonen Builder */

  /* Aus Zonen-Objekten die cfgeffectarea-„Areas“ bauen (geteilt: Save + Export) */
  function gasAreasFromZones(zones) {
    return zones.map((z) => ({
      AreaName: z.name,
      Type: "ContaminatedArea_Static",
      TriggerType: "ContaminatedTrigger",
      Data: {
        Pos: [z.x, 0, z.z], Radius: z.radius,
        PosHeight: z.posHeight, NegHeight: z.negHeight,
        InnerPartDist: z.innerPartDist, OuterOffset: z.outerOffset,
        ParticleName: z.particle,
      },
      PlayerData: {
        AroundPartName: "graphics/particles/contaminated_area_gas_around",
        TinyPartName: "graphics/particles/contaminated_area_gas_around_tiny",
        PPERequesterType: "PPERequester_ContaminatedAreaTint",
      },
    }));
  }

  registry.push({
    id: "gaszone", icon: "☣️", title: "Gas-Zonen Builder",
    desc: "Kontaminationszonen direkt auf der Karte zeichnen (Kreis ziehen), pro Zone konfigurieren, sichere Teleport-Punkte setzen – schreibt cfgEffectArea.json.",

    render(form) {
      const self = this;
      const shared = window.DayZMapShared;
      const gz = this.gz = {
        zones: [], safe: [], map: null, mapKey: shared.currentKey(),
        cityGroup: null, drawGroup: null, safeGroup: null, editing: null,
        counter: 1, drawMode: false, safeMode: false,
        showCities: true, showZones: true, showSafe: true,
        defaults: { posHeight: 20, negHeight: 3, innerPartDist: 100,
                    outerOffset: 20, particle: GAS_PARTICLES[0][0] },
      };

      form.append(h("p", { class: "hint" },
        "Auf der Karte einen Kreis ziehen = neue Gaszone (in der Mitte drücken " +
        "und ziehen). Ctrl+Klick = SafePosition. Zone/Kreis anklicken = " +
        "konfigurieren. Am Handy: „+ Zone per Koordinaten“ unten nutzen."));

      /* -- Ebenen-Umschalter -------------------------------------------- */
      const switchRow = h("div", { class: "map-switch gz-switch" });
      Object.entries(shared.MAPS).forEach(([key, cfg]) =>
        switchRow.append(h("button", { "data-mapkey": key,
          onclick: () => switchMap(key) }, cfg.label)));
      form.append(field("Karte", switchRow));

      /* -- Toggles ------------------------------------------------------ */
      const tgCity = h("input", { type: "checkbox", checked: "checked",
        onchange: (e) => { gz.showCities = e.target.checked; applyToggles(); } });
      const tgZone = h("input", { type: "checkbox", checked: "checked",
        onchange: (e) => { gz.showZones = e.target.checked; applyToggles(); } });
      const tgSafe = h("input", { type: "checkbox", checked: "checked",
        onchange: (e) => { gz.showSafe = e.target.checked; applyToggles(); } });
      form.append(h("div", { class: "row gz-toggles" },
        h("label", {}, tgCity, " Ortsnamen"),
        h("label", {}, tgZone, " Gaszonen"),
        h("label", {}, tgSafe, " SafePositions")));

      /* -- Werkzeugleiste ----------------------------------------------- */
      const drawBtn = h("button", { class: "small", onclick: () => toggleDraw() }, "➕ Zone zeichnen");
      const safeBtn = h("button", { class: "small", onclick: () => toggleSafe() }, "＋ SafePosition");
      form.append(h("div", { class: "row gz-tools" }, drawBtn, safeBtn,
        h("button", { class: "small danger", onclick: () => clearZones() }, "Zonen leeren"),
        h("button", { class: "small danger", onclick: () => clearSafe() }, "SafePos leeren"),
        h("button", { class: "small", onclick: () => downloadJson() }, "⬇️ cfgEffectArea.json")));

      /* -- Karte + Koordinaten-Overlay ---------------------------------- */
      const mapEl = h("div", { class: "gz-map" });
      const coordEl = h("div", { class: "gz-coord" }, "X – | Z –");
      form.append(h("div", { class: "gz-mapwrap" }, mapEl, coordEl));

      /* -- Zonen-Liste -------------------------------------------------- */
      const zoneCount = h("span", {}, "0");
      const zoneList = h("div", { class: "gz-list" });
      form.append(h("div", { class: "grp" },
        h("h4", {}, "Gaszonen (", zoneCount, ")"), zoneList));

      /* -- Zone per Koordinaten (Handy/Präzision) ----------------------- */
      form.append(h("div", { class: "grp" },
        h("h4", {}, "Zone per Koordinaten (Alternative zum Zeichnen)"),
        h("div", { class: "row" },
          "X:", numInput("gz-addx", ""), "Z:", numInput("gz-addz", ""),
          "Radius:", numInput("gz-addr", 150),
          h("button", { class: "small", onclick: () => addByCoords() }, "+ Zone"))));

      /* -- SafePositions-Liste ------------------------------------------ */
      const safeList = h("div", { class: "gz-list" });
      form.append(h("div", { class: "grp" },
        h("h4", {}, "SafePositions (Teleport-Ziele)"),
        h("p", { class: "hint" }, "Wohin Spieler versetzt werden, die mitten " +
          "in einer Gaszone einloggen – sonst sterben sie beim Beitreten."),
        safeList));

      /* -- Konfig-Modal ------------------------------------------------- */
      const mName = textInput("gzm-name", "");
      const mRadius = numInput("gzm-radius", 150);
      const mX = numInput("gzm-x", 0), mZ = numInput("gzm-z", 0);
      const mPos = numInput("gzm-pos", 20), mNeg = numInput("gzm-neg", 3);
      const mInner = numInput("gzm-inner", 100), mOuter = numInput("gzm-outer", 20);
      const mPart = h("select", { id: "gzm-part" },
        ...GAS_PARTICLES.map(([v, l]) => h("option", { value: v }, l)));
      const modal = h("div", { class: "gz-modal-overlay hidden" },
        h("div", { class: "gz-modal" },
          h("h3", {}, "Gaszone konfigurieren"),
          field("Name", mName),
          h("div", { class: "row" }, "Radius (m):", mRadius, "X:", mX, "Z:", mZ),
          h("div", { class: "row" }, "Höhe oben:", mPos, "Höhe unten:", mNeg),
          h("div", { class: "row" }, "Partikel-Abstand:", mInner, "Außenversatz:", mOuter),
          field("Partikel-Effekt", mPart),
          h("div", { class: "btn-row" },
            h("button", { class: "primary", onclick: () => saveModal() }, "Speichern"),
            h("button", { onclick: () => closeModal() }, "Abbrechen"),
            h("button", { class: "danger",
              onclick: () => { if (gz.editing) removeZone(gz.editing); closeModal(); } },
              "Zone löschen"))));
      form.append(modal);

      /* ---------------------------------------------------- Funktionen */
      function updateSwitch() {
        switchRow.querySelectorAll("button").forEach((b) =>
          b.classList.toggle("active", b.dataset.mapkey === gz.mapKey));
      }
      function applyToggles() {
        if (!gz.map) return;
        const set = (grp, show) => {
          if (!grp) return;
          if (show && !gz.map.hasLayer(grp)) grp.addTo(gz.map);
          else if (!show && gz.map.hasLayer(grp)) gz.map.removeLayer(grp);
        };
        set(gz.cityGroup, gz.showCities);
        set(gz.drawGroup, gz.showZones);
        set(gz.safeGroup, gz.showSafe);
      }
      function buildMap() {
        const cfg = shared.MAPS[gz.mapKey];
        const WORLD = cfg.size;
        if (gz.map) { gz.map.remove(); gz.map = null; }
        gz.map = L.map(mapEl, {
          crs: shared.makeCrs(WORLD), minZoom: 1, maxZoom: 8,
          maxBounds: [[-2000, -2000], [WORLD + 2000, WORLD + 2000]],
          attributionControl: false,
        });
        L.tileLayer(shared.tileUrl(cfg.slug, "topographic"), {
          noWrap: true, minNativeZoom: 0, maxNativeZoom: 8,
          bounds: [[0, 0], [WORLD, WORLD]],
        }).addTo(gz.map);
        new shared.GridBackdrop({ noWrap: true, opacity: 0.35, world: WORLD }).addTo(gz.map);
        gz.cityGroup = L.layerGroup();
        gz.drawGroup = L.layerGroup();
        gz.safeGroup = L.layerGroup();
        shared.cities(gz.mapKey).forEach(([name, x, z]) =>
          L.marker([z, x], { interactive: false, icon: L.divIcon({
            className: "gz-city", html: name,
            iconSize: [90, 14], iconAnchor: [45, 7] }) }).addTo(gz.cityGroup));
        gz.map.on("mousemove", (e) => {
          coordEl.textContent = "X " + Math.round(e.latlng.lng) + " | Z " + Math.round(e.latlng.lat);
        });
        /* Ctrl-/Cmd-Klick auf die Karte = SafePosition (Desktop-Komfort). */
        gz.map.on("click", (e) => {
          if (e.originalEvent.ctrlKey || e.originalEvent.metaKey)
            addSafe(Math.round(e.latlng.lng), Math.round(e.latlng.lat));
        });
        /* Kreis-Zeichnen & SafePosition-Tippen — Pointer-Events (funktioniert
           mit Maus UND Touch/Handy; Leaflet-Map-Events feuern auf Touch nicht).
           Einmalig an den (stabilen) Karten-Container gebunden; liest gz.map
           dynamisch. */
        if (!gz._drawBound) {
          gz._drawBound = true;
          const toLL = (ev) => {
            const r = mapEl.getBoundingClientRect();
            return gz.map.containerPointToLatLng(
              L.point(ev.clientX - r.left, ev.clientY - r.top));
          };
          const finish = (ev) => {
            if (gz._drawing) {
              const d = gz._drawing; gz._drawing = null;
              ev.preventDefault();
              const r = Math.round(gz.map.distance(d.center, toLL(ev)));
              gz.drawGroup.removeLayer(d.circle);
              try { mapEl.releasePointerCapture(ev.pointerId); } catch (_) {}
              if (r >= 5) { toggleDraw(false); addZone(d.x, d.z, r, true); }
              return;
            }
            if (gz._safeDown) {
              const s = gz._safeDown; gz._safeDown = null;
              ev.preventDefault();
              try { mapEl.releasePointerCapture(ev.pointerId); } catch (_) {}
              if (Math.hypot(ev.clientX - s.sx, ev.clientY - s.sy) < 14) {
                const ll = toLL(ev);
                addSafe(Math.round(ll.lng), Math.round(ll.lat));
                toggleSafe(false);
              }
            }
          };
          mapEl.addEventListener("pointerdown", (ev) => {
            if (!gz.map || (ev.button && ev.button !== 0)) return;
            if (gz.drawMode) {
              ev.preventDefault();
              const ll = toLL(ev);
              const circle = L.circle(ll, { radius: 1, color: "#ff6b35",
                fillColor: "#ffe14d", fillOpacity: 0.3, weight: 2 }).addTo(gz.drawGroup);
              gz._drawing = { x: Math.round(ll.lng), z: Math.round(ll.lat),
                              center: ll, circle };
              try { mapEl.setPointerCapture(ev.pointerId); } catch (_) {}
            } else if (gz.safeMode) {
              ev.preventDefault();
              gz._safeDown = { sx: ev.clientX, sy: ev.clientY };
              try { mapEl.setPointerCapture(ev.pointerId); } catch (_) {}
            }
          });
          mapEl.addEventListener("pointermove", (ev) => {
            if (!gz.map) return;
            const ll = toLL(ev);
            coordEl.textContent = "X " + Math.round(ll.lng) + " | Z " + Math.round(ll.lat);
            if (gz._drawing) {
              ev.preventDefault();
              gz._drawing.circle.setRadius(
                Math.max(1, gz.map.distance(gz._drawing.center, ll)));
            }
          });
          mapEl.addEventListener("pointerup", finish);
          mapEl.addEventListener("pointercancel", finish);
        }
        applyToggles();
        [30, 150, 400].forEach((ms) => setTimeout(() => {
          if (gz.map) gz.map.invalidateSize();
        }, ms));
        gz.map.setView([WORLD / 2, WORLD / 2], 2);
      }
      function switchMap(key) {
        if (key === gz.mapKey) return;
        if ((gz.zones.length || gz.safe.length) &&
            !confirm("Kartenwechsel löscht die aktuellen Zonen und SafePositions. Fortfahren?"))
          return;
        gz.zones = []; gz.safe = []; gz.counter = 1;
        gz.mapKey = key;
        shared.setMap(key);
        updateSwitch(); buildMap(); renderZones(); renderSafe();
      }
      function toggleDraw(force) {
        gz.drawMode = force === undefined ? !gz.drawMode : force;
        if (gz.drawMode) { gz.safeMode = false; safeBtn.classList.remove("on"); }
        drawBtn.classList.toggle("on", gz.drawMode);
        mapEl.classList.toggle("gz-drawing", gz.drawMode);
        if (gz.map) gz.map.dragging[gz.drawMode ? "disable" : "enable"]();
      }
      function toggleSafe(force) {
        gz.safeMode = force === undefined ? !gz.safeMode : force;
        if (gz.safeMode) toggleDraw(false);
        safeBtn.classList.toggle("on", gz.safeMode);
      }
      function drawZoneCircle(zone) {
        if (zone.circle) gz.drawGroup.removeLayer(zone.circle);
        const c = L.circle([zone.z, zone.x], { radius: zone.radius, color: "#ff6b35",
          fillColor: "#ffe14d", fillOpacity: 0.28, weight: 2 });
        c.on("click", (e) => { L.DomEvent.stop(e); openModal(zone); });
        c.bindTooltip(zone.name);
        c.addTo(gz.drawGroup);
        zone.circle = c;
      }
      function addZone(x, z, radius, openCfg) {
        const zone = { id: gz.counter++, name: "GasZone" + (gz.zones.length + 1),
          x, z, radius, posHeight: gz.defaults.posHeight, negHeight: gz.defaults.negHeight,
          innerPartDist: gz.defaults.innerPartDist, outerOffset: gz.defaults.outerOffset,
          particle: gz.defaults.particle, circle: null };
        gz.zones.push(zone);
        drawZoneCircle(zone);
        renderZones();
        if (openCfg) openModal(zone);
      }
      function removeZone(zone) {
        if (zone.circle) gz.drawGroup.removeLayer(zone.circle);
        gz.zones = gz.zones.filter((z) => z !== zone);
        renderZones();
      }
      function renderZones() {
        zoneList.innerHTML = "";
        if (!gz.zones.length)
          zoneList.append(h("p", { class: "hint" },
            "Noch keine Zonen. Kreis auf der Karte ziehen oder per Koordinaten anlegen."));
        gz.zones.forEach((zone) => zoneList.append(h("div", { class: "gz-row" },
          h("span", { class: "nm" }, zone.name),
          h("span", { class: "co" }, zone.x + ", " + zone.z),
          h("span", { class: "co" }, zone.radius + " m"),
          h("button", { class: "small", onclick: () => openModal(zone) }, "Konfigurieren"),
          h("button", { class: "small danger", onclick: () => removeZone(zone) }, "✕"))));
        zoneCount.textContent = String(gz.zones.length);
      }
      function openModal(zone) {
        gz.editing = zone;
        mName.value = zone.name; mRadius.value = zone.radius;
        mX.value = zone.x; mZ.value = zone.z;
        mPos.value = zone.posHeight; mNeg.value = zone.negHeight;
        mInner.value = zone.innerPartDist; mOuter.value = zone.outerOffset;
        mPart.value = zone.particle;
        modal.classList.remove("hidden");
      }
      function closeModal() { modal.classList.add("hidden"); gz.editing = null; }
      function saveModal() {
        const z = gz.editing; if (!z) return;
        z.name = mName.value.trim() || z.name;
        z.radius = num(mRadius.value, z.radius);
        z.x = Math.round(num(mX.value, z.x)); z.z = Math.round(num(mZ.value, z.z));
        z.posHeight = num(mPos.value, z.posHeight);
        z.negHeight = num(mNeg.value, z.negHeight);
        z.innerPartDist = num(mInner.value, z.innerPartDist);
        z.outerOffset = num(mOuter.value, z.outerOffset);
        z.particle = mPart.value; gz.defaults.particle = z.particle;
        drawZoneCircle(z); renderZones(); closeModal();
        toast("Gaszone gespeichert.");
      }
      function addSafe(x, z) {
        const sp = { x, z, marker: null };
        const m = L.circleMarker([z, x], { radius: 6, color: "#00aa00",
          fillColor: "#00ff5a", weight: 2, opacity: 1, fillOpacity: 0.75 });
        m.bindTooltip("SafePos " + x + ", " + z);
        m.on("click", (e) => { L.DomEvent.stop(e); removeSafe(sp); });
        m.addTo(gz.safeGroup);
        sp.marker = m; gz.safe.push(sp); renderSafe();
      }
      function removeSafe(sp) {
        if (sp.marker) gz.safeGroup.removeLayer(sp.marker);
        gz.safe = gz.safe.filter((s) => s !== sp); renderSafe();
      }
      function renderSafe() {
        safeList.innerHTML = "";
        if (!gz.safe.length)
          safeList.append(h("p", { class: "hint" },
            "Keine SafePositions. Ctrl+Klick auf die Karte oder „＋ SafePosition“."));
        gz.safe.forEach((sp, i) => safeList.append(h("div", { class: "gz-row" },
          h("span", { class: "nm" }, "Pos " + (i + 1)),
          h("span", { class: "co" }, sp.x + ", " + sp.z),
          h("button", { class: "small danger", onclick: () => removeSafe(sp) }, "✕"))));
      }
      function clearZones() {
        if (!gz.zones.length) return;
        if (!confirm("Alle Gaszonen löschen?")) return;
        gz.zones.forEach((z) => z.circle && gz.drawGroup.removeLayer(z.circle));
        gz.zones = []; gz.counter = 1; renderZones();
      }
      function clearSafe() {
        if (!gz.safe.length) return;
        if (!confirm("Alle SafePositions löschen?")) return;
        gz.safe.forEach((s) => s.marker && gz.safeGroup.removeLayer(s.marker));
        gz.safe = []; renderSafe();
      }
      function addByCoords() {
        const x = num($("#gz-addx").value, NaN), z = num($("#gz-addz").value, NaN);
        const r = num($("#gz-addr").value, 150);
        if (!Number.isFinite(x) || !Number.isFinite(z))
          return toast("Bitte X und Z angeben.", "warn");
        addZone(Math.round(x), Math.round(z), Math.round(r), true);
        if (gz.map) gz.map.setView([z, x], 4);
      }
      function downloadJson() {
        if (!gz.zones.length) return toast("Keine Zonen zum Exportieren.", "warn");
        const data = { Areas: gasAreasFromZones(gz.zones),
                       SafePositions: gz.safe.map((s) => [s.x, s.z]) };
        const a = h("a", { download: "cfgEffectArea.json",
          href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 4)],
            { type: "application/json" })) });
        a.click(); URL.revokeObjectURL(a.href);
      }

      updateSwitch(); buildMap(); renderZones(); renderSafe();
    },

    async generate() {
      const gz = this.gz;
      if (!gz || !gz.zones.length) throw new Error("Bitte mindestens eine Gaszone anlegen.");
      const areas = gasAreasFromZones(gz.zones);
      const safe = gz.safe.map((s) => [s.x, s.z]);
      const summary = areas.map((a) => "Gaszone „" + a.AreaName + "“ bei X " +
        a.Data.Pos[0] + " / Z " + a.Data.Pos[2] + ", Radius " + a.Data.Radius + " m.");
      if (safe.length) summary.push(safe.length + " SafePosition(en).");
      return [{
        path: mission("cfgEffectArea.json"),
        summary,
        transform: (current) => {
          const data = current ? JSON.parse(current) : { Areas: [], SafePositions: [] };
          if (!Array.isArray(data.Areas)) data.Areas = [];
          const names = new Set(areas.map((a) => a.AreaName));
          data.Areas = data.Areas.filter((a) => !names.has(a.AreaName));
          data.Areas.push(...areas);
          if (!Array.isArray(data.SafePositions)) data.SafePositions = [];
          if (safe.length) data.SafePositions = safe;
          return JSON.stringify(data, null, 4) + "\n";
        },
      }];
    },
  });

  /* -------------------------------------------- 3. Zombie-Horden Generator */

  registry.push({
    id: "horde", icon: "🧟", title: "Zombie-Horden Generator",
    desc: "Feste Zombie-Horden an Wunschpositionen – Zombie-Typen bequem per Liste auswählen, Bewegungsverhalten und Zonen-Radius einstellbar.",
    render(form) {
      form.append(field("Name der Horde", textInput("hd-name", "InfectedHorde")));
      this.zombies = zombiePicker();
      this.zombies.add("ZmbM_SoldierNormal", 5);
      form.append(this.zombies);
      form.append(field("Bewegungsverhalten",
        h("select", { id: "hd-move" },
          ...Object.entries(HORDE_MOVEMENT).map(([v, m]) =>
            h("option", { value: v }, m.label)))));
      this.pos = posList({});
      form.append(h("div", { class: "grp" },
        h("h4", {}, "Position(en) der Horde"),
        h("div", { class: "row" }, "Zonen-Radius (m):", numInput("hd-radius", 25)),
        this.pos));
      form.append(h("details", {},
        h("summary", {}, "Experten-Einstellungen"),
        field("Lifetime (Sek.)", numInput("hd-lifetime", 300)),
        field("Loot pro Zombie (min/max)",
          h("span", { class: "row" }, numInput("hd-lootmin", 0), numInput("hd-lootmax", 0))),
        field("Cleanupradius", numInput("hd-cleanup", 400))));
    },
    async generate() {
      const name = $("#hd-name").value.trim() || "InfectedHorde";
      const zombies = this.zombies.values();
      const positions = this.pos.values();
      if (!zombies.length) throw new Error("Bitte mindestens einen Zombie-Typ hinzufügen.");
      if (!positions.length) throw new Error("Bitte mindestens eine Position angeben.");
      const move = HORDE_MOVEMENT[$("#hd-move").value] || HORDE_MOVEMENT.stationary;
      const radius = num($("#hd-radius").value, 25);
      const lootmin = num($("#hd-lootmin").value, 0);
      const lootmax = num($("#hd-lootmax").value, 0);
      const count = positions.length;
      const total = zombies.reduce((s, z) => s + z.num, 0);
      const def = {
        name, nominal: count, min: count, max: count,
        lifetime: num($("#hd-lifetime").value, 300), restock: 0,
        saferadius: 10, distanceradius: 300,
        cleanupradius: num($("#hd-cleanup").value, 400),
        flags: { deletable: 0, init_random: 0, remove_damaged: 1 },
        position: "fixed", limit: "custom", active: 1,
        children: zombies.map((z) => ({ type: z.item, min: Math.round(z.num),
                                        max: Math.round(z.num),
                                        lootmin, lootmax })),
      };
      const zones = positions.map((p) => ({ x: p.x, y: 0, z: p.z, r: radius,
        smin: move.smin, smax: move.smax, dmin: move.dmin, dmax: move.dmax }));
      return [
        {
          path: mission("db/events.xml"),
          summary: ["Event „" + name + "“ mit " + total + " Zombies pro Zone (" +
                    zombies.map((z) => z.num + "× " + z.item).join(", ") +
                    "), Verhalten: " + move.label + "."],
          transform: (current) => {
            if (current === null) throw new Error("db/events.xml wurde auf dem Server nicht gefunden.");
            return upsertEvent(current, def);
          },
        },
        {
          path: mission("cfgeventspawns.xml"),
          summary: [count + " Horden-Zone(n), Radius " + radius + " m: " +
                    positions.map((p) => "X " + p.x + "/Z " + p.z).join(", ") + "."],
          transform: (current) => {
            if (current === null) throw new Error("cfgeventspawns.xml wurde auf dem Server nicht gefunden.");
            return writeEventZones(current, name, zones);
          },
        },
      ];
    },
  });

  /* --------------------------------------- 4. Heli-Crash / Supply-Drop Loot */

  registry.push({
    id: "heliloot", icon: "🚁", title: "Heli-Crash Loot",
    desc: "Eigenen Loot an Helikopter-Absturzstellen festlegen, Anzahl der Crashes erhöhen und zusätzliche Absturzorte setzen.",
    async render(form) {
      const grp = h("div", { class: "grp" },
        h("h4", {}, "Loot an der Absturzstelle (Wreck_UH1Y)"));
      this.loot = itemList({ numLabel: "Chance %", numDefault: 30, step: "1",
        initial: [["M4A1", 25], ["Mag_STANAG_30Rnd", 60], ["", undefined]] });
      grp.append(this.loot,
        h("p", { class: "hint" }, "Jedes Item erscheint mit seiner eigenen " +
          "Chance unabhängig von den anderen. Ersetzt den bisherigen " +
          "Wreck_UH1Y-Eintrag in cfgspawnabletypes.xml."));
      form.append(grp);
      const counts = h("div", { class: "grp" }, h("h4", {}, "Anzahl gleichzeitiger Heli-Crashes"));
      counts.append(h("div", { class: "row" },
        "nominal:", numInput("hl-nominal", 5),
        "min:", numInput("hl-min", 3), "max:", numInput("hl-max", 7)));
      form.append(counts);
      this.pos = posList({ startEmpty: true });
      form.append(h("div", { class: "grp" },
        h("h4", {}, "Zusätzliche Absturzorte (optional)"),
        h("p", { class: "hint" }, "Werden zu den vorhandenen Vanilla-Positionen hinzugefügt."),
        this.pos));
      // Aktuelle Werte aus events.xml vorbelegen
      try {
        const text = await readOrNull(mission("db/events.xml"));
        if (text) {
          const ev = parseXml(text).querySelector('event[name="StaticHeliCrash"]');
          if (ev) {
            for (const f of ["nominal", "min", "max"]) {
              const el = ev.querySelector(":scope > " + f);
              if (el) $("#hl-" + f).value = el.textContent.trim();
            }
          }
        }
      } catch (err) { /* Vorbelegung optional */ }
    },
    async generate() {
      const loot = this.loot.values();
      if (!loot.length) throw new Error("Bitte mindestens ein Loot-Item angeben.");
      const rows = loot.map((l) => ({ kind: "cargo", item: l.item,
                                      chance: Math.min(1, l.num / 100) }));
      const nominal = num($("#hl-nominal").value, 5);
      const minV = num($("#hl-min").value, 3);
      const maxV = num($("#hl-max").value, 7);
      const positions = this.pos.values();
      const plans = [
        {
          path: mission("cfgspawnabletypes.xml"),
          summary: ["Heli-Crash-Loot: " + loot.map((l) => l.item + " (" + l.num + " %)").join(", ")],
          transform: (current) => {
            const base = current ?? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<spawnabletypes>\n</spawnabletypes>\n';
            return upsertSpawnableType(base, "Wreck_UH1Y", rows);
          },
        },
        {
          path: mission("db/events.xml"),
          summary: ["StaticHeliCrash: nominal " + nominal + ", min " + minV + ", max " + maxV + "."],
          transform: (current) => {
            if (current === null) throw new Error("db/events.xml wurde auf dem Server nicht gefunden.");
            return updateEventCounts(current, "StaticHeliCrash",
              { nominal, min: minV, max: maxV });
          },
        },
      ];
      if (positions.length) {
        plans.push({
          path: mission("cfgeventspawns.xml"),
          summary: [positions.length + " zusätzliche Absturzposition(en)."],
          transform: (current) => {
            if (current === null) throw new Error("cfgeventspawns.xml wurde auf dem Server nicht gefunden.");
            return upsertEventspawns(current, "StaticHeliCrash", positions, "append").text;
          },
        });
      }
      return plans;
    },
  });

  /* ------------------------------------------------ 5. Fahrzeug-Builder */

  const VEHICLES = {
    OffroadHatchback: { label: "ADA 4x4 (Lada)", parts: [
      ["HatchbackWheel", 4], ["HatchbackHood", 1], ["HatchbackTrunk", 1],
      ["HatchbackDoors_Driver", 1], ["HatchbackDoors_CoDriver", 1],
      ["CarBattery", 1], ["SparkPlug", 1], ["CarRadiator", 1], ["HeadlightH7", 2]] },
    Hatchback_02: { label: "Gunter 2 (Golf)", parts: [
      ["Hatchback_02_Wheel", 4], ["Hatchback_02_Hood", 1], ["Hatchback_02_Trunk", 1],
      ["Hatchback_02_Door_1_1", 1], ["Hatchback_02_Door_1_2", 1],
      ["Hatchback_02_Door_2_1", 1], ["Hatchback_02_Door_2_2", 1],
      ["CarBattery", 1], ["SparkPlug", 1], ["CarRadiator", 1], ["HeadlightH7", 2]] },
    CivilianSedan: { label: "Olga 24 (Wolga)", parts: [
      ["CivSedanWheel", 4], ["CivSedanHood", 1], ["CivSedanTrunk", 1],
      ["CivSedanDoors_Driver", 1], ["CivSedanDoors_CoDriver", 1],
      ["CivSedanDoors_BackLeft", 1], ["CivSedanDoors_BackRight", 1],
      ["CarBattery", 1], ["SparkPlug", 1], ["CarRadiator", 1], ["HeadlightH7", 2]] },
    Sedan_02: { label: "Sarka 120 (Skoda)", parts: [
      ["Sedan_02_Wheel", 4], ["Sedan_02_Hood", 1], ["Sedan_02_Trunk", 1],
      ["Sedan_02_Door_1_1", 1], ["Sedan_02_Door_1_2", 1],
      ["Sedan_02_Door_2_1", 1], ["Sedan_02_Door_2_2", 1],
      ["CarBattery", 1], ["SparkPlug", 1], ["CarRadiator", 1], ["HeadlightH7", 2]] },
    Truck_01_Covered: { label: "M3S Truck (V3S)", parts: [
      ["Truck_01_Wheel", 2], ["Truck_01_WheelDouble", 4], ["Truck_01_Hood", 1],
      ["Truck_01_Door_1_1", 1], ["Truck_01_Door_2_1", 1],
      ["TruckBattery", 1], ["GlowPlug", 1], ["HeadlightH7", 2]] },
    Offroad_02: { label: "M1025 Humvee", parts: [
      ["Offroad_02_Wheel", 4], ["Offroad_02_Hood", 1], ["Offroad_02_Trunk", 1],
      ["Offroad_02_Door_1_1", 1], ["Offroad_02_Door_1_2", 1],
      ["Offroad_02_Door_2_1", 1], ["Offroad_02_Door_2_2", 1],
      ["CarBattery", 1], ["GlowPlug", 1], ["HeadlightH7", 2]] },
  };

  registry.push({
    id: "vehicle", icon: "🚗", title: "Fahrzeug-Builder",
    desc: "Fahrzeuge an Wunschpositionen spawnen – auf Wunsch komplett fahrbereit mit allen Teilen.",
    render(form) {
      const sel = h("select", { id: "vh-type" });
      for (const [type, info] of Object.entries(VEHICLES))
        sel.append(h("option", { value: type }, info.label + " – " + type));
      form.append(field("Fahrzeug", sel));
      form.append(h("div", { class: "row" },
        "nominal:", numInput("vh-nominal", 3),
        "min:", numInput("vh-min", 2), "max:", numInput("vh-max", 4)));
      this.pos = posList({ angle: true });
      form.append(h("div", { class: "grp" },
        h("h4", {}, "Spawnpositionen"),
        h("p", { class: "hint" }, "Ersetzt die bisherigen Positionen dieses Fahrzeug-Events."),
        this.pos));
      const fit = h("div", { class: "grp" },
        h("h4", {}, h("label", {},
          h("input", { type: "checkbox", id: "vh-fit", checked: "" }),
          " Komplett fahrbereit spawnen (Teile unten anpassbar)")));
      this.parts = itemList({ numLabel: "Anzahl", numDefault: 1, initial: [] });
      fit.append(this.parts);
      form.append(fit);
      const fillParts = () => {
        const fresh = itemList({ numLabel: "Anzahl", numDefault: 1,
          initial: VEHICLES[sel.value].parts.map(([i, c]) => [i, c]) });
        this.parts.replaceWith(fresh);
        this.parts = fresh;
      };
      sel.addEventListener("change", fillParts);
      fillParts();
    },
    async generate() {
      const type = $("#vh-type").value;
      const eventName = "Vehicle" + type.replace(/_/g, "");
      const positions = this.pos.values();
      if (!positions.length) throw new Error("Bitte mindestens eine Position angeben.");
      const nominal = num($("#vh-nominal").value, 3);
      const minV = num($("#vh-min").value, 2);
      const maxV = num($("#vh-max").value, 4);
      const def = {
        name: eventName, nominal, min: minV, max: maxV,
        lifetime: 300, restock: 0, saferadius: 500, distanceradius: 500,
        cleanupradius: 2500,
        flags: { deletable: 0, init_random: 0, remove_damaged: 1 },
        position: "fixed", limit: "custom", active: 1,
        children: [{ type, min: minV, max: maxV }],
      };
      const plans = [
        {
          path: mission("db/events.xml"),
          summary: ["Event „" + eventName + "“: " + VEHICLES[type].label +
                    ", nominal " + nominal + " (min " + minV + ", max " + maxV + ")."],
          transform: (current) => {
            if (current === null) throw new Error("db/events.xml wurde auf dem Server nicht gefunden.");
            return upsertEvent(current, def);
          },
        },
        {
          path: mission("cfgeventspawns.xml"),
          summary: [positions.length + " Spawnposition(en) für " + eventName + "."],
          transform: (current) => {
            if (current === null) throw new Error("cfgeventspawns.xml wurde auf dem Server nicht gefunden.");
            return upsertEventspawns(current, eventName, positions, "replace").text;
          },
        },
      ];
      if ($("#vh-fit").checked) {
        const rows = [];
        for (const part of this.parts.values()) {
          for (let i = 0; i < Math.max(1, Math.round(part.num)); i++)
            rows.push({ kind: "attachments", item: part.item, chance: 1 });
        }
        if (rows.length) {
          plans.push({
            path: mission("cfgspawnabletypes.xml"),
            summary: [type + " spawnt fahrbereit mit: " +
                      this.parts.values().map((p) => p.num + "× " + p.item).join(", ")],
            transform: (current) => {
              const base = current ?? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<spawnabletypes>\n</spawnabletypes>\n';
              return upsertSpawnableType(base, type, rows);
            },
          });
        }
      }
      return plans;
    },
  });

  /* -------------------------------------- 6. Inhalte & Aufsätze (spawnable) */

  registry.push({
    id: "spawnable", icon: "🎒", title: "Inhalte & Aufsätze",
    desc: "Bestimmen, womit ein Item spawnt: Waffen mit Aufsätzen, Rucksäcke mit Inhalt, Zombies mit Loot in den Taschen. (cfgspawnabletypes.xml)",
    render(form) {
      form.append(field("Ziel (Waffe / Tasche / Zombie / Container)",
        textInput("sp-target", "", "z.B. AKM, ZmbM_SoldierNormal…", "dl-items")));
      const att = h("div", { class: "grp" }, h("h4", {}, "Aufsätze / Anbauteile (attachments)"));
      this.att = itemList({ numLabel: "Chance %", numDefault: 100,
                            initial: [["", undefined]] });
      att.append(this.att);
      form.append(att);
      const cargo = h("div", { class: "grp" }, h("h4", {}, "Inhalt (cargo)"));
      this.cargo = itemList({ numLabel: "Chance %", numDefault: 100,
                              initial: [["", undefined]] });
      cargo.append(this.cargo);
      form.append(cargo);
      form.append(h("p", { class: "hint" },
        "Beispiel Waffe: Ziel AKM, Aufsätze Mag_AKM_30Rnd (100 %), " +
        "PSO1Optic (50 %). Ersetzt den bisherigen Eintrag dieses Typs."));
    },
    async generate() {
      const target = $("#sp-target").value.trim();
      if (!target) throw new Error("Bitte einen Ziel-Typ angeben.");
      const rows = [
        ...this.att.values().map((r) => ({ kind: "attachments", item: r.item,
                                           chance: Math.min(1, r.num / 100) })),
        ...this.cargo.values().map((r) => ({ kind: "cargo", item: r.item,
                                             chance: Math.min(1, r.num / 100) })),
      ];
      if (!rows.length) throw new Error("Bitte mindestens einen Aufsatz oder Inhalt angeben.");
      return [{
        path: mission("cfgspawnabletypes.xml"),
        summary: ["„" + target + "“ spawnt mit: " + rows.map((r) =>
          r.item + " (" + Math.round(r.chance * 100) + " %, " +
          (r.kind === "cargo" ? "Inhalt" : "Aufsatz") + ")").join(", ")],
        transform: (current) => {
          const base = current ?? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<spawnabletypes>\n</spawnabletypes>\n';
          return upsertSpawnableType(base, target, rows);
        },
      }];
    },
  });

  /* ------------------------------------------------ 7. Event-Vorlagen */

  registry.push({
    id: "event", icon: "📅", title: "Event-Vorlagen",
    desc: "Eigene Events komplett konfigurieren oder vorhandene Events anpassen (db/events.xml).",
    async render(form) {
      const loadSel = h("select", { id: "ev-load" },
        h("option", { value: "" }, "– Neues Event –"));
      form.append(field("Vorhandenes Event laden", loadSel));
      form.append(field("Event-Name", textInput("ev-name", "StaticMeinEvent")));
      form.append(h("div", { class: "row" },
        "nominal:", numInput("ev-nominal", 1), "min:", numInput("ev-min", 1),
        "max:", numInput("ev-max", 1)));
      form.append(h("div", { class: "row" },
        "lifetime:", numInput("ev-lifetime", 1800),
        "restock:", numInput("ev-restock", 0)));
      form.append(h("div", { class: "row" },
        "saferadius:", numInput("ev-safe", 500),
        "distanceradius:", numInput("ev-dist", 500),
        "cleanupradius:", numInput("ev-cleanup", 1000)));
      form.append(h("div", { class: "row" },
        h("label", {}, h("input", { type: "checkbox", id: "ev-deletable" }), " deletable"),
        h("label", {}, h("input", { type: "checkbox", id: "ev-initrandom" }), " init_random"),
        h("label", {}, h("input", { type: "checkbox", id: "ev-removedmg", checked: "" }), " remove_damaged"),
        h("label", {}, h("input", { type: "checkbox", id: "ev-active", checked: "" }), " aktiv")));
      form.append(h("div", { class: "row" },
        "position:", h("select", { id: "ev-position" },
          h("option", { value: "fixed" }, "fixed (feste Orte)"),
          h("option", { value: "player" }, "player (nahe Spielern)")),
        "limit:", h("select", { id: "ev-limit" },
          h("option", { value: "custom" }, "custom"),
          h("option", { value: "mixed" }, "mixed"),
          h("option", { value: "child" }, "child"),
          h("option", { value: "parent" }, "parent"))));
      const kids = h("div", { class: "grp" }, h("h4", {}, "Kinder (was spawnt)"));
      this.children = itemList({ numLabel: "max", numDefault: 1,
        placeholder: "Typ, z.B. Wreck_UH1Y oder OffroadHatchback",
        initial: [["", undefined]] });
      kids.append(this.children);
      form.append(kids);
      this.pos = posList({ angle: true, startEmpty: true });
      form.append(h("div", { class: "grp" },
        h("h4", {}, "Feste Positionen (optional, ersetzt vorhandene)"), this.pos));

      // Vorhandene Events zum Laden anbieten
      try {
        const text = await readOrNull(mission("db/events.xml"));
        if (text) {
          this._eventsDoc = parseXml(text);
          this._eventsDoc.querySelectorAll("events > event").forEach((ev) => {
            loadSel.append(h("option", { value: ev.getAttribute("name") },
              ev.getAttribute("name")));
          });
          loadSel.addEventListener("change", () => this.fillFrom(loadSel.value));
        }
      } catch (err) { /* optional */ }
    },
    fillFrom(name) {
      if (!name || !this._eventsDoc) return;
      const ev = this._eventsDoc.querySelector(`event[name="${name}"]`);
      if (!ev) return;
      const get = (f, dflt) => {
        const el = ev.querySelector(":scope > " + f);
        return el ? el.textContent.trim() : dflt;
      };
      $("#ev-name").value = name;
      $("#ev-nominal").value = get("nominal", 1);
      $("#ev-min").value = get("min", 1);
      $("#ev-max").value = get("max", 1);
      $("#ev-lifetime").value = get("lifetime", 1800);
      $("#ev-restock").value = get("restock", 0);
      $("#ev-safe").value = get("saferadius", 500);
      $("#ev-dist").value = get("distanceradius", 500);
      $("#ev-cleanup").value = get("cleanupradius", 1000);
      $("#ev-position").value = get("position", "fixed");
      $("#ev-limit").value = get("limit", "custom");
      $("#ev-active").checked = get("active", "1") === "1";
      const flags = ev.querySelector(":scope > flags");
      if (flags) {
        $("#ev-deletable").checked = flags.getAttribute("deletable") === "1";
        $("#ev-initrandom").checked = flags.getAttribute("init_random") === "1";
        $("#ev-removedmg").checked = flags.getAttribute("remove_damaged") === "1";
      }
      const fresh = itemList({ numLabel: "max", numDefault: 1,
        placeholder: "Typ…",
        initial: Array.from(ev.querySelectorAll(":scope > children > child")).map(
          (c) => [c.getAttribute("type"), Number(c.getAttribute("max")) || 1]) });
      this.children.replaceWith(fresh);
      this.children = fresh;
      toast("Event „" + name + "“ geladen – Werte anpassen und Vorschau öffnen.");
    },
    async generate() {
      const name = $("#ev-name").value.trim();
      if (!name) throw new Error("Bitte einen Event-Namen angeben.");
      const children = this.children.values();
      if (!children.length) throw new Error("Bitte mindestens ein Kind (Spawn-Typ) angeben.");
      const def = {
        name,
        nominal: num($("#ev-nominal").value, 1),
        min: num($("#ev-min").value, 1),
        max: num($("#ev-max").value, 1),
        lifetime: num($("#ev-lifetime").value, 1800),
        restock: num($("#ev-restock").value, 0),
        saferadius: num($("#ev-safe").value, 500),
        distanceradius: num($("#ev-dist").value, 500),
        cleanupradius: num($("#ev-cleanup").value, 1000),
        flags: {
          deletable: $("#ev-deletable").checked ? 1 : 0,
          init_random: $("#ev-initrandom").checked ? 1 : 0,
          remove_damaged: $("#ev-removedmg").checked ? 1 : 0,
        },
        position: $("#ev-position").value,
        limit: $("#ev-limit").value,
        active: $("#ev-active").checked ? 1 : 0,
        children: children.map((c) => ({ type: c.item, min: Math.round(c.num),
                                         max: Math.round(c.num) })),
      };
      const positions = this.pos.values();
      const plans = [{
        path: mission("db/events.xml"),
        summary: ["Event „" + name + "“ (nominal " + def.nominal + ", " +
                  children.map((c) => c.num + "× " + c.item).join(", ") + ")."],
        transform: (current) => {
          if (current === null) throw new Error("db/events.xml wurde auf dem Server nicht gefunden.");
          return upsertEvent(current, def);
        },
      }];
      if (positions.length) {
        plans.push({
          path: mission("cfgeventspawns.xml"),
          summary: [positions.length + " feste Position(en) für „" + name + "“."],
          transform: (current) => {
            if (current === null) throw new Error("cfgeventspawns.xml wurde auf dem Server nicht gefunden.");
            return upsertEventspawns(current, name, positions, "replace").text;
          },
        });
      }
      return plans;
    },
  });

  /* ======================================================== UI-Aufbau */

  let initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;
    const grid = $("#tools-grid");
    for (const tool of registry) {
      grid.append(h("div", { class: "tool-card", onclick: () => openTool(tool) },
        h("span", { class: "tool-icon" }, tool.icon),
        h("div", {}, h("b", {}, tool.title), h("small", {}, tool.desc))));
    }
    $("#btn-tool-back").addEventListener("click", () => {
      $("#tool-panel").classList.add("hidden");
      $("#tools-home").classList.remove("hidden");
      currentTool = null;
    });
    $("#btn-tool-preview").addEventListener("click", () => {
      if (currentTool) showPreview(currentTool);
    });
    $("#btn-preview-cancel").addEventListener("click", () => {
      $("#preview-overlay").classList.add("hidden");
      pendingPlans = null;
    });
    $("#btn-preview-apply").addEventListener("click", () => {
      if (pendingPlans) staged.push(...pendingPlans);
      pendingPlans = null;
      $("#preview-overlay").classList.add("hidden");
      updateStagingBar();
      toast("Änderung vorgemerkt. Unten auf „💾 Speichern“ tippen, um sie hochzuladen.");
    });
    $("#btn-staging-save").addEventListener("click", saveStaged);
    $("#btn-staging-clear").addEventListener("click", () => {
      staged.length = 0;
      updateStagingBar();
    });
    bindPickerButtons();
    ensureDatalists();
  }

  async function openTool(tool) {
    currentTool = tool;
    $("#tools-home").classList.add("hidden");
    $("#tool-panel").classList.remove("hidden");
    $("#tool-title").textContent = tool.icon + " " + tool.title;
    $("#tool-desc").textContent = tool.desc;
    const form = $("#tool-form");
    form.innerHTML = "";
    await ensureDatalists();
    try {
      await tool.render(form);
    } catch (err) {
      toast("Tool konnte nicht geladen werden: " + err.message, "error");
    }
  }

  return { init, registry, _test: { upsertEvent, upsertEventspawns,
                                    upsertSpawnableType, updateEventCounts,
                                    lineDiff } };
})();

window.Tools = Tools;
