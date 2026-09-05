/* =========================================================
   ProfPlanner — synchronisé avec Supabase (voir supabase-client.js)
   ========================================================= */

const DB_KEY = "profplanner_db_v1";
const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function nextDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

let pendingSyncCount = 0;

function save(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  if (currentUser) {
    pendingSyncCount++;
    const status = document.getElementById("sync-status");
    if (status) status.textContent = "Synchronisation…";
    cloudSyncAll(db, currentUser.id)
      .then(() => { if (status) status.textContent = "Connecté · synchronisé en ligne"; })
      .catch((e) => {
        console.error("Sync error:", e);
        if (status) status.textContent = "⚠️ Échec de synchronisation (voir console)";
      })
      .finally(() => { pendingSyncCount--; });
  }
}

// Empêche de fermer/quitter la page tant qu'une sauvegarde en ligne est en cours,
// pour éviter de perdre une modification faite juste avant de fermer.
window.addEventListener("beforeunload", (e) => {
  if (pendingSyncCount > 0) {
    e.preventDefault();
    e.returnValue = "";
  }
});

let db = { timeSlots: [], classes: [], students: [], courses: [], preparations: [], tasks: [], evaluations: [], events: [], links: [], documents: [] };
let currentUser = null;
let currentView = "dashboard";
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth();
let calendarViewMode = "month"; // "month" | "column"

/* ---------------- navigation ---------------- */
const SEEN_KEY = "profplanner_seen_features";
function getSeenFeatures() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY)) || []; } catch { return []; }
}
function markFeatureSeen(view) {
  const seen = getSeenFeatures();
  if (!seen.includes(view)) {
    seen.push(view);
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  }
}

document.getElementById("nav").addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-btn");
  if (!btn || !btn.dataset.view) return;
  currentView = btn.dataset.view;
  markFeatureSeen(currentView);
  document.getElementById("sidebar-menu").classList.remove("open");
  render();
});

document.getElementById("menu-toggle").addEventListener("click", () => {
  document.getElementById("sidebar-menu").classList.toggle("open");
});

function render() {
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === currentView);
    const badge = b.querySelector(".new-badge");
    if (badge && getSeenFeatures().includes(b.dataset.view)) badge.style.display = "none";
  });
  const main = document.getElementById("main");
  main.innerHTML = "";
  const renderers = {
    dashboard: renderDashboard,
    planning: renderPlanning,
    courseList: renderCourseList,
    schedule: renderSchedule,
    calendar: renderCalendar,
    yearOverview: renderYearOverview,
    prep: renderPrep,
    resources: renderResources,
    classes: renderClasses,
    tasks: renderTasks,
    evals: renderEvals,
  };
  renderers[currentView](main);
}

