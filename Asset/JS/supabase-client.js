/* ============================================================
   ProfPlanner — intégration Supabase (compte + sauvegarde en ligne)
   ============================================================ */

const SUPABASE_URL = "https://whzazzckkywmkmkndvcz.supabase.co";
const SUPABASE_KEY = "sb_publishable_-UHPKeMxM21goNaiBQV_Sw_Ag2Dw0Lm";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------------- authentification ---------------- */

async function cloudGetSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

async function cloudSignUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  // Crée la ligne de profil correspondante (best-effort : ne doit jamais bloquer l'inscription)
  if (data.user) {
    try {
      await sb.from("profiles").upsert({ id: data.user.id, full_name: email.split("@")[0] });
    } catch (e) {
      console.warn("Création du profil différée :", e);
    }
  }
  return data;
}

async function cloudSignIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function cloudSignOut() {
  await sb.auth.signOut();
}

/* ---------------- écran de connexion ---------------- */

function renderAuthScreen(container, onSuccess) {
  container.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="brand" style="color:var(--board);margin-bottom:22px;">
          ProfPlanner
          <small style="color:var(--ink-soft);">carnet de bord — en ligne</small>
        </div>
        <div class="view-toggle" style="margin-bottom:18px;width:100%;">
          <button class="toggle-btn active" id="auth-tab-login" style="flex:1;">Connexion</button>
          <button class="toggle-btn" id="auth-tab-signup" style="flex:1;">Créer un compte</button>
        </div>
        <div class="field"><label>Email</label><input id="auth-email" type="email" placeholder="prof@exemple.fr"></div>
        <div class="field"><label>Mot de passe</label><input id="auth-password" type="password" placeholder="••••••••"></div>
        <div id="auth-error" style="color:var(--accent-red);font-size:12.5px;margin-bottom:10px;display:none;"></div>
        <button class="btn btn-primary" id="auth-submit" style="width:100%;justify-content:center;">Se connecter</button>
        <p style="font-size:11.5px;color:var(--ink-soft);margin-top:16px;">Tes données sont privées : seul ton compte peut y accéder.</p>
      </div>
    </div>`;

  let mode = "login";
  const tabLogin = container.querySelector("#auth-tab-login");
  const tabSignup = container.querySelector("#auth-tab-signup");
  const submitBtn = container.querySelector("#auth-submit");
  const errorBox = container.querySelector("#auth-error");

  function setMode(m) {
    mode = m;
    tabLogin.classList.toggle("active", m === "login");
    tabSignup.classList.toggle("active", m === "signup");
    submitBtn.textContent = m === "login" ? "Se connecter" : "Créer mon compte";
    errorBox.style.display = "none";
    errorBox.style.color = "var(--accent-red)";
  }
  tabLogin.addEventListener("click", () => setMode("login"));
  tabSignup.addEventListener("click", () => setMode("signup"));

  submitBtn.addEventListener("click", async () => {
    const email = container.querySelector("#auth-email").value.trim();
    const password = container.querySelector("#auth-password").value;
    if (!email || !password) {
      errorBox.textContent = "Renseigne un email et un mot de passe.";
      errorBox.style.display = "block";
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "Un instant…";
    try {
      if (mode === "login") {
        await cloudSignIn(email, password);
        onSuccess();
      } else {
        const data = await cloudSignUp(email, password);
        if (data.session) {
          // Confirmation email désactivée côté Supabase → connecté directement
          onSuccess();
        } else {
          // Confirmation email requise → pas encore de session active
          errorBox.style.color = "var(--accent-green)";
          errorBox.textContent = "Compte créé ✓ — vérifie ta boîte mail (et les spams) pour confirmer ton adresse, puis connecte-toi ici.";
          errorBox.style.display = "block";
          submitBtn.disabled = false;
          setMode("login");
          errorBox.style.color = "var(--accent-green)";
          errorBox.style.display = "block";
        }
      }
    } catch (err) {
      errorBox.style.color = "var(--accent-red)";
      errorBox.textContent = translateAuthError(err.message);
      errorBox.style.display = "block";
      submitBtn.disabled = false;
      submitBtn.textContent = mode === "login" ? "Se connecter" : "Créer mon compte";
    }
  });
}

function translateAuthError(msg) {
  if (/invalid login credentials/i.test(msg)) return "Email ou mot de passe incorrect.";
  if (/already registered|already exists/i.test(msg)) return "Un compte existe déjà avec cet email — connecte-toi plutôt.";
  if (/password.*at least/i.test(msg)) return "Le mot de passe doit faire au moins 6 caractères.";
  if (/email.*invalid/i.test(msg)) return "Adresse email invalide.";
  return "Erreur : " + msg;
}

/* ---------------- chargement des données depuis Supabase ---------------- */

async function cloudFetchAllData() {
  const [
    classesRes, studentsRes, absencesRes, slotsRes, coursesRes,
    prepsRes, tasksRes, evalsRes, gradesRes, eventsRes, linksRes, docsRes,
  ] = await Promise.all([
    sb.from("classes").select("*"),
    sb.from("students").select("*"),
    sb.from("absences").select("*"),
    sb.from("time_slots").select("*"),
    sb.from("courses").select("*"),
    sb.from("preparations").select("*"),
    sb.from("tasks").select("*"),
    sb.from("evaluations").select("*"),
    sb.from("grades").select("*"),
    sb.from("events").select("*"),
    sb.from("links").select("*"),
    sb.from("documents").select("*"),
  ]);

  const classes = (classesRes.data || []).map((c) => ({ id: c.id, name: c.name }));

  const absencesRaw = absencesRes.data || [];
  const students = (studentsRes.data || []).map((s) => ({
    id: s.id,
    classId: s.class_id,
    name: s.name,
    notes: s.notes || "",
    absences: absencesRaw
      .filter((a) => a.student_id === s.id)
      .map((a) => ({ id: a.id, date: a.date, motif: a.motif || "" })),
  }));

  const timeSlots = (slotsRes.data || []).map((s) => ({
    id: s.id, label: s.label, start: (s.start_time || "").slice(0, 5), end: (s.end_time || "").slice(0, 5),
  }));

  const courses = (coursesRes.data || []).map((c) => ({
    id: c.id, subject: c.subject, classId: c.class_id, room: c.room || "",
    day: c.day_of_week, time: (c.start_time || "").slice(0, 5),
    endTime: c.end_time ? c.end_time.slice(0, 5) : "",
    week: c.week || "both", objectives: c.objectives || "",
  }));

  const preparations = (prepsRes.data || []).map((p) => ({
    id: p.id, courseId: p.course_id, classId: p.class_id, subject: p.subject || "",
    title: p.title, objectives: p.objectives || "", documents: p.documents || "",
    homework: p.homework || "", notes: p.notes || "",
  }));

  const tasks = (tasksRes.data || []).map((t) => ({
    id: t.id, title: t.title, priority: t.priority, classId: t.class_id,
  }));

  const gradesRaw = gradesRes.data || [];
  const evaluations = (evalsRes.data || []).map((e) => {
    const grades = {};
    gradesRaw.filter((g) => g.evaluation_id === e.id).forEach((g) => {
      grades[g.student_id] = e.mode === "color" ? g.color_category : g.score;
    });
    return {
      id: e.id, classId: e.class_id, title: e.title, date: e.date,
      coefficient: Number(e.coefficient), mode: e.mode || "numeric", grades,
    };
  });

  const events = (eventsRes.data || []).map((ev) => ({
    id: ev.id, type: ev.type, label: ev.label, classId: ev.class_id,
    startDate: ev.start_date, endDate: ev.end_date,
  }));

  const links = (linksRes.data || []).map((l) => ({
    id: l.id, title: l.title, url: l.url, description: l.description || "",
  }));

  const documents = await Promise.all((docsRes.data || []).map(async (d) => {
    let dataUrl = null;
    try {
      const { data: signed } = await sb.storage.from("documents").createSignedUrl(d.storage_path, 3600);
      dataUrl = signed ? signed.signedUrl : null;
    } catch (e) { /* fichier inaccessible, ignoré silencieusement */ }
    return { id: d.id, name: d.name, type: d.type, size: d.size, addedAt: d.added_at, storagePath: d.storage_path, dataUrl };
  }));

  return { timeSlots, classes, students, courses, preparations, tasks, evaluations, events, links, documents };
}

/* ---------------- synchronisation vers Supabase ---------------- */

async function syncSimpleTable(table, rows, mapFn) {
  try {
    const { data: existing } = await sb.from(table).select("id");
    const existingIds = new Set((existing || []).map((r) => r.id));
    const localIds = new Set(rows.map((r) => r.id));
    if (rows.length) {
      const { error } = await sb.from(table).upsert(rows.map(mapFn));
      if (error) console.error("[sync]", table, error.message);
    }
    const toDelete = [...existingIds].filter((id) => !localIds.has(id));
    if (toDelete.length) {
      await sb.from(table).delete().in("id", toDelete);
    }
  } catch (e) {
    console.error("[sync]", table, e);
  }
}

async function cloudSyncAll(db, userId) {
  await Promise.all([
    syncSimpleTable("classes", db.classes, (c) => ({ id: c.id, owner_id: userId, name: c.name })),
    syncSimpleTable("time_slots", db.timeSlots, (s) => ({ id: s.id, owner_id: userId, label: s.label, start_time: s.start, end_time: s.end })),
    syncSimpleTable("tasks", db.tasks, (t) => ({ id: t.id, owner_id: userId, class_id: t.classId || null, title: t.title, priority: t.priority })),
    syncSimpleTable("events", db.events, (e) => ({ id: e.id, owner_id: userId, class_id: e.classId || null, type: e.type, label: e.label, start_date: e.startDate, end_date: e.endDate })),
    syncSimpleTable("links", db.links, (l) => ({ id: l.id, owner_id: userId, title: l.title, url: l.url, description: l.description || null })),
  ]);

  // courses et preparations dépendent des classes déjà synchronisées ci-dessus
  await syncSimpleTable("courses", db.courses, (c) => ({
    id: c.id, owner_id: userId, class_id: c.classId, subject: c.subject, room: c.room || null,
    day_of_week: c.day, start_time: c.time, end_time: c.endTime || null, week: c.week || "both", objectives: c.objectives || null,
  }));
  await syncSimpleTable("preparations", db.preparations, (p) => ({
    id: p.id, owner_id: userId, course_id: p.courseId || null, class_id: p.classId || null, subject: p.subject || null,
    title: p.title, objectives: p.objectives || null, documents: p.documents || null, homework: p.homework || null, notes: p.notes || null,
  }));

  // students dépend des classes
  await syncSimpleTable("students", db.students, (s) => ({ id: s.id, class_id: s.classId, name: s.name, notes: s.notes || null }));

  // absences dépend des students
  const absenceRows = [];
  db.students.forEach((s) => (s.absences || []).forEach((a) => {
    if (!a.id) a.id = uid();
    absenceRows.push({ id: a.id, student_id: s.id, date: a.date, motif: a.motif || null });
  }));
  await syncSimpleTable("absences", absenceRows, (a) => a);

  // evaluations dépend des classes
  await syncSimpleTable("evaluations", db.evaluations, (e) => ({
    id: e.id, class_id: e.classId, title: e.title, date: e.date, coefficient: e.coefficient, mode: e.mode || "numeric",
  }));

  // grades dépend des evaluations + students
  try {
    const gradeRows = [];
    db.evaluations.forEach((e) => {
      Object.entries(e.grades || {}).forEach(([studentId, val]) => {
        if (val === undefined || val === null || val === "") return;
        gradeRows.push({
          evaluation_id: e.id, student_id: studentId,
          score: e.mode === "color" ? null : Number(val),
          color_category: e.mode === "color" ? val : null,
        });
      });
    });
    if (gradeRows.length) {
      const { error } = await sb.from("grades").upsert(gradeRows, { onConflict: "evaluation_id,student_id" });
      if (error) console.error("[sync] grades", error.message);
    }
  } catch (e) {
    console.error("[sync] grades", e);
  }
}

/* ---------------- documents (Supabase Storage) ---------------- */

async function cloudUploadDocument(file, userId) {
  const path = `${userId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await sb.storage.from("documents").upload(path, file);
  if (uploadError) throw uploadError;
  const { data, error } = await sb
    .from("documents")
    .insert({ owner_id: userId, name: file.name, type: file.type || "application/octet-stream", size: file.size, storage_path: path })
    .select()
    .single();
  if (error) throw error;
  const { data: signed } = await sb.storage.from("documents").createSignedUrl(path, 3600);
  return { id: data.id, name: data.name, type: data.type, size: data.size, addedAt: data.added_at, storagePath: path, dataUrl: signed ? signed.signedUrl : null };
}

async function cloudDeleteDocument(doc) {
  await sb.storage.from("documents").remove([doc.storagePath]);
  await sb.from("documents").delete().eq("id", doc.id);
}