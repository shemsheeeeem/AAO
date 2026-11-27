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
    var back = role === "admin" ? "../#admin" : "../#va-settings";
    bar.innerHTML = '<a href="' + back + '" style="color:#1f4e79;text-decoration:none">← Back to AAO</a>' +
      (!base && role === "test" ? '<span style="background:#FFF6DB;border:1px solid #E8D28A;color:#5A4500;border-radius:8px;padding:6px 10px;font-weight:500">Practice mode: your answers are not saved yet.</span>' : "");
    document.body.insertBefore(bar, document.body.firstChild);
  });
})();