function todayStr() {
  return new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function className(id) {
  const c = db.classes.find((c) => c.id === id);
  return c ? c.name : "—";
}

function pageHead(main, eyebrow, title, actionHtml) {
  const head = document.createElement("div");
  head.className = "page-head";
  head.innerHTML = `
    <div>
      <span class="eyebrow">${eyebrow}</span>
      <h1>${title}</h1>
    </div>
    <div style="display:flex;align-items:flex-end;gap:16px;">
      ${actionHtml || ""}
      <button class="btn btn-ghost btn-sm" onclick="window.print()" title="Imprimer cette page">🖨️ Imprimer</button>
      <div class="today">${todayStr()}</div>
    </div>`;
  main.appendChild(head);
}

/* ================= DASHBOARD ================= */
function renderDashboard(main) {
  pageHead(main, "Aujourd'hui", "Tableau de bord");

  const WHATS_NEW_KEY = "profplanner_whatsnew_dismissed_v1";
  if (!localStorage.getItem(WHATS_NEW_KEY)) {
    const banner = document.createElement("div");
    banner.className = "card";
    banner.style.cssText = "margin-bottom:18px;border-left:4px solid var(--accent-amber);display:flex;justify-content:space-between;align-items:flex-start;gap:16px;";
    banner.innerHTML = `
      <div>
        <h3 style="margin-bottom:8px;">✨ Nouveautés</h3>
        <ul style="margin:0;padding-left:18px;font-size:13.5px;color:var(--ink);line-height:1.7;">
          <li><strong>Mes horaires</strong> — définis tes créneaux (8h-9h, 9h-10h...) qui servent de trame au Planning.</li>
          <li><strong>Modifier mes cours</strong> — une liste complète de tes cours pour les modifier ou les supprimer en un clic.</li>
          <li><strong>Calendrier annuel</strong> — vue mois par mois de l'année, pour noter séquences, vacances et infos importantes ; les jours passés sont rayés automatiquement.</li>
        </ul>
      </div>
      <button class="btn btn-ghost btn-sm" id="dismiss-whatsnew" style="white-space:nowrap;">Compris ✕</button>`;
    main.appendChild(banner);
    banner.querySelector("#dismiss-whatsnew").addEventListener("click", () => {
      localStorage.setItem(WHATS_NEW_KEY, "1");
      banner.remove();
    });
  }

  const todayIdx = [6, 0, 1, 2, 3, 4, 5][new Date().getDay()]; // 0=Mon..4=Fri, weekend->6
  const coursesToday = db.courses.filter((c) => c.day === todayIdx).sort((a, b) => a.time.localeCompare(b.time));
  const urgentTasks = db.tasks.filter((t) => t.priority === "urgent");
  const nextEval = [...db.evaluations].sort((a, b) => a.date.localeCompare(b.date))[0];

  const stats = document.createElement("div");
  stats.className = "grid grid-3";
  stats.style.marginBottom = "18px";
  stats.innerHTML = `
    <div class="card">
      <h3>Cours aujourd'hui</h3>
      <div class="stat-num">${coursesToday.length}</div>
      <div class="stat-label">${coursesToday.map((c) => c.subject).join(", ") || "Aucun cours"}</div>
    </div>
    <div class="card">
      <h3>Tâches urgentes</h3>
      <div class="stat-num">${urgentTasks.length}</div>
      <div class="stat-label">à traiter en priorité</div>
    </div>
    <div class="card">
      <h3>Prochaine évaluation</h3>
      <div class="stat-num" style="font-size:20px;">${nextEval ? nextEval.title : "—"}</div>
      <div class="stat-label">${nextEval ? `${className(nextEval.classId)} · ${formatDate(nextEval.date)}` : "Aucune planifiée"}</div>
    </div>`;
  main.appendChild(stats);

  const grid = document.createElement("div");
  grid.className = "grid grid-2";

  const coursesCard = document.createElement("div");
  coursesCard.className = "card";
  coursesCard.innerHTML = `<h3>Cours du jour</h3>`;
  const rowList = document.createElement("div");
  rowList.className = "row-list";
  if (coursesToday.length === 0) {
    rowList.innerHTML = `<div class="empty-day">Pas de cours prévu aujourd'hui, c'est repos !</div>`;
  } else {
    coursesToday.forEach((c) => {
      rowList.innerHTML += `
        <div class="row-item">
          <div class="row-time mono">${c.time}</div>
          <div class="row-main">
            <div class="row-title">${c.subject} — ${className(c.classId)}</div>
            <div class="row-sub">Salle ${c.room || "?"} · ${c.objectives || "Pas d'objectif renseigné"}</div>
          </div>
        </div>`;
    });
  }
  coursesCard.appendChild(rowList);

  const tasksCard = document.createElement("div");
  tasksCard.className = "card";
  tasksCard.innerHTML = `<h3>Tâches urgentes</h3>`;
  const taskList = document.createElement("div");
  taskList.className = "row-list";
  if (urgentTasks.length === 0) {
    taskList.innerHTML = `<div class="empty-day">Rien d'urgent — bien joué 🎉</div>`;
  } else {
    urgentTasks.forEach((t) => {
      taskList.innerHTML += `
        <div class="row-item">
          <span class="pill pill-urgent">urgent</span>
          <div class="row-main">
            <div class="row-title">${t.title}</div>
            ${t.classId ? `<div class="row-sub">${className(t.classId)}</div>` : ""}
          </div>
        </div>`;
    });
  }
  tasksCard.appendChild(taskList);

  grid.appendChild(coursesCard);
  grid.appendChild(tasksCard);
  main.appendChild(grid);
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function weekBadge(week) {
  if (!week || week === "both") return "";
  return `<span class="pill ${week === "A" ? "pill-info" : "pill-normal"}" style="margin-left:4px;">S${week}</span>`;
}

function courseMatchesWeekFilter(c) {
  if (planningWeekFilter === "both") return true;
  return !c.week || c.week === "both" || c.week === planningWeekFilter;
}

/* ================= PLANNING ================= */
let planningWeekFilter = "both"; // "both" | "A" | "B"

function renderPlanning(main) {
  pageHead(
    main, "Semaine", "Planning des cours",
    `<div class="view-toggle">
       <button class="toggle-btn ${planningWeekFilter === "both" ? "active" : ""}" id="wf-both">Toutes</button>
       <button class="toggle-btn ${planningWeekFilter === "A" ? "active" : ""}" id="wf-a">Semaine A</button>
       <button class="toggle-btn ${planningWeekFilter === "B" ? "active" : ""}" id="wf-b">Semaine B</button>
     </div>
     <button class="btn btn-ghost" id="edit-schedule-btn">Modifier mes horaires</button>
     <button class="btn btn-ghost" id="edit-courses-btn">Modifier mes cours</button>
     <button class="btn btn-primary" id="add-course-btn">+ Ajouter un cours</button>`
  );
  main.querySelector("#add-course-btn").addEventListener("click", () => openCourseModal());
  main.querySelector("#edit-schedule-btn").addEventListener("click", () => {
    currentView = "schedule";
    render();
  });
  main.querySelector("#edit-courses-btn").addEventListener("click", () => {
    currentView = "courseList";
    render();
  });
  main.querySelector("#wf-both").addEventListener("click", () => { planningWeekFilter = "both"; render(); });
  main.querySelector("#wf-a").addEventListener("click", () => { planningWeekFilter = "A"; render(); });
  main.querySelector("#wf-b").addEventListener("click", () => { planningWeekFilter = "B"; render(); });

  const slots = [...db.timeSlots].sort((a, b) => a.start.localeCompare(b.start));

  if (slots.length === 0) {
    main.appendChild(emptyState(
      "Aucun créneau horaire défini",
      "Va dans « Mes horaires » pour définir les créneaux "
    ));
    return;
  }

  const table = document.createElement("div");
  table.className = "timetable-grid";
  table.style.setProperty("--slot-count", slots.length);

  const corner = document.createElement("div");
  corner.className = "tt-corner";
  table.appendChild(corner);

  DAYS.forEach((day) => {
    const head = document.createElement("div");
    head.className = "tt-head";
    head.textContent = day;
    table.appendChild(head);
  });

  slots.forEach((slot) => {
    const timeCell = document.createElement("div");
    timeCell.className = "tt-time";
    timeCell.innerHTML = `<span class="mono tt-start">${slot.start}</span><span class="tt-time-sep">↓</span><span class="mono tt-end">${slot.end}</span><br><span class="tt-time-label">${slot.label}</span>`;
    table.appendChild(timeCell);

    DAYS.forEach((_, dayIdx) => {
      const coursesHere = db.courses.filter(
        (c) => c.day === dayIdx && c.time >= slot.start && c.time < slot.end && courseMatchesWeekFilter(c)
      );
      const cell = document.createElement("div");
      cell.className = "tt-cell" + (coursesHere.length === 0 ? " empty" : "");
      if (coursesHere.length === 0) {
        cell.innerHTML = `<div class="tt-add" title="Ajouter un cours">+</div>`;
        cell.addEventListener("click", () => openCourseModal(null, { day: dayIdx, time: slot.start }));
      } else {
        coursesHere.forEach((c) => {
          const card = document.createElement("div");
          card.className = "course-card";
          card.innerHTML = `
            <div class="m">${c.subject} — ${className(c.classId)} ${weekBadge(c.week)}</div>
            <div class="s">salle ${c.room || "?"}${c.objectives ? " · " + c.objectives : ""}</div>`;
          card.addEventListener("click", (e) => {
            e.stopPropagation();
            openCourseModal(c);
          });
          cell.appendChild(card);
        });
        // clic n'importe où dans la case (pas seulement sur une carte) → ouvre le premier cours
        cell.addEventListener("click", () => openCourseModal(coursesHere[0]));
      }
      table.appendChild(cell);
    });
  });

  main.appendChild(table);

  const orphanCourses = db.courses.filter(
    (c) => !slots.some((slot) => c.time >= slot.start && c.time < slot.end)
  );
  if (orphanCourses.length > 0) {
    const warn = document.createElement("div");
    warn.className = "list-card";
    warn.style.marginTop = "20px";
    warn.style.borderLeft = "4px solid var(--accent-amber)";
    warn.innerHTML = `<div class="list-header"><h3>⚠️ Cours hors créneau (${orphanCourses.length})</h3></div><div class="list-body"></div>`;
    const body = warn.querySelector(".list-body");
    const p = document.createElement("p");
    p.style.cssText = "color:var(--ink-soft);font-size:12.5px;margin:8px 0 10px;";
    p.textContent = "Ces cours ont une heure qui ne correspond à aucun créneau défini dans « Mes horaires », donc ils n'apparaissent pas dans la grille ci-dessus. Modifie-les pour choisir un créneau existant, ou supprime-les.";
    body.appendChild(p);
    orphanCourses.forEach((c) => {
      const row = document.createElement("div");
      row.className = "task-item";
      row.innerHTML = `
        <div class="task-title">${c.subject} — ${className(c.classId)} <span class="row-sub">· ${DAYS[c.day]} ${c.time}${c.endTime ? "–" + c.endTime : ""} ${weekBadge(c.week)}</span></div>
        <button class="btn btn-ghost btn-sm" data-edit>Modifier</button>
        <button class="btn btn-danger btn-sm" data-delete>Supprimer</button>`;
      row.querySelector("[data-edit]").addEventListener("click", () => openCourseModal(c));
      row.querySelector("[data-delete]").addEventListener("click", () => {
        db.courses = db.courses.filter((x) => x.id !== c.id);
        save(db);
        render();
      });
      body.appendChild(row);
    });
    main.appendChild(warn);
  }
}

/* ================= MODIFIER MES COURS (liste) ================= */
function renderCourseList(main) {
  pageHead(
    main, "Liste", "Modifier mes cours",
    `<button class="btn btn-ghost" id="back-to-planning-btn">← Retour au planning</button>
     <button class="btn btn-primary" id="add-course-btn-list">+ Ajouter un cours</button>`
  );
  main.querySelector("#back-to-planning-btn").addEventListener("click", () => {
    currentView = "planning";
    render();
  });
  main.querySelector("#add-course-btn-list").addEventListener("click", () => openCourseModal());

  if (db.courses.length === 0) {
    main.appendChild(emptyState("Aucun cours", "Ajoute ton premier cours pour le voir apparaître ici."));
    return;
  }

  const sorted = [...db.courses].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  const card = document.createElement("div");
  card.className = "list-card";
  const body = document.createElement("div");
  body.className = "list-body";
  body.style.paddingTop = "12px";

  sorted.forEach((c) => {
    const row = document.createElement("div");
    row.className = "task-item";
    row.innerHTML = `
      <div style="flex:1;">
        <div class="task-title">${c.subject} — ${className(c.classId)}</div>
        <div class="row-sub">${DAYS[c.day]} · ${c.time}${c.endTime ? "–" + c.endTime : ""} · salle ${c.room || "?"} ${weekBadge(c.week)}${c.objectives ? " · " + c.objectives : ""}</div>
      </div>
      <button class="btn btn-ghost btn-sm" data-edit>Modifier</button>
      <button class="btn btn-danger btn-sm" data-delete>Supprimer</button>`;
    row.querySelector("[data-edit]").addEventListener("click", () => openCourseModal(c));
    row.querySelector("[data-delete]").addEventListener("click", () => {
      if (confirm(`Supprimer le cours « ${c.subject} — ${className(c.classId)} » (${DAYS[c.day]} ${c.time}) ?`)) {
        db.courses = db.courses.filter((x) => x.id !== c.id);
        save(db);
        render();
      }
    });
    body.appendChild(row);
  });
  card.appendChild(body);
  main.appendChild(card);
}

/* ================= ANNÉE COMPLÈTE (1 page) ================= */
const MONTH_SHORT = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jui", "Aoû", "Sep", "Oct", "Nov", "Déc"];

function renderYearOverview(main) {
  const showWeekAB = localStorage.getItem("profplanner_show_weekab_yo") === "1";
  pageHead(
    main, "Vue globale", "Année complète",
    `<div style="display:flex;align-items:center;gap:8px;">
       <button class="btn btn-ghost btn-sm" id="yo-prev">‹</button>
       <span class="mono" style="font-weight:600;min-width:44px;text-align:center;display:inline-block;">${calendarYear}</span>
       <button class="btn btn-ghost btn-sm" id="yo-next">›</button>
     </div>
     <button class="btn ${showWeekAB ? "btn-primary" : "btn-ghost"} btn-sm" id="toggle-weekab-yo">${showWeekAB ? "✓ Semaines A/B affichées" : "Afficher semaines A/B"}</button>
     <button class="btn btn-primary" id="add-event-btn-yo">+ Ajouter un évènement</button>`
  );
  main.querySelector("#yo-prev").addEventListener("click", () => { calendarYear--; render(); });
  main.querySelector("#yo-next").addEventListener("click", () => { calendarYear++; render(); });
  main.querySelector("#add-event-btn-yo").addEventListener("click", () => openEventModal());
  main.querySelector("#toggle-weekab-yo").addEventListener("click", () => {
    localStorage.setItem("profplanner_show_weekab_yo", showWeekAB ? "0" : "1");
    render();
  });

  const legend = document.createElement("div");
  legend.style.cssText = "display:flex;gap:16px;margin-bottom:14px;flex-wrap:wrap;";
  legend.innerHTML = Object.values(EVENT_TYPES).map((t) => `
    <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-soft);">
      <span style="width:10px;height:10px;border-radius:3px;background:${t.color};display:inline-block;"></span>${t.label}
    </div>`).join("");
  if (showWeekAB) {
    legend.innerHTML += `
      <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-soft);">
        <span style="width:3px;height:12px;background:var(--accent-blue);display:inline-block;"></span> Semaine A
        <span style="width:3px;height:12px;background:var(--accent-amber);display:inline-block;margin-left:6px;"></span> Semaine B
      </div>`;
  }
  main.appendChild(legend);

  main.appendChild(buildYearOverviewGrid(calendarYear, showWeekAB));
}

function buildYearOverviewGrid(year, showWeekAB) {
  const wrap = document.createElement("div");
  wrap.className = "year-overview";

  const today = todayISO();
  const daysInMonthArr = Array.from({ length: 12 }, (_, m) => new Date(year, m + 1, 0).getDate());

  let html = `<div class="yo-cell yo-corner"></div>`;
  MONTH_SHORT.forEach((m) => (html += `<div class="yo-cell yo-month-head">${m}</div>`));

  for (let d = 1; d <= 31; d++) {
    html += `<div class="yo-cell yo-day-label">${d}</div>`;
    for (let m = 0; m < 12; m++) {
      if (d > daysInMonthArr[m]) {
        html += `<div class="yo-cell yo-day yo-invalid"></div>`;
        continue;
      }
      const iso = isoDate(year, m, d);
      const dayEvents = eventsForDate(iso);
      const cls = ["yo-cell", "yo-day"];
      if (iso === today) cls.push("today");
      else if (iso < today) cls.push("past");
      if (showWeekAB) {
        const isMonday = new Date(year, m, d).getDay() === 1;
        const wLabel = isMonday ? weekLabelForDate(iso) : null;
        if (wLabel) cls.push("yo-week-" + wLabel.toLowerCase());
      }
      const tags = dayEvents.slice(0, 3).map((e) =>
        `<span class="yo-tag" style="background:${EVENT_TYPES[e.type].color}" title="${e.label}${e.classId ? " · " + className(e.classId) : ""}"></span>`
      ).join("");
      html += `<div class="${cls.join(" ")}" data-date="${iso}">${tags}</div>`;
    }
  }

  wrap.innerHTML = html;
  wrap.querySelectorAll(".yo-day[data-date]").forEach((cell) => {
    cell.addEventListener("click", () => openDayModal(cell.dataset.date));
  });
  return wrap;
}

/* ================= CALENDRIER ANNUEL ================= */
const EVENT_TYPES = {
  sequence: { label: "Séquence", color: "var(--accent-blue)", pill: "pill-info" },
  vacation: { label: "Vacances", color: "var(--accent-amber)", pill: "pill-normal" },
  note: { label: "Info importante", color: "var(--accent-green)", pill: "pill-done" },
};
const MONTH_NAMES = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const DOW_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

function pad2(n) { return String(n).padStart(2, "0"); }
function isoDate(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }
function todayISO() {
  const t = new Date();
  return isoDate(t.getFullYear(), t.getMonth(), t.getDate());
}
function eventsForDate(iso) {
  return db.events.filter((e) => iso >= e.startDate && iso <= e.endDate);
}

/* ---------- repère Semaine A / B (réglage local, discret sur le calendrier) ---------- */
const WEEK_AB_KEY = "profplanner_weekA_ref";

function getWeekARef() {
  return localStorage.getItem(WEEK_AB_KEY) || "";
}
function setWeekARef(dateStr) {
  if (dateStr) localStorage.setItem(WEEK_AB_KEY, dateStr);
  else localStorage.removeItem(WEEK_AB_KEY);
}
// Renvoie "A", "B" ou null (si aucun repère n'a été configuré) pour la semaine ISO contenant cette date.
function weekLabelForDate(iso) {
  const ref = getWeekARef();
  if (!ref) return null;
  const mondayOf = (d) => {
    const dt = new Date(d + "T00:00:00");
    const dow = (dt.getDay() + 6) % 7; // 0 = lundi
    dt.setDate(dt.getDate() - dow);
    return dt;
  };
  const refMonday = mondayOf(ref);
  const targetMonday = mondayOf(iso);
  const diffWeeks = Math.round((targetMonday - refMonday) / (7 * 86400000));
  return ((diffWeeks % 2) + 2) % 2 === 0 ? "A" : "B";
}

function renderCalendar(main) {
  pageHead(
    main, "Vue d'ensemble", "Calendrier",
    `<div class="view-toggle">
       <button class="toggle-btn ${calendarViewMode === "month" ? "active" : ""}" id="mode-month">Vue mois</button>
       <button class="toggle-btn ${calendarViewMode === "column" ? "active" : ""}" id="mode-column">Vue colonne</button>
     </div>
     <div style="display:flex;align-items:center;gap:8px;">
       <button class="btn btn-ghost btn-sm" id="cal-prev">‹</button>
       <span class="display" style="font-size:16px;min-width:150px;text-align:center;display:inline-block;text-transform:capitalize;">${MONTH_NAMES[calendarMonth]} ${calendarYear}</span>
       <button class="btn btn-ghost btn-sm" id="cal-next">›</button>
     </div>
     <button class="btn btn-primary" id="add-event-btn">+ Ajouter un évènement</button>`
  );
  main.querySelector("#cal-prev").addEventListener("click", () => { shiftMonth(-1); render(); });
  main.querySelector("#cal-next").addEventListener("click", () => { shiftMonth(1); render(); });
  main.querySelector("#add-event-btn").addEventListener("click", () => openEventModal());
  main.querySelector("#mode-month").addEventListener("click", () => { calendarViewMode = "month"; render(); });
  main.querySelector("#mode-column").addEventListener("click", () => { calendarViewMode = "column"; render(); });

  const legend = document.createElement("div");
  legend.style.cssText = "display:flex;gap:16px;margin-bottom:18px;flex-wrap:wrap;";
  legend.innerHTML = Object.values(EVENT_TYPES).map((t) => `
    <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-soft);">
      <span style="width:10px;height:10px;border-radius:3px;background:${t.color};display:inline-block;"></span>${t.label}
    </div>`).join("") + `
    <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-soft);">
      <span class="mono" style="text-decoration:line-through;"></span>
    </div>`;
  main.appendChild(legend);

  if (calendarViewMode === "month") {
    main.appendChild(buildMonthGridSingle(calendarYear, calendarMonth));
  } else {
    main.appendChild(buildMonthColumn(calendarYear, calendarMonth));
  }
}

function shiftMonth(delta) {
  calendarMonth += delta;
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
}

function buildMonthGridSingle(year, monthIdx) {
  const wrap = document.createElement("div");
  wrap.className = "month-card-list month-solo";

  const firstOfMonth = new Date(year, monthIdx, 1);
  const jsFirstDow = firstOfMonth.getDay();
  const leadingBlanks = (jsFirstDow + 6) % 7;
  const totalDays = new Date(year, monthIdx + 1, 0).getDate();
  const today = todayISO();

  let html = `<div class="month-grid-lg">`;
  DOW_LETTERS.forEach((l) => (html += `<div class="dow">${l}</div>`));
  for (let i = 0; i < leadingBlanks; i++) html += `<div class="month-day-lg other-month"></div>`;

  for (let d = 1; d <= totalDays; d++) {
    const iso = isoDate(year, monthIdx, d);
    const dayEvents = eventsForDate(iso);
    const classes = ["month-day-lg"];
    if (iso === today) classes.push("today");
    else if (iso < today) classes.push("past");

    const isMonday = new Date(year, monthIdx, d).getDay() === 1;
    const wLabel = isMonday ? weekLabelForDate(iso) : null;
    const weekTag = wLabel ? `<span class="week-ab-tag week-ab-${wLabel}" title="Semaine ${wLabel}">${wLabel}</span>` : "";

    const visibleTags = dayEvents.slice(0, 3).map((e) => `
      <span class="day-tag-text" style="background:${EVENT_TYPES[e.type].color}" title="${e.label}${e.classId ? " · " + className(e.classId) : ""}">${e.label}</span>`).join("");
    const overflow = dayEvents.length > 3 ? `<span class="day-tag-more">+${dayEvents.length - 3}</span>` : "";

    html += `<div class="${classes.join(" ")}" data-date="${iso}">
      <span class="day-num-lg">${d}</span>${weekTag}
      <div class="day-tags-lg">${visibleTags}${overflow}</div>
    </div>`;
  }
  html += `</div>`;
  wrap.innerHTML = html;

  wrap.querySelectorAll(".month-day-lg[data-date]").forEach((cell) => {
    cell.addEventListener("click", () => openDayModal(cell.dataset.date));
  });
  return wrap;
}

function buildMonthColumn(year, monthIdx) {
  const wrap = document.createElement("div");
  wrap.className = "agenda-list";
  const totalDays = new Date(year, monthIdx + 1, 0).getDate();
  const today = todayISO();
  const WEEKDAY_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

  for (let d = 1; d <= totalDays; d++) {
    const iso = isoDate(year, monthIdx, d);
    const jsDow = new Date(year, monthIdx, d).getDay();
    const dayEvents = eventsForDate(iso);
    const classes = ["agenda-row"];
    if (iso === today) classes.push("today");
    else if (iso < today) classes.push("past");
    if (jsDow === 0 || jsDow === 6) classes.push("weekend");

    const tags = dayEvents.map((e) => `
      <span class="agenda-tag" style="background:${EVENT_TYPES[e.type].color}">${e.label}${e.classId ? " · " + className(e.classId) : ""}</span>`).join("");

    const wLabel = jsDow === 1 ? weekLabelForDate(iso) : null;
    if (wLabel) classes.push("week-start-" + wLabel.toLowerCase());
    const weekTag = wLabel ? `<span class="week-ab-tag week-ab-${wLabel}" title="Semaine ${wLabel}">${wLabel}</span>` : "";

    const row = document.createElement("div");
    row.className = classes.join(" ");
    row.innerHTML = `
      <div class="agenda-date">
        <div class="agenda-day-num">${d}</div>
        <div class="agenda-day-label">${WEEKDAY_NAMES[jsDow]}</div>
        ${weekTag}
      </div>
      <div class="agenda-tags">${tags || `<span class="agenda-empty">—</span>`}</div>`;
    row.addEventListener("click", () => openDayModal(iso));
    wrap.appendChild(row);
  }
  return wrap;
}

function openDayModal(iso) {
  const dayEvents = eventsForDate(iso);
  const dateLabel = new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  let listHtml = "";
  if (dayEvents.length === 0) {
    listHtml = `<div class="empty-day">Rien de noté ce jour-là.</div>`;
  } else {
    listHtml = dayEvents.map((e) => `
      <div class="task-item" data-eid="${e.id}">
        <span class="pill ${EVENT_TYPES[e.type].pill}">${EVENT_TYPES[e.type].label}</span>
        <div class="task-title">${e.label}${e.classId ? ` <span class="row-sub">· ${className(e.classId)}</span>` : ""}
          <div class="row-sub mono">${formatDate(e.startDate)} → ${formatDate(e.endDate)}</div>
        </div>
        <button class="btn btn-ghost btn-sm" data-edit-event="${e.id}">Modifier</button>
      </div>`).join("");
  }

  openModal(`
    <h2 style="text-transform:capitalize;">${dateLabel}</h2>
    <div style="margin:10px 0 16px;">${listHtml}</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="f-cancel">Fermer</button>
      <button class="btn btn-primary" id="f-add">+ Ajouter un évènement ce jour</button>
    </div>`);

  document.getElementById("f-cancel").onclick = closeModal;
  document.getElementById("f-add").onclick = () => openEventModal(null, iso);
  document.querySelectorAll("[data-edit-event]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ev = db.events.find((e) => e.id === btn.dataset.editEvent);
      openEventModal(ev);
    });
  });
}

