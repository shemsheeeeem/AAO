/* AAO <-> Job Board backend client layer.
   Loaded before the main app script. When AAO_API_CONFIG is empty, enabled() is false and the site stays in demo mode.
   Auth is Supabase Auth (PKCE); every protected API call sends "Authorization: Bearer <access_token>". No cookies. */
(function () {
  "use strict";

  var cfg = window.AAO_API_CONFIG || {};
  var client = null;

  function enabled() {
    return !!(cfg.apiBase && cfg.supabaseUrl && cfg.supabaseAnonKey);
  }

  /* Resolves once the page (and the Supabase script at the end of the body) has loaded. */
  var loaded = new Promise(function (resolve) {
    if (document.readyState === "complete") resolve();
    else window.addEventListener("load", function () { resolve(); });
  });

  function sb() {
    if (client) return client;
    if (!window.supabase || !window.supabase.createClient) throw new Error("Supabase library did not load.");
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "aao-job-board-auth" }
    });
    /* Registered right away, before the library finishes reading the ?code= in the address: that is when it announces a password reset. Only a flag is set here (no auth calls inside the callback). */
    client.auth.onAuthStateChange(function (event) {
      if (event === "PASSWORD_RECOVERY") { markRecovery(); return; }
      /* Safety net: arriving from an email link (?code= in the address) within an hour of asking for a reset also counts, in case the library's announcement is missed. */
      if (event === "SIGNED_IN" && ARRIVED_WITH_CODE && resetRequestedRecently()) markRecovery();
    });
    return client;
  }

  /* ---------- password reset ---------- */
  var RECOVERY_KEY = "aao_password_recovery";
  var REQUESTED_KEY = "aao_reset_requested";
  var ARRIVED_WITH_CODE = /[?&]code=/.test(window.location.search); /* read now, before the library removes the code from the address */
  function markRecovery() {
    try { sessionStorage.setItem(RECOVERY_KEY, "1"); } catch (e) { /* ignore */ }
    try { window.dispatchEvent(new Event("aao-recovery")); } catch (e) { /* ignore */ }
  }
  function resetRequestedRecently() {
    try {
      var t = parseInt(localStorage.getItem(REQUESTED_KEY) || "0", 10);
      return t > 0 && Date.now() - t < 60 * 60 * 1000;
    } catch (e) { return false; }
  }
  /* True from the moment a visitor arrives from a reset email until they have chosen a new password (or given up). */
  function recoveryPending() {
    try { return sessionStorage.getItem(RECOVERY_KEY) === "1"; } catch (e) { return false; }
  }
  function clearRecovery() {
    try { sessionStorage.removeItem(RECOVERY_KEY); } catch (e) { /* ignore */ }
    try { localStorage.removeItem(REQUESTED_KEY); } catch (e) { /* ignore */ }
  }

  /* ---------- email confirmation ---------- */
  var SIGNUP_KEY = "aao_signup_pending";
  var CONFIRMED_KEY = "aao_email_confirmed";
  var ARRIVED_VERIFIED = /[?&]verified=1(&|$)/.test(window.location.search); /* set on the confirmation link when the address is on Supabase's redirect allow-list */
  function signupPendingRecently() {
    try {
      var t = parseInt(localStorage.getItem(SIGNUP_KEY) || "0", 10);
      return t > 0 && Date.now() - t < 7 * 24 * 60 * 60 * 1000;
    } catch (e) { return false; }
  }
  /* True when this visit came from the confirmation email (and not a password reset). The email is already confirmed by then, so the
     session the link may have created is dropped: the person sees a "confirmed" page and logs in on purpose. */
  async function consumeEmailConfirmation() {
    if (!(ARRIVED_WITH_CODE || ARRIVED_VERIFIED)) return false;
    try { await sb().auth.getSession(); } catch (e) { /* wait for the library to finish reading the ?code= */ }
    if (recoveryPending() || resetRequestedRecently()) return false;
    if (!(ARRIVED_VERIFIED || signupPendingRecently())) return false;
    try { await sb().auth.signOut({ scope: "local" }); } catch (e) { /* ignore */ }
    try { localStorage.removeItem(SIGNUP_KEY); } catch (e) { /* ignore */ }
    try { sessionStorage.setItem(CONFIRMED_KEY, "1"); } catch (e) { /* ignore */ }
    return true;
  }
  /* The role (client or va) the person last signed up or logged in as, so the login page can preselect it. Not sensitive; this browser only. */
  var ROLE_KEY = "aao_last_role";
  function rememberRole(role) {
    if (role !== "client" && role !== "va") return;
    try { localStorage.setItem(ROLE_KEY, role); } catch (e) { /* ignore */ }
  }
  function lastRole() {
    try { var r = localStorage.getItem(ROLE_KEY); return r === "client" || r === "va" ? r : ""; } catch (e) { return ""; }
  }
  function emailConfirmed() {
    try { return sessionStorage.getItem(CONFIRMED_KEY) === "1"; } catch (e) { return false; }
  }
  function clearEmailConfirmed() {
    try { sessionStorage.removeItem(CONFIRMED_KEY); } catch (e) { /* ignore */ }
  }

  /* ---------- text safety: the app writes these strings into innerHTML, so escape everything that came from the API ---------- */
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  /* Attribute-safe: escape quotes and brackets without assuming the string is raw (avoids breaking pre-escaped API text). */
  function escAttr(v) {
    return String(v == null ? "" : v).replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function safeUrl(u) {
    return /^https?:\/\//i.test(String(u || "")) ? esc(u) : "";
  }

  /* ---------- category mapping (frontend category <-> backend talent type name) ---------- */
  var CAT_TO_TYPE = {
    "Admin": "Virtual Assistant", "Customer support": "Customer Support", "Marketing": "Marketing", "Writing": "Writer",
    "Design": "Designer", "Development": "Developer", "Video": "Video Editor", "AI services": "AI Services",
    "Finance & accounting": "Finance & Accounting", "Legal": "Legal Support"
  };
  var TYPE_TO_CAT = {};
  Object.keys(CAT_TO_TYPE).forEach(function (c) { TYPE_TO_CAT[CAT_TO_TYPE[c]] = c; });
  TYPE_TO_CAT["Social Media"] = "Marketing";
  TYPE_TO_CAT["Other"] = "Admin";

  var types = []; /* [{id, name}] from GET /talent-types */
  function typeIdForCat(cat) {
    var name = CAT_TO_TYPE[cat] || "Other";
    for (var i = 0; i < types.length; i++) if (types[i].name === name) return types[i].id;
    return null;
  }

  var AVAIL = {
    full_time: "Available full-time", part_time: "Available part-time", project: "Available for projects", unavailable: "Not available right now"
  };
  var AVAIL_BACK = { "Available full-time": "full_time", "Available part-time": "part_time", "Available for projects": "project", "Not available right now": "unavailable" };
  var JOBTYPE = { full_time: "Full-time", part_time: "Part-time", contract: "Project-based", one_off: "Project-based" };
  var JOBTYPE_BACK = { "Full-time": "full_time", "Part-time": "part_time", "Project-based": "contract" };
  var UNIT = { hour: "hr", month: "mo", fixed: "fixed" };
  var UNIT_BACK = { hr: "hour", mo: "month", fixed: "fixed" };

  /* ---------- HTTP ---------- */
  function ApiError(status, code, message) {
    var e = new Error(message || "Request failed");
    e.status = status; e.code = code || "ERROR";
    return e;
  }

  async function token() {
    var r = await sb().auth.getSession();
    return r && r.data && r.data.session ? r.data.session.access_token : null;
  }

  async function call(method, path, body, opts) {
    opts = opts || {};
    var headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.auth || opts.optionalAuth) {
      var t = await token();
      if (t) headers.Authorization = "Bearer " + t;
      else if (opts.auth) throw ApiError(401, "UNAUTHENTICATED", "Please log in again.");
    }
    var res;
    try {
      res = await fetch(cfg.apiBase.replace(/\/+$/, "") + path, {
        method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "omit",
        /* "fresh" bypasses the browser cache (public listings are cacheable for up to a minute) */
        cache: opts.fresh ? "no-store" : "default"
      });
    } catch (err) {
      throw ApiError(0, "NETWORK", "Could not reach the server. Check your connection and try again.");
    }
    var json = null;
    try { json = await res.json(); } catch (err) { json = null; }
    if (!res.ok) {
      var e = (json && json.error) || {};
      throw ApiError(res.status, e.code, friendly(res.status, e));
    }
    return json || {};
  }

  /* Short, user-safe messages (the backend never returns SQL or internals). */
  function friendly(status, e) {
    var m = e && e.message ? String(e.message) : "";
    if (status === 401) return "Please log in again.";
    if (status === 403) return m || "You are not allowed to do that.";
    if (status === 404) return m || "Not found.";
    if (status === 429) return "Too many requests. Please wait a bit and try again.";
    if (status >= 500) return "Something went wrong on our side. Please try again shortly.";
    if (e && e.code === "CONTACT_INFO" && m) return m;
    if (e && e.details && e.details.body && e.details.body.length) {
      var d = e.details.body[0];
      return (d.field ? d.field + " " : "") + (d.message || "is invalid");
    }
    return m || "That did not work.";
  }

  /* ---------- adapters: API -> the shapes the existing UI renders ---------- */
  function expLabel(n) {
    if (n == null) return "Experience not listed";
    return n + (n === 1 ? " year" : " years");
  }

  function talentFromApi(t) {
    return {
      id: t.id,
      photo: safeUrl(t.photo_url), video: "",
      name: esc(t.display_name),
      headline: esc(t.headline || ""),
      cat: TYPE_TO_CAT[(t.talent_type && t.talent_type.name) || ""] || "Admin",
      loc: esc(t.location || "Location not listed"),
      avail: AVAIL[t.availability] || AVAIL.part_time,
      exp: expLabel(t.experience_years),
      langs: esc((t.languages || []).join(", ") || "English"),
      skills: (t.skills || []).map(esc),
      about: "", port: [], certs: [], rate: t.hourly_rate == null ? null : t.hourly_rate,
      hours: t.hours_per_week ? t.hours_per_week + " hours/week" : "",
      start: START_LABEL[t.start_when] || "",
      subs: (t.sub_specialties || []).map(esc),
      _full: false
    };
  }

  /* Work experience entries with every text HTML-escaped (years are numbers; end null = present). */
  function workFromApi(list) {
    return (list || []).map(function (w) {
      return { role: esc(w.role), business: esc(w.business || ""), start: w.start, end: w.end == null ? null : w.end, bullets: (w.bullets || []).map(esc), tools: esc(w.tools || "") };
    });
  }

  function talentDetailFrom(d) {
    var base = talentFromApi(d);
    base.about = esc(d.bio || "");
    base.video = safeUrl(d.video_url);
    base.certs = (d.certifications || []).map(function (c) { return { t: esc(c.title), s: esc(c.issuer || "") }; });
    base.edu = esc(d.education || "");
    /* Detailed skills (decision 77): raw text here; the page escapes it when it draws it. */
    base.banner = d.banner && safeUrl(d.banner.url) ? { url: safeUrl(d.banner.url), x: Number(d.banner.x) || 0, y: Number(d.banner.y) || 0 } : null;
    base.photos = (d.photos || []).map(function (p) { return { url: safeUrl(p.url), caption: esc(p.caption || "") }; }).filter(function (p) { return p.url; });
    base.skillDetails = (d.skill_details || []).map(function (s) { return { name: String(s.name || ""), category: String(s.category || "Other"), rating: Number(s.rating) || 0, isTop: !!s.is_top }; });
    base.work = workFromApi(d.work_experience);
    /* Portfolio pages (decision 79): raw text here; the page escapes and formats it when it draws it. Featured first (the API orders them). */
    base.pages = (d.pages || []).map(function (p) {
      return { title: String(p.title || ""), body: String(p.body || ""), featured: !!p.featured, images: (p.images || []).map(safeUrl).filter(Boolean) };
    });
    base.port = (d.portfolio || []).map(function (p) {
      var file = safeUrl(p.file_url);
      var isImg = /\.(png|jpe?g|webp)(\?|$)/i.test(file);
      return { kind: "doc", t: esc(p.title), d: esc(p.description || ""), url: safeUrl(p.link_url) || (isImg ? "" : file), img: isImg ? file : "" };
    });
    base._full = true;
    return base;
  }

  function jobFromApi(j) {
    return {
      id: j.id,
      title: esc(j.title),
      company: esc((j.company && j.company.name) || "Employer"),
      cat: TYPE_TO_CAT[(j.talent_type && j.talent_type.name) || ""] || "Admin",
      pay: j.pay_amount == null ? 0 : j.pay_amount,
      payUnit: UNIT[j.pay_unit] || "hr",
      type: JOBTYPE[j.job_type] || "Part-time",
      loc: esc(j.location || "Remote"),
      skills: (j.skills || []).map(esc),
      body: esc(j.description || j.description_excerpt || ""),
      created: j.created_at || "",
      _full: j.description != null
    };
  }

  /* ---------- catalog (public reads) ---------- */
  async function paged(path, fresh) {
    var out = [], offset = 0;
    for (var i = 0; i < 5; i++) { /* at most 5 pages x 24 = 120 items for now */
      var r = await call("GET", path + (path.indexOf("?") < 0 ? "?" : "&") + "limit=24&offset=" + offset, undefined, { fresh: fresh });
      out = out.concat(r.data || []);
      if (!r.meta || !r.meta.has_more) break;
      offset = r.meta.next_offset;
    }
    return out;
  }

  async function loadCatalog(fresh) {
    var t = await call("GET", "/talent-types", undefined, { fresh: fresh });
    types = (t.data || []).map(function (x) { return { id: x.id, name: x.name }; });
    var res = await Promise.all([paged("/talent", fresh), paged("/jobs", fresh)]);
    return { talent: res[0].map(talentFromApi), jobs: res[1].map(jobFromApi) };
  }

  /* A job the signed-in employer just posted (owner response) in the shape the job screens use. */
  function jobFromOwn(j) {
    return jobFromApi({
      id: j.id, title: j.title, description: j.description, job_type: j.job_type, talent_type: j.talent_type, location: j.location,
      skills: j.skills, pay_amount: j.pay_amount, pay_unit: j.pay_unit, created_at: j.created_at,
      company: { name: (mine && mine.kind === "employer" && mine.data && mine.data.company_name) || "Employer" }
    });
  }

  async function loadTalent(id) {
    var r = await call("GET", "/talent/" + encodeURIComponent(id));
    return talentDetailFrom(r.data);
  }
  async function loadJob(id) {
    var r = await call("GET", "/jobs/" + encodeURIComponent(id));
    return jobFromApi(r.data);
  }

  /* ---------- auth ---------- */
  var ROLE_TO_APP = { employer: "client", talent: "va" };
  var APP_TO_ROLE = { client: "employer", va: "talent" };

  function sessionUser(user, role) {
    var meta = (user && user.user_metadata) || {};
    var appRole = ROLE_TO_APP[role] || "client";
    return {
      email: user.email, role: appRole, name: meta.full_name || (user.email || "").split("@")[0],
      label: appRole === "va" ? "Virtual assistant" : "Client", id: user.id, verified: !!user.email_confirmed_at,
      business: meta.business || "",
      since: user.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : ""
    };
  }

  /* Returns the app-style user for the current Supabase session, or null. */
  async function currentUser() {
    var s = await sb().auth.getSession();
    if (!s.data || !s.data.session) return null;
    var me = await call("GET", "/me", undefined, { auth: true });
    var u = sessionUser(s.data.session.user, me.data && me.data.role);
    /* Decision 80: only decides whether the Admin review link shows. Every admin endpoint checks again on the server. */
    u.isAdmin = !!(me.data && me.data.is_admin === true);
    return u;
  }

  async function signUp(o) {
    var r = await sb().auth.signUp({
      email: o.email, password: o.password,
      options: { data: { role: APP_TO_ROLE[o.role], full_name: o.name, business: o.business || "" }, emailRedirectTo: window.location.origin + window.location.pathname + "?verified=1" }
    });
    if (r.error) throw ApiError(400, "AUTH", authMessage(r.error));
    rememberRole(o.role);
    /* No session means the email must be confirmed first. */
    if (!r.data.session) { try { localStorage.setItem(SIGNUP_KEY, String(Date.now())); } catch (e) { /* ignore */ } }
    return { needsConfirmation: !r.data.session };
  }

  async function signIn(email, password) {
    var r = await sb().auth.signInWithPassword({ email: email, password: password });
    if (r.error) throw ApiError(401, "AUTH", authMessage(r.error));
    return currentUser();
  }

  async function signOut() {
    clearRecovery(); /* signing out also ends a pending password reset */
    try { await sb().auth.signOut(); } catch (err) { /* ignore */ }
  }

  /* Sends the reset email. The answer is the same whether or not an account exists, so the page never reveals who has an account. */
  async function requestPasswordReset(email) {
    var r = await sb().auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/" });
    if (r.error && /rate limit|too many|seconds/i.test(String(r.error.message || ""))) throw ApiError(429, "AUTH", authMessage(r.error));
    /* Any other error (for example an unknown address) is deliberately not shown. */
    try { localStorage.setItem(REQUESTED_KEY, String(Date.now())); } catch (e) { /* ignore */ }
    return true;
  }

  /* Sets the new password for the person who arrived from the reset email, then signs them out so they log in with it. */
  async function updatePassword(newPassword) {
    var r = await sb().auth.updateUser({ password: newPassword });
    if (r.error) throw ApiError(400, "AUTH", authMessage(r.error));
    clearRecovery();
    try { await sb().auth.signOut(); } catch (err) { /* ignore */ }
    return true;
  }

  /* The visitor gave up on the reset: forget the flag and the temporary session. */
  async function cancelRecovery() {
    clearRecovery();
    try { await sb().auth.signOut(); } catch (err) { /* ignore */ }
  }

  function authMessage(err) {
    var m = String((err && err.message) || "");
    if (/invalid login/i.test(m)) return "That email and password do not match.";
    if (/email not confirmed/i.test(m)) return "Please confirm your email first. Check your inbox for the link.";
    if (/already registered|already been registered/i.test(m)) return "An account with that email already exists. Try logging in.";
    if (/password/i.test(m)) return m;
    if (/rate limit|too many|only request this after|seconds/i.test(m)) return "Too many attempts right now. Please try again in a little while.";
    return "We could not complete that. Please try again.";
  }

  /* ---------- the signed-in user's own profile (cached so the existing synchronous screens can read it) ---------- */
  var mine = null; /* { kind: "talent" | "employer", data: object | null } */

  async function refreshMine(u) {
    mine = null;
    if (!u) return;
    var path = u.role === "va" ? "/me/talent-profile" : "/me/employer-profile";
    try {
      var r = await call("GET", path, undefined, { auth: true });
      mine = { kind: u.role === "va" ? "talent" : "employer", data: r.data };
    } catch (e) {
      if (e.status === 404) mine = { kind: u.role === "va" ? "talent" : "employer", data: null }; /* not created yet */
    }
  }

  /* The own talent profile in the shape the VA profile screen uses (text is HTML-escaped; the screen decodes it for form fields). */
  /* "When can you start?" (decision 82): API value -> label. */
  var START_LABEL = { immediately: "Immediately", within_week: "Within a week", in_two_weeks: "In 2 weeks", in_a_month: "In a month" };
  function myTalentForUi() {
    if (!mine || mine.kind !== "talent" || !mine.data) return null;
    var d = mine.data;
    return {
      name: esc(d.display_name), headline: esc(d.headline || ""), about: esc(d.bio || ""),
      cat: TYPE_TO_CAT[(d.talent_type && d.talent_type.name) || ""] || "Admin",
      avail: AVAIL[d.availability] || AVAIL.part_time,
      loc: esc(d.location || ""), exp: d.experience_years == null ? "" : d.experience_years + (d.experience_years === 1 ? " year" : " years"),
      langs: esc((d.languages || []).join(", ")), skills: esc((d.skills || []).join(", ")),
      rate: d.hourly_rate == null ? "" : String(d.hourly_rate),
      education: esc(d.education || ""),
      hours: d.hours_per_week ? d.hours_per_week + " hours/week" : "",
      start: START_LABEL[d.start_when] ? d.start_when : "",
      subs: esc((d.sub_specialties || []).join(", ")),
      work: workFromApi(d.work_experience),
      /* Raw text for the skill editor, which escapes what it draws. */
      banner: d.banner && safeUrl(d.banner.url) ? { url: safeUrl(d.banner.url), x: Number(d.banner.x) || 0, y: Number(d.banner.y) || 0 } : null,
      skillRatings: (d.skill_details || []).map(function (s) {
        var cat = String(s.category || "Other");
        return { name: String(s.name || ""), category: cat, path: [cat, String(s.name || "")], rating: Number(s.rating) || 3, about: String(s.note || ""), isTop: !!s.is_top, custom: cat === "Other" };
      })
    };
  }

  function splitList(s, max) {
    return String(s || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean).slice(0, max);
  }

  async function saveTalentProfile(row) {
    var prev = (mine && mine.kind === "talent" && mine.data) || {};
    var typeId = typeIdForCat(row.cat);
    if (!typeId) throw ApiError(400, "VALIDATION_ERROR", "The category list has not loaded. Please refresh the page and try again.");
    var years = parseInt(String(row.exp || "").replace(/[^0-9]/g, ""), 10);
    var rate = parseFloat(row.rate);
    var body = {
      display_name: row.name, headline: row.headline || null, bio: row.about || null, talent_type_id: typeId,
      skills: splitList(row.skills, 30), availability: AVAIL_BACK[row.avail] || "part_time",
      location: row.loc || null, experience_years: isFinite(years) && years >= 0 && years <= 60 ? years : null,
      languages: splitList(row.langs, 10),
      certifications: (prev.certifications || []).map(function (c) { return { title: c.title, issuer: c.issuer || null }; }),
      video_url: prev.video_url || null,
      hourly_rate: rate > 0 ? Math.round(rate * 100) / 100 : null, show_rate: rate > 0
    };
    /* Profile sections (decision 75). Sent only when the screen has them, so an older screen never clears them. */
    if (row.education !== undefined) body.education = String(row.education || "").trim() || null;
    if (row.hours !== undefined) {
      var hrs = parseInt(String(row.hours || "").replace(/[^0-9]/g, ""), 10);
      body.hours_per_week = hrs >= 1 && hrs <= 80 ? hrs : null;
    }
    /* Specialties: commas or "|" between them (Toni typed "Digital Marketing | Branding"). */
    if (row.subs !== undefined) body.sub_specialties = String(row.subs || "").split(/[,|]/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 5);
    if (row.start !== undefined) body.start_when = START_LABEL[row.start] ? row.start : null;
    if (Array.isArray(row.work)) body.work_experience = row.work;
    if (Array.isArray(row.skillDetails)) body.skill_details = row.skillDetails;
    var r = await call("PUT", "/me/talent-profile", body, { auth: true });
    mine = { kind: "talent", data: r.data };
    return r.data;
  }

  /* Employers need a company profile before they can post. Created on first use from the sign-up details. */
  async function ensureEmployerProfile(u) {
    if (mine && mine.kind === "employer" && mine.data) return;
    var name = (u && (u.business || u.name)) || "My company";
    var r = await call("PUT", "/me/employer-profile", { company_name: name.slice(0, 120), contact_name: ((u && u.name) || "").slice(0, 80) || null }, { auth: true });
    mine = { kind: "employer", data: r.data };
  }

  async function postJob(u, row) {
    await ensureEmployerProfile(u);
    var amount = parseFloat(row.amount);
    var body = {
      title: row.title, description: row.body, job_type: JOBTYPE_BACK[row.availability] || "part_time",
      talent_type_id: typeIdForCat(row.category), location: "Remote", skills: splitList(row.skills, 15),
      pay_amount: amount > 0 ? Math.round(amount * 100) / 100 : null,
      pay_unit: amount > 0 ? ({ hourly: "hour", monthly: "month", fixed: "fixed" }[row.budgetType] || "hour") : null
    };
    var r = await call("POST", "/me/jobs", body, { auth: true });
    return r.data;
  }

  /* ---------- inquiries (an employer contacting a talent). Saved by the backend; not emailed yet. ---------- */
  async function sentInquiries() {
    var r = await call("GET", "/me/sent-inquiries?limit=50", undefined, { auth: true });
    return r.data || [];
  }
  async function receivedInquiries() {
    var r = await call("GET", "/me/inquiries?limit=50", undefined, { auth: true });
    return r.data || [];
  }
  async function sendInquiry(u, talentId, message) {
    await ensureEmployerProfile(u);
    try {
      var r = await call("POST", "/talent/" + encodeURIComponent(talentId) + "/inquiries", { message: message }, { auth: true });
      return r.data;
    } catch (e) {
      if (e.status === 429) throw ApiError(429, "RATE_LIMITED", "You have reached the daily limit for messages to this assistant. Please try again tomorrow.");
      if (e.status === 404) throw ApiError(404, "NOT_FOUND", "This assistant is no longer available.");
      throw e;
    }
  }

  /* ---------- the employer's own jobs ---------- */
  async function myJobs() {
    try {
      var r = await call("GET", "/me/jobs?limit=50", undefined, { auth: true, fresh: true });
      return r.data || [];
    } catch (e) {
      if (e.status === 404) return []; /* no employer profile yet */
      throw e;
    }
  }
  async function closeJob(id) {
    var r = await call("POST", "/me/jobs/" + encodeURIComponent(id) + "/close", undefined, { auth: true });
    return r.data;
  }
  async function reopenJob(id) {
    var r = await call("POST", "/me/jobs/" + encodeURIComponent(id) + "/reopen", { expires_in_days: 30 }, { auth: true });
    return r.data;
  }

  /* ---------- reports (anyone may report; a signed-in reporter's token is sent when there is one) ---------- */
  async function report(o) {
    var body = { target_type: o.type, target_id: o.id, reason: o.reason };
    if (o.details) body.details = o.details;
    if (o.turnstileToken) body.turnstile_token = o.turnstileToken; /* single-use token from the Cloudflare Turnstile widget */
    try {
      await call("POST", "/reports", body, { optionalAuth: true });
    } catch (e) {
      if (e.status === 429) throw ApiError(429, "RATE_LIMITED", "You have sent several reports recently. Please try again later.");
      if (e.status === 404) throw ApiError(404, "NOT_FOUND", "That listing is no longer available.");
      if (e.status === 400 && e.code === "BAD_REQUEST") throw ApiError(400, "VERIFICATION", "The verification did not pass. Please try again.");
      if (e.status === 503) throw ApiError(503, "UNAVAILABLE", "Reporting is temporarily unavailable. Please try again in a few minutes.");
      throw e;
    }
  }

  /* ---------- profile photo: signed upload URL, raw bytes to storage, then register the file ---------- */
  async function uploadPhoto(file) {
    if (["image/jpeg", "image/png", "image/webp"].indexOf(file.type) < 0) throw ApiError(400, "VALIDATION_ERROR", "Please choose a JPEG, PNG or WebP image.");
    if (!file.size) throw ApiError(400, "VALIDATION_ERROR", "That file is empty.");
    if (file.size > 2 * 1024 * 1024) throw ApiError(400, "VALIDATION_ERROR", "That image is larger than 2 MB. Please choose a smaller one.");
    var a = await call("POST", "/me/talent-profile/photo/upload-url", { content_type: file.type, size: file.size }, { auth: true });
    var up = a.data.upload, put;
    try {
      put = await fetch(up.url, { method: "PUT", headers: up.headers, body: file });
    } catch (err) {
      throw ApiError(0, "NETWORK", "The upload failed. Check your connection and try again.");
    }
    if (!put.ok) throw ApiError(put.status, "UPLOAD", "The upload was not accepted. Please try again.");
    var r = await call("PUT", "/me/talent-profile/photo", { file: a.data.file }, { auth: true });
    mine = { kind: "talent", data: r.data };
    return safeUrl(r.data.photo_url);
  }
  /* ---------- government ID (private; only the owner and AAO administrators can see it) ---------- */
  /* Redraws the photo as a JPEG of at most 1600 px. This keeps it under the 5 MB limit and drops the camera's hidden details (such as location). */
  function idPhotoAsJpeg(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || "")) { reject(ApiError(400, "VALIDATION_ERROR", "Please choose a photo of your ID (JPEG, PNG or WebP).")); return; }
      if (file.size > 20 * 1024 * 1024) { reject(ApiError(400, "VALIDATION_ERROR", "That photo is too large. Please choose one under 20 MB.")); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try {
          var scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
          var c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.naturalWidth * scale));
          c.height = Math.max(1, Math.round(img.naturalHeight * scale));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          c.toBlob(function (b) { b ? resolve(b) : reject(ApiError(400, "VALIDATION_ERROR", "We could not read that photo. Please try another one.")); }, "image/jpeg", 0.85);
        } catch (e) { URL.revokeObjectURL(url); reject(ApiError(400, "VALIDATION_ERROR", "We could not read that photo. Please try another one.")); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(ApiError(400, "VALIDATION_ERROR", "We could not read that photo. Please take it again as a JPEG or PNG.")); };
      img.src = url;
    });
  }
  async function identityStatus() {
    var r = await call("GET", "/me/identity", undefined, { auth: true, fresh: true });
    return r.data;
  }
  async function uploadIdentity(file) {
    var blob = await idPhotoAsJpeg(file);
    if (blob.size > 5 * 1024 * 1024) throw ApiError(400, "VALIDATION_ERROR", "That photo is still too large after resizing. Please try another one.");
    var a = await call("POST", "/me/identity/upload-url", { content_type: "image/jpeg", size: blob.size }, { auth: true });
    var up = a.data.upload, put;
    try {
      put = await fetch(up.url, { method: "PUT", headers: up.headers, body: blob });
    } catch (err) {
      throw ApiError(0, "NETWORK", "The upload failed. Check your connection and try again.");
    }
    if (!put.ok) throw ApiError(put.status, "UPLOAD", "The upload was not accepted. Please try again.");
    var r = await call("PUT", "/me/identity", { file: a.data.file }, { auth: true });
    return r.data;
  }
  /* ---------- test results (typing, DISC, aptitude); private: only the owner and AAO administrators can see them ---------- */
  async function assessmentStatus() {
    var r = await call("GET", "/me/assessments", undefined, { auth: true, fresh: true });
    return r.data;
  }
  /* Attaches the result PDF of one test ("typing", "disc" or "aptitude"). Private: only the owner and AAO administrators can open it. */
  async function uploadAssessmentPdf(test, file) {
    if (!file || (file.type && file.type !== "application/pdf" && !/\.pdf$/i.test(file.name || ""))) throw ApiError(400, "VALIDATION_ERROR", "Please choose the PDF of your result.");
    if (!file.size) throw ApiError(400, "VALIDATION_ERROR", "That file is empty.");
    if (file.size > 5 * 1024 * 1024) throw ApiError(400, "VALIDATION_ERROR", "That PDF is larger than 5 MB. Please save a smaller one.");
    var a = await call("POST", "/me/assessments/upload-url", { content_type: "application/pdf", size: file.size }, { auth: true });
    var up = a.data.upload, put;
    try {
      put = await fetch(up.url, { method: "PUT", headers: up.headers, body: file });
    } catch (err) {
      throw ApiError(0, "NETWORK", "The upload failed. Check your connection and try again.");
    }
    if (!put.ok) throw ApiError(put.status, "UPLOAD", "The upload was not accepted. Please check that it is a PDF and try again.");
    var r = await call("PUT", "/me/assessments/pdf", { test: test, file: a.data.file }, { auth: true });
    return r.data;
  }
  async function saveAssessment(o) {
    var r = await call("PUT", "/me/assessments", { typing_result: o.typing || null, disc_result: o.disc || null, aptitude_result: o.aptitude || null }, { auth: true });
    return r.data;
  }
  /* ---------- banner and personal photos (public; decision 78) ---------- */
  /* Redraws an image as a JPEG of at most maxSide px (keeps uploads small and drops hidden camera details such as location). */
  function imageAsJpeg(file, maxSide) {
    return new Promise(function (resolve, reject) {
      if (!file || ["image/jpeg", "image/png", "image/webp"].indexOf(file.type) < 0) { reject(ApiError(400, "VALIDATION_ERROR", "Please choose a JPG, PNG or WebP image.")); return; }
      if (file.size > 20 * 1024 * 1024) { reject(ApiError(400, "VALIDATION_ERROR", "That image is too large. Please choose one under 20 MB.")); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try {
          var scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
          var c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.naturalWidth * scale));
          c.height = Math.max(1, Math.round(img.naturalHeight * scale));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          c.toBlob(function (b) { b ? resolve(b) : reject(ApiError(400, "VALIDATION_ERROR", "We could not read that image.")); }, "image/jpeg", 0.85);
        } catch (e) { URL.revokeObjectURL(url); reject(ApiError(400, "VALIDATION_ERROR", "We could not read that image.")); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(ApiError(400, "VALIDATION_ERROR", "We could not read that image. Please try another one.")); };
      img.src = url;
    });
  }
  async function uploadMedia(kindPath, file, maxSide) {
    var blob = await imageAsJpeg(file, maxSide);
    if (blob.size > 5 * 1024 * 1024) throw ApiError(400, "VALIDATION_ERROR", "That image is still too large after resizing. Please try another one.");
    var a = await call("POST", "/me/talent-profile/" + kindPath + "/upload-url", { content_type: "image/jpeg", size: blob.size }, { auth: true });
    var up = a.data.upload, put;
    try { put = await fetch(up.url, { method: "PUT", headers: up.headers, body: blob }); }
    catch (err) { throw ApiError(0, "NETWORK", "The upload failed. Check your connection and try again."); }
    if (!put.ok) throw ApiError(put.status, "UPLOAD", "The upload was not accepted. Please try again.");
    return a.data.file;
  }
  async function uploadBanner(file) {
    var name = await uploadMedia("banner", file, 1600);
    var r = await call("PUT", "/me/talent-profile/banner", { file: name }, { auth: true });
    mine = { kind: "talent", data: r.data };
    return r.data.banner;
  }
  async function setBannerPosition(x, y) {
    var r = await call("PATCH", "/me/talent-profile/banner", { x: x, y: y }, { auth: true });
    mine = { kind: "talent", data: r.data };
    return r.data.banner;
  }
  async function removeBanner() {
    var r = await call("DELETE", "/me/talent-profile/banner", undefined, { auth: true });
    mine = { kind: "talent", data: r.data };
  }
  async function myPhotos() {
    var r = await call("GET", "/me/talent-profile/photos", undefined, { auth: true, fresh: true });
    return (r.data || []).map(function (p) { return { id: p.id, url: safeUrl(p.url), caption: p.caption || "", sort: p.sort_order }; });
  }
  async function addPhoto(file, caption) {
    var name = await uploadMedia("photos", file, 1200);
    var r = await call("POST", "/me/talent-profile/photos", { file: name, caption: caption || null }, { auth: true });
    return r.data;
  }
  async function updatePhoto(id, o) {
    var r = await call("PATCH", "/me/talent-profile/photos/" + encodeURIComponent(id), o, { auth: true });
    return r.data;
  }
  async function deletePhoto(id) {
    await call("DELETE", "/me/talent-profile/photos/" + encodeURIComponent(id), undefined, { auth: true });
  }
  /* ---------- portfolio pages (public; decision 79) ---------- */
  function pageFromApi(p) {
    return {
      id: p.id, title: p.title || "", body: p.body || "", featured: !!p.featured, sort: p.sort_order,
      images: (p.images || []).map(function (im) { return { id: im.id, url: safeUrl(im.url) }; }).filter(function (im) { return im.url; })
    };
  }
  async function myPages() {
    var r = await call("GET", "/me/talent-profile/pages", undefined, { auth: true, fresh: true });
    return (r.data || []).map(pageFromApi);
  }
  async function addPage(o) {
    var r = await call("POST", "/me/talent-profile/pages", { title: o.title || null, body: o.body || null, featured: !!o.featured }, { auth: true });
    return pageFromApi(r.data);
  }
  async function updatePage(id, o) {
    var r = await call("PATCH", "/me/talent-profile/pages/" + encodeURIComponent(id), o, { auth: true });
    return pageFromApi(r.data);
  }
  async function deletePage(id) {
    await call("DELETE", "/me/talent-profile/pages/" + encodeURIComponent(id), undefined, { auth: true });
  }
  async function addPageImage(pageId, file) {
    var name = await uploadMedia("pages", file, 1600);
    var r = await call("POST", "/me/talent-profile/pages/" + encodeURIComponent(pageId) + "/images", { file: name }, { auth: true });
    return { id: r.data.id, url: safeUrl(r.data.url) };
  }
  async function deletePageImage(pageId, imageId) {
    await call("DELETE", "/me/talent-profile/pages/" + encodeURIComponent(pageId) + "/images/" + encodeURIComponent(imageId), undefined, { auth: true });
  }
  async function removeProfilePhoto() {
    var r = await call("DELETE", "/me/talent-profile/photo", undefined, { auth: true });
    mine = { kind: "talent", data: r.data };
  }
  function myPhotoUrl() {
    return mine && mine.kind === "talent" && mine.data ? safeUrl(mine.data.photo_url) : "";
  }

  /* ---------- administrators: ID and test result review (decision 80) ---------- */
  function adminQuery(status) { return "?limit=50" + (status ? "&status=" + encodeURIComponent(status) : ""); }
  async function adminIdentityList(status) {
    var r = await call("GET", "/admin/identity" + adminQuery(status), undefined, { auth: true, fresh: true });
    return r.data || [];
  }
  async function adminIdentityLink(accountId) {
    var r = await call("GET", "/admin/identity/" + encodeURIComponent(accountId) + "/document", undefined, { auth: true, fresh: true });
    return safeUrl(r.data && r.data.url);
  }
  async function adminIdentityReview(accountId, status, note) {
    var r = await call("POST", "/admin/identity/" + encodeURIComponent(accountId) + "/review", { status: status, note: note || null }, { auth: true });
    return r.data;
  }
  async function adminAssessmentList(status) {
    var r = await call("GET", "/admin/assessments" + adminQuery(status), undefined, { auth: true, fresh: true });
    return r.data || [];
  }
  async function adminAssessmentLink(accountId, test) {
    var r = await call("GET", "/admin/assessments/" + encodeURIComponent(accountId) + "/pdf/" + encodeURIComponent(test), undefined, { auth: true, fresh: true });
    return safeUrl(r.data && r.data.url);
  }
  async function adminAssessmentReview(accountId, status, note) {
    var r = await call("POST", "/admin/assessments/" + encodeURIComponent(accountId) + "/review", { status: status, note: note || null }, { auth: true });
    return r.data;
  }

  /* ---------- administrators: oversight of jobs, messages and assistants (decision 83). Every call is logged by the server. ---------- */
  function qs(o) {
    var parts = [];
    Object.keys(o).forEach(function (k) { if (o[k] !== undefined && o[k] !== null && o[k] !== "") parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(o[k])); });
    return parts.length ? "?" + parts.join("&") : "";
  }
  async function adminGet(path) {
    var r = await call("GET", path, undefined, { auth: true, fresh: true });
    return { items: r.data || [], meta: r.meta || {} };
  }
  function adminJobs(o) { o = o || {}; return adminGet("/admin/jobs" + qs({ status: o.status, limit: 20, offset: o.offset || 0 })); }
  function adminJobApplicants(jobId) { return adminGet("/admin/jobs/" + encodeURIComponent(jobId) + "/applications"); }
  function adminMessages(o) { o = o || {}; return adminGet("/admin/messages" + qs({ flagged: o.flagged ? "true" : "", limit: 20, offset: o.offset || 0 })); }
  function adminTalentList(o) { o = o || {}; return adminGet("/admin/talent" + qs({ status: o.status, q: o.q, limit: 20, offset: o.offset || 0 })); }
  async function adminSetJobStatus(jobId, status, reason) {
    var r = await call("POST", "/admin/jobs/" + encodeURIComponent(jobId) + "/status", { status: status, reason: reason || undefined }, { auth: true });
    return r.data;
  }
  async function adminSetTalentStatus(profileId, status, reason) {
    var r = await call("POST", "/admin/talent/" + encodeURIComponent(profileId) + "/status", { status: status, reason: reason || undefined }, { auth: true });
    return r.data;
  }

  /* ---------- job applications ---------- */
  var START_FROM_LABEL = { "Immediately": "immediately", "Within a week": "within_week", "In 2 weeks": "in_two_weeks", "In a month": "in_a_month" };

  async function applyToJob(jobId, o) {
    var body = { letter: o.letter, start_when: START_FROM_LABEL[o.start] || "immediately" };
    var amount = parseFloat(o.amount);
    if (amount > 0) body.proposed_amount = Math.round(amount * 100) / 100;
    var r = await call("POST", "/jobs/" + encodeURIComponent(jobId) + "/applications", body, { auth: true });
    return r.data;
  }
  async function myApplications() {
    var r = await call("GET", "/me/applications?limit=50", undefined, { auth: true, fresh: true });
    return r.data || [];
  }
  async function withdrawApplication(id) {
    var r = await call("POST", "/me/applications/" + encodeURIComponent(id) + "/withdraw", undefined, { auth: true });
    return r.data;
  }
  async function jobApplicants(jobId) {
    var r = await call("GET", "/me/jobs/" + encodeURIComponent(jobId) + "/applications?limit=50", undefined, { auth: true, fresh: true });
    return r.data || [];
  }

  window.AAOApi = {
    applyToJob: applyToJob, myApplications: myApplications, withdrawApplication: withdrawApplication, jobApplicants: jobApplicants,
    myJobs: myJobs, closeJob: closeJob, reopenJob: reopenJob,
    report: report,
    turnstileSiteKey: function () { return cfg.turnstileSiteKey || ""; },
    uploadPhoto: uploadPhoto, removeProfilePhoto: removeProfilePhoto,
    uploadBanner: uploadBanner, setBannerPosition: setBannerPosition, removeBanner: removeBanner,
    myPhotos: myPhotos, addPhoto: addPhoto, updatePhoto: updatePhoto, deletePhoto: deletePhoto,
    myPages: myPages, addPage: addPage, updatePage: updatePage, deletePage: deletePage, addPageImage: addPageImage, deletePageImage: deletePageImage,
    identityStatus: identityStatus,
    adminIdentityList: adminIdentityList, adminIdentityLink: adminIdentityLink, adminIdentityReview: adminIdentityReview,
    adminAssessmentList: adminAssessmentList, adminAssessmentLink: adminAssessmentLink, adminAssessmentReview: adminAssessmentReview,
    adminJobs: adminJobs, adminJobApplicants: adminJobApplicants, adminMessages: adminMessages, adminTalentList: adminTalentList,
    adminSetJobStatus: adminSetJobStatus, adminSetTalentStatus: adminSetTalentStatus,
    uploadIdentity: uploadIdentity, myPhotoUrl: myPhotoUrl,
    assessmentStatus: assessmentStatus, saveAssessment: saveAssessment, uploadAssessmentPdf: uploadAssessmentPdf,
    hasTalentProfile: function () { return !!(mine && mine.kind === "talent" && mine.data); },
    jobFromOwn: jobFromOwn,
    sentInquiries: sentInquiries,
    receivedInquiries: receivedInquiries,
    sendInquiry: sendInquiry,
    refreshMine: refreshMine,
    myTalentForUi: myTalentForUi,
    saveTalentProfile: saveTalentProfile,
    postJob: postJob,
    enabled: enabled,
    ready: function () { return loaded; },
    esc: esc,
    startLabel: function (v) { return START_LABEL[v] || ""; },
    escAttr: escAttr,
    loadCatalog: loadCatalog,
    loadTalent: loadTalent,
    loadJob: loadJob,
    currentUser: currentUser,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    requestPasswordReset: requestPasswordReset,
    updatePassword: updatePassword,
    recoveryPending: recoveryPending,
    cancelRecovery: cancelRecovery,
    consumeEmailConfirmation: consumeEmailConfirmation,
    emailConfirmed: emailConfirmed,
    rememberRole: rememberRole,
    lastRole: lastRole,
    clearEmailConfirmed: clearEmailConfirmed,
    typeIdForCat: typeIdForCat,
    maps: { AVAIL_BACK: AVAIL_BACK, JOBTYPE_BACK: JOBTYPE_BACK, UNIT_BACK: UNIT_BACK, CAT_TO_TYPE: CAT_TO_TYPE }
  };
})();
