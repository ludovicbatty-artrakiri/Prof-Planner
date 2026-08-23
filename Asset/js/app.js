/* =========================================================
   ProfPlanner — stockage local (localStorage)
   Structure prête à être remplacée par des appels Supabase :
   voir supabase-schema.sql pour le schéma équivalent.
   ========================================================= */

const DB_KEY = "profplanner_db_v1";
const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function defaultTimeSlots() {
  return [
    { id: uid(), label: "1", start: "08:00", end: "09:00" },
    { id: uid(), label: "2", start: "09:00", end: "10:00" },
    { id: uid(), label: "3", start: "10:15", end: "11:15" },
    { id: uid(), label: "4", start: "11:15", end: "12:15" },
    { id: uid(), label: "5", start: "13:30", end: "14:30" },
    { id: uid(), label: "6", start: "14:30", end: "15:30" },
    { id: uid(), label: "7", start: "15:45", end: "16:45" },
  ];
}

function seedData() {
  const timeSlots = defaultTimeSlots();
  const classes = [
    { id: "c1", name: "4ème B" },
    { id: "c2", name: "3ème A" },
    { id: "c3", name: "6ème C" },
  ];
  const students = [
    { id: uid(), classId: "c1", name: "Lina Bertrand", notes: "", absences: [] },
    { id: uid(), classId: "c1", name: "Nathan Roche", notes: "Dyslexie — tiers temps", absences: [] },
    { id: uid(), classId: "c2", name: "Yasmine Diallo", notes: "", absences: [] },
  ];
  const courses = [
    { id: uid(), day: 0, time: "10:00", subject: "Maths", classId: "c1", room: "204", objectives: "Chapitre fractions : addition et soustraction" },
    { id: uid(), day: 0, time: "14:00", subject: "Maths", classId: "c2", room: "108", objectives: "Théorème de Pythagore — exercices" },
    { id: uid(), day: 1, time: "09:00", subject: "Maths", classId: "c3", room: "204", objectives: "Introduction aux nombres décimaux" },
    { id: uid(), day: 2, time: "11:00", subject: "Maths", classId: "c1", room: "204", objectives: "Correction du contrôle" },
  ];
  const preparations = [
    { id: uid(), courseId: courses[0].id, title: "Fractions — addition/soustraction", objectives: "Savoir mettre au même dénominateur", documents: "Manuel p.42, fiche d'exercices A3", homework: "Exercices 5 à 9 p.44", notes: "Prévoir rappel sur PGCD en début de séance." },
  ];
  const tasks = [
    { id: uid(), title: "Corriger les copies — contrôle fractions 4ème B", priority: "urgent", classId: "c1" },
    { id: uid(), title: "Préparer le contrôle de 3ème A", priority: "normal", classId: "c2" },
    { id: uid(), title: "Envoyer message aux parents de Nathan R.", priority: "urgent", classId: "c1" },
    { id: uid(), title: "Remplir le bulletin trimestriel", priority: "normal", classId: null },
    { id: uid(), title: "Réserver la salle informatique", priority: "done", classId: null },
  ];
  const evaluations = [
    { id: uid(), classId: "c1", title: "Contrôle fractions", date: nextDate(1), coefficient: 2, grades: {} },
  ];
  return { timeSlots, classes, students, courses, preparations, tasks, evaluations };
}

function nextDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function load() {
  const raw = localStorage.getItem(DB_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (!parsed.timeSlots || parsed.timeSlots.length === 0) {
      parsed.timeSlots = defaultTimeSlots();
      localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }
    return parsed;
  }
  const seeded = seedData();
  localStorage.setItem(DB_KEY, JSON.stringify(seeded));
  return seeded;
}

function save(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

let db = load();
let currentView = "dashboard";

/* ---------------- navigation ---------------- */
document.getElementById("nav").addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-btn");
  if (!btn) return;
  currentView = btn.dataset.view;
  render();
});