function openEventModal(event, prefillDate) {
  const isEdit = !!event;
  const classOptions = `<option value="">— (aucune classe précise)</option>` + db.classes.map((c) => `<option value="${c.id}" ${event && event.classId === c.id ? "selected" : ""}>${c.name}</option>`).join("");
  const typeOptions = Object.entries(EVENT_TYPES).map(([key, t]) => `<option value="${key}" ${(event ? event.type : "sequence") === key ? "selected" : ""}>${t.label}</option>`).join("");
  const start = event ? event.startDate : prefillDate || todayISO();
  const end = event ? event.endDate : prefillDate || todayISO();

  openModal(`
    <h2>${isEdit ? "Modifier l'évènement" : "Ajouter un évènement"}</h2>
    <div class="field"><label>Type</label><select id="f-type">${typeOptions}</select></div>
    <div class="field"><label>Nom / description</label><input id="f-label" value="${event ? event.label : ""}" placeholder="Chapitre fractions, Vacances de Noël..."></div>
    <div class="grid grid-2">
      <div class="field"><label>Du</label><input id="f-start" type="date" value="${start}"></div>
      <div class="field"><label>Au</label><input id="f-end" type="date" value="${end}"></div>
    </div>
    <div class="field"><label>Classe concernée (optionnel)</label><select id="f-class">${classOptions}</select></div>
    <div class="modal-actions">
      ${isEdit ? `<button class="btn btn-danger" id="f-delete">Supprimer</button>` : ""}
      <button class="btn btn-ghost" id="f-cancel">Annuler</button>
      <button class="btn btn-primary" id="f-save">Enregistrer</button>
    </div>`);

  document.getElementById("f-cancel").onclick = closeModal;
  if (isEdit) {
    document.getElementById("f-delete").onclick = () => {
      if (!confirm(`Supprimer « ${event.label} » ?`)) return;
      db.events = db.events.filter((e) => e.id !== event.id);
      save(db);
      closeModal();
      render();
    };
  }
  document.getElementById("f-save").onclick = () => {
    const s = document.getElementById("f-start").value;
    const en = document.getElementById("f-end").value;
    if (!s || !en || s > en) {
      alert("La date de fin doit être après (ou égale à) la date de début.");
      return;
    }
    const data = {
      type: document.getElementById("f-type").value,
      label: document.getElementById("f-label").value || "Évènement",
      classId: document.getElementById("f-class").value || null,
      startDate: s,
      endDate: en,
    };
    if (isEdit) {
      Object.assign(event, data);
    } else {
      db.events.push({ id: uid(), ...data });
    }
    save(db);
    closeModal();
    render();
    showToast(`« ${data.label} » enregistré — visible sur les deux pages calendrier.`);
  };
}

