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
    return client;
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
      loc: esc(t.location || "Remote"),
      avail: AVAIL[t.availability] || AVAIL.part_time,
      exp: expLabel(t.experience_years),
      langs: esc((t.languages || []).join(", ") || "English"),
      skills: (t.skills || []).map(esc),
      about: "", port: [], certs: [], rate: t.hourly_rate == null ? null : t.hourly_rate,
      _full: false
    };
  }

  function talentDetailFrom(d) {
    var base = talentFromApi(d);
    base.about = esc(d.bio || "");
    base.video = safeUrl(d.video_url);
    base.certs = (d.certifications || []).map(function (c) { return { t: esc(c.title), s: esc(c.issuer || "") }; });
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
    return sessionUser(s.data.session.user, me.data && me.data.role);
  }

  async function signUp(o) {
    var r = await sb().auth.signUp({
      email: o.email, password: o.password,
      options: { data: { role: APP_TO_ROLE[o.role], full_name: o.name, business: o.business || "" }, emailRedirectTo: window.location.origin + window.location.pathname }
    });
    if (r.error) throw ApiError(400, "AUTH", authMessage(r.error));
    /* No session means the email must be confirmed first. */
    return { needsConfirmation: !r.data.session };
  }

  async function signIn(email, password) {
    var r = await sb().auth.signInWithPassword({ email: email, password: password });
    if (r.error) throw ApiError(401, "AUTH", authMessage(r.error));
    return currentUser();
  }

  async function signOut() {
    try { await sb().auth.signOut(); } catch (err) { /* ignore */ }
  }

  function authMessage(err) {
    var m = String((err && err.message) || "");
    if (/invalid login/i.test(m)) return "That email and password do not match.";
    if (/email not confirmed/i.test(m)) return "Please confirm your email first. Check your inbox for the link.";
    if (/already registered|already been registered/i.test(m)) return "An account with that email already exists. Try logging in.";
    if (/password/i.test(m)) return m;
    if (/rate limit|too many/i.test(m)) return "Too many attempts. Please wait a bit and try again.";
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
  function myTalentForUi() {
    if (!mine || mine.kind !== "talent" || !mine.data) return null;
    var d = mine.data;
    return {
      name: esc(d.display_name), headline: esc(d.headline || ""), about: esc(d.bio || ""),
      cat: TYPE_TO_CAT[(d.talent_type && d.talent_type.name) || ""] || "Admin",
      avail: AVAIL[d.availability] || AVAIL.part_time,
      loc: esc(d.location || ""), exp: d.experience_years == null ? "" : d.experience_years + (d.experience_years === 1 ? " year" : " years"),
      langs: esc((d.languages || []).join(", ")), skills: esc((d.skills || []).join(", ")),
      rate: d.hourly_rate == null ? "" : String(d.hourly_rate)
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
  function myPhotoUrl() {
    return mine && mine.kind === "talent" && mine.data ? safeUrl(mine.data.photo_url) : "";
  }

  /* ---------- job applications ---------- */
  var START_FROM_LABEL = { "Immediately": "immediately", "Within a week": "within_week", "In 2 weeks": "in_two_weeks", "In a month": "in_a_month" };

  async function applyToJob(jobId, o) {
    var body = { letter: o.letter, start_when: START_FROM_LABEL[o.start] || "immediately" };
    var amount = parseFloat(o.amount);
    if (amount > 0) body.proposed_amount = Math.round(amount * 100) / 100;
    if (o.link) body.link_url = o.link;
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
    uploadPhoto: uploadPhoto, myPhotoUrl: myPhotoUrl,
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
    escAttr: escAttr,
    loadCatalog: loadCatalog,
    loadTalent: loadTalent,
    loadJob: loadJob,
    currentUser: currentUser,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    typeIdForCat: typeIdForCat,
    maps: { AVAIL_BACK: AVAIL_BACK, JOBTYPE_BACK: JOBTYPE_BACK, UNIT_BACK: UNIT_BACK, CAT_TO_TYPE: CAT_TO_TYPE }
  };
})();
