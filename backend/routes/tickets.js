const express = require("express");
const { z } = require("zod");
const supabase = require("../supabase");
const { requireAuth, allowRoles } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
const createSchema = z.object({
  subject: z.string().trim().min(5).max(150),
  description: z.string().trim().min(10).max(5000),
  category: z.enum(["Technical", "Billing", "Account", "General"]),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]).default("Medium")
});
const updateSchema = z.object({
  status: z.enum(["Open", "In Progress", "Waiting on Customer", "Resolved", "Closed"]).optional(),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]).optional(),
  assigneeId: z.string().uuid().nullable().optional()
}).refine(value => Object.keys(value).length > 0, "Provide at least one field to update.");
const commentSchema = z.object({ message: z.string().trim().min(1).max(3000) });

function fail(res, error, status = 500) {
  return res.status(status).json({ error: status === 500 ? "The request could not be completed. Check the server configuration and database." : error });
}
async function getTicketForUser(id, user) {
  let query = supabase.from("tickets").select("*, customer:profiles!tickets_customer_id_fkey(id,name,email), assignee:profiles!tickets_assignee_id_fkey(id,name,email)").eq("id", id);
  if (user.role === "customer") query = query.eq("customer_id", user.id);
  return query.maybeSingle();
}
router.get("/", async (req, res) => {
  try {
    let query = supabase.from("tickets").select("*, customer:profiles!tickets_customer_id_fkey(id,name,email), assignee:profiles!tickets_assignee_id_fkey(id,name,email)").order("updated_at", { ascending: false }).limit(200);
    if (req.user.role === "customer") query = query.eq("customer_id", req.user.id);
    const { data, error } = await query;
    if (error) return fail(res, error);
    res.json({ tickets: data });
  } catch (error) { fail(res, error); }
});
router.get("/stats", async (req, res) => {
  try {
    let query = supabase.from("tickets").select("id,status");
    if (req.user.role === "customer") query = query.eq("customer_id", req.user.id);
    const { data, error } = await query;
    if (error) return fail(res, error);
    res.json({ stats: {
      total: data.length,
      open: data.filter(t => t.status === "Open").length,
      inProgress: data.filter(t => t.status === "In Progress").length,
      resolved: data.filter(t => ["Resolved", "Closed"].includes(t.status)).length
    }});
  } catch (error) { fail(res, error); }
});
router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  try {
    const { data, error } = await supabase.from("tickets").insert({ ...parsed.data, customer_id: req.user.id }).select("*").single();
    if (error) return fail(res, error);
    res.status(201).json({ ticket: data });
  } catch (error) { fail(res, error); }
});
router.get("/:id", async (req, res) => {
  try {
    const { data: ticket, error } = await getTicketForUser(req.params.id, req.user);
    if (error) return fail(res, error);
    if (!ticket) return res.status(404).json({ error: "Ticket not found." });
    const [{ data: comments, error: commentsError }, { data: agents, error: agentsError }] = await Promise.all([
      supabase.from("ticket_comments").select("id,message,created_at,author:profiles!ticket_comments_author_id_fkey(id,name,role)").eq("ticket_id", ticket.id).order("created_at"),
      req.user.role === "admin" ? supabase.from("profiles").select("id,name,email").in("role", ["agent","admin"]).order("name") : Promise.resolve({ data: [], error: null })
    ]);
    if (commentsError || agentsError) return fail(res, commentsError || agentsError);
    res.json({ ticket: { ...ticket, comments, agents } });
  } catch (error) { fail(res, error); }
});
router.patch("/:id", allowRoles("agent", "admin"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  try {
    const changes = parsed.data;
    if (Object.hasOwn(changes, "assigneeId") && changes.assigneeId) {
      if (req.user.role !== "admin") return res.status(403).json({ error: "Only administrators can assign tickets." });
      const { data: agent, error: agentError } = await supabase.from("profiles").select("id").eq("id", changes.assigneeId).in("role", ["agent","admin"]).maybeSingle();
      if (agentError) return fail(res, agentError);
      if (!agent) return res.status(400).json({ error: "Choose a valid support agent." });
      changes.assignee_id = changes.assigneeId;
    }
    delete changes.assigneeId;
    const { data, error } = await supabase.from("tickets").update(changes).eq("id", req.params.id).select("*").maybeSingle();
    if (error) return fail(res, error);
    if (!data) return res.status(404).json({ error: "Ticket not found." });
    res.json({ ticket: data });
  } catch (error) { fail(res, error); }
});
router.post("/:id/comments", async (req, res) => {
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  try {
    const { data: ticket, error: ticketError } = await getTicketForUser(req.params.id, req.user);
    if (ticketError) return fail(res, ticketError);
    if (!ticket) return res.status(404).json({ error: "Ticket not found." });
    const { data, error } = await supabase.from("ticket_comments").insert({ ticket_id: ticket.id, author_id: req.user.id, message: parsed.data.message }).select("id,message,created_at").single();
    if (error) return fail(res, error);
    await supabase.from("tickets").update({ updated_at: new Date().toISOString() }).eq("id", ticket.id);
    res.status(201).json({ comment: data });
  } catch (error) { fail(res, error); }
});
module.exports = router;