/* ================= MES HORAIRES (créneaux) ================= */
function renderSchedule(main) {
  pageHead(main, "Réglages", "Mes horaires",
    `<button class="btn btn-primary" id="add-slot-btn">+ Ajouter un créneau</button>`);
  main.querySelector("#add-slot-btn").addEventListener("click", () => openSlotModal());

  const intro = document.createElement("p");
  intro.style.color = "var(--ink-soft)";
  intro.style.fontSize = "13.5px";
  intro.style.maxWidth = "560px";
  intro.style.marginBottom = "18px";
  intro.textContent = "Indique les horaires de cours";
  main.appendChild(intro);

  const slots = [...db.timeSlots].sort((a, b) => a.start.localeCompare(b.start));
  const card = document.createElement("div");
  card.className = "list-card";
  const body = document.createElement("div");
  body.className = "list-body";
  body.style.paddingTop = "12px";

  if (slots.length === 0) {
    body.innerHTML = `<div class="empty-day">Aucun créneau défini.</div>`;
  } else {
    slots.forEach((slot) => {
      const row = document.createElement("div");
      row.className = "task-item";
      row.innerHTML = `
        <span class="pill pill-info">${slot.label}</span>
        <div class="task-title mono">${slot.start} — ${slot.end}</div>
        <button class="btn btn-ghost btn-sm" data-edit>Modifier</button>`;
      row.querySelector("[data-edit]").addEventListener("click", () => openSlotModal(slot));
      body.appendChild(row);
    });
  }
  card.appendChild(body);
  main.appendChild(card);

  const weekCard = document.createElement("div");
  weekCard.className = "list-card";
  weekCard.style.marginTop = "16px";
  const currentRef = getWeekARef();
  weekCard.innerHTML = `
    <div class="list-header"><h3>Repère semaine A / B</h3></div>
    <div class="list-body" style="padding-top:12px;">
      <p style="color:var(--ink-soft);font-size:12.5px;margin-bottom:12px;max-width:520px;">
        Indique un lundi que tu sais être une <strong>semaine A</strong>. Le calendrier annuel affichera alors
        un petit repère discret sur chaque semaine pour savoir si c'est A ou B, sans rien avoir à recalculer.
        Laisse vide pour ne rien afficher.
      </p>
      <div class="field" style="max-width:220px;">
        <label>Un lundi de semaine A</label>
        <input type="date" id="f-weekA-ref" value="${currentRef}">
      </div>
      <div style="display:flex;gap:8px;margin-top:4px;">
        <button class="btn btn-primary btn-sm" id="save-weekA-ref">Enregistrer</button>
        ${currentRef ? `<button class="btn btn-ghost btn-sm" id="clear-weekA-ref">Retirer le repère</button>` : ""}
      </div>
    </div>`;
  main.appendChild(weekCard);
  weekCard.querySelector("#save-weekA-ref").addEventListener("click", () => {
    const val = weekCard.querySelector("#f-weekA-ref").value;
    if (!val) { alert("Choisis une date."); return; }
    setWeekARef(val);
    showToast("Repère semaine A enregistré.");
    render();
  });
  const clearBtn = weekCard.querySelector("#clear-weekA-ref");
  if (clearBtn) clearBtn.addEventListener("click", () => {
    setWeekARef(null);
    render();
  });
}

