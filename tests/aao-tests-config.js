/* AAO tests: connects the English, Work style (DISC) and Reasoning test pages in this folder to the AAO site.
   Each page loads ../aao-config.js, then this file with data-page="<kind>-<test|report|admin>".

   Turning the tests on: set assessmentsApi in ../aao-config.js to the backend's assessments address
   (for example "https://api.findmyaao.com/api/v1/assessments"). Until it is set, the tests run in PRACTICE MODE:
   VAs can take them, but nothing is saved, and the settings page says so.

   Sign-in: the pages use the same sign-in as the main site (Supabase, saved in this browser as "aao-job-board-auth").
   window.AAO_TOKEN() always returns the current token, so a long test can still submit after the token was refreshed. */
(function () {
  "use strict";
  var me = document.currentScript;
  var page = (me && me.getAttribute("data-page")) || "";
  var kind = page.split("-")[0];                  /* english | disc | reasoning */
  var role = page.split("-")[1] || "test";        /* test | report | admin */
  var cfg = window.AAO_API_CONFIG || {};
  var base = String(cfg.assessmentsApi || "").replace(/\/+$/, "");
  var here = location.origin + location.pathname.replace(/[^\/]*$/, "");
  var FILES = {
    english: { test: "english.html", report: "english-certificate.html" },
    disc: { test: "disc.html", report: "disc-report.html" },
    reasoning: { test: "reasoning.html", report: "reasoning-report.html" }
  };
  var STORAGE_KEY = "aao-job-board-auth";

  function session() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (e) { return null; } }
  function demoUser() { try { return JSON.parse(sessionStorage.getItem("aao_demo_user") || "null"); } catch (e) { return null; } }
  window.AAO_TOKEN = function () { var s = session(); return (s && s.access_token) || ""; };
  /* AAO's backend is on its own address and signs requests with the token above, not with cookies. */
  window.AAO_FETCH_CREDENTIALS = "omit";

  var s = session(), u = s && s.user;
  var name = (u && u.user_metadata && u.user_metadata.full_name) || "", email = (u && u.email) || "";
  if (!name) { var d = demoUser(); if (d) { name = d.name || ""; email = d.email || ""; } }
  window.AAO_TESTS_LIVE = !!base;
  if (base) installTranslator();

  /* TRANSLATOR (AAO, 28 Nov 2026). The pages in this folder were written for Shem's original server. AAO's API (the job-board
     backend, decisions 85/86) answers in its own format, so this one place translates between the two. Only requests to the tests
     address are touched, and only once assessmentsApi is set; practice mode never gets here.
     - answers come back as { data }; errors as { error: { message } }: unwrapped / flattened, snake_case names also given in camelCase;
     - English recordings: the page sends them inside the submit; here each one is first uploaded straight to private storage
       through a one-time link (the API cannot take large uploads), then the answers are sent with the file names;
     - the admin pages' own paths (/{test}/results...) are mapped to /admin/test-results/{test}...;
     - a recording opens for administrators through a 60-second link. */
  function installTranslator() {
    var realFetch = window.fetch.bind(window);
    var admin = base.replace(/\/assessments$/, "/admin/test-results");
    var JSON_TYPE = { "Content-Type": "application/json" };

    function camel(v) {
      if (Array.isArray(v)) return v.map(camel);
      if (!v || typeof v !== "object") return v;
      var o = {};
      Object.keys(v).forEach(function (k) {
        o[k] = camel(v[k]);
        var c = k.replace(/_([a-z])/g, function (m, x) { return x.toUpperCase(); });
        if (c !== k && !(c in v)) o[c] = o[k];
      });
      return o;
    }
    function reply(status, body) { return new Response(JSON.stringify(body), { status: status, headers: JSON_TYPE }); }
    function fail(status, message) { var e = new Error(message); e.status = status; return e; }
    function auth() { var t = window.AAO_TOKEN(); return t ? { Authorization: "Bearer " + t } : {}; }
    /* One call to AAO's API: returns `data`, or throws with the API's own message. */
    function api(method, url, body) {
      return realFetch(url, { method: method, credentials: "omit", headers: Object.assign({}, auth(), body !== undefined ? JSON_TYPE : {}), body: body === undefined ? undefined : JSON.stringify(body) })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (j) {
            if (!res.ok) throw fail(res.status, (j && j.error && j.error.message) || "Request failed (" + res.status + ")");
            return j.data;
          });
        });
    }
    function flagList(v) { return Array.isArray(v) ? v : v ? String(v).split(",").filter(Boolean) : []; }

    /* ---------- English ---------- */
    function englishSubmit(fd) {
      var payload = JSON.parse(fd.get("payload") || "{}"), said = payload.speaking || {}, speaking = {};
      return ["s1", "s2"].reduce(function (chain, t) {
        return chain.then(function () {
          var blob = fd.get("audio_" + t);
          if (!blob || !blob.size) return;
          var type = String(blob.type || "").split(";")[0];
          if (!/^audio\/(webm|ogg|mp4)$/.test(type)) type = "audio/webm";
          return api("POST", base + "/english/audio/upload-url", { task: t, content_type: type, size: blob.size }).then(function (a) {
            return realFetch(a.upload.url, { method: "PUT", headers: Object.assign({}, a.upload.headers, { "Content-Type": type }), body: blob }).then(function (up) {
              if (!up.ok) throw fail(up.status, "Your recording could not be uploaded");
              speaking[t] = { file: a.file, seconds: Math.max(0, Math.min(600, Math.round((said[t] && said[t].seconds) || 0))) };
            });
          });
        });
      }, Promise.resolve()).then(function () {
        payload.speaking = speaking;
        return api("POST", base + "/english", payload);
      }).then(function (d) { return reply(201, camel(d)); });
    }
    function englishRow(r) {
      var s = r.scores || {}, f = r.flags || {}, ai = r.ai_scores || {};
      return {
        id: r.id, candidate_name: r.name, candidate_email: r.email || "", submitted_at: r.submitted_at, status: r.status,
        cert_code: r.certificate_code, reading_score: s.reading, listening_score: s.listening, writing_score: s.writing, speaking_score: s.speaking,
        overall_score: s.overall, ai_status: r.ai_status || (r.ai && r.ai.status), ai_writing_score: ai.writing, ai_speaking_score: ai.speaking,
        tab_switches: f.tabSwitches || 0, paste_attempts: f.pasteAttempts || 0,
        flags: Object.assign({}, f, { timedOutSections: flagList(f.timedOutSections) })
      };
    }
    function englishDetail(r) {
      var row = englishRow(r), ai = r.ai || {}, audio = {}, urls = {}, rec = r.recordings || {};
      var breakdown = (r.breakdown || []).map(camel);
      ["s1", "s2"].forEach(function (t) {
        if (rec[t]) { audio[t] = { seconds: rec[t].seconds }; urls[t] = base + "/english/results/" + encodeURIComponent(r.id) + "/audio/" + t; }
      });
      var right = function (secs) { return breakdown.filter(function (b) { return secs.indexOf(b.section) >= 0 && b.isCorrect; }).length; };
      return Object.assign(row, {
        ai_status: ai.status, ai_writing: ai.writing || null, ai_speaking: ai.speaking || null, ai_error: ai.error || null,
        writing: r.writing || {}, transcripts: r.transcripts || {}, audio: audio, audioUrls: urls, breakdown: breakdown,
        grammar_raw: right(["grammar"]), reading_raw: right(["grammar", "reading"]), listening_raw: right(["listening"]),
        reviewer_notes: (r.review && r.review.notes) || ""
      });
    }
    function englishCertificate(d) {
      var res = d.result || {};
      return { code: d.code, name: d.name, awardedOn: d.completed_on, overall: res.overall || {}, skills: res.skills || {} };
    }
    function minScoreFor(level) {
      var L = window.AAO_LEVELS, b = L && L.BANDS && L.BANDS.filter(function (x) { return x.level === level; })[0];
      return b ? b.min : null;
    }

    /* ---------- DISC and Reasoning (admin) ---------- */
    function testRow(r) {
      var f = r.flags || {};
      return {
        id: r.id, candidate_name: r.name, candidate_email: r.email || "", submitted_at: r.submitted_at, report_code: r.report_code,
        tab_switches: f.tabSwitches || 0, timed_out: !!f.timedOut, flags: f, result: camel(r.result || {}), breakdown: r.breakdown ? r.breakdown.map(camel) : null
      };
    }

    function route(method, path, query, init) {
      var m;
      if (method === "POST" && path === "/english" && init && typeof FormData !== "undefined" && init.body instanceof FormData) return englishSubmit(init.body);
      if (method === "GET" && (m = path.match(/^\/english\/certificate\/([A-Z0-9-]+)$/i))) {
        return api("GET", base + "/english/report/" + encodeURIComponent(m[1])).then(function (d) { return reply(200, englishCertificate(d)); });
      }
      if (method === "GET" && path === "/english/results") {
        var q = new URLSearchParams({ limit: "50" }), min = query.get("minLevel") ? minScoreFor(query.get("minLevel")) : null;
        if (query.get("status")) q.set("status", query.get("status"));
        if (min != null) q.set("min_score", String(min));
        return api("GET", admin + "/english?" + q).then(function (d) { return reply(200, { results: (d || []).map(englishRow) }); });
      }
      if ((m = path.match(/^\/english\/results\/([0-9a-f-]{36})(\/review|\/ai-rescore|\/audio\/(s1|s2))?$/i))) {
        var one = admin + "/english/" + m[1];
        if (method === "GET" && !m[2]) return api("GET", one).then(function (d) { return reply(200, englishDetail(d)); });
        if (method === "GET" && m[3]) {
          /* The API gives a 60-second link; the page wants the recording itself. */
          return api("GET", one + "/audio/" + m[3]).then(function (d) { return realFetch(d.url, { credentials: "omit" }); });
        }
        if (method === "PATCH" && m[2] === "/review") {
          var b = JSON.parse((init && init.body) || "{}"), sent = { writing_score: b.writingScore == null ? null : b.writingScore, speaking_score: b.speakingScore == null ? null : b.speakingScore };
          var body = Object.assign({}, sent, { approve: !!b.approve });
          if (b.notes) body.notes = String(b.notes);
          return api("PATCH", one + "/review", body).then(function (d) {
            return reply(200, { status: d.status, cert_code: d.certificate_code, overall_score: d.overall_score, writing_score: sent.writing_score, speaking_score: sent.speaking_score });
          });
        }
        if (method === "POST" && m[2] === "/ai-rescore") return api("POST", one + "/ai-rescore").then(function () { return reply(202, { ok: true }); });
      }
      if (method === "GET" && (m = path.match(/^\/(disc|reasoning)\/results(?:\/([0-9a-f-]{36}))?$/i))) {
        if (m[2]) return api("GET", admin + "/" + m[1] + "/" + m[2]).then(function (d) { return reply(200, testRow(d)); });
        var p = new URLSearchParams({ limit: "50" });
        if (query.get("minScore")) p.set("min_score", query.get("minScore"));
        if (query.get("style")) p.set("style", query.get("style"));
        return api("GET", admin + "/" + m[1] + "?" + p).then(function (d) { return reply(200, { results: (d || []).map(testRow) }); });
      }
      /* Everything else (submit DISC / Reasoning, eligibility, reports): same address, unwrapped. */
      return realFetch(base + path + (String(query) ? "?" + query : ""), Object.assign({}, init, { credentials: "omit" })).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (j) {
          if (!res.ok) return reply(res.status, { error: (j && j.error && j.error.message) || "Request failed (" + res.status + ")" });
          return reply(res.status, camel(j && "data" in j ? j.data : j));
        });
      });
    }

    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      if (url.indexOf(base + "/") !== 0) return realFetch(input, init);
      var u = new URL(url, location.href), path = u.pathname.slice(new URL(base, location.href).pathname.length);
      var method = String((init && init.method) || "GET").toUpperCase();
      return Promise.resolve().then(function () { return route(method, path, u.searchParams, init); }).catch(function (e) {
        return reply(e.status || 502, { error: e.message || "Request failed" });
      });
    };
  }

  if (role === "test") {
    window.AAO_CONFIG = {
      submitUrl: base ? base + "/" + kind : "",
      eligibilityUrl: base ? base + "/" + kind + "/eligibility" : "",
      reportUrl: "",                               /* VAs go back to their settings page; reports are opened from there */
      candidateName: name,
      candidateEmail: email,
      audio: (kind === "english" && cfg.englishListeningAudio) || {}
    };
  } else if (role === "report") {
    var rc = { apiBase: base, publicBaseUrl: here + FILES[kind].report + "?c=" };
    if (kind === "english") window.AAO_CERT_CONFIG = rc; else window.AAO_REPORT_CONFIG = rc;
  } else if (role === "admin") {
    window.AAO_ADMIN_CONFIG = {
      apiBase: base,
      certificateUrl: FILES.english.report + "?c=",
      discReportUrl: FILES.disc.report + "?c=",
      reasoningReportUrl: FILES.reasoning.report + "?c="
    };
  }

  /* Keep the sign-in fresh while a test is open (tokens last about an hour; the English test takes about 70 minutes). */
  if (cfg.supabaseUrl && cfg.supabaseAnonKey && role !== "report") {
    var sc = document.createElement("script");
    sc.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0";
    sc.integrity = "sha384-gnyZit14c5lnGcarmA166QQjjJXpucw25ogZXuwH3HxxY904zHkBqmxVpelsPorb";
    sc.crossOrigin = "anonymous";
    sc.onload = function () {
      try {
        var client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
          auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: STORAGE_KEY }
        });
        client.auth.getSession();
      } catch (e) { /* the saved token is still used */ }
    };
    document.head.appendChild(sc);
  }

  /* A way back to the AAO site, and a clear note in practice mode. */
  document.addEventListener("DOMContentLoaded", function () {
    if (role === "report") return;
    var bar = document.createElement("div");
    bar.setAttribute("style", "max-width:880px;margin:12px auto 0;padding:0 16px;font:600 14px/1.4 system-ui,sans-serif;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between");
    var back = role === "admin" ? "../admin.html#tests" : "../#va-settings";
    bar.innerHTML = '<a href="' + back + '" style="color:#1f4e79;text-decoration:none">' + (role === "admin" ? "← Back to admin" : "← Back to AAO") + '</a>' +
      (!base && role === "test" ? '<span style="background:#FFF6DB;border:1px solid #E8D28A;color:#5A4500;border-radius:8px;padding:6px 10px;font-weight:500">Practice mode: your answers are not saved yet.</span>' : "");
    document.body.insertBefore(bar, document.body.firstChild);
  });
})();
