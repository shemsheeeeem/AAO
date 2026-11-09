/* AAO Supabase messaging client for the marketing SPA */
(function () {
  "use strict";

  var state = {
    client: null,
    user: null,
    profile: null,
    conversationId: null,
    channel: null,
    peerName: "",
    talentSlug: ""
  };

  function cfg() {
    return window.AAO_SUPABASE || null;
  }

  function ready() {
    var c = cfg();
    return !!(c && c.url && c.anonKey && c.url.indexOf("YOUR_PROJECT") === -1 && window.supabase);
  }

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function ensureUi() {
    if ($("#aao-chat")) return;
    var wrap = document.createElement("div");
    wrap.id = "aao-chat";
    wrap.className = "aao-chat";
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML =
      '<button type="button" class="aao-chat-backdrop" aria-label="Close chat"></button>' +
      '<aside class="aao-chat-panel" role="dialog" aria-modal="true" aria-labelledby="aao-chat-title">' +
      '  <header class="aao-chat-head">' +
      '    <div><h2 id="aao-chat-title">Messages</h2><p class="aao-chat-sub">Sign in to chat</p></div>' +
      '    <button type="button" class="aao-chat-close" aria-label="Close">×</button>' +
      "  </header>" +
      '  <div class="aao-chat-status" id="aao-chat-status"></div>' +
      '  <div class="aao-chat-stream" id="aao-chat-stream"></div>' +
      '  <form class="aao-chat-form" id="aao-chat-form">' +
      '    <textarea id="aao-chat-input" rows="1" placeholder="Write a message…" required maxlength="5000"></textarea>' +
      '    <button type="submit">Send</button>' +
      "  </form>" +
      "</aside>";
    document.body.appendChild(wrap);

    wrap.addEventListener("click", function (e) {
      if (e.target.classList.contains("aao-chat-backdrop") || e.target.classList.contains("aao-chat-close")) {
        closeChat();
      }
    });
    $("#aao-chat-form").addEventListener("submit", function (e) {
      e.preventDefault();
      sendMessage();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && wrap.classList.contains("is-open")) closeChat();
    });
  }

  function setStatus(text, on) {
    var el = $("#aao-chat-status");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-on", !!on && !!text);
  }

  function openShell(title, sub) {
    ensureUi();
    var root = $("#aao-chat");
    root.classList.add("is-open");
    root.setAttribute("aria-hidden", "false");
    $("#aao-chat-title").textContent = title || "Messages";
    $(".aao-chat-sub").textContent = sub || "";
  }

  function closeChat() {
    var root = $("#aao-chat");
    if (!root) return;
    root.classList.remove("is-open");
    root.setAttribute("aria-hidden", "true");
    teardownChannel();
  }

  function teardownChannel() {
    if (state.channel && state.client) {
      try {
        state.client.removeChannel(state.channel);
      } catch (err) {}
    }
    state.channel = null;
  }

  function getClient() {
    if (!ready()) return null;
    if (state.client) return state.client;
    var c = cfg();
    state.client = window.supabase.createClient(c.url, c.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    return state.client;
  }

  async function ensureSessionFromDemo() {
    var client = getClient();
    if (!client) return null;

    var existing = await client.auth.getSession();
    if (existing.data && existing.data.session) {
      state.user = existing.data.session.user;
      return state.user;
    }

    var demo = null;
    try {
      demo = JSON.parse(sessionStorage.getItem("aao_demo_user") || "null");
    } catch (err) {
      demo = null;
    }
    if (!demo || !demo.email) return null;

    /* Never auto-sign with the demo password when the Job Board live API is configured. */
    if (window.AAOApi && typeof AAOApi.enabled === "function" && AAOApi.enabled()) {
      return null;
    }

    var signed = await client.auth.signInWithPassword({
      email: demo.email,
      password: "demo123"
    });
    if (signed.error) throw signed.error;
    state.user = signed.data.user;
    return state.user;
  }

  async function loadMyProfile() {
    var client = getClient();
    var { data, error } = await client
      .from("profiles")
      .select("id, email, full_name, role, talent_slug")
      .eq("id", state.user.id)
      .single();
    if (error) throw error;
    state.profile = data;
    return data;
  }

  function bubbleHtml(msg, meId) {
    var mine = msg.sender_id === meId;
    var when = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
    var body = String(msg.body || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    return (
      '<div class="aao-chat-bubble ' +
      (mine ? "me" : "them") +
      '">' +
      body +
      (when ? "<time>" + when + "</time>" : "") +
      "</div>"
    );
  }

  function renderMessages(rows) {
    var stream = $("#aao-chat-stream");
    if (!stream) return;
    if (!rows || !rows.length) {
      stream.innerHTML = '<p class="aao-chat-empty">No messages yet. Say hello and introduce what you need help with.</p>';
      return;
    }
    stream.innerHTML = rows.map(function (m) {
      return bubbleHtml(m, state.user.id);
    }).join("");
    stream.scrollTop = stream.scrollHeight;
  }

  async function loadMessages(conversationId) {
    var client = getClient();
    var { data, error } = await client
      .from("messages")
      .select("id, sender_id, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    renderMessages(data || []);
  }

  function subscribe(conversationId) {
    teardownChannel();
    var client = getClient();
    state.channel = client
      .channel("messages:" + conversationId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: "conversation_id=eq." + conversationId
        },
        function (payload) {
          var stream = $("#aao-chat-stream");
          if (!stream || !payload.new) return;
          if (stream.querySelector(".aao-chat-empty")) stream.innerHTML = "";
          stream.insertAdjacentHTML("beforeend", bubbleHtml(payload.new, state.user.id));
          stream.scrollTop = stream.scrollHeight;
        }
      )
      .subscribe();
  }

  async function sendMessage() {
    var input = $("#aao-chat-input");
    var btn = $("#aao-chat-form button");
    if (!input || !state.conversationId) return;
    var body = (input.value || "").trim();
    if (!body) return;
    btn.disabled = true;
    setStatus("", false);
    try {
      var client = getClient();
      var { error } = await client.from("messages").insert({
        conversation_id: state.conversationId,
        sender_id: state.user.id,
        body: body
      });
      if (error) throw error;
      input.value = "";
    } catch (err) {
      setStatus((err && err.message) || "Could not send message.", true);
    } finally {
      btn.disabled = false;
      input.focus();
    }
  }

  async function openWithTalent(talentSlug, peerName) {
    ensureUi();
    openShell(peerName || "Assistant", "Connecting…");
    setStatus("", false);
    $("#aao-chat-stream").innerHTML = '<p class="aao-chat-empty">Loading conversation…</p>';

    if (!ready()) {
      setStatus("Add messaging-config.js with your Supabase URL and anon key to enable live chat.", true);
      $(".aao-chat-sub").textContent = "Messaging not configured";
      return;
    }

    try {
      await ensureSessionFromDemo();
      if (!state.user) {
        setStatus("Sign in with a demo account first (client@aao.demo / demo123).", true);
        $(".aao-chat-sub").textContent = "Not signed in";
        return;
      }
      await loadMyProfile();
      if (state.profile.role !== "client" && state.profile.role !== "admin") {
        setStatus("Only client accounts can message assistants from this desk.", true);
        return;
      }

      var client = getClient();
      var { data: conv, error } = await client.rpc("start_conversation_by_slug", {
        p_talent_slug: talentSlug,
        p_subject: "Chat with " + (peerName || talentSlug)
      });
      if (error) throw error;

      state.conversationId = conv.id;
      state.talentSlug = talentSlug;
      state.peerName = peerName || talentSlug;
      openShell(state.peerName, "Direct message · AAO");
      await loadMessages(conv.id);
      subscribe(conv.id);
      $("#aao-chat-input").focus();
    } catch (err) {
      var msg = (err && err.message) || "Could not open chat.";
      if (/No VA profile for slug/i.test(msg)) {
        msg = "No Supabase VA profile for “" + talentSlug + "”. Set talent_slug on that VA in profiles (see supabase/README.md).";
      } else if (/Invalid login credentials/i.test(msg)) {
        msg = "Supabase Auth user missing. Create client@aao.demo / demo123 in Authentication → Users.";
      }
      setStatus(msg, true);
      $("#aao-chat-stream").innerHTML = '<p class="aao-chat-empty">Chat unavailable until Supabase is set up.</p>';
    }
  }

  async function syncAuthWithDemo(demoUser) {
    if (!ready() || !demoUser || !demoUser.email) return;
    if (window.AAOApi && typeof AAOApi.enabled === "function" && AAOApi.enabled()) return;
    try {
      var client = getClient();
      await client.auth.signInWithPassword({
        email: demoUser.email,
        password: "demo123"
      });
    } catch (err) {
      /* Configured later — Message will surface the error */
    }
  }

  async function signOutSupabase() {
    if (!state.client) return;
    try {
      await state.client.auth.signOut();
    } catch (err) {}
    state.user = null;
    state.profile = null;
    state.conversationId = null;
    teardownChannel();
    closeChat();
  }

  window.AAOMessaging = {
    ready: ready,
    openWithTalent: openWithTalent,
    syncAuthWithDemo: syncAuthWithDemo,
    signOut: signOutSupabase,
    close: closeChat
  };
})();