function openSlotModal(slot) {
  const isEdit = !!slot;
  openModal(`
    <h2>${isEdit ? "Modifier le créneau" : "Nouveau créneau"}</h2>
    <div class="field"><label>Nom du créneau</label><input id="f-label" value="${slot ? slot.label : ""}" placeholder="Ex : 1, Matin, P3..."></div>
    <div class="grid grid-2">
      <div class="field"><label>Début</label><input id="f-start" type="time" value="${slot ? slot.start : "08:00"}"></div>
      <div class="field"><label>Fin</label><input id="f-end" type="time" value="${slot ? slot.end : "09:00"}"></div>
    </div>
    <div class="modal-actions">
      ${isEdit ? `<button class="btn btn-danger" id="f-delete">Supprimer</button>` : ""}
      <button class="btn btn-ghost" id="f-cancel">Annuler</button>
      <button class="btn btn-primary" id="f-save">Enregistrer</button>
    </div>`);
  document.getElementById("f-cancel").onclick = closeModal;
  if (isEdit) {
    document.getElementById("f-delete").onclick = () => {
      db.timeSlots = db.timeSlots.filter((s) => s.id !== slot.id);
      save(db);
      closeModal();
      render();
    };
  }
  document.getElementById("f-save").onclick = () => {
    const start = document.getElementById("f-start").value;
    const end = document.getElementById("f-end").value;
    if (!start || !end || start >= end) {
      alert("L'heure de fin doit être après l'heure de début.");
      return;
    }
    const data = {
      label: document.getElementById("f-label").value || start,
      start,
      end,
    };
    if (isEdit) {
      Object.assign(slot, data);
    } else {
      db.timeSlots.push({ id: uid(), ...data });
    }
    save(db);
    closeModal();
    render();
  };
}

function openCourseModal(course, prefill) {
  const isEdit = !!course;
  const classOptions = db.classes.map((c) => `<option value="${c.id}" ${course && course.classId === c.id ? "selected" : ""}>${c.name}</option>`).join("");
  const dayOptions = DAYS.map((d, i) => `<option value="${i}" ${(course ? course.day : prefill && prefill.day) === i ? "selected" : ""}>${d}</option>`).join("");
  const sortedSlots = [...db.timeSlots].sort((a, b) => a.start.localeCompare(b.start));
  const currentTime = course ? course.time : (prefill && prefill.time);
  const timeOptions = sortedSlots.map((s) => `<option value="${s.start}" data-end="${s.end}" ${currentTime === s.start ? "selected" : ""}>${s.start} — ${s.end} (${s.label})</option>`).join("");
  const matchedSlot = sortedSlots.find((s) => s.start === currentTime) || sortedSlots[0];
  const endTimeValue = course ? (course.endTime || matchedSlot.end) : matchedSlot.end;
  const weekValue = course ? (course.week || "both") : (prefill && prefill.week) || "both";

  if (sortedSlots.length === 0) {
    openModal(`
      <h2>Aucun créneau défini</h2>
      <p style="color:var(--ink-soft);font-size:13.5px;">Va d'abord dans « Mes horaires » pour créer au moins un créneau (ex : 8h-9h) avant de pouvoir ajouter un cours.</p>
      <div class="modal-actions"><button class="btn btn-primary" id="f-cancel">Fermer</button></div>`);
    document.getElementById("f-cancel").onclick = closeModal;
    return;
  }

  openModal(`
    <h2>${isEdit ? "Modifier le cours" : "Ajouter un cours"}</h2>
    <div class="field"><label>Matière</label><input id="f-subject" value="${course ? course.subject : ""}" placeholder="Maths"></div>
    <div class="field"><label>Classe</label><select id="f-class">${classOptions}</select></div>
    <div class="grid grid-2">
      <div class="field"><label>Jour</label><select id="f-day">${dayOptions}</select></div>
      <div class="field"><label>Créneau (début)</label><select id="f-time">${timeOptions}</select></div>
    </div>
    <div class="grid grid-2">
      <div class="field"><label>Heure de fin</label><input id="f-endtime" type="time" value="${endTimeValue}"></div>
      <div class="field"><label>Semaine</label>
        <select id="f-week">
          <option value="both" ${weekValue === "both" ? "selected" : ""}>Toutes les semaines</option>
          <option value="A" ${weekValue === "A" ? "selected" : ""}>Semaine A</option>
          <option value="B" ${weekValue === "B" ? "selected" : ""}>Semaine B</option>
        </select>
      </div>
    </div>
    <div class="field"><label>Salle</label><input id="f-room" value="${course ? course.room : ""}" placeholder="204"></div>
    <div class="field"><label>Objectifs du cours</label><textarea id="f-objectives">${course ? course.objectives : ""}</textarea></div>
    <div class="modal-actions">
      ${isEdit ? `<button class="btn btn-danger" id="f-delete">Supprimer</button>` : ""}
      <button class="btn btn-ghost" id="f-cancel">Annuler</button>
      <button class="btn btn-primary" id="f-save">Enregistrer</button>
    </div>
  `);

  document.getElementById("f-time").addEventListener("change", (e) => {
    const end = e.target.selectedOptions[0].dataset.end;
    if (end) document.getElementById("f-endtime").value = end;
  });

  document.getElementById("f-cancel").onclick = closeModal;
  if (isEdit) {
    document.getElementById("f-delete").onclick = () => {
      if (!confirm(`Supprimer le cours « ${course.subject} » ?`)) return;
      db.courses = db.courses.filter((c) => c.id !== course.id);
      save(db);
      closeModal();
      render();
    };
  }
  document.getElementById("f-save").onclick = () => {
    const data = {
      subject: document.getElementById("f-subject").value || "Matière",
      classId: document.getElementById("f-class").value,
      day: Number(document.getElementById("f-day").value),
      time: document.getElementById("f-time").value,
      endTime: document.getElementById("f-endtime").value,
      week: document.getElementById("f-week").value,
      room: document.getElementById("f-room").value,
      objectives: document.getElementById("f-objectives").value,
    };
    if (isEdit) {
      Object.assign(course, data);
    } else {
      db.courses.push({ id: uid(), ...data });
    }
    save(db);
    closeModal();
    render();
  };
}

/* ================= PRÉPARATIONS ================= */
function renderPrep(main) {
  pageHead(main, "Fiches", "Préparation des cours",
    `<button class="btn btn-primary" id="add-prep-btn">+ Ajouter une préparation</button>`);
  main.querySelector("#add-prep-btn").addEventListener("click", () => openPrepModal());

  if (db.preparations.length === 0) {
    main.appendChild(emptyState("Aucune fiche de préparation", "Clique sur « + Ajouter une préparation » pour créer ou depuis le planning "));
    return;
  }

  const list = document.createElement("div");
  list.className = "list-card";
  db.preparations.forEach((p, i) => {
    const linkedCourse = p.courseId ? db.courses.find((c) => c.id === p.courseId) : null;
    const subject = linkedCourse ? linkedCourse.subject : p.subject;
    const classId = linkedCourse ? linkedCourse.classId : p.classId;
    const item = document.createElement("div");
    item.className = "list-header";
    item.style.borderBottom = i === db.preparations.length - 1 ? "none" : "1px solid var(--rule)";
    item.innerHTML = `
      <div>
        <div class="row-title">${p.title}</div>
        <div class="row-sub">${[subject, classId ? className(classId) : null].filter(Boolean).join(" · ") || "Aucune matière/classe renseignée"}</div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-ghost btn-sm" data-edit>Ouvrir</button>
        <button class="btn btn-danger btn-sm" data-delete>Supprimer</button>
      </div>`;
    item.querySelector("[data-edit]").addEventListener("click", () => openPrepModal(p));
    item.querySelector("[data-delete]").addEventListener("click", () => {
      if (!confirm(`Supprimer la fiche « ${p.title} » ?`)) return;
      db.preparations = db.preparations.filter((x) => x.id !== p.id);
      save(db);
      render();
    });
    list.appendChild(item);
  });
  main.appendChild(list);
}

function openPrepModal(prep) {
  const isEdit = !!prep;
  const classOptions = `<option value="">— (aucune)</option>` + db.classes.map((c) => `<option value="${c.id}" ${prep && prep.classId === c.id ? "selected" : ""}>${c.name}</option>`).join("");
  openModal(`
    <h2>${isEdit ? "Modifier la fiche" : "Nouvelle fiche de préparation"}</h2>
    <div class="field"><label>Titre</label><input id="f-title" value="${prep ? prep.title : ""}" placeholder="Chapitre fractions — séance 1"></div>
    <div class="grid grid-2">
      <div class="field"><label>Matière</label><input id="f-subject" value="${prep ? prep.subject || "" : ""}" placeholder="Maths"></div>
      <div class="field"><label>Classe (optionnel)</label><select id="f-class">${classOptions}</select></div>
    </div>
    <div class="field"><label>Objectifs</label><textarea id="f-objectives">${prep ? prep.objectives || "" : ""}</textarea></div>
    <div class="field"><label>Documents à utiliser</label><textarea id="f-documents">${prep ? prep.documents || "" : ""}</textarea></div>
    <div class="field"><label>Devoirs à donner</label><textarea id="f-homework">${prep ? prep.homework || "" : ""}</textarea></div>
    <div class="field"><label>Notes personnelles</label><textarea id="f-notes">${prep ? prep.notes || "" : ""}</textarea></div>
    <div class="modal-actions">
      ${isEdit ? `<button class="btn btn-danger" id="f-delete">Supprimer</button>` : ""}
      <button class="btn btn-ghost" id="f-cancel">Annuler</button>
      <button class="btn btn-primary" id="f-save">Enregistrer</button>
    </div>
  `);
  document.getElementById("f-cancel").onclick = closeModal;
  if (isEdit) {
    document.getElementById("f-delete").onclick = () => {
      if (!confirm(`Supprimer la fiche « ${prep.title} » ?`)) return;
      db.preparations = db.preparations.filter((p) => p.id !== prep.id);
      save(db);
      closeModal();
      render();
    };
  }
  document.getElementById("f-save").onclick = () => {
    const data = {
      title: document.getElementById("f-title").value || "Fiche sans titre",
      subject: document.getElementById("f-subject").value,
      classId: document.getElementById("f-class").value || null,
      objectives: document.getElementById("f-objectives").value,
      documents: document.getElementById("f-documents").value,
      homework: document.getElementById("f-homework").value,
      notes: document.getElementById("f-notes").value,
    };
    if (isEdit) {
      Object.assign(prep, data);
    } else {
      db.preparations.push({ id: uid(), courseId: null, ...data });
    }
    save(db);
    closeModal();
    render();
  };
}

