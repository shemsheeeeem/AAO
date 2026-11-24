/* AAO contact guard: blocks contact details and links in VA profile text.
   One file, used in two places:
   - the website (loaded with <script src="aao-contact-guard.js">, available as window.AAOContactGuard)
   - a Node.js server (const guard = require("./aao-contact-guard.js")), so the backend can run the exact same checks.
   No dependencies. Tests: run  node --test  in the site folder.

   guard.check(text) -> { ok: true } or { ok: false, type: "email" | "phone" | "link" | "handle" | "contact", match: "..." }
   guard.issue(text) -> "" when the text is fine, otherwise the type
   guard.mask(text)  -> the text with any contact details replaced by "[contact removed]" (for showing old or unchecked data safely)
   guard.MESSAGE     -> the friendly message to show the VA */
(function (root, factory) {
  var guard = factory();
  if (typeof module === "object" && module.exports) module.exports = guard;
  else root.AAOContactGuard = guard;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MESSAGE = "For your safety, contact details and links aren’t allowed on your profile.";
  var MASK = "[contact removed]";

  /* Domain endings that are almost never normal words after a dot. Two-letter endings that are common
     words ("in", "my", "it", "to", "be") are left out to avoid blocking typos like "results.In". */
  var TLD = "(?:com|net|org|ph|io|co|me|ai|ly|gg|tv|us|uk|ca|au|sg|nz|biz|info|xyz|site|online|app|page|link|dev|shop|store|tech|website|blog|asia|club|live|life|studio|agency|digital|email|works|world|space|art|design|im|cc|ws|fm|bio|lol|social|pro)";
  /* Tool names that contain a dot but are skills, not links: Node.js, Next.js, ASP.NET, Monday.com, Make.com. Add more here if needed. */
  var SAFE_TECH = /\b(?:asp|vb|ado)\.net\b|\b[a-z0-9-]+\.js\b|(?:^|[^a-z0-9.\-])(?:monday|make)\.com\b(?!\/|\.[a-z])/gi;
  var NUM_WORDS = "(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)";

  var RULES = [
    /* email: name@domain.tld, also with spaces around @ and dots */
    { type: "email", re: /[a-z0-9._%+-]+\s*@\s*[a-z0-9-]+(?:\s*\.\s*[a-z0-9-]+)*\s*\.\s*[a-z]{2,}\b/gi },
    /* spelled-out email: "name at gmail dot com", "name(at)gmail(dot)com", "name [at] gmail [dot] com" */
    { type: "email", re: new RegExp("[a-z0-9._%+-]+\\s*[\\(\\[\\{]?\\s*(?:at|@)\\s*[\\)\\]\\}]?\\s*[a-z0-9-]+\\s*[\\(\\[\\{]?\\s*(?:dot|\\.)\\s*[\\)\\]\\}]?\\s*" + TLD + "\\b", "gi") },
    /* links: http(s)://, www. */
    { type: "link", re: /\b(?:https?:\/\/|www\s*\.)\S*/gi },
    /* links: bare domains such as sofia.com, sofia.com.ph, bit.ly/abc, t.me/name, fb.com/name, wa.me/63917... */
    { type: "link", re: new RegExp("\\b[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\s?\\." + TLD + "\\b(?:\\.[a-z]{2})?(?:\\/\\S*)?", "gi") },
    /* links: spelled-out domains such as "sofia dot com", "sofia (dot) ph" */
    { type: "link", re: new RegExp("\\b[a-z0-9-]+\\s*(?:\\(dot\\)|\\[dot\\]|\\{dot\\}|\\sdot\\s)\\s*" + TLD + "\\b", "gi") },
    /* handles: @name (must start with a letter or underscore, so "@9am" is fine) */
    { type: "handle", re: /(^|[^a-z0-9_.@])@[a-z_][a-z0-9_.]{1,}/gi },
    /* labelled handles: "IG: sofia_va", "FB - sofia.reyes", "TikTok: sofia2024" (handle-like: has . _ or a digit) */
    { type: "handle", re: /\b(?:ig|insta(?:gram)?|fb|facebook|tiktok|twitter|threads|linkedin|youtube|yt|pinterest)\s*(?:id|handle|username|account|acct|page)?\s*[:=\-–]\s*@?[a-z0-9_.]*[._\d][a-z0-9_.]*/gi },
    /* messaging apps with an ID: "Telegram: sofiareyes", "Skype: live:sofia", "Line ID: sofia" */
    { type: "handle", re: /\b(?:telegram|tg|whatsapp|viber|skype|wechat|discord|signal|kik|snapchat|line\s*id)\s*(?:id|handle|username|number|no\.?|#)?\s*[:=#]\s*\S{3,}/gi },
    /* asking to be contacted off AAO: "email me at", "message me on Viber", "my number is", "my IG is" */
    { type: "contact", re: /\b(?:email|e-mail|mail|text|call|dm|pm|message|msg|contact|reach|add|ping|find|follow)\s+me\s+(?:at|on|via|thru|through|@)\s+(?!aao\b|amazing assistants\b|this platform\b|the platform\b)\S+/gi },
    { type: "contact", re: /\bmy\s+(?:e-?mail|number|phone|cell|cellphone|mobile|landline|whatsapp|viber|telegram|skype|ig|insta(?:gram)?|fb|facebook|tiktok|linkedin|website|site|page|handle|socials?)\s*(?:number|no\.?|address|id|account)?\s*(?:is|:|=|-)\s*\S+/gi },
    /* phone: "+63 917...", spelled-out digits ("zero nine one seven ...") */
    { type: "phone", re: /\+\s?6\s?3\s?[\s\-.()]*\d/g },
    { type: "phone", re: new RegExp("\\b" + NUM_WORDS + "(?:[\\s,\\-]+" + NUM_WORDS + "){6,}\\b", "gi") }
  ];

  /* Number runs that look like a phone: 7+ digits with spaces, dots, dashes, slashes or brackets in between.
     Year ranges (2019-2021) and dates (2024-11-23, 23/11/2024) are allowed. */
  var PHONE_RUN = /\+?\(?\d[\d\s().\-\/]{5,}\d\)?/g;
  function isPhoneRun(s) {
    var t = s.trim(), d = t.replace(/\D/g, "");
    if (d.length < 7) return false;
    if (/^(?:19|20)\d{2}\s*[-–\/]\s*(?:19|20)\d{2}$/.test(t)) return false;
    if (/^\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2}$/.test(t)) return false;
    if (/^\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}$/.test(t)) return false;
    return true;
  }

  function normalize(text) {
    var t = String(text == null ? "" : text);
    if (t.normalize) t = t.normalize("NFKC"); /* full-width @ and digits become normal ones */
    t = t.replace(/[​-‍⁠﻿­]/g, ""); /* invisible characters used to sneak past filters */
    t = t.replace(/&amp;/g, "&").replace(/&#64;|&commat;/gi, "@").replace(/&#46;|&period;/gi, ".");
    return t;
  }
  function withoutSafeTech(t) { return t.replace(SAFE_TECH, function (m) { return m.replace(/\./g, " "); }); }

  function check(text) {
    var t = withoutSafeTech(normalize(text));
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i].re; r.lastIndex = 0;
      var m = r.exec(t);
      if (m) return { ok: false, type: RULES[i].type, match: m[0].trim() };
    }
    PHONE_RUN.lastIndex = 0;
    var p;
    while ((p = PHONE_RUN.exec(t))) if (isPhoneRun(p[0])) return { ok: false, type: "phone", match: p[0].trim() };
    return { ok: true };
  }
  function issue(text) { var r = check(text); return r.ok ? "" : r.type; }

  function mask(text) {
    var original = String(text == null ? "" : text);
    if (check(original).ok) return original;
    var t = withoutSafeTech(normalize(original));
    RULES.forEach(function (rule) {
      t = t.replace(rule.re, function (m, lead) {
        return (rule.type === "handle" && typeof lead === "string" && lead.length <= 1 && m.charAt(lead.length) === "@") ? lead + MASK : MASK;
      });
    });
    t = t.replace(PHONE_RUN, function (m) { return isPhoneRun(m) ? MASK : m; });
    return t;
  }

  return { check: check, issue: issue, mask: mask, MESSAGE: MESSAGE, MASK: MASK };
});
