/* Khadimni production hardening + real feature layer. Loaded after script.js. */
(function () {
  "use strict";

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
  }
  window.khadimniEscape = esc;

  /* ---------- API reliability ---------- */
  window.apiFetch = function (path, options) {
    options = options || {};
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, options.timeout || 15000);
    var headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    var body = options.body;
    if (body && typeof body !== "string") body = JSON.stringify(body);
    return fetch((window.__KHADIMNI_API_BASE__ || "/api") + path, {
      method: options.method || "GET", credentials: "include", headers: headers, body: body,
      signal: options.signal || controller.signal,
    }).then(function (res) {
      if (res.status === 204) return null;
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
        if (!res.ok) throw new Error((data && data.error) || ("خطأ " + res.status));
        return data;
      });
    }).catch(function (err) {
      if (err && err.name === "AbortError") throw new Error("انتهت مهلة الاتصال بالخادم");
      throw err;
    }).finally(function () { clearTimeout(timeout); });
  };
  window.apiGet = function (path) { return window.apiFetch(path); };
  window.apiPost = function (path, body) { return window.apiFetch(path, { method: "POST", body: body }); };
  window.apiPatch = function (path, body) { return window.apiFetch(path, { method: "PATCH", body: body }); };
  window.apiDelete = function (path) { return window.apiFetch(path, { method: "DELETE" }); };

  /* ---------- Safe icons ---------- */
  window.icon = function (name, size, color, extra) {
    size = size == null ? 18 : Number(size) || 18;
    color = color == null ? "currentColor" : String(color);
    name = String(name || "circle").replace(/[^a-zA-Z0-9_-]/g, "");
    var safeColor = color.replace(/[\"<>]/g, "");
    var safeExtra = "";
    if (extra && /fill\s*=/.test(extra)) {
      var m = String(extra).match(/fill\s*=\s*[\"']([^\"']+)[\"']/);
      if (m && /^[#a-zA-Z0-9().,_ -]+$/.test(m[1])) safeExtra = ' fill="' + m[1] + '"';
    }
    return '<i data-lucide="' + name + '" style="width:' + size + 'px;height:' + size + 'px;color:' + safeColor + ';"' + safeExtra + '></i>';
  };

  /* ---------- Better cache: no duplicate requests, short retry cooldown ---------- */
  window.ensureLoaded = function (key, fetcher) {
    var entry = STATE.cache[key];
    var now = Date.now();
    if (entry && entry.status === "loaded") return entry.data;
    if (entry && entry.status === "loading") return null;
    if (entry && entry.status === "error" && entry.retryAt && now < entry.retryAt) return null;
    STATE.cache[key] = { status: "loading", startedAt: now };
    Promise.resolve().then(fetcher).then(function (data) {
      STATE.cache[key] = { status: "loaded", data: data, loadedAt: Date.now() };
      render();
    }).catch(function (err) {
      STATE.cache[key] = { status: "error", error: (err && err.message) || "تعذر تحميل البيانات", retryAt: Date.now() + 5000 };
      render();
    });
    return null;
  };

  /* ---------- Registration/login validation ---------- */
  window.doRegister = function () {
    var fullName = val("reg-fullname"), email = val("reg-email"), phone = val("reg-phone");
    var password = val("reg-password"), confirm = val("reg-confirm");
    if (fullName.length < 2) return alert("أدخل الاسم الكامل");
    if (!email && !phone) return alert("أدخل بريداً إلكترونياً أو رقم هاتف");
    if (password.length < 8) return alert("كلمة المرور يجب أن تحتوي على 8 أحرف على الأقل");
    if (password !== confirm) return alert("كلمتا المرور غير متطابقتين");
    var body = { fullName: fullName, password: password, accountType: STATE.userType };
    if (email) body.email = email;
    if (phone) body.phone = phone;
    apiPost("/auth/register", body).then(function (res) {
      STATE.currentUser = res.user; invalidateAll(); go("home");
    }).catch(function (err) { alert(err.message || "تعذر إنشاء الحساب"); });
  };

  /* ---------- Navigation/history + call timer ---------- */
  window.go = function (screen, payload) {
    if (screen === "post-menu") { STATE.menuOpen = true; render(); return; }
    if (STATE.screen !== screen) STATE.history.push(STATE.screen);
    if (STATE.history.length > 40) STATE.history = STATE.history.slice(-40);
    if (typeof stopCallTimer === "function") stopCallTimer();
    STATE.screen = screen; STATE.payload = payload !== undefined ? payload : null; STATE.menuOpen = false;
    if (screen === "call" && typeof startCallTimer === "function") startCallTimer();
    render();
    var sr = document.getElementById("screen-root"); if (sr) sr.scrollTop = 0;
  };

  window.startCallTimer = function () {
    if (STATE.callTimer) clearInterval(STATE.callTimer);
    STATE.callSeconds = 0;
    STATE.callTimer = setInterval(function () {
      if (STATE.screen !== "call") { clearInterval(STATE.callTimer); STATE.callTimer = null; return; }
      STATE.callSeconds += 1; render();
    }, 1000);
  };
  window.stopCallTimer = function () { if (STATE.callTimer) clearInterval(STATE.callTimer); STATE.callTimer = null; };

  /* ---------- Real profile saving + location ---------- */
  window.saveProfile = function () {
    if (!requireAuthOr("سجّل الدخول لتعديل ملفك")) return;
    var body = {
      fullName: val("profile-fullname"), city: val("profile-city"), profession: val("profile-profession"),
      bio: val("profile-bio"), experienceYears: Number(val("profile-exp") || 0),
      skills: val("profile-skills").split(",").map(function (x) { return x.trim(); }).filter(Boolean),
      availableNow: !!document.getElementById("profile-available") && document.getElementById("profile-available").checked,
      hourlyOrJobPrice: val("profile-price"),
    };
    if (body.experienceYears < 0 || body.experienceYears > 80) return alert("سنوات الخبرة غير صالحة");
    apiPatch("/users/me", body).then(function (r) {
      STATE.currentUser = r.user; invalidateAll(); alert("تم حفظ الملف الشخصي بنجاح"); go("profile");
    }).catch(function (err) { alert(err.message || "تعذر حفظ الملف الشخصي"); });
  };

  window.saveMyLocation = function () {
    if (!navigator.geolocation) return alert("المتصفح لا يدعم تحديد الموقع");
    navigator.geolocation.getCurrentPosition(function (pos) {
      apiPatch("/users/me", { locationLat: pos.coords.latitude, locationLng: pos.coords.longitude }).then(function (r) {
        STATE.currentUser = r.user; alert("تم تحديث موقعك"); render();
      }).catch(function (e) { alert(e.message || "تعذر حفظ الموقع"); });
    }, function () { alert("تعذر الوصول إلى موقعك. اسمح للتطبيق باستخدام الموقع ثم حاول مرة أخرى."); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  };

  window.screenEditProfile = function () {
    var u = STATE.currentUser || {};
    return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      topBar("تعديل الملف الشخصي", true) +
      '<div class="scroll" style="padding:16px 20px;display:flex;flex-direction:column;gap:12px">' +
      field("user", "الاسم الكامل", "profile-fullname", "", esc(u.fullName || "")) +
      field("map-pin", "المدينة", "profile-city", "", esc(u.city || "")) +
      field("briefcase", "المهنة", "profile-profession", "", esc(u.profession || "")) +
      field("award", "سنوات الخبرة", "profile-exp", 'type="number" min="0" max="80"', esc(u.experienceYears || "")) +
      field("dollar-sign", "السعر أو الأجر", "profile-price", "", esc(u.hourlyOrJobPrice || "")) +
      field("tags", "المهارات (افصل بينها بفاصلة)", "profile-skills", "", esc((u.skills || []).join(", "))) +
      '<textarea id="profile-bio" rows="4" placeholder="نبذة عنك" style="width:100%;border-radius:16px;padding:12px;font-size:13px;background:var(--primarySofter);border:1px solid var(--border);color:var(--text)">' + esc(u.bio || "") + '</textarea>' +
      '<label style="display:flex;align-items:center;gap:10px;padding:12px;border-radius:16px;background:var(--card);border:1px solid var(--border)"><input id="profile-available" type="checkbox" ' + (u.availableNow ? "checked" : "") + '><span style="font-size:13px;color:var(--text)">متاح الآن لاستقبال الأعمال</span></label>' +
      '<button class="btn btn-outline" onclick="saveMyLocation()">' + icon("map-pin", 16) + ' تحديث موقعي الحالي</button>' +
      '</div><div style="padding:16px 20px;background:var(--card);border-top:1px solid var(--border)">' + btn("حفظ التعديلات", "saveProfile()") + '</div></div>';
  };

  /* ---------- Real nearby/geolocation ---------- */
  window.requestNearby = function () {
    if (!navigator.geolocation) return alert("تحديد الموقع غير مدعوم");
    navigator.geolocation.getCurrentPosition(function (pos) {
      STATE.geo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      invalidate("nearby:" + STATE.geo.lat.toFixed(3) + ":" + STATE.geo.lng.toFixed(3)); render();
    }, function () { alert("اسمح بالوصول إلى الموقع لعرض النتائج القريبة"); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  };
  window.screenNearby = function () {
    var g = STATE.geo;
    if (!g) return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' + topBar("بالقرب مني", true) +
      '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;text-align:center;gap:14px">' +
      '<div style="width:72px;height:72px;border-radius:24px;display:flex;align-items:center;justify-content:center;background:var(--primarySoft)">' + icon("map-pin", 32, "var(--primary)") + '</div>' +
      '<div style="font-weight:800;font-size:16px;color:var(--text)">اكتشف ما حولك</div><div style="font-size:12.5px;line-height:1.7;color:var(--sub)">سنستخدم موقعك الحالي للعثور على العمال والوظائف القريبة منك.</div>' +
      btn("تحديد موقعي وعرض النتائج", "requestNearby()") + '</div></div>';
    var key = "nearby:" + g.lat.toFixed(3) + ":" + g.lng.toFixed(3);
    var data = ensureLoaded(key, function () { return apiGet("/nearby?lat=" + encodeURIComponent(g.lat) + "&lng=" + encodeURIComponent(g.lng) + "&radius=50&limit=50"); });
    if (!data) return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' + topBar("بالقرب مني", true) + loadingRow() + '</div>';
    var workers = (data.workers || []).map(function (w) { var m = mapWorkerCard(w); return '<button class="card" onclick="go(\'worker-profile\',\'' + m.id + '\')" style="display:flex;align-items:center;gap:10px;padding:12px;border-radius:16px;text-align:right">' + avatar(m.seed,44,m.available) + '<div style="flex:1"><b style="font-size:13px;color:var(--text)">' + esc(m.name) + '</b><div style="font-size:11px;color:var(--sub)">' + esc(m.job) + ' · ' + Number(w.distanceKm).toFixed(1) + ' كم</div>' + stars(m.rating,11) + '</div></button>'; }).join("");
    var jobs = (data.jobs || []).map(function (j) { return jobCard(Object.assign(mapJobCard(j), { dist: Number(j.distanceKm).toFixed(1) })); }).join("");
    return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' + topBar("بالقرب مني", true) + '<div class="scroll" style="padding:16px 20px;display:flex;flex-direction:column;gap:18px">' + section("العمال القريبون", workers || emptyRow("لا يوجد عمال مسجلون بموقع قريب")) + section("الوظائف القريبة", jobs || emptyRow("لا توجد وظائف بموقع قريب")) + '</div></div>';
  };

  /* ---------- Real activity ---------- */
  window.screenActivity = function () {
    if (!requireAuthOr("سجّل الدخول لعرض نشاطك")) return "";
    var data = ensureLoaded("activity", function () { return apiGet("/activity"); });
    if (!data) return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' + topBar("سجل النشاط", true) + loadingRow() + '</div>';
    var s = data.stats || {};
    var rows = [
      ["وظائف منشورة", s.jobsPosted, "briefcase"], ["خدمات منشورة", s.servicesPosted, "wrench"],
      ["طلبات توظيف", s.applicationsSent, "send"], ["مفضلة", s.favorites, "heart"],
      ["تقييمات أعطيتها", s.ratingsGiven, "star"], ["تقييمات استلمتها", s.ratingsReceived, "badge-check"],
      ["رسائل أرسلتها", s.messagesSent, "message-circle"], ["رسائل واردة", s.messagesReceived, "inbox"],
    ];
    var cards = rows.map(function (r) { return '<div class="card" style="border-radius:16px;padding:14px">' + icon(r[2],17,"var(--primary)") + '<div style="font-weight:900;font-size:18px;margin-top:7px;color:var(--text)">' + Number(r[1] || 0) + '</div><div style="font-size:10.5px;color:var(--sub)">' + r[0] + '</div></div>'; }).join("");
    return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' + topBar("سجل النشاط", true) + '<div class="scroll" style="padding:16px 20px"><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' + cards + '</div></div></div>';
  };

  /* ---------- Real ratings ---------- */
  window.postRating = function (targetId) {
    var value = Number(val("rating-value")), comment = val("rating-comment");
    if (!value || value < 1 || value > 5) return alert("اختر تقييماً من 1 إلى 5");
    apiPost("/users/" + targetId + "/ratings", { value: value, comment: comment || null }).then(function () { invalidate("ratings:" + targetId); invalidate("worker:" + targetId); alert("تم إرسال تقييمك"); render(); }).catch(function (e) { alert(e.message || "تعذر إرسال التقييم"); });
  };
  window.screenRatings = function () {
    var targetId = STATE.payload || (STATE.currentUser && STATE.currentUser.id);
    if (!targetId) return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' + topBar("التقييمات", true) + emptyRow("لا يوجد مستخدم محدد") + '</div>';
    var data = ensureLoaded("ratings:" + targetId, function () { return apiGet("/users/" + targetId + "/ratings"); });
    if (!data) return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' + topBar("التقييمات", true) + loadingRow() + '</div>';
    var list = data.ratings || [];
    var avg = list.length ? list.reduce(function (a, r) { return a + Number(r.value); }, 0) / list.length : 0;
    var reviews = list.map(function (r) { var starsHtml = ""; for (var i=1;i<=5;i++) starsHtml += icon("star",11,"var(--amber)",i<=r.value?'fill="var(--amber)"':''); return '<div class="card" style="border-radius:16px;padding:14px"><div style="display:flex;gap:10px;align-items:center">' + avatar(seedFromId(r.raterUserId),34) + '<div><b style="font-size:12.5px;color:var(--text)">' + esc(r.rater && r.rater.fullName || "مستخدم") + '</b><div>' + starsHtml + '</div></div></div><p style="font-size:12px;line-height:1.6;color:var(--sub)">' + esc(r.comment || "بدون تعليق") + '</p></div>'; }).join("");
    var form = STATE.currentUser && String(STATE.currentUser.id) !== String(targetId) ? '<div class="card" style="padding:14px;border-radius:16px;margin-bottom:12px"><div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px">أضف تقييمك</div><select id="rating-value" style="width:100%;height:42px;border-radius:12px;border:1px solid var(--border);background:var(--primarySofter);color:var(--text);padding:0 10px"><option value="">اختر التقييم</option><option value="5">★★★★★ ممتاز</option><option value="4">★★★★ جيد جداً</option><option value="3">★★★ جيد</option><option value="2">★★ يحتاج تحسين</option><option value="1">★ ضعيف</option></select><textarea id="rating-comment" rows="3" placeholder="تعليق اختياري" style="width:100%;margin-top:8px;border-radius:12px;padding:10px;border:1px solid var(--border);background:var(--primarySofter);color:var(--text)"></textarea><button class="btn btn-primary" style="margin-top:8px;width:100%" onclick="postRating(\'' + targetId + '\')">إرسال التقييم</button></div>' : "";
    return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' + topBar("التقييمات", true) + '<div class="scroll" style="padding:16px 20px"><div class="card" style="border-radius:16px;padding:18px;text-align:center;margin-bottom:12px"><div style="font-size:28px;font-weight:900;color:var(--primaryDark)">' + avg.toFixed(1) + '</div><div>' + "★★★★★" + '</div><div style="font-size:11px;color:var(--sub)">' + list.length + ' تقييم</div></div>' + form + '<div style="display:flex;flex-direction:column;gap:10px">' + (reviews || emptyRow("لا توجد تقييمات بعد")) + '</div></div></div>';
  };

  /* ---------- Real AI ---------- */
  window.sendAI = function (text) {
    var input = document.getElementById("ai-input");
    var q = text || (input && input.value.trim()); if (!q) return;
    if (!STATE.aiMessages) STATE.aiMessages = [{ from: "ai", text: "مرحباً بك في خدمني 👋" }];
    STATE.aiMessages.push({ from: "me", text: q }); if (input) input.value = ""; render();
    var history = STATE.aiMessages.filter(function (m) { return m.from === "me" || m.from === "ai"; }).slice(-10).map(function (m) { return { role: m.from === "me" ? "user" : "assistant", content: m.text }; });
    apiPost("/ai/chat", { message: q, history: history.slice(0, -1) }).then(function (r) {
      STATE.aiMessages.push({ from: "ai", text: r.answer }); render();
      var scroll = document.getElementById("ai-scroll"); if (scroll) scroll.scrollTop = scroll.scrollHeight;
    }).catch(function (e) { STATE.aiMessages.push({ from: "ai", text: e.message || "تعذر الاتصال بالمساعد الذكي" }); render(); });
  };

  /* ---------- Real notifications read actions ---------- */
  window.markNotificationRead = function (id) { apiPost("/notifications/" + id + "/read").then(function () { invalidate("notifications"); render(); }).catch(function (e) { alert(e.message || "تعذر تحديث الإشعار"); }); };
  window.markAllNotificationsRead = function () { apiPost("/notifications/read-all").then(function () { invalidate("notifications"); render(); }).catch(function (e) { alert(e.message || "تعذر تحديث الإشعارات"); }); };
  window.screenNotifications = function () {
    if (!STATE.currentUser) return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' + authRequiredCard("سجّل الدخول لعرض إشعاراتك") + '</div>';
    var data = ensureLoaded("notifications", function () { return apiGet("/notifications").then(function (r) { return r.notifications; }); });
    if (!data) return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' + topBar("الإشعارات", true) + loadingRow() + '</div>';
    var list = data.map(function (n) { return '<button onclick="markNotificationRead(\'' + n.id + '\')" style="width:100%;display:flex;align-items:center;gap:12px;padding:14px 20px;border:0;border-bottom:1px solid var(--border);text-align:right;background:' + (n.read ? "transparent" : "var(--primarySofter)") + '">' + icon("bell",17,"var(--primaryDark)") + '<div style="flex:1"><div style="font-weight:700;font-size:12.5px;color:var(--text)">' + esc(n.title) + '</div><div style="font-size:11.5px;color:var(--sub)">' + esc(n.body || "") + '</div><div style="font-size:10px;color:var(--sub)">' + timeAgo(n.createdAt) + '</div></div>' + (!n.read ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--primary)"></span>' : '') + '</button>'; }).join("");
    return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' + topBar("الإشعارات", true, '<button class="icon-btn" onclick="markAllNotificationsRead()">' + icon("check-check",18,"var(--primary)") + '</button>') + '<div class="scroll">' + (list || emptyRow("لا توجد إشعارات")) + '</div></div>';
  };

  /* ---------- Real search with filters ---------- */
  window.searchQuery = "";
  window.runSearch = function () { STATE.searchQuery = val("global-search") || ""; invalidate("search:" + (STATE.searchQuery || "all") + ":" + (STATE.searchTab || "all")); render(); };
  window.screenSearch = function () {
    var tab = STATE.searchTab || "all", q = STATE.searchQuery || "";
    var key = "search:" + (q || "all") + ":" + tab;
    var endpoint = tab === "workers" ? "/workers?limit=50" : tab === "services" ? "/services?limit=50" : "/jobs?limit=50";
    var data = ensureLoaded(key, function () { return apiGet(endpoint); });
    var list = "";
    if (data) {
      if (tab === "workers") list = (data.workers || []).filter(function(w){return !q || [w.fullName,w.profession,w.city].join(" ").toLowerCase().indexOf(q.toLowerCase())>=0;}).map(function(w){var m=mapWorkerCard(w);return '<button class="card" onclick="go(\'worker-profile\',\''+m.id+'\')" style="width:100%;padding:12px;border-radius:16px;display:flex;gap:10px;text-align:right">'+avatar(m.seed,44,m.available)+'<div><b style="color:var(--text);font-size:13px">'+esc(m.name)+'</b><div style="font-size:11px;color:var(--sub)">'+esc(m.job)+' · '+esc(m.city)+'</div>'+stars(m.rating,11)+'</div></button>';}).join("");
      else if (tab === "services") list = (data.services || []).filter(function(s){return !q || [s.name,s.description,s.city].join(" ").toLowerCase().indexOf(q.toLowerCase())>=0;}).map(function(s){return '<div class="card" style="padding:14px;border-radius:16px"><b style="font-size:13px;color:var(--text)">'+esc(s.name)+'</b><div style="font-size:11px;color:var(--sub)">'+esc(s.city||"")+'</div><div style="font-weight:800;color:var(--primaryDark)">'+(s.price?Number(s.price).toLocaleString("ar")+" دج":"")+'</div></div>';}).join("");
      else list = (data.jobs || []).filter(function(j){return !q || [j.title,j.description,j.city].join(" ").toLowerCase().indexOf(q.toLowerCase())>=0;}).map(function(j){return jobCard(mapJobCard(j));}).join("");
    }
    return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden"><div style="padding:16px 20px;background:var(--card);border-bottom:1px solid var(--border)"><div style="font-weight:800;font-size:16px;color:var(--text);margin-bottom:10px">البحث</div><div style="display:flex;gap:8px"><input id="global-search" value="'+esc(q)+'" onkeydown="if(event.key===\'Enter\')runSearch()" placeholder="ابحث عن عمل أو عامل أو خدمة" style="flex:1;height:44px;border-radius:14px;border:1px solid var(--border);background:var(--primarySofter);padding:0 12px;color:var(--text)"><button class="icon-btn" onclick="runSearch()" style="background:var(--primary);color:#fff">'+icon("search",17,"#fff")+'</button></div><div style="display:flex;gap:8px;margin-top:10px">'+["all","jobs","workers","services"].map(function(t){return '<button class="chip" onclick="STATE.searchTab=\''+t+'\';runSearch()" style="background:'+(tab===t?'var(--primary)':'var(--primarySoft)')+';color:'+(tab===t?'#fff':'var(--primaryDark)')+'">'+({all:"الكل",jobs:"وظائف",workers:"عمال",services:"خدمات"}[t])+'</button>';}).join("")+'</div></div><div class="scroll" style="padding:16px 20px;display:flex;flex-direction:column;gap:10px">'+(list||emptyRow("لا توجد نتائج"))+'</div></div>';
  };

  /* ---------- Real post validation ---------- */
  var oldPostJob = window.doPostJob;
  window.doPostJob = function () {
    var salary = val("job-salary"), workers = Number(val("job-workers") || 1), exp = Number(val("job-exp") || 0);
    if (salary && (!/^\d+(\.\d{1,2})?$/.test(salary) || Number(salary) < 0)) return alert("الراتب يجب أن يكون رقماً موجباً");
    if (!Number.isInteger(workers) || workers < 1 || workers > 100) return alert("عدد العمال غير صالح");
    if (!Number.isInteger(exp) || exp < 0 || exp > 80) return alert("سنوات الخبرة غير صالحة");
    return oldPostJob();
  };
  var oldPostService = window.doPostService;
  window.doPostService = function () {
    var price = val("svc-price");
    if (price && (!/^\d+(\.\d{1,2})?$/.test(price) || Number(price) < 0)) return alert("السعر يجب أن يكون رقماً موجباً");
    return oldPostService();
  };

  /* ---------- Dark mode persistence ---------- */
  function applyTheme() {
    var dark = !!STATE.dark;
    document.documentElement.classList.toggle("khadimni-dark", dark);
    try { localStorage.setItem("khadimni-dark", dark ? "1" : "0"); } catch (_) {}
  }
  try { STATE.dark = localStorage.getItem("khadimni-dark") === "1"; } catch (_) {}
  var style = document.createElement("style");
  style.textContent = '.khadimni-dark{--bg:#0b1712;--card:#13231a;--primarySoft:#173d28;--primarySofter:#102a1c;--text:#ecf8ef;--sub:#9bb7a5;--border:#254936}.khadimni-dark body{background:#050b07}.khadimni-dark .topbar,.khadimni-dark .bottomnav{background:var(--card)}';
  document.head.appendChild(style); applyTheme();
  window.toggleDarkMode = function () { STATE.dark = !STATE.dark; applyTheme(); render(); };
  window.toggleLanguage = function () { STATE.lang = STATE.lang === "ar" ? "fr" : "ar"; document.documentElement.lang = STATE.lang; document.documentElement.dir = STATE.lang === "ar" ? "rtl" : "ltr"; render(); };
  window.screenSettings = function () {
    return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' + topBar("الإعدادات", true) + '<div class="scroll" style="padding:16px 20px;display:flex;flex-direction:column;gap:12px"><div class="card" style="border-radius:16px;overflow:hidden">' + settingsRow("user","تعديل البيانات",icon("chevron-left",16),"go(\'edit-profile\')") + settingsRow("globe","اللغة",'<span style="font-weight:700;color:var(--primary)">'+(STATE.lang==="ar"?"العربية":"Français")+'</span>',"toggleLanguage()") + settingsRow("moon","الوضع الليلي",'<span style="font-size:12px;color:var(--primary)">'+(STATE.dark?"مفعّل":"متوقف")+'</span>',"toggleDarkMode()") + settingsRow("map-pin","تحديث موقعي",icon("chevron-left",16),"saveMyLocation()") + '</div><div class="card" style="border-radius:16px;overflow:hidden">' + settingsRow("bell","الإشعارات",icon("chevron-left",16),"go(\'notifications\')") + settingsRow("activity","سجل النشاط",icon("chevron-left",16),"go(\'activity\')") + settingsRow("star","التقييمات",icon("chevron-left",16),"go(\'ratings\')") + '</div></div></div>';
  };

  /* ---------- Apply registry overrides and repaint after this file loads ---------- */
  if (typeof SCREENS !== "undefined") {
    SCREENS["search"] = window.screenSearch;
    SCREENS["nearby"] = window.screenNearby;
    SCREENS["activity"] = window.screenActivity;
    SCREENS["ratings"] = window.screenRatings;
    SCREENS["edit-profile"] = window.screenEditProfile;
    SCREENS["settings"] = window.screenSettings;
    SCREENS["notifications"] = window.screenNotifications;
  }
  applyTheme();
  if (typeof render === "function") render();
})();