/* ================= LIENS & DOCUMENTS ================= */
function renderResources(main) {
  pageHead(main, "Ressources", "Liens & documents utiles");

  /* --- Liens --- */
  const linksCard = document.createElement("div");
  linksCard.className = "list-card";
  linksCard.style.marginBottom = "20px";
  linksCard.innerHTML = `
    <div class="list-header">
      <h3>🔗 Liens utiles</h3>
      <button class="btn btn-primary btn-sm" id="add-link-btn">+ Ajouter un lien</button>
    </div>
    <div class="list-body" id="links-body" style="padding-top:10px;"></div>`;
  main.appendChild(linksCard);
  linksCard.querySelector("#add-link-btn").addEventListener("click", () => openLinkModal());

  const linksBody = linksCard.querySelector("#links-body");
  if (db.links.length === 0) {
    linksBody.innerHTML = `<div class="empty-day">Aucun lien enregistré.</div>`;
  } else {
    db.links.forEach((l) => {
      const row = document.createElement("div");
      row.className = "task-item";
      row.innerHTML = `
        <div style="flex:1;">
          <a href="${l.url}" target="_blank" rel="noopener" class="row-title" style="color:var(--accent-blue);text-decoration:none;">${l.title} ↗</a>
          ${l.description ? `<div class="row-sub">${l.description}</div>` : ""}
        </div>
        <button class="btn btn-ghost btn-sm" data-edit>Modifier</button>`;
      row.querySelector("[data-edit]").addEventListener("click", () => openLinkModal(l));
      linksBody.appendChild(row);
    });
  }

  /* --- Documents --- */
  const docsCard = document.createElement("div");
  docsCard.className = "list-card";
  docsCard.innerHTML = `
    <div class="list-header">
      <h3>📎 Documents</h3>
      <label class="btn btn-primary btn-sm" style="cursor:pointer;">
        + Importer un document
        <input type="file" id="doc-input" style="display:none;">
      </label>
    </div>
    <div class="list-body" id="docs-body" style="padding-top:10px;"></div>`;
  main.appendChild(docsCard);

  const note = document.createElement("p");
  note.style.cssText = "color:var(--ink-soft);font-size:12px;margin:8px 0 0;";
  note.textContent = "Les documents sont stockés en ligne, dans ton espace privé (jusqu'à 50 Mo par fichier).";
  docsCard.appendChild(note);

  docsCard.querySelector("#doc-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      alert("Ce fichier dépasse 50 Mo, c'est trop volumineux.");
      e.target.value = "";
      return;
    }
    showToast(`Envoi de « ${file.name} »…`);
    try {
      const doc = await cloudUploadDocument(file, currentUser.id);
      db.documents.push(doc);
      localStorage.setItem(DB_KEY, JSON.stringify(db));
      render();
      showToast(`« ${file.name} » importé.`);
    } catch (err) {
      console.error(err);
      alert("Échec de l'envoi du document : " + (err.message || err));
    }
  });

  const docsBody = docsCard.querySelector("#docs-body");
  if (db.documents.length === 0) {
    docsBody.innerHTML = `<div class="empty-day">Aucun document importé.</div>`;
  } else {
    db.documents.forEach((d) => {
      const row = document.createElement("div");
      row.className = "task-item";
      row.innerHTML = `
        <div style="flex:1;">
          <div class="row-title">${d.name}</div>
          <div class="row-sub mono">${(d.size / 1024).toFixed(0)} Ko · ajouté le ${formatDate(d.addedAt)}</div>
        </div>
        <a class="btn btn-ghost btn-sm" href="${d.dataUrl}" target="_blank" rel="noopener" download="${d.name}">Télécharger</a>
        <button class="btn btn-danger btn-sm" data-delete>Supprimer</button>`;
      row.querySelector("[data-delete]").addEventListener("click", async () => {
        if (!confirm(`Supprimer « ${d.name} » ?`)) return;
        try {
          await cloudDeleteDocument(d);
          db.documents = db.documents.filter((x) => x.id !== d.id);
          localStorage.setItem(DB_KEY, JSON.stringify(db));
          render();
        } catch (err) {
          alert("Échec de la suppression : " + (err.message || err));
        }
      });
      docsBody.appendChild(row);
    });
  }
}

function openLinkModal(link) {
  const isEdit = !!link;
  openModal(`
    <h2>${isEdit ? "Modifier le lien" : "Nouveau lien"}</h2>
    <div class="field"><label>Titre</label><input id="f-title" value="${link ? link.title : ""}" placeholder="Éduscol, Pronote, banque d'exercices..."></div>
    <div class="field"><label>URL</label><input id="f-url" value="${link ? link.url : ""}" placeholder="https://..."></div>
    <div class="field"><label>Description (optionnel)</label><textarea id="f-description">${link ? link.description || "" : ""}</textarea></div>
    <div class="modal-actions">
      ${isEdit ? `<button class="btn btn-danger" id="f-delete">Supprimer</button>` : ""}
      <button class="btn btn-ghost" id="f-cancel">Annuler</button>
      <button class="btn btn-primary" id="f-save">Enregistrer</button>
    </div>`);
  document.getElementById("f-cancel").onclick = closeModal;
  if (isEdit) {
    document.getElementById("f-delete").onclick = () => {
      db.links = db.links.filter((l) => l.id !== link.id);
      save(db);
      closeModal();
      render();
    };
  }
  document.getElementById("f-save").onclick = () => {
    let url = document.getElementById("f-url").value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const data = {
      title: document.getElementById("f-title").value || url,
      url,
      description: document.getElementById("f-description").value,
    };
    if (isEdit) {
      Object.assign(link, data);
    } else {
      db.links.push({ id: uid(), ...data });
    }
    save(db);
    closeModal();
    render();
  };
}

/* ================= CLASSES ================= */
function renderClasses(main) {
  pageHead(main, "Élèves", "Gestion des classes",
    `<button class="btn btn-primary" id="add-class-btn">+ Nouvelle classe</button>`);
  main.querySelector("#add-class-btn").addEventListener("click", () => openClassModal());

  db.classes.forEach((cls) => {
    const students = db.students.filter((s) => s.classId === cls.id);
    const card = document.createElement("div");
    card.className = "list-card";
    card.style.marginBottom = "14px";
    card.dataset.classCard = cls.id;
    card.innerHTML = `
      <div class="list-header">
        <h3>${cls.name} <span class="mono" style="font-size:12px;color:var(--ink-soft);font-weight:400;">· ${students.length} élève(s)</span></h3>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-ghost btn-sm" data-print-class="${cls.id}">🖨️ Imprimer cette classe</button>
          <button class="btn btn-ghost btn-sm" data-add-student="${cls.id}">+ Élève</button>
          <button class="btn btn-danger btn-sm" data-delete-class="${cls.id}">Supprimer la classe</button>
        </div>
      </div>
      <div class="list-body"></div>`;
    const body = card.querySelector(".list-body");
    if (students.length === 0) {
      body.innerHTML = `<div class="empty-day">Aucun élève dans cette classe.</div>`;
    } else {
      students.forEach((s) => {
        const row = document.createElement("div");
        row.className = "student-item";
        row.innerHTML = `
          <div style="flex:1;">
            <div class="row-title">${s.name}</div>
            ${s.notes ? `<div class="row-sub">${s.notes}</div>` : ""}
            ${s.absences.length ? `<div class="row-sub">Absences : ${s.absences.length}</div>` : ""}
          </div>
          <button class="btn btn-ghost btn-sm" data-edit-student="${s.id}">Modifier</button>`;
        row.querySelector("button").addEventListener("click", () => openStudentModal(cls, s));
        body.appendChild(row);
      });
    }
    card.querySelector("[data-add-student]").addEventListener("click", () => openStudentModal(cls));
    card.querySelector("[data-print-class]").addEventListener("click", () => {
      printSingleElement(card);
    });
    card.querySelector("[data-delete-class]").addEventListener("click", () => {
      const nbStudents = db.students.filter((s) => s.classId === cls.id).length;
      const msg = nbStudents > 0
        ? `Supprimer « ${cls.name} » et ses ${nbStudents} élève(s) ? Cette action est irréversible.`
        : `Supprimer la classe « ${cls.name} » ?`;
      if (!confirm(msg)) return;
      db.classes = db.classes.filter((c) => c.id !== cls.id);
      db.students = db.students.filter((s) => s.classId !== cls.id);
      save(db);
      render();
    });
    main.appendChild(card);
  });

  if (db.classes.length === 0) {
    main.appendChild(emptyState("Aucune classe", "Crée ta première classe pour commencer."));
  }
}

