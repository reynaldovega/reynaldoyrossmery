const adminLogin = document.querySelector("[data-admin-login]");
const adminPanel = document.querySelector("[data-admin-panel]");
const loginForm = document.querySelector("[data-login-form]");
const adminStatus = document.querySelector("[data-admin-status]");
const tableBody = document.querySelector("[data-confirmations-body]");
const countNode = document.querySelector("[data-confirmation-count]");
let confirmations = [];

function isMissingAttendanceColumn(error) {
  const text = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  return text.includes("attendance_confirmed");
}

function getAdminDb() {
  const config = window.WEDDING_SUPABASE;
  const isConfigured = config?.url && config?.anonKey && !config.url.includes("PEGA_AQUI") && !config.anonKey.includes("PEGA_AQUI");

  if (!isConfigured || !window.supabase) {
    adminStatus.textContent = "Falta conectar Supabase en supabase-config.js.";
    return null;
  }

  return window.supabase.createClient(config.url, config.anonKey);
}

const adminDb = getAdminDb();

function setAdminView(isLoggedIn) {
  adminLogin.hidden = isLoggedIn;
  adminPanel.hidden = !isLoggedIn;
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function renderRows() {
  countNode.textContent = confirmations.length;

  if (!confirmations.length) {
    tableBody.innerHTML = '<tr><td colspan="9">Todavia no hay confirmaciones.</td></tr>';
    return;
  }

  tableBody.innerHTML = confirmations.map((row) => `
    <tr>
      <td>${formatDate(row.created_at)}</td>
      <td>${escapeHtml(row.first_name || "")}</td>
      <td>${escapeHtml(row.last_name || "")}</td>
      <td>${escapeHtml(row.email || "")}</td>
      <td>${row.attendance_confirmed === false ? "No" : "Si"}</td>
      <td>${row.has_companion ? "Si" : "No"}</td>
      <td>${escapeHtml(row.companion_name || "")}</td>
      <td>${escapeHtml(row.dietary_restrictions || "")}</td>
      <td>${escapeHtml(row.comments || "")}</td>
    </tr>
  `).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

async function loadConfirmations() {
  if (!adminDb) {
    return;
  }

  let { data, error } = await adminDb
    .from("rsvp_confirmations")
    .select("created_at, first_name, last_name, email, attendance_confirmed, has_companion, companion_name, dietary_restrictions, comments")
    .order("created_at", { ascending: false });

  if (error && isMissingAttendanceColumn(error)) {
    const fallback = await adminDb
      .from("rsvp_confirmations")
      .select("created_at, first_name, last_name, email, has_companion, companion_name, dietary_restrictions, comments")
      .order("created_at", { ascending: false });
    data = fallback.data;
    error = fallback.error;
    if (!error) {
      adminStatus.textContent = "Data cargada. Falta agregar la columna attendance_confirmed en Supabase.";
    }
  }

  if (error) {
    adminStatus.textContent = `No se pudo cargar la data: ${error.message}`;
    return;
  }

  confirmations = (data || []).map((row) => ({
    attendance_confirmed: true,
    ...row,
  }));
  renderRows();
}

function downloadCsv() {
  const headers = ["Fecha", "Nombre", "Apellido", "Correo", "Confirma asistencia", "Viene con pareja", "Acompanante", "Restriccion alimentaria", "Comentarios"];
  const rows = confirmations.map((row) => [
    formatDate(row.created_at),
    row.first_name,
    row.last_name,
    row.email,
    row.attendance_confirmed === false ? "No" : "Si",
    row.has_companion ? "Si" : "No",
    row.companion_name || "",
    row.dietary_restrictions || "",
    row.comments || "",
  ]);
  const csv = [headers, ...rows]
    .map((line) => line.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `confirmaciones-boda-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!adminDb) {
    return;
  }

  const formData = new FormData(loginForm);
  adminStatus.textContent = "Ingresando...";
  const { error } = await adminDb.auth.signInWithPassword({
    email: String(formData.get("email") || "").trim(),
    password: String(formData.get("password") || ""),
  });

  if (error) {
    adminStatus.textContent = "No se pudo ingresar. Revisa correo y contrasena.";
    return;
  }

  adminStatus.textContent = "";
  setAdminView(true);
  await loadConfirmations();
});

document.querySelector("[data-refresh-confirmations]")?.addEventListener("click", loadConfirmations);
document.querySelector("[data-download-csv]")?.addEventListener("click", downloadCsv);
document.querySelector("[data-admin-logout]")?.addEventListener("click", async () => {
  await adminDb?.auth.signOut();
  confirmations = [];
  renderRows();
  setAdminView(false);
});

(async () => {
  if (!adminDb) {
    setAdminView(false);
    return;
  }

  const { data } = await adminDb.auth.getSession();
  const isLoggedIn = Boolean(data.session);
  setAdminView(isLoggedIn);
  if (isLoggedIn) {
    await loadConfirmations();
  }
})();
