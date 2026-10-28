const jwt = require("jsonwebtoken");
const supabase = require("../supabase");

function signToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: "8h" });
}

async function requireAuth(req, res, next) {
  const token = req.cookies?.support_session;
  if (!token) return res.status(401).json({ error: "Please sign in to continue." });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { data: user, error } = await supabase.from("profiles")
      .select("id, name, email, role, created_at").eq("id", decoded.sub).maybeSingle();
    if (error || !user) return res.status(401).json({ error: "Your session is invalid. Please sign in again." });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: "You do not have permission to perform this action." });
    next();
  };
}

module.exports = { signToken, requireAuth, allowRoles };