function openClassModal() {
  openModal(`
    <h2>Nouvelle classe</h2>
    <div class="field"><label>Nom de la classe</label><input id="f-name" placeholder="4ème B"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="f-cancel">Annuler</button>
      <button class="btn btn-primary" id="f-save">Créer</button>
    </div>`);
  document.getElementById("f-cancel").onclick = closeModal;
  document.getElementById("f-save").onclick = () => {
    const name = document.getElementById("f-name").value.trim();
    if (!name) return;
    db.classes.push({ id: uid(), name });
    save(db);
    closeModal();
    render();
  };
}

function openStudentModal(cls, student) {
  const isEdit = !!student;
  openModal(`
    <h2>${isEdit ? "Modifier l'élève" : "Ajouter un élève"} — ${cls.name}</h2>
    <div class="field"><label>Nom complet</label><input id="f-name" value="${student ? student.name : ""}"></div>
    <div class="field"><label>Informations importantes</label><textarea id="f-notes">${student ? student.notes : ""}</textarea></div>
    <div class="field"><label>Absences (une par ligne)</label><textarea id="f-absences">${student ? student.absences.map((a) => a.date + (a.motif ? " — " + a.motif : "")).join("\n") : ""}</textarea></div>
    <div class="modal-actions">
      ${isEdit ? `<button class="btn btn-danger" id="f-delete">Retirer de la classe</button>` : ""}
      <button class="btn btn-ghost" id="f-cancel">Annuler</button>
      <button class="btn btn-primary" id="f-save">Enregistrer</button>
    </div>`);
  document.getElementById("f-cancel").onclick = closeModal;
  if (isEdit) {
    document.getElementById("f-delete").onclick = () => {
      db.students = db.students.filter((s) => s.id !== student.id);
      save(db);
      closeModal();
      render();
    };
  }
  document.getElementById("f-save").onclick = () => {
    const name = document.getElementById("f-name").value.trim();
    if (!name) return;
    const absences = document.getElementById("f-absences").value.split("\n").filter(Boolean).map((line) => {
      const [date, ...rest] = line.split("—");
      return { date: date.trim(), motif: rest.join("—").trim() };
    });
    const notes = document.getElementById("f-notes").value;
    if (isEdit) {
      Object.assign(student, { name, notes, absences });
    } else {
      db.students.push({ id: uid(), classId: cls.id, name, notes, absences });
    }
    save(db);
    closeModal();
    render();
  };
}

/* ================= TÂCHES ================= */
const PRIORITY_LABEL = { urgent: "🔴 urgent", normal: "🟠 normal", done: "🟢 terminé" };

function renderTasks(main) {
  pageHead(main, "To-do", "Liste des tâches",
    `<button class="btn btn-primary" id="add-task-btn">+ Ajouter une tâche</button>`);
  main.querySelector("#add-task-btn").addEventListener("click", () => openTaskModal());

  const order = { urgent: 0, normal: 1, done: 2 };
  const sorted = [...db.tasks].sort((a, b) => order[a.priority] - order[b.priority]);

  const card = document.createElement("div");
  card.className = "list-card";
  const body = document.createElement("div");
  body.className = "list-body";
  body.style.paddingTop = "12px";

  if (sorted.length === 0) {
    body.innerHTML = `<div class="empty-day">Aucune tâche. Profite du calme.</div>`;
  } else {
    sorted.forEach((t) => {
      const row = document.createElement("div");
      row.className = "task-item";
      row.innerHTML = `
        <span class="pill ${t.priority === "urgent" ? "pill-urgent" : t.priority === "done" ? "pill-done" : "pill-normal"}">${PRIORITY_LABEL[t.priority]}</span>
        <div class="task-title ${t.priority === "done" ? "done" : ""}">${t.title}${t.classId ? ` <span class="row-sub">· ${className(t.classId)}</span>` : ""}</div>
        <button class="btn btn-ghost btn-sm" data-edit>Modifier</button>`;
      row.querySelector("[data-edit]").addEventListener("click", () => openTaskModal(t));
      body.appendChild(row);
    });
  }
  card.appendChild(body);
  main.appendChild(card);
}

function openTaskModal(task) {
  const isEdit = !!task;
  const classOptions = `<option value="">—</option>` + db.classes.map((c) => `<option value="${c.id}" ${task && task.classId === c.id ? "selected" : ""}>${c.name}</option>`).join("");
  openModal(`
    <h2>${isEdit ? "Modifier la tâche" : "Nouvelle tâche"}</h2>
    <div class="field"><label>Description</label><input id="f-title" value="${task ? task.title : ""}" placeholder="Corriger les copies..."></div>
    <div class="field"><label>Priorité</label>
      <select id="f-priority">
        <option value="urgent" ${task && task.priority === "urgent" ? "selected" : ""}>🔴 Urgent</option>
        <option value="normal" ${!task || task.priority === "normal" ? "selected" : ""}>🟠 Normal</option>
        <option value="done" ${task && task.priority === "done" ? "selected" : ""}>🟢 Terminé</option>
      </select>
    </div>
    <div class="field"><label>Classe liée (optionnel)</label><select id="f-class">${classOptions}</select></div>
    <div class="modal-actions">
      ${isEdit ? `<button class="btn btn-danger" id="f-delete">Supprimer</button>` : ""}
      <button class="btn btn-ghost" id="f-cancel">Annuler</button>
      <button class="btn btn-primary" id="f-save">Enregistrer</button>
    </div>`);
  document.getElementById("f-cancel").onclick = closeModal;
  if (isEdit) {
    document.getElementById("f-delete").onclick = () => {
      db.tasks = db.tasks.filter((t) => t.id !== task.id);
      save(db);
      closeModal();
      render();
    };
  }
  document.getElementById("f-save").onclick = () => {
    const title = document.getElementById("f-title").value.trim();
    if (!title) return;
    const data = {
      title,
      priority: document.getElementById("f-priority").value,
      classId: document.getElementById("f-class").value || null,
    };
    if (isEdit) {
      Object.assign(task, data);
    } else {
      db.tasks.push({ id: uid(), ...data });
    }
    save(db);
    closeModal();
    render();
  };
}

/* ================= ÉVALUATIONS ================= */
function gradeColorClass(score) {
  if (score === undefined || score === null || score === "") return "";
  const n = Number(score);
  if (n >= 16) return "grade-excellent";
  if (n >= 14) return "grade-bien";
  if (n >= 10) return "grade-passable";
  return "grade-insuffisant";
}

const GRADE_CATEGORIES = ["excellent", "bien", "passable", "insuffisant"];
const GRADE_CATEGORY_LABELS = { excellent: "Excellent", bien: "Bien", passable: "Passable", insuffisant: "Insuffisant" };