function render() {
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === currentView);
  });
  const main = document.getElementById("main");
  main.innerHTML = "";
  const renderers = {
    dashboard: renderDashboard,
    planning: renderPlanning,
    courseList: renderCourseList,
    schedule: renderSchedule,
    prep: renderPrep,
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
      <div class="today">${todayStr()}</div>
    </div>`;
  main.appendChild(head);
}

/* ================= DASHBOARD ================= */
function renderDashboard(main) {
  pageHead(main, "Aujourd'hui", "Tableau de bord");

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
    rowList.innerHTML = `<div class="empty-day">Pas de cours prévu aujourd'hui.</div>`;
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

/* ================= PLANNING ================= */
function renderPlanning(main) {
  pageHead(
    main, "Semaine", "Planning des cours",
    `<button class="btn btn-ghost" id="edit-schedule-btn">Modifier mes horaires</button>
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

  const slots = [...db.timeSlots].sort((a, b) => a.start.localeCompare(b.start));

  if (slots.length === 0) {
    main.appendChild(emptyState(
      "Aucun créneau horaire défini",
      "Va dans « Mes horaires » pour définir tes créneaux (8h-9h, 9h-10h...) avant de placer des cours."
    ));
    return;
  }

  const table = document.createElement("div");
  table.className = "timetable-grid";
  table.style.setProperty("--slot-count", slots.length);

  table.innerHTML += `<div class="tt-corner"></div>`;
  DAYS.forEach((day) => {
    table.innerHTML += `<div class="tt-head">${day}</div>`;
  });

  slots.forEach((slot) => {
    table.innerHTML += `<div class="tt-time"><span class="mono">${slot.start}</span><br><span class="tt-time-label">${slot.label}</span></div>`;
    DAYS.forEach((_, dayIdx) => {
      const coursesHere = db.courses.filter(
        (c) => c.day === dayIdx && c.time >= slot.start && c.time < slot.end
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
            <div class="t">${c.time} · salle ${c.room || "?"}</div>
            <div class="m">${c.subject} — ${className(c.classId)}</div>
            <div class="s">${c.objectives || ""}</div>`;
          card.addEventListener("click", (e) => {
            e.stopPropagation();
            openCourseModal(c);
          });
          cell.appendChild(card);
        });
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
        <div class="task-title">${c.subject} — ${className(c.classId)} <span class="row-sub">· ${DAYS[c.day]} ${c.time}</span></div>
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
        <div class="row-sub">${DAYS[c.day]} · ${c.time} · salle ${c.room || "?"}${c.objectives ? " · " + c.objectives : ""}</div>
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
  intro.textContent = "Définis ici les créneaux horaires de ta journée type (les périodes de cours). Ils servent de trame pour la page Planning — modifie-les à tout moment si ton emploi du temps change.";
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
  const timeOptions = sortedSlots.map((s) => `<option value="${s.start}" ${currentTime === s.start ? "selected" : ""}>${s.start} — ${s.end} (${s.label})</option>`).join("");

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
      <div class="field"><label>Créneau</label><select id="f-time">${timeOptions}</select></div>
    </div>
    <div class="field"><label>Salle</label><input id="f-room" value="${course ? course.room : ""}" placeholder="204"></div>
    <div class="field"><label>Objectifs du cours</label><textarea id="f-objectives">${course ? course.objectives : ""}</textarea></div>
    <div class="modal-actions">
      ${isEdit ? `<button class="btn btn-danger" id="f-delete">Supprimer</button>` : ""}
      <button class="btn btn-ghost" id="f-cancel">Annuler</button>
      <button class="btn btn-primary" id="f-save">Enregistrer</button>
    </div>
  `);

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
  pageHead(main, "Fiches", "Préparation des cours");

  if (db.courses.length === 0) {
    main.appendChild(emptyState("Aucun cours créé", "Ajoute d'abord un cours dans le Planning pour créer sa fiche de préparation."));
    return;
  }

  const list = document.createElement("div");
  list.className = "list-card";
  db.courses.forEach((c, i) => {
    const prep = db.preparations.find((p) => p.courseId === c.id);
    const item = document.createElement("div");
    item.className = "list-header";
    item.style.borderBottom = i === db.courses.length - 1 ? "none" : "1px solid var(--rule)";
    item.innerHTML = `
      <div>
        <div class="row-title">${c.subject} — ${className(c.classId)} <span class="mono" style="font-weight:400;color:var(--ink-soft);font-size:12px;">(${DAYS[c.day]} ${c.time})</span></div>
        <div class="row-sub">${prep ? prep.title : "Pas encore de fiche"}</div>
      </div>
      <button class="btn btn-ghost btn-sm">${prep ? "Ouvrir" : "Créer la fiche"}</button>`;
    item.querySelector("button").addEventListener("click", () => openPrepModal(c, prep));
    list.appendChild(item);
  });
  main.appendChild(list);
}

function openPrepModal(course, prep) {
  openModal(`
    <h2>Fiche — ${course.subject} (${className(course.classId)})</h2>
    <div class="field"><label>Titre</label><input id="f-title" value="${prep ? prep.title : ""}"></div>
    <div class="field"><label>Objectifs</label><textarea id="f-objectives">${prep ? prep.objectives : course.objectives || ""}</textarea></div>
    <div class="field"><label>Documents à utiliser</label><textarea id="f-documents">${prep ? prep.documents : ""}</textarea></div>
    <div class="field"><label>Devoirs à donner</label><textarea id="f-homework">${prep ? prep.homework : ""}</textarea></div>
    <div class="field"><label>Notes personnelles</label><textarea id="f-notes">${prep ? prep.notes : ""}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="f-cancel">Annuler</button>
      <button class="btn btn-primary" id="f-save">Enregistrer</button>
    </div>
  `);
  document.getElementById("f-cancel").onclick = closeModal;
  document.getElementById("f-save").onclick = () => {
    const data = {
      title: document.getElementById("f-title").value || course.subject,
      objectives: document.getElementById("f-objectives").value,
      documents: document.getElementById("f-documents").value,
      homework: document.getElementById("f-homework").value,
      notes: document.getElementById("f-notes").value,
    };
    if (prep) {
      Object.assign(prep, data);
    } else {
      db.preparations.push({ id: uid(), courseId: course.id, ...data });
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
    card.innerHTML = `
      <div class="list-header">
        <h3>${cls.name} <span class="mono" style="font-size:12px;color:var(--ink-soft);font-weight:400;">· ${students.length} élève(s)</span></h3>
        <button class="btn btn-ghost btn-sm" data-add-student="${cls.id}">+ Élève</button>
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
function renderEvals(main) {
  pageHead(main, "Notes", "Suivi des évaluations",
    `<button class="btn btn-primary" id="add-eval-btn">+ Nouvelle évaluation</button>`);
  main.querySelector("#add-eval-btn").addEventListener("click", () => openEvalModal());

  if (db.evaluations.length === 0) {
    main.appendChild(emptyState("Aucune évaluation", "Crée une évaluation pour commencer à saisir des notes."));
    return;
  }

  [...db.evaluations].sort((a, b) => b.date.localeCompare(a.date)).forEach((ev) => {
    const students = db.students.filter((s) => s.classId === ev.classId);
    const notes = students.map((s) => ev.grades[s.id]).filter((n) => n !== undefined && n !== null && n !== "");
    const avg = notes.length ? (notes.reduce((a, b) => a + Number(b), 0) / notes.length).toFixed(2) : "—";

    const card = document.createElement("div");
    card.className = "list-card";
    card.style.marginBottom = "14px";
    card.innerHTML = `
      <div class="list-header">
        <div>
          <h3>${ev.title}</h3>
          <div class="row-sub">${className(ev.classId)} · ${formatDate(ev.date)} · coefficient ${ev.coefficient}</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="text-align:right;"><div class="stat-num" style="font-size:22px;">${avg}</div><div class="stat-label">moyenne / 20</div></div>
          <button class="btn btn-ghost btn-sm" data-edit-eval>Modifier</button>
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
          <div style="flex:1;">${s.name}</div>
          <input type="number" min="0" max="20" step="0.5" class="grade-input" data-student="${s.id}" value="${ev.grades[s.id] ?? ""}">
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
  openModal(`
    <h2>${isEdit ? "Modifier l'évaluation" : "Nouvelle évaluation"}</h2>
    <div class="field"><label>Titre</label><input id="f-title" value="${ev ? ev.title : ""}" placeholder="Contrôle fractions"></div>
    <div class="field"><label>Classe</label><select id="f-class">${classOptions}</select></div>
    <div class="grid grid-2">
      <div class="field"><label>Date</label><input id="f-date" type="date" value="${ev ? ev.date : nextDate(0)}"></div>
      <div class="field"><label>Coefficient</label><input id="f-coef" type="number" min="1" value="${ev ? ev.coefficient : 1}"></div>
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

/* ---------------- init ---------------- */
render();
