const API = "/api";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let currentUser = null;
let tickets = [];
let activeTicket = null;
let toastTimer;

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Something went wrong. Please try again.");
  return payload;
}
function showMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.remove("hidden", "error");
  if (isError) element.classList.add("error");
}
function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.add("hidden"), 3500);
}
function safeClass(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function setAuthTab(tab) {
  $$(".tab").forEach(button => button.classList.toggle("active", button.dataset.authTab === tab));
  $("#login-form").classList.toggle("hidden", tab !== "login");
  $("#register-form").classList.toggle("hidden", tab !== "register");
  $("#auth-message").classList.add("hidden");
}
async function initialize() {
  try {
    const result = await api("/auth/me");
    currentUser = result.user;
    showApp();
    await loadDashboard();
  } catch {
    showAuth();
  }
}
function showAuth() {
  $("#auth-view").classList.remove("hidden");
  $("#app-view").classList.add("hidden");
  $("#logout-btn").classList.add("hidden");
  $("#session-label").textContent = "";
}
function showApp() {
  $("#auth-view").classList.add("hidden");
  $("#app-view").classList.remove("hidden");
  $("#logout-btn").classList.remove("hidden");
  $("#session-label").textContent = `${currentUser.name} · ${currentUser.role}`;
  $("#welcome-title").textContent = currentUser.role === "customer" ? `Hello, ${currentUser.name.split(" ")[0]}` : "Support workspace";
  $("#welcome-subtitle").textContent = currentUser.role === "customer" ? "Here is the latest progress on your support requests." : "Review requests and help customers get to a resolution.";
  $("#new-ticket-btn").classList.toggle("hidden", false);
}
async function loadDashboard() {
  $("#ticket-list").innerHTML = '<div class="empty-state"><p>Loading tickets…</p></div>';
  try {
    const [ticketData, statsData] = await Promise.all([api("/tickets"), api("/tickets/stats")]);
    tickets = ticketData.tickets;
    renderStats(statsData.stats);
    renderTickets();
  } catch (error) {
    $("#ticket-list").innerHTML = `<div class="empty-state"><h3>Could not load tickets</h3><p>${escapeHTML(error.message)}</p><button class="button button-primary" id="retry-btn">Try again</button></div>`;
    $("#retry-btn").addEventListener("click", loadDashboard);
  }
}
function renderStats(stats) {
  const items = [
    ["Total tickets", stats.total, "All requests"],
    ["Open", stats.open, "Need attention"],
    ["In progress", stats.inProgress, "Being worked on"],
    ["Resolved", stats.resolved, "Successfully resolved"]
  ];
  $("#stats").innerHTML = items.map((item, index) => `<div class="stat-card"><div class="stat-label"><span class="stat-dot" style="background:${["#4f46e5","#e9a23b","#7866e8","#0f9f91"][index]}"></span>${item[0]}</div><div class="stat-value">${item[1]}</div><div class="muted">${item[2]}</div></div>`).join("");
}
function renderTickets() {
  const query = $("#search-input").value.trim().toLowerCase();
  const status = $("#status-filter").value;
  const priority = $("#priority-filter").value;
  const filtered = tickets.filter(ticket => {
    const haystack = `${ticket.ticket_number} ${ticket.subject} ${ticket.description} ${ticket.customer?.name || ""}`.toLowerCase();
    return (!query || haystack.includes(query)) && (!status || ticket.status === status) && (!priority || ticket.priority === priority);
  });
  if (!filtered.length) {
    $("#ticket-list").innerHTML = `<div class="empty-state"><h3>${tickets.length ? "No matching tickets" : "Your support desk is ready"}</h3><p>${tickets.length ? "Try changing your search or filters." : "Create a ticket to start a conversation with support."}</p>${tickets.length ? "" : '<button class="button button-primary" id="empty-new-btn">＋ Create a ticket</button>'}</div>`;
    $("#empty-new-btn")?.addEventListener("click", () => $("#ticket-dialog").showModal());
    return;
  }
  $("#ticket-list").innerHTML = filtered.map(ticket => `<article class="ticket-card">
    <div><div class="ticket-meta"><span class="ticket-id">${escapeHTML(ticket.ticket_number)}</span><span class="pill status-${safeClass(ticket.status)}">${escapeHTML(ticket.status)}</span><span class="pill priority-${safeClass(ticket.priority)}">${escapeHTML(ticket.priority)} priority</span></div>
    <h3 class="ticket-title">${escapeHTML(ticket.subject)}</h3><p class="ticket-description">${escapeHTML(ticket.description.slice(0, 180))}${ticket.description.length > 180 ? "…" : ""}</p>
    <p class="muted">${escapeHTML(ticket.category)} · Updated ${escapeHTML(formatDate(ticket.updated_at))}${currentUser.role !== "customer" ? ` · ${escapeHTML(ticket.customer?.name || "Customer")}` : ""}</p></div>
    <div class="ticket-side"><span class="muted">Created ${escapeHTML(formatDate(ticket.created_at))}</span><button class="text-button" data-open-ticket="${escapeHTML(ticket.id)}">View details →</button></div>
  </article>`).join("");
  $$("[data-open-ticket]").forEach(button => button.addEventListener("click", () => openTicket(button.dataset.openTicket)));
}
async function openTicket(id) {
  try {
    const result = await api(`/tickets/${encodeURIComponent(id)}`);
    activeTicket = result.ticket;
    renderTicketDetail(activeTicket);
    $("#detail-dialog").showModal();
  } catch (error) { toast(error.message); }
}
function renderTicketDetail(ticket) {
  const canManage = ["agent", "admin"].includes(currentUser.role);
  const canAssign = currentUser.role === "admin";
  const comments = ticket.comments || [];
  $("#detail-content").innerHTML = `
    <div class="detail-head"><div><div class="ticket-meta"><span class="ticket-id">${escapeHTML(ticket.ticket_number)}</span><span class="pill status-${safeClass(ticket.status)}">${escapeHTML(ticket.status)}</span><span class="pill priority-${safeClass(ticket.priority)}">${escapeHTML(ticket.priority)}</span></div><h2>${escapeHTML(ticket.subject)}</h2><p class="muted">${escapeHTML(ticket.category)} · Created ${escapeHTML(formatDate(ticket.created_at))}</p></div><button type="button" class="icon-button" data-close="detail-dialog" aria-label="Close">×</button></div>
    <div class="detail-grid"><div class="detail-field"><small>Submitted by</small><strong>${escapeHTML(ticket.customer?.name || "Customer")}</strong></div><div class="detail-field"><small>Assigned agent</small><strong>${escapeHTML(ticket.assignee?.name || "Unassigned")}</strong></div><div class="detail-field"><small>Last updated</small><strong>${escapeHTML(formatDate(ticket.updated_at))}</strong></div></div>
    <h3>Description</h3><p class="detail-description">${escapeHTML(ticket.description)}</p>
    ${canManage ? `<div class="detail-section"><h3>Manage ticket</h3><div class="detail-actions"><label>Status<select id="detail-status">${["Open","In Progress","Waiting on Customer","Resolved","Closed"].map(s=>`<option ${ticket.status===s?"selected":""}>${s}</option>`).join("")}</select></label><label>Priority<select id="detail-priority">${["Low","Medium","High","Urgent"].map(s=>`<option ${ticket.priority===s?"selected":""}>${s}</option>`).join("")}</select></label>${canAssign ? `<label>Assign agent<select id="detail-assignee"><option value="">Unassigned</option>${(ticket.agents||[]).map(a=>`<option value="${escapeHTML(a.id)}" ${ticket.assignee_id===a.id?"selected":""}>${escapeHTML(a.name)} (${escapeHTML(a.email)})</option>`).join("")}</select></label>` : ""}<button id="save-ticket-btn" class="button button-primary">Save changes</button></div></div>` : ""}
    <div class="detail-section"><h3>Conversation (${comments.length})</h3><div class="comment-list">${comments.length ? comments.map(comment=>`<div class="comment"><div class="comment-top"><span>${escapeHTML(comment.author?.name || "User")}</span><span class="muted">${escapeHTML(formatDate(comment.created_at))}</span></div><p>${escapeHTML(comment.message)}</p></div>`).join("") : '<p class="muted">No replies yet. Add a message to keep the conversation moving.</p>'}</div>
    <form id="comment-form" class="form-stack"><label>Add a reply<textarea name="message" required minlength="1" maxlength="3000" rows="3" placeholder="Write a helpful message…"></textarea></label><button class="button button-primary" type="submit">Send reply</button><p id="comment-message" class="notice hidden" role="status"></p></form></div>`;
  $$("[data-close]", $("#detail-content")).forEach(button => button.addEventListener("click", () => $("#detail-dialog").close()));
  $("#comment-form").addEventListener("submit", submitComment);
  $("#save-ticket-btn")?.addEventListener("click", saveTicketChanges);
}
async function submitComment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await api(`/tickets/${encodeURIComponent(activeTicket.id)}/comments`, { method: "POST", body: JSON.stringify({ message: new FormData(form).get("message") }) });
    await openTicket(activeTicket.id);
    await loadDashboard();
    toast("Reply added.");
  } catch (error) { showMessage($("#comment-message"), error.message, true); }
  finally { button.disabled = false; }
}
async function saveTicketChanges() {
  const body = { status: $("#detail-status").value, priority: $("#detail-priority").value };
  if ($("#detail-assignee")) body.assigneeId = $("#detail-assignee").value || null;
  try {
    await api(`/tickets/${encodeURIComponent(activeTicket.id)}`, { method: "PATCH", body: JSON.stringify(body) });
    await openTicket(activeTicket.id);
    await loadDashboard();
    toast("Ticket updated.");
  } catch (error) { toast(error.message); }
}
$("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const form = new FormData(event.currentTarget);
    const result = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
    currentUser = result.user; showApp(); await loadDashboard();
  } catch (error) { showMessage($("#auth-message"), error.message, true); }
  finally { button.disabled = false; }
});
$("#register-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const form = new FormData(event.currentTarget);
    const result = await api("/auth/register", { method: "POST", body: JSON.stringify({ name: form.get("name"), email: form.get("email"), password: form.get("password") }) });
    currentUser = result.user; showApp(); await loadDashboard(); toast("Account created successfully.");
  } catch (error) { showMessage($("#auth-message"), error.message, true); }
  finally { button.disabled = false; }
});
$$("[data-auth-tab]").forEach(button => button.addEventListener("click", () => setAuthTab(button.dataset.authTab)));
$("#logout-btn").addEventListener("click", async () => {
  try { await api("/auth/logout", { method: "POST", body: "{}" }); } catch {}
  currentUser = null; tickets = []; showAuth(); setAuthTab("login"); toast("You have signed out.");
});
$("#new-ticket-btn").addEventListener("click", () => { $("#ticket-form").reset(); $("#ticket-form-message").classList.add("hidden"); $("#ticket-dialog").showModal(); });
$("#ticket-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const data = new FormData(form);
    const result = await api("/tickets", { method: "POST", body: JSON.stringify({ subject: data.get("subject"), category: data.get("category"), priority: data.get("priority"), description: data.get("description") }) });
    $("#ticket-dialog").close(); await loadDashboard(); await openTicket(result.ticket.id); toast("Ticket created.");
  } catch (error) { showMessage($("#ticket-form-message"), error.message, true); }
  finally { button.disabled = false; }
});
$$("[data-close]").forEach(button => button.addEventListener("click", () => document.getElementById(button.dataset.close)?.close()));
$("#search-input").addEventListener("input", renderTickets);
$("#status-filter").addEventListener("change", renderTickets);
$("#priority-filter").addEventListener("change", renderTickets);
initialize();