function renderEvals(main) {
  pageHead(main, "Notes", "Suivi des évaluations",
    `<button class="btn btn-primary" id="add-eval-btn">+ Nouvelle évaluation</button>`);
  main.querySelector("#add-eval-btn").addEventListener("click", () => openEvalModal());

  if (db.evaluations.length === 0) {
    main.appendChild(emptyState("Aucune évaluation", "Crée une évaluation pour commencer à saisir des notes."));
    return;
  }

  const legend = document.createElement("div");
  legend.style.cssText = "display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;font-size:12px;color:var(--ink-soft);";
  legend.innerHTML = `
    <span><span class="grade-dot grade-excellent"></span> ≥16 / Excellent</span>
    <span><span class="grade-dot grade-bien"></span> ≥14 / Bien</span>
    <span><span class="grade-dot grade-passable"></span> ≥10 / Passable</span>
    <span><span class="grade-dot grade-insuffisant"></span> &lt;10 / Insuffisant</span>`;
  main.appendChild(legend);

  [...db.evaluations].sort((a, b) => b.date.localeCompare(a.date)).forEach((ev) => {
    const isColorMode = ev.mode === "color";
    const students = db.students.filter((s) => s.classId === ev.classId);

    let summaryHtml;
    if (isColorMode) {
      const counts = { excellent: 0, bien: 0, passable: 0, insuffisant: 0 };
      students.forEach((s) => { if (ev.grades[s.id]) counts[ev.grades[s.id]]++; });
      summaryHtml = `<div class="color-dist">${GRADE_CATEGORIES.map((cat) =>
        `<span class="grade-dot grade-${cat}"></span>${counts[cat]}`).join(" &nbsp; ")}</div><div class="stat-label">répartition</div>`;
    } else {
      const notes = students.map((s) => ev.grades[s.id]).filter((n) => n !== undefined && n !== null && n !== "");
      const avg = notes.length ? (notes.reduce((a, b) => a + Number(b), 0) / notes.length).toFixed(2) : "—";
      const avgClass = notes.length ? gradeColorClass(avg) : "";
      summaryHtml = `<div class="stat-num ${avgClass}" style="font-size:22px;">${avg}</div><div class="stat-label">moyenne / 20</div>`;
    }

    const card = document.createElement("div");
    card.className = "list-card";
    card.style.marginBottom = "14px";
    card.innerHTML = `
      <div class="list-header">
        <div>
          <h3>${ev.title} ${isColorMode ? '<span class="pill pill-info">Couleurs</span>' : ""}</h3>
          <div class="row-sub">${className(ev.classId)} · ${formatDate(ev.date)} · coefficient ${ev.coefficient}</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="text-align:right;">${summaryHtml}</div>
          <button class="btn btn-ghost btn-sm" data-edit-eval>Modifier</button>
        </div>
      </div>
      <div class="list-body"></div>`;
    const body = card.querySelector(".list-body");
    if (students.length === 0) {
      body.innerHTML = `<div class="empty-day">Aucun élève dans cette classe.</div>`;
    } else if (isColorMode) {
      students.forEach((s) => {
        const current = ev.grades[s.id];
        const row = document.createElement("div");
        row.className = "student-item";
        row.innerHTML = `
          <div style="flex:1;">${s.name}</div>
          <div class="color-grade-picker">
            ${GRADE_CATEGORIES.map((cat) =>
              `<button class="swatch grade-${cat} ${current === cat ? "selected" : ""}" data-value="${cat}" title="${GRADE_CATEGORY_LABELS[cat]}"></button>`
            ).join("")}
          </div>`;
        row.querySelectorAll(".swatch").forEach((btn) => {
          btn.addEventListener("click", () => {
            const val = btn.dataset.value;
            ev.grades[s.id] = ev.grades[s.id] === val ? undefined : val;
            save(db);
            render();
          });
        });
        body.appendChild(row);
      });
    } else {
      students.forEach((s) => {
        const row = document.createElement("div");
        row.className = "student-item";
        row.innerHTML = `
          <div style="flex:1;">${s.name}</div>
          <input type="number" min="0" max="20" step="0.5" class="grade-input ${gradeColorClass(ev.grades[s.id])}" data-student="${s.id}" value="${ev.grades[s.id] ?? ""}">
        `;
        row.querySelector("input").addEventListener("change", (e) => {
          const val = e.target.value;
          ev.grades[s.id] = val === "" ? undefined : Number(val);
          save(db);
          render();
        });
        body.appendChild(row);
      });
    }
    card.querySelector("[data-edit-eval]").addEventListener("click", () => openEvalModal(ev));
    main.appendChild(card);
  });
}

function openEvalModal(ev) {
  const isEdit = !!ev;
  const classOptions = db.classes.map((c) => `<option value="${c.id}" ${ev && ev.classId === c.id ? "selected" : ""}>${c.name}</option>`).join("");
  const modeValue = ev ? (ev.mode || "numeric") : "numeric";
  openModal(`
    <h2>${isEdit ? "Modifier l'évaluation" : "Nouvelle évaluation"}</h2>
    <div class="field"><label>Titre</label><input id="f-title" value="${ev ? ev.title : ""}" placeholder="Contrôle fractions"></div>
    <div class="field"><label>Classe</label><select id="f-class">${classOptions}</select></div>
    <div class="grid grid-2">
      <div class="field"><label>Date</label><input id="f-date" type="date" value="${ev ? ev.date : nextDate(0)}"></div>
      <div class="field"><label>Coefficient</label><input id="f-coef" type="number" min="1" value="${ev ? ev.coefficient : 1}"></div>
    </div>
    <div class="field">
      <label>Mode de notation</label>
      <select id="f-mode">
        <option value="numeric" ${modeValue === "numeric" ? "selected" : ""}>Notes chiffrées (/20)</option>
        <option value="color" ${modeValue === "color" ? "selected" : ""}>Couleurs uniquement (sans chiffres)</option>
      </select>
    </div>
    <div class="modal-actions">
      ${isEdit ? `<button class="btn btn-danger" id="f-delete">Supprimer</button>` : ""}
      <button class="btn btn-ghost" id="f-cancel">Annuler</button>
      <button class="btn btn-primary" id="f-save">Enregistrer</button>
    </div>`);
  document.getElementById("f-cancel").onclick = closeModal;
  if (isEdit) {
    document.getElementById("f-delete").onclick = () => {
      db.evaluations = db.evaluations.filter((e) => e.id !== ev.id);
      save(db);
      closeModal();
      render();
    };
  }
  document.getElementById("f-save").onclick = () => {
    const data = {
      title: document.getElementById("f-title").value || "Évaluation",
      classId: document.getElementById("f-class").value,
      date: document.getElementById("f-date").value,
      coefficient: Number(document.getElementById("f-coef").value) || 1,
      mode: document.getElementById("f-mode").value,
    };
    if (isEdit) {
      Object.assign(ev, data);
    } else {
      db.evaluations.push({ id: uid(), grades: {}, ...data });
    }
    save(db);
    closeModal();
    render();
  };
}

/* ================= UI helpers ================= */
function emptyState(title, sub) {
  const div = document.createElement("div");
  div.className = "empty-state";
  div.innerHTML = `<div class="display">${title}</div><div>${sub}</div>`;
  return div;
}

function openModal(innerHtml) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `<div class="overlay"><div class="modal">${innerHtml}</div></div>`;
  root.querySelector(".overlay").addEventListener("click", (e) => {
    if (e.target.classList.contains("overlay")) closeModal();
  });
}
function closeModal() {
  document.getElementById("modal-root").innerHTML = "";
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

function printSingleElement(el) {
  el.classList.add("print-only");
  document.body.classList.add("printing-single");
  const cleanup = () => {
    el.classList.remove("print-only");
    document.body.classList.remove("printing-single");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

/* ---------------- init & authentification ---------------- */

function showAppRoot() {
  document.getElementById("auth-root").innerHTML = "";
  document.getElementById("app-root").style.display = "grid";
}

function showAuthRoot() {
  document.getElementById("app-root").style.display = "none";
  renderAuthScreen(document.getElementById("auth-root"), onAuthSuccess);
}

async function onAuthSuccess() {
  let session = await cloudGetSession();
  if (!session) {
    // Petit délai de propagation possible juste après une inscription → on retente une fois
    await new Promise((r) => setTimeout(r, 700));
    session = await cloudGetSession();
  }
  if (!session) {
    showAuthRoot();
    showToast("Connexion pas encore établie — réessaie de te connecter.");
    return;
  }
  currentUser = session.user;
  try {
    await sb.from("profiles").upsert({ id: currentUser.id, full_name: currentUser.email.split("@")[0] });
  } catch (e) {
    console.warn("Création du profil différée :", e);
  }
  showAppRoot();
  await loadFromCloudAndRender();
}

async function loadFromCloudAndRender() {
  document.getElementById("main").innerHTML = `<div class="empty-state"><div class="display">Chargement de tes données…</div></div>`;
  try {
    db = await cloudFetchAllData();
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    console.error("Erreur de chargement:", e);
    document.getElementById("main").innerHTML = `<div class="empty-state"><div class="display">Impossible de charger tes données</div>${e.message || ""}</div>`;
    return;
  }
  render();
}

document.getElementById("logout-btn").addEventListener("click", async () => {
  await cloudSignOut();
  currentUser = null;
  showAuthRoot();
});

/* ---------------- installation de l'application (PWA) ---------------- */
let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  showToast("ProfPlanner est installé 🎉");
});

document.getElementById("install-btn").addEventListener("click", async () => {
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (isStandalone) {
    showToast("L'application est déjà installée sur cet appareil.");
    return;
  }
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (outcome !== "accepted") showToast("Installation annulée.");
    return;
  }
  // Pas d'invite native disponible (Safari / iOS / navigateur non compatible) → instructions manuelles
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  let steps;
  if (isIOS) {
    steps = `
      <ol style="padding-left:20px;line-height:1.9;">
        <li>Appuie sur l'icône <strong>Partager</strong> (le carré avec une flèche vers le haut) en bas de Safari.</li>
        <li>Fais défiler et choisis <strong>« Sur l'écran d'accueil »</strong>.</li>
        <li>Confirme en appuyant sur <strong>« Ajouter »</strong> en haut à droite.</li>
      </ol>`;
  } else if (isSafari) {
    steps = `<p>Dans la barre de menu, va dans <strong>Fichier → Ajouter au Dock</strong> (macOS Sonoma ou plus récent).</p>`;
  } else {
    steps = `
      <p>Cherche l'icône d'installation dans la barre d'adresse de ton navigateur (souvent un écran avec une flèche ⊕), ou :</p>
      <ol style="padding-left:20px;line-height:1.9;">
        <li>Ouvre le menu du navigateur (⋮ ou ☰).</li>
        <li>Choisis <strong>« Installer ProfPlanner »</strong> ou <strong>« Ajouter à l'écran d'accueil »</strong>.</li>
      </ol>`;
  }
  openModal(`
    <h2>Installer ProfPlanner</h2>
    ${steps}
    <div class="modal-actions"><button class="btn btn-primary" id="f-cancel">Compris</button></div>`);
  document.getElementById("f-cancel").onclick = closeModal;
});

async function bootstrap() {
  const session = await cloudGetSession();
  if (session) {
    currentUser = session.user;
    showAppRoot();
    await loadFromCloudAndRender();
  } else {
    showAuthRoot();
  }
}

bootstrap();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}