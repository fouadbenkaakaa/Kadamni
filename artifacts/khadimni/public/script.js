/* ============================================================
   خدمني — Vanilla JS application
   Now wired to the real @workspace/api-server backend instead of
   mock data. Organized to mirror a component-based structure:
     - API         : fetch helpers + generic cache/loading pattern
     - DATA        : small static/demo data (categories, and mock
                     data still used by screens without a backend
                     endpoint yet: Nearby map, Activity log)
     - STATE       : global reactive app state
     - UI HELPERS  : small reusable "components" (return HTML strings)
     - SCREENS     : one render function per screen (like a page/view)
     - NAV         : go()/back() router
     - RENDER      : main render loop
   ============================================================ */

/* ---------------------------- API ---------------------------- */
var API_BASE = (typeof window !== "undefined" && window.__KHADIMNI_API_BASE__) || "/api";

function apiFetch(path, options) {
  options = options || {};
  options.credentials = "include";
  options.headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  if (options.body && typeof options.body !== "string") options.body = JSON.stringify(options.body);
  return fetch(API_BASE + path, options).then(function(res) {
    if (res.status === 204) return null;
    return res.json().catch(function() { return null; }).then(function(data) {
      if (!res.ok) throw new Error((data && data.error) || ("خطأ " + res.status));
      return data;
    });
  });
}
function apiGet(path) { return apiFetch(path); }
function apiPost(path, body) { return apiFetch(path, { method: "POST", body: body }); }
function apiPatch(path, body) { return apiFetch(path, { method: "PATCH", body: body }); }
function apiDelete(path) { return apiFetch(path, { method: "DELETE" }); }

function val(id) {
  var el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

// Generic cache + loading pattern: screens call ensureLoaded(key, fetcher)
// while building their HTML. The first call kicks off the fetch and
// returns null (so the screen can show a loading state); once the fetch
// resolves the cache is filled and render() is called again, at which
// point ensureLoaded returns the data synchronously.
function ensureLoaded(key, fetcher) {
  var entry = STATE.cache[key];
  if (entry && entry.status === "loaded") return entry.data;
  if (!entry || entry.status !== "loading") {
    STATE.cache[key] = { status: "loading" };
    fetcher().then(function(data) {
      STATE.cache[key] = { status: "loaded", data: data };
      render();
    }).catch(function(err) {
      STATE.cache[key] = { status: "error", error: (err && err.message) || "تعذر تحميل البيانات" };
      render();
    });
  }
  return null;
}
function invalidate(key) { delete STATE.cache[key]; }
function invalidateAll() { STATE.cache = {}; }

function loadingRow() {
  return '<div style="text-align:center;padding:24px;color:var(--sub);font-size:12px">جارِ التحميل...</div>';
}
function emptyRow(msg) {
  return '<div style="text-align:center;padding:24px;color:var(--sub);font-size:12px">' + msg + "</div>";
}
function errorRow(msg) {
  return '<div style="text-align:center;padding:24px;color:#EF4444;font-size:12px">' + msg + "</div>";
}
function cacheStatus(key) {
  var e = STATE.cache[key];
  return e ? e.status : "idle";
}

function timeAgo(iso) {
  if (!iso) return "";
  var diffMs = Date.now() - new Date(iso).getTime();
  var mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return "منذ " + mins + " دقيقة";
  var hours = Math.floor(mins / 60);
  if (hours < 24) return "منذ " + hours + " ساعة";
  var days = Math.floor(hours / 24);
  return "منذ " + days + " يوم";
}

// Deterministic-ish avatar seed (1-70) derived from a uuid string, since
// the demo avatars come from pravatar.cc/img=<1-70>.
function seedFromId(id) {
  var s = String(id || "x");
  var h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 70) + 1;
}

function mapWorkerCard(w) {
  return {
    id: w.id,
    name: w.fullName,
    job: w.profession || "عامل",
    city: w.city || "",
    rating: parseFloat(w.ratingAverage) || 0,
    reviews: w.ratingCount || 0,
    exp: w.experienceYears ? (w.experienceYears + " سنوات") : "",
    done: w.completedJobsCount || 0,
    available: !!w.availableNow,
    price: w.hourlyOrJobPrice || "",
    bio: w.bio || "",
    skills: w.skills || [],
    seed: seedFromId(w.id),
  };
}

function mapJobCard(j) {
  return {
    id: j.id,
    title: j.title,
    company: (j.employer && j.employer.fullName) || "",
    city: j.city || "",
    dist: null,
    salary: j.salary ? Number(j.salary).toLocaleString("ar") : "",
    time: timeAgo(j.createdAt),
    urgent: false,
  };
}

/* ---------------------------- DATA ---------------------------- */
// Static category list (cosmetic, just navigates to Results).
const CATEGORIES = [
  { id: 1, name: "البناء",   icon: "building-2" },
  { id: 2, name: "النقل",    icon: "truck" },
  { id: 3, name: "التجارة",  icon: "shopping-bag" },
  { id: 4, name: "التعليم",  icon: "graduation-cap" },
  { id: 5, name: "التقنية",  icon: "wrench" },
  { id: 6, name: "الزراعة",  icon: "leaf" },
  { id: 7, name: "الطبخ",    icon: "utensils-crossed" },
  { id: 8, name: "أخرى",     icon: "more-horizontal" },
];

// Demo-only data — still used by the Nearby map and Activity log screens,
// which don't have a backend endpoint yet (geolocation search, activity
// stats). Everything else in the app now uses the real API.
const MOCK_WORKERS = [
  {
    id: 1, name: "أحمد محمد", job: "كهربائي محترف", city: "الجزائر العاصمة",
    dist: "1.8", rating: 4.9, reviews: 256, exp: "5 سنوات",
    done: 120, available: true, price: "80,000", seed: 11,
  },
  { id: 2, name: "ياسين قادر", job: "سائق نقل سريع", city: "وهران", dist: "4.5", rating: 4.5, reviews: 98, exp: "3 سنوات", done: 76, available: true, price: "70,000", seed: 12 },
  { id: 3, name: "كريم نجار", job: "نجار أثاث", city: "قسنطينة", dist: "3.2", rating: 4.2, reviews: 61, exp: "6 سنوات", done: 88, available: false, price: "60,000", seed: 13 },
  { id: 4, name: "سامي بلحاج", job: "سباك خبير", city: "البليدة", dist: "2.1", rating: 4.7, reviews: 143, exp: "8 سنوات", done: 150, available: true, price: "65,000", seed: 14 },
];
const MOCK_JOBS = [
  { id: 1, title: "مطلوب كهربائي", company: "شركة البناء الحديث", city: "الجزائر العاصمة", dist: "2.1", salary: "80,000", time: "منذ 10 دقائق", urgent: true },
  { id: 2, title: "مطلوب سائق", company: "مؤسسة النقل السريع", city: "وهران", dist: "4.5", salary: "70,000", time: "منذ ساعة", urgent: false },
  { id: 3, title: "مطلوب نجار", company: "الأثاث الأخضر", city: "قسنطينة", dist: "3.2", salary: "60,000", time: "منذ يومين", urgent: false },
];

/* ---------------------------- STATE ---------------------------- */
const STATE = {
  screen: "splash",
  history: [],
  payload: null,
  filterOpen: false,
  menuOpen: false,
  userType: "seeker",
  dark: false,
  lang: "ar",
  callSeconds: 15,
  callTimer: null,
  callMicOn: true,
  callSpeakerOn: false,
  searchTab: "all",
  notifTab: "all",
  aiMessages: null,
  currentUser: null,
  sessionChecked: false,
  cache: {},
};

/* ---------------------------- AUTH ---------------------------- */
function checkSession() {
  apiGet("/auth/me").then(function(res) {
    STATE.currentUser = res.user;
  }).catch(function() {
    STATE.currentUser = null;
  }).then(function() {
    STATE.sessionChecked = true;
    if (STATE.screen === "splash") {
      // screenSplash's own timer will pick this up; nothing to do here
      // unless it already fired and is waiting.
    } else {
      render();
    }
  });
}

function doRegister() {
  const fullName = val("reg-fullname");
  const email = val("reg-email");
  const phone = val("reg-phone");
  const password = val("reg-password");
  const confirm = val("reg-confirm");
  if (!fullName || !password) { alert("الرجاء تعبئة الاسم وكلمة المرور (8 أحرف على الأقل)"); return; }
  if (!email && !phone) { alert("أدخل بريداً إلكترونياً أو رقم هاتف"); return; }
  if (password !== confirm) { alert("كلمتا المرور غير متطابقتين"); return; }

  const body = { fullName: fullName, password: password, accountType: STATE.userType };
  if (email) body.email = email;
  if (phone) body.phone = phone;

  apiPost("/auth/register", body).then(function(res) {
    STATE.currentUser = res.user;
    invalidateAll();
    go("home");
  }).catch(function(err) {
    alert(err.message || "تعذر إنشاء الحساب");
  });
}

function doLogin() {
  const identifier = val("login-identifier");
  const password = val("login-password");
  if (!identifier || !password) { alert("أدخل البريد/الهاتف وكلمة المرور"); return; }

  apiPost("/auth/login", { identifier: identifier, password: password }).then(function(res) {
    STATE.currentUser = res.user;
    invalidateAll();
    go("home");
  }).catch(function(err) {
    alert(err.message || "بيانات الدخول غير صحيحة");
  });
}

function doLogout() {
  apiPost("/auth/logout").catch(function() {}).then(function() {
    STATE.currentUser = null;
    invalidateAll();
    go("welcome");
  });
}

function requireAuthOr(redirectMessage) {
  if (STATE.currentUser) return true;
  alert(redirectMessage || "الرجاء تسجيل الدخول أولاً");
  go("login");
  return false;
}

function authRequiredCard(message) {
  return (
    '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:40px 24px;text-align:center">' +
      '<div style="font-size:13px;color:var(--sub)">' + message + "</div>" +
      btn("تسجيل الدخول", "go('login')") +
    "</div>"
  );
}

/* ---------------------------- FAVORITES ---------------------------- */
function loadFavoritesIfNeeded() {
  if (!STATE.currentUser) return;
  ensureLoaded("favorites", function() {
    return apiGet("/favorites").then(function(r) { return r.favorites; });
  });
}
function isFav(targetType, targetId) {
  const entry = STATE.cache.favorites;
  if (!entry || entry.status !== "loaded") return false;
  return entry.data.some(function(f) { return f.targetType === targetType && String(f.targetId) === String(targetId); });
}
function toggleFav(targetType, targetId) {
  if (!requireAuthOr("سجّل الدخول لإضافة عناصر للمفضلة")) return;
  const entry = STATE.cache.favorites;
  const favs = (entry && entry.data) || [];
  const existing = favs.find(function(f) { return f.targetType === targetType && String(f.targetId) === String(targetId); });
  const p = existing ? apiDelete("/favorites/" + existing.id) : apiPost("/favorites", { targetType: targetType, targetId: targetId });
  p.then(function() {
    invalidate("favorites");
    render();
  }).catch(function(err) { alert(err.message || "حدث خطأ"); });
}

/* ---------------------------- CONVERSATIONS / CHAT ---------------------------- */
function openChatWith(otherUserId) {
  if (!requireAuthOr("سجّل الدخول لبدء محادثة")) return;
  if (STATE.currentUser && String(otherUserId) === String(STATE.currentUser.id)) return;
  apiPost("/conversations", { otherUserId: otherUserId }).then(function(res) {
    invalidate("conversations");
    go("chat", res.conversation.id);
  }).catch(function(err) { alert(err.message || "تعذر بدء المحادثة"); });
}

function sendChat(convId) {
  const input = document.getElementById("chat-input");
  if (!input || !input.value.trim()) return;
  const text = input.value.trim();
  input.value = "";
  apiPost("/conversations/" + convId + "/messages", { type: "text", content: text }).then(function() {
    invalidate("messages:" + convId);
    invalidate("conversations");
    render();
    const scroll = document.getElementById("chat-scroll");
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }).catch(function(err) { alert(err.message || "تعذر إرسال الرسالة"); });
}

function resolveCallPeer(id) {
  const wEntry = STATE.cache["worker:" + id];
  if (wEntry && wEntry.status === "loaded") {
    return { name: wEntry.data.fullName, seed: seedFromId(id) };
  }
  const cEntry = STATE.cache.conversations;
  if (cEntry && cEntry.status === "loaded") {
    const conv = cEntry.data.find(function(c) { return c.otherUser && c.otherUser.id === id; });
    if (conv) return { name: conv.otherUser.fullName, seed: seedFromId(id) };
  }
  return { name: "...", seed: seedFromId(id) };
}

/* ---------------------------- NAV ---------------------------- */
function go(screen, payload) {
  if (screen === "post-menu") { STATE.menuOpen = true; render(); return; }
  stopCallTimer();
  STATE.history.push(STATE.screen);
  STATE.screen = screen;
  STATE.payload = payload !== undefined ? payload : null;
  STATE.menuOpen = false;
  if (screen === "call") startCallTimer();
  render();
  const sr = document.getElementById("screen-root");
  if (sr) sr.scrollTop = 0;
}

function back() {
  stopCallTimer();
  STATE.screen = STATE.history.pop() || "home";
  render();
}

function closeSheet() { STATE.filterOpen = false; STATE.menuOpen = false; render(); }

/* ---------------------------- UI HELPERS ---------------------------- */
function icon(name, size, color, extra) {
  size  = size  !== undefined ? size  : 18;
  color = color !== undefined ? color : "currentColor";
  extra = extra !== undefined ? extra : "";
  return '<i data-lucide="' + name + '" style="width:' + size + 'px;height:' + size + 'px;color:' + color + ';" ' + extra + '></i>';
}

function topBar(title, showBack, rightHtml) {
  rightHtml = rightHtml || "";
  return (
    '<div class="topbar">' +
      '<button class="icon-btn" onclick="' + (showBack ? "back()" : "") + '">' + (showBack ? icon("chevron-right", 22, "var(--text)") : "") + "</button>" +
      '<div style="font-weight:700;font-size:15px;color:var(--text)">' + title + "</div>" +
      '<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center">' + rightHtml + "</div>" +
    "</div>"
  );
}

function field(iconName, placeholder, id, extra, value) {
  id    = id    !== undefined ? id    : "";
  extra = extra !== undefined ? extra : "";
  value = value !== undefined ? value : "";
  return (
    '<div class="field">' +
      (iconName ? icon(iconName, 17, "var(--sub)") : "") +
      '<input id="' + id + '" placeholder="' + placeholder + '" value="' + value + '" ' + extra + "/>" +
    "</div>"
  );
}

function btn(label, onclick, variant, extraClass, extraAttrs) {
  variant = variant || "primary";
  extraClass = extraClass || "";
  extraAttrs = extraAttrs || "";
  const cls = variant === "primary" ? "btn-primary" : variant === "outline" ? "btn-outline" : "btn-ghost";
  return '<button class="btn ' + cls + " " + extraClass + '" onclick="' + onclick + '" ' + extraAttrs + ">" + label + "</button>";
}

function stars(v, size) {
  size = size !== undefined ? size : 12;
  return '<div style="display:flex;align-items:center;gap:2px">' + icon("star", size, "var(--amber)", 'fill="var(--amber)"') + '<span style="font-size:' + (size + 1) + 'px;color:var(--text);font-weight:700">' + v + "</span></div>";
}

function avatar(seed, size, available) {
  size = size !== undefined ? size : 44;
  return (
    '<div class="avatar-wrap" style="width:' + size + "px;height:" + size + 'px">' +
      '<img src="https://i.pravatar.cc/100?img=' + seed + '" style="width:' + size + "px;height:" + size + 'px" />' +
      (available ? '<span class="avail-dot"></span>' : "") +
    "</div>"
  );
}

function chip(iconName, label, onclick) {
  return '<button class="chip" style="background:var(--primarySoft);color:var(--primaryDark)" onclick="' + onclick + '">' + icon(iconName, 13) + " " + label + "</button>";
}

function jobCard(j) {
  return (
    '<button onclick="go(\'results\')" class="card" style="width:100%;border-radius:16px;padding:14px;display:flex;align-items:center;gap:12px;text-align:right;">' +
      '<div style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--primarySoft)">' + icon("briefcase", 18, "var(--primaryDark)") + "</div>" +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:6px">' +
          '<div style="font-weight:700;font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + j.title + "</div>" +
          (j.urgent ? '<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:9999px;flex-shrink:0;background:#FEF3C7;color:#B45309">عاجل</span>' : "") +
        "</div>" +
        '<div style="font-size:11px;color:var(--sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (j.company || "") + "</div>" +
        '<div style="display:flex;align-items:center;gap:8px;margin-top:4px;font-size:10.5px;color:var(--sub)">' +
          '<span style="display:flex;align-items:center;gap:2px">' + icon("map-pin", 10) + " " + j.city + (j.dist ? " · " + j.dist + " كم" : "") + "</span>" +
          "<span>" + (j.time || "") + "</span>" +
        "</div>" +
      "</div>" +
      '<div style="text-align:left;flex-shrink:0">' +
        '<div style="font-weight:900;font-size:12.5px;color:var(--primaryDark)">' + (j.salary || "—") + "</div>" +
        '<div style="font-size:9.5px;color:var(--sub)">دج</div>' +
      "</div>" +
    "</button>"
  );
}

function section(title, innerHtml, onMore) {
  onMore = onMore || "go('results')";
  return (
    "<div>" +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">' +
        '<div style="font-weight:700;font-size:14px;color:var(--text)">' + title + "</div>" +
        '<button onclick="' + onMore + '" style="font-size:11.5px;font-weight:700;color:var(--primary);background:none;border:none;cursor:pointer">عرض الكل</button>' +
      "</div>" +
      '<div style="display:flex;flex-direction:column;gap:10px">' + innerHtml + "</div>" +
    "</div>"
  );
}

/* ---------------------------- BOTTOM NAV ---------------------------- */
const NAV_SCREENS = ["home", "search", "messages", "profile"];

function bottomNav() {
  const items = [
    { id: "home",      label: "الرئيسية", icon: "home" },
    { id: "search",    label: "البحث",    icon: "search" },
    { id: "post-menu", label: "إضافة",    icon: "plus", cta: true },
    { id: "messages",  label: "الرسائل",  icon: "message-circle" },
    { id: "profile",   label: "الحساب",   icon: "user" },
  ];
  let html = '<div class="bottomnav">';
  items.forEach(function(it) {
    if (it.cta) {
      html +=
        '<button class="navitem" style="margin-top:-24px" onclick="go(\'post-menu\')">' +
          '<div style="width:48px;height:48px;border-radius:9999px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 16px rgba(31,170,89,.35);background:var(--primary)">' +
            icon("plus", 24, "#fff") +
          "</div>" +
        "</button>";
      return;
    }
    const active = STATE.screen === it.id;
    html +=
      '<button class="navitem" onclick="go(\'' + it.id + '\')">' +
        icon(it.icon, 21, active ? "var(--primary)" : "var(--sub)") +
        '<span style="color:' + (active ? "var(--primary)" : "var(--sub)") + '">' + it.label + "</span>" +
      "</button>";
  });
  html += "</div>";
  return html;
}

/* ============================================================
   SCREENS
   ============================================================ */

function screenSplash() {
  setTimeout(function() {
    if (STATE.screen !== "splash") return;
    if (STATE.sessionChecked) {
      go(STATE.currentUser ? "home" : "welcome");
    } else {
      const waitForSession = setInterval(function() {
        if (STATE.sessionChecked) {
          clearInterval(waitForSession);
          if (STATE.screen === "splash") go(STATE.currentUser ? "home" : "welcome");
        }
      }, 100);
    }
  }, 1200);
  return (
    '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 32px;background:linear-gradient(180deg,var(--primarySoft),#fff)">' +
      '<div style="width:96px;height:96px;border-radius:28px;display:flex;align-items:center;justify-content:center;margin-bottom:20px;box-shadow:0 12px 24px rgba(31,170,89,.25);background:var(--primary)">' + icon("hammer", 44, "#fff") + "</div>" +
      '<div style="font-size:30px;font-weight:900;color:var(--primaryDark)">خدمني</div>' +
      '<div style="font-size:14px;margin-top:4px;color:var(--sub)">العمل أقرب إليك الآن</div>' +
      '<div style="width:112px;height:6px;border-radius:9999px;margin-top:40px;overflow:hidden;background:var(--border)">' +
        '<div style="height:100%;width:70%;border-radius:9999px;background:var(--primary)"></div>' +
      "</div>" +
    "</div>"
  );
}

function screenWelcome() {
  return (
    '<div style="flex:1;display:flex;flex-direction:column;padding:0 24px 32px;background:linear-gradient(180deg,var(--primarySoft),#fff)">' +
      '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">' +
        '<div style="width:80px;height:80px;border-radius:24px;display:flex;align-items:center;justify-content:center;margin-bottom:24px;background:var(--primary)">' + icon("hammer", 36, "#fff") + "</div>" +
        '<div style="font-size:24px;font-weight:900;margin-bottom:8px;color:var(--text)">مرحباً بك في خدمني</div>' +
        '<div style="font-size:14px;line-height:1.7;color:var(--sub)">منصة ذكية للبحث عن عمل أو العثور على العمال والحرفيين بسرعة وسهولة</div>' +
      "</div>" +
      '<div style="display:flex;flex-direction:column;gap:12px">' +
        btn("إنشاء حساب",   "go('account-type')") +
        btn("تسجيل الدخول", "go('login')", "outline") +
        '<button onclick="go(\'home\')" style="text-align:center;font-size:13px;font-weight:600;margin-top:4px;background:none;border:none;color:var(--sub);cursor:pointer">متابعة كضيف</button>' +
      "</div>" +
    "</div>"
  );
}

function screenAccountType() {
  const types = [
    { id: "seeker",   title: "باحث عن عمل",       sub: "ابحث عن وظيفة تناسبك",         icon: "user" },
    { id: "employer", title: "صاحب عمل",           sub: "ابحث عن عمال",                  icon: "briefcase" },
    { id: "worker",   title: "عامل حر / مهني",     sub: "قدم خدماتك ومهاراتك",           icon: "wrench" },
  ];
  let items = "";
  types.forEach(function(t) {
    const active = STATE.userType === t.id;
    items +=
      '<button onclick="STATE.userType=\'' + t.id + '\';render()" style="display:flex;align-items:center;gap:12px;border-radius:16px;padding:16px;text-align:right;background:' + (active ? "var(--primarySoft)" : "var(--card)") + ";border:1.5px solid " + (active ? "var(--primary)" : "var(--border)") + '">' +
        '<div style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:' + (active ? "var(--primary)" : "var(--primarySoft)") + '">' + icon(t.icon, 20, active ? "#fff" : "var(--primaryDark)") + "</div>" +
        '<div style="flex:1">' +
          '<div style="font-weight:700;font-size:14px;color:var(--text)">' + t.title + "</div>" +
          '<div style="font-size:12px;color:var(--sub)">' + t.sub + "</div>" +
        "</div>" +
        (active ? icon("check-circle-2", 20, "var(--primary)") : icon("circle", 20, "var(--border)")) +
      "</button>";
  });
  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' +
      topBar("اختر نوع حسابك", true) +
      '<div style="flex:1;padding:16px 20px 0;display:flex;flex-direction:column;gap:12px">' +
        '<div style="font-size:12.5px;margin-bottom:4px;color:var(--sub)">يمكنك تغييره لاحقاً</div>' +
        items +
      "</div>" +
      '<div style="padding:12px 20px 24px">' + btn("متابعة", "go('signup-form')") + "</div>" +
    "</div>"
  );
}

function screenSignupForm() {
  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' +
      topBar("إنشاء حساب", true) +
      '<div class="scroll" style="padding:16px 20px 0;display:flex;flex-direction:column;gap:12px">' +
        field("user",  "الاسم الكامل", "reg-fullname") +
        field("phone", "رقم الهاتف",           "reg-phone", 'type="tel"') +
        field("mail",  "البريد الإلكتروني",    "reg-email", 'type="email"') +
        field("lock",  "كلمة المرور",          "reg-password", 'type="password"') +
        field("lock",  "تأكيد كلمة المرور",   "reg-confirm", 'type="password"') +
        '<label style="display:flex;align-items:center;gap:8px;margin-top:4px">' +
          '<input type="checkbox" checked/>' +
          '<span style="font-size:12px;color:var(--sub)">أوافق على شروط الاستخدام والخصوصية</span>' +
        "</label>" +
      "</div>" +
      '<div style="padding:12px 20px 24px;display:flex;flex-direction:column;gap:12px">' +
        btn("إنشاء حساب", "doRegister()") +
        '<div style="text-align:center;font-size:12.5px;color:var(--sub)">لديك حساب؟ <button onclick="go(\'login\')" style="font-weight:700;color:var(--primary);background:none;border:none;cursor:pointer">تسجيل الدخول</button></div>' +
      "</div>" +
    "</div>"
  );
}

function screenOtp() {
  // Not currently wired to a real SMS/OTP provider — registration
  // completes directly from screenSignupForm. This screen is kept for
  // future use but isn't part of the active navigation flow.
  let inputs = "";
  for (let i = 0; i < 4; i++) {
    inputs += '<input maxlength="1" style="width:48px;height:56px;text-align:center;font-size:18px;font-weight:700;border-radius:16px;border:1.5px solid var(--border);background:var(--card);color:var(--text)" oninput="if(this.value && this.nextElementSibling) this.nextElementSibling.focus()"/>';
  }
  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' +
      topBar("التحقق", true) +
      '<div style="flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;padding:32px 24px 0">' +
        '<div style="width:64px;height:64px;border-radius:20px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;background:var(--primarySoft)">' + icon("shield", 28, "var(--primary)") + "</div>" +
        '<div style="font-weight:700;font-size:15px;color:var(--text)">أدخل رمز التحقق</div>' +
        '<div style="font-size:12.5px;margin:4px 0 24px;color:var(--sub)">تم إرسال رمز مكوّن من 4 أرقام إلى هاتفك</div>' +
        '<div style="display:flex;gap:12px" dir="ltr">' + inputs + "</div>" +
        '<button style="font-size:12.5px;font-weight:700;margin-top:24px;background:none;border:none;color:var(--primary);cursor:pointer">إعادة إرسال الرمز</button>' +
      "</div>" +
      '<div style="padding:24px 20px">' + btn("تأكيد", "go('home')") + "</div>" +
    "</div>"
  );
}

function screenLogin() {
  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' +
      topBar("تسجيل الدخول", true) +
      '<div style="flex:1;padding:24px 20px 0;display:flex;flex-direction:column;gap:12px">' +
        field("mail", "البريد الإلكتروني أو رقم الهاتف", "login-identifier") +
        field("lock", "كلمة المرور", "login-password", 'type="password"') +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">' +
          '<label style="display:flex;align-items:center;gap:8px"><input type="checkbox"/><span style="font-size:12px;color:var(--sub)">تذكرني</span></label>' +
          '<button style="font-size:12px;font-weight:700;background:none;border:none;color:var(--primary);cursor:pointer">نسيت كلمة المرور؟</button>' +
        "</div>" +
      "</div>" +
      '<div style="padding:12px 20px 24px;display:flex;flex-direction:column;gap:12px">' +
        btn("تسجيل الدخول", "doLogin()") +
        '<div style="text-align:center;font-size:12.5px;color:var(--sub)">ليس لديك حساب؟ <button onclick="go(\'account-type\')" style="font-weight:700;color:var(--primary);background:none;border:none;cursor:pointer">إنشاء حساب</button></div>' +
      "</div>" +
    "</div>"
  );
}

function screenHome() {
  loadFavoritesIfNeeded();
  const jobsData = ensureLoaded("jobs", function() { return apiGet("/jobs?limit=5").then(function(r) { return r.jobs; }); });
  const workersData = ensureLoaded("availableWorkers", function() { return apiGet("/workers?availableNow=true&limit=10").then(function(r) { return r.workers; }); });

  let jobCards = loadingRow();
  if (cacheStatus("jobs") === "error") jobCards = errorRow(STATE.cache.jobs.error);
  else if (jobsData) jobCards = jobsData.length ? jobsData.map(function(j) { return jobCard(mapJobCard(j)); }).join("") : emptyRow("لا توجد وظائف حالياً");

  let workerCards = loadingRow();
  if (cacheStatus("availableWorkers") === "error") workerCards = errorRow(STATE.cache.availableWorkers.error);
  else if (workersData) {
    workerCards = workersData.length ? workersData.map(function(wRaw) {
      const w = mapWorkerCard(wRaw);
      return (
        '<button onclick="go(\'worker-profile\', \'' + w.id + '\')" class="card" style="flex-shrink:0;width:144px;border-radius:16px;padding:12px;text-align:right;cursor:pointer">' +
          avatar(w.seed, 40, true) +
          '<div style="font-weight:700;font-size:12.5px;margin-top:8px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + w.name + "</div>" +
          '<div style="font-size:10.5px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + w.job + "</div>" +
          '<div style="margin-top:6px">' + stars(w.rating, 11) + "</div>" +
        "</button>"
      );
    }).join("") : emptyRow("لا يوجد عمال متاحون الآن");
  }

  let unreadCount = 0;
  if (STATE.currentUser) {
    const notifData = ensureLoaded("notifications", function() { return apiGet("/notifications").then(function(r) { return r.notifications; }); });
    if (notifData) unreadCount = notifData.filter(function(n) { return !n.read; }).length;
  }

  const greeting = STATE.currentUser ? ("مرحباً 👋 " + STATE.currentUser.fullName.split(" ")[0]) : "مرحباً بك 👋";

  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      '<div style="padding:16px 20px 12px;flex-shrink:0;background:var(--card);border-bottom:1px solid var(--border)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<div style="width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--primary)">' + icon("hammer", 17, "#fff") + "</div>" +
            '<span style="font-weight:900;font-size:17px;color:var(--primaryDark)">خدمني</span>' +
          "</div>" +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<button onclick="go(\'notifications\')" class="icon-btn" style="position:relative;background:var(--primarySoft)">' +
              icon("bell", 17, "var(--primaryDark)") +
              (unreadCount > 0 ? '<span style="position:absolute;top:6px;left:6px;width:6px;height:6px;border-radius:9999px;background:var(--danger)"></span>' : "") +
            "</button>" +
            '<button onclick="go(\'profile\')" style="background:none;border:none;padding:0;cursor:pointer">' + avatar(STATE.currentUser ? seedFromId(STATE.currentUser.id) : 12, 34) + "</button>" +
          "</div>" +
        "</div>" +
        '<div style="font-size:13px;color:var(--sub)">' + greeting + "</div>" +
        '<div style="font-weight:700;font-size:15.5px;margin-bottom:12px;color:var(--text)">ما الذي تبحث عنه اليوم؟</div>' +
        '<button onclick="go(\'search\')" style="width:100%;display:flex;align-items:center;gap:8px;border-radius:16px;padding:0 14px;height:44px;background:var(--primarySofter);border:1px solid var(--border);cursor:pointer">' +
          icon("search", 16, "var(--sub)") +
          '<span style="flex:1;text-align:right;font-size:13px;color:var(--sub)">ابحث عن عمل أو عامل أو خدمة...</span>' +
          icon("mic", 16, "var(--primary)") +
        "</button>" +
        '<div style="display:flex;gap:8px;margin-top:12px">' +
          chip("sparkles", "بحث ذكي",  "go('ai')") +
          chip("map-pin",  "بالقرب مني", "go('nearby')") +
        "</div>" +
      "</div>" +

      '<div class="scroll" style="padding:16px 20px;display:flex;flex-direction:column;gap:20px">' +
        "<div>" +
          '<div style="font-weight:700;font-size:14px;margin-bottom:10px;color:var(--text)">التصنيفات</div>' +
          '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">' +
            (function() {
              let cats = "";
              CATEGORIES.forEach(function(c) {
                cats +=
                  '<button onclick="go(\'results\')" style="display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:none;cursor:pointer">' +
                    '<div style="width:48px;height:48px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:var(--primarySoft)">' + icon(c.icon, 19, "var(--primaryDark)") + "</div>" +
                    '<span style="font-size:10.5px;font-weight:600;color:var(--text)">' + c.name + "</span>" +
                  "</button>";
              });
              return cats;
            })() +
          "</div>" +
        "</div>" +

        '<button onclick="go(\'nearby\')" style="border-radius:16px;padding:16px;display:flex;align-items:center;gap:12px;text-align:right;border:none;cursor:pointer;background:linear-gradient(90deg,var(--primary),var(--primaryDark))">' +
          '<div style="flex:1">' +
            '<div style="font-weight:700;color:#fff;font-size:13.5px">وظائف بالقرب منك</div>' +
            '<div style="color:rgba(255,255,255,.85);font-size:11.5px">اكتشف فرص العمل حولك الآن</div>' +
          "</div>" +
          '<div style="width:40px;height:40px;border-radius:9999px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center">' + icon("map-pin", 18, "#fff") + "</div>" +
        "</button>" +

        section("الوظائف الجديدة", jobCards) +
        section("العمال المتاحون الآن", '<div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:4px">' + workerCards + "</div>") +
      "</div>" +
    "</div>"
  );
}

function screenSearch() {
  const tab = STATE.searchTab || "all";
  const recent = ["كهربائي", "سائق", "نجار", "تنظيف منازل"];
  const tabs = [
    { id: "all",      l: "الكل" },
    { id: "jobs",     l: "وظائف" },
    { id: "workers",  l: "عمال" },
    { id: "services", l: "خدمات" },
  ];
  let tabHtml = "";
  tabs.forEach(function(t) {
    tabHtml += '<button onclick="STATE.searchTab=\'' + t.id + '\';render()" class="chip" style="background:' + (tab === t.id ? "var(--primary)" : "var(--primarySoft)") + ";color:" + (tab === t.id ? "#fff" : "var(--primaryDark)") + '">' + t.l + "</button>";
  });
  let recentHtml = "";
  recent.forEach(function(s) {
    recentHtml += '<span class="card" style="padding:0 12px;height:28px;display:flex;align-items:center;border-radius:9999px;font-size:11.5px;color:var(--text)">' + s + "</span>";
  });

  let results = "";
  if (tab === "all" || tab === "jobs") {
    const jobsData = ensureLoaded("allJobs", function() { return apiGet("/jobs?limit=30").then(function(r) { return r.jobs; }); });
    if (cacheStatus("allJobs") === "error") results += errorRow(STATE.cache.allJobs.error);
    else if (jobsData) results += jobsData.length ? jobsData.map(function(j) { return jobCard(mapJobCard(j)); }).join("") : (tab === "jobs" ? emptyRow("لا توجد وظائف") : "");
    else results += loadingRow();
  }
  if (tab === "all" || tab === "workers") {
    const workersData = ensureLoaded("allWorkers", function() { return apiGet("/workers?limit=30").then(function(r) { return r.workers; }); });
    if (cacheStatus("allWorkers") === "error") results += errorRow(STATE.cache.allWorkers.error);
    else if (workersData) {
      results += workersData.length ? workersData.map(function(wRaw) {
        const w = mapWorkerCard(wRaw);
        return (
          '<button onclick="go(\'worker-profile\', \'' + w.id + '\')" class="card" style="width:100%;border-radius:16px;padding:12px;display:flex;align-items:center;gap:12px;text-align:right;cursor:pointer">' +
            avatar(w.seed, 44, w.available) +
            '<div style="flex:1;min-width:0">' +
              '<div style="font-weight:700;font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + w.name + "</div>" +
              '<div style="font-size:11px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + w.job + " · " + w.city + "</div>" +
              stars(w.rating, 11) +
            "</div>" +
            '<div style="font-weight:900;font-size:12px;color:var(--primaryDark)">' + (w.price ? w.price + " دج" : "") + "</div>" +
          "</button>"
        );
      }).join("") : (tab === "workers" ? emptyRow("لا يوجد عمال") : "");
    } else results += loadingRow();
  }
  if (tab === "services") {
    const servicesData = ensureLoaded("allServices", function() { return apiGet("/services?limit=30").then(function(r) { return r.services; }); });
    if (cacheStatus("allServices") === "error") results += errorRow(STATE.cache.allServices.error);
    else if (servicesData) {
      results += servicesData.length ? servicesData.map(function(s) {
        const workerName = (s.worker && s.worker.fullName) || "";
        return (
          '<div class="card" style="width:100%;border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:4px">' +
            '<div style="font-weight:700;font-size:13px;color:var(--text)">' + s.name + "</div>" +
            '<div style="font-size:11px;color:var(--sub)">' + workerName + " · " + (s.city || "") + "</div>" +
            '<div style="font-weight:900;font-size:12px;color:var(--primaryDark)">' + (s.price ? Number(s.price).toLocaleString("ar") + " دج" : "") + "</div>" +
          "</div>"
        );
      }).join("") : emptyRow("لا توجد خدمات");
    } else results += loadingRow();
  }

  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      '<div style="padding:16px 20px 12px;flex-shrink:0;background:var(--card);border-bottom:1px solid var(--border)">' +
        '<div style="font-weight:700;font-size:16px;margin-bottom:12px;color:var(--text)">البحث</div>' +
        '<div style="display:flex;gap:8px">' +
          '<div style="flex:1;display:flex;align-items:center;gap:8px;border-radius:16px;padding:0 14px;height:44px;background:var(--primarySofter);border:1px solid var(--border)">' +
            icon("search", 16, "var(--sub)") +
            '<input placeholder="ابحث عن عمل أو عامل أو خدمة..." style="flex:1;background:transparent;border:none;font-size:13px;color:var(--text)"/>' +
          "</div>" +
          '<button onclick="STATE.filterOpen=true;render()" style="width:44px;height:44px;border-radius:16px;flex-shrink:0;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;background:var(--primary)">' + icon("filter", 17, "#fff") + "</button>" +
        "</div>" +
        '<div style="display:flex;gap:8px;margin-top:12px">' + tabHtml + "</div>" +
      "</div>" +
      '<div class="scroll" style="padding:16px 20px;display:flex;flex-direction:column;gap:12px">' +
        '<div style="font-size:12px;font-weight:700;color:var(--sub)">عمليات بحث حديثة</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">' + recentHtml + "</div>" +
        results +
      "</div>" +
    "</div>"
  );
}

function filterSheet() {
  if (!STATE.filterOpen) return "";
  return (
    '<div class="sheet-overlay">' +
      '<div class="sheet-backdrop" onclick="closeSheet()"></div>' +
      '<div class="sheet fade-in">' +
        '<div class="topbar" style="flex-shrink:0">' +
          '<button class="icon-btn" onclick="closeSheet()">' + icon("x", 20, "var(--sub)") + "</button>" +
          '<div style="font-weight:700;font-size:14px;color:var(--text)">فلاتر البحث</div>' +
          '<div style="width:20px"></div>' +
        "</div>" +
        '<div class="scroll" style="padding:16px 20px;display:flex;flex-direction:column;gap:20px">' +
          '<div style="font-size:12px;color:var(--sub);line-height:1.7">الفلاتر التفصيلية (المدينة، نوع العمل، الراتب، إلخ) قيد التطوير — البحث حالياً يعرض جميع النتائج حسب التبويب المختار.</div>' +
        "</div>" +
        '<div style="padding:16px 20px;flex-shrink:0;border-top:1px solid var(--border)">' + btn("إغلاق", "closeSheet()") + "</div>" +
      "</div>" +
    "</div>"
  );
}

function screenWorkerProfile() {
  loadFavoritesIfNeeded();
  const id = STATE.payload;
  const wRaw = ensureLoaded("worker:" + id, function() { return apiGet("/workers/" + id).then(function(r) { return r.worker; }); });

  if (cacheStatus("worker:" + id) === "error") {
    return (
      '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' +
        topBar("الملف الشخصي", true) +
        errorRow(STATE.cache["worker:" + id].error) +
      "</div>"
    );
  }
  if (!wRaw) {
    return (
      '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' +
        topBar("الملف الشخصي", true) +
        loadingRow() +
      "</div>"
    );
  }

  const w = mapWorkerCard(wRaw);
  const fav = isFav("worker", w.id);
  const stats = [["الخبرة", w.exp || "—"], ["عمل منجز", w.done]];
  let statsHtml = "";
  stats.forEach(function(item, i) {
    statsHtml +=
      '<div style="flex:1;padding:10px 0;' + (i < stats.length - 1 ? "border-left:1px solid var(--border)" : "") + '">' +
        '<div style="font-weight:900;font-size:13px;color:var(--primaryDark)">' + item[1] + "</div>" +
        '<div style="font-size:10px;color:var(--sub)">' + item[0] + "</div>" +
      "</div>";
  });
  const skillsList = w.skills.length ? w.skills : ["احترافية", "التزام بالمواعيد"];
  let skillsHtml = "";
  skillsList.forEach(function(s) {
    skillsHtml += '<span style="padding:0 12px;height:32px;display:flex;align-items:center;border-radius:9999px;font-size:11.5px;font-weight:600;background:var(--primarySoft);color:var(--primaryDark)">' + s + "</span>";
  });

  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      topBar("الملف الشخصي", true,
        '<button class="icon-btn" onclick="toggleFav(\'worker\',\'' + w.id + '\')">' + icon("heart", 19, fav ? "#EF4444" : "var(--sub)", fav ? 'fill="#EF4444"' : "") + "</button>"
      ) +
      '<div class="scroll">' +
        '<div style="padding:20px 20px 16px;display:flex;flex-direction:column;align-items:center;text-align:center;background:var(--card);border-bottom:1px solid var(--border)">' +
          avatar(w.seed, 80, w.available) +
          '<div style="font-weight:900;font-size:16px;margin-top:12px;color:var(--text)">' + w.name + "</div>" +
          '<div style="font-size:12.5px;color:var(--sub)">' + w.job + "</div>" +
          '<div style="margin-top:6px;display:flex;align-items:center;gap:4px">' + stars(w.rating, 14) + '<span style="font-size:11px;color:var(--sub)"> (' + w.reviews + ")</span></div>" +
          (w.available ? '<span style="margin-top:8px;font-size:10.5px;font-weight:700;padding:4px 12px;border-radius:9999px;background:#DCFCE7;color:#16A34A">متاح الآن</span>' : "") +
          '<div style="display:flex;width:100%;margin-top:16px;border-radius:16px;overflow:hidden;border:1px solid var(--border)">' + statsHtml + "</div>" +
        "</div>" +
        '<div style="padding:16px 20px;display:flex;flex-direction:column;gap:16px">' +
          "<div>" +
            '<div style="font-weight:700;font-size:13.5px;margin-bottom:6px;color:var(--text)">نبذة عني</div>' +
            '<p style="font-size:12.5px;line-height:1.7;color:var(--sub)">' + (w.bio || "لم يضف هذا العامل نبذة بعد.") + "</p>" +
          "</div>" +
          "<div>" +
            '<div style="font-weight:700;font-size:13.5px;margin-bottom:8px;color:var(--text)">المهارات</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap">' + skillsHtml + "</div>" +
          "</div>" +
        "</div>" +
      "</div>" +
      '<div style="padding:14px 20px;display:flex;gap:12px;flex-shrink:0;background:var(--card);border-top:1px solid var(--border)">' +
        btn(icon("message-circle", 16) + " دردشة", "openChatWith('" + w.id + "')", "outline") +
        btn(icon("phone", 16) + " اتصال",           "go('call', '" + w.id + "')", "primary") +
      "</div>" +
    "</div>"
  );
}

function screenResults() {
  loadFavoritesIfNeeded();
  const workersData = ensureLoaded("allWorkers", function() { return apiGet("/workers?limit=30").then(function(r) { return r.workers; }); });

  let body = loadingRow();
  if (cacheStatus("allWorkers") === "error") body = errorRow(STATE.cache.allWorkers.error);
  else if (workersData) {
    body = workersData.length ? workersData.map(function(wRaw) {
      const w = mapWorkerCard(wRaw);
      const fav = isFav("worker", w.id);
      return (
        '<div class="card" style="border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:8px">' +
          '<button onclick="go(\'worker-profile\', \'' + w.id + '\')" style="display:flex;align-items:center;gap:12px;text-align:right;background:none;border:none;cursor:pointer;width:100%">' +
            avatar(w.seed, 50, w.available) +
            '<div style="flex:1;min-width:0">' +
              '<div style="font-weight:700;font-size:13.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + w.name + "</div>" +
              '<div style="font-size:11.5px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + w.job + " · " + w.city + "</div>" +
              '<div style="display:flex;align-items:center;gap:8px;margin-top:4px">' + stars(w.rating, 11) + (w.exp ? '<span style="font-size:10.5px;color:var(--sub)">' + w.exp + "</span>" : "") + "</div>" +
            "</div>" +
            '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">' +
              '<span onclick="event.stopPropagation();toggleFav(\'worker\',\'' + w.id + '\')">' + icon("heart", 16, fav ? "#EF4444" : "var(--sub)", fav ? 'fill="#EF4444"' : "") + "</span>" +
              (w.available ? '<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:9999px;background:#DCFCE7;color:#16A34A">متاح الآن</span>' : "") +
            "</div>" +
          "</button>" +
          '<div style="display:flex;gap:8px">' +
            btn(icon("message-circle", 13) + " دردشة", "openChatWith('" + w.id + "')", "ghost",   "", 'style="height:36px;font-size:12px;flex:1"') +
            btn(icon("phone", 13) + " اتصال",           "go('call', '" + w.id + "')", "primary", "", 'style="height:36px;font-size:12px;flex:1"') +
          "</div>" +
        "</div>"
      );
    }).join("") : emptyRow("لا توجد نتائج");
  }

  const count = workersData ? workersData.length : 0;
  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      topBar("نتائج البحث", true, '<button class="icon-btn" onclick="STATE.filterOpen=true;render()">' + icon("filter", 18, "var(--text)") + "</button>") +
      '<div style="padding:12px 20px 4px;font-size:11.5px;color:var(--sub)">' + count + " نتيجة</div>" +
      '<div class="scroll" style="padding:12px 20px;display:flex;flex-direction:column;gap:12px">' + body + "</div>" +
    "</div>"
  );
}

function screenNearby() {
  // Demo-only screen — real geolocation-based search isn't built yet, so
  // this still uses the mock worker pins.
  const pins = [{ x: "30%", y: "35%" }, { x: "55%", y: "25%" }, { x: "68%", y: "55%" }, { x: "40%", y: "65%" }, { x: "20%", y: "60%" }];
  let gridLines = "";
  for (let i = 0; i < 8; i++) {
    gridLines += '<line x1="0" y1="' + (i * 13) + '%" x2="100%" y2="' + (i * 13) + '%" stroke="#B9E3C4"/>';
    gridLines += '<line x1="' + (i * 13) + '%" y1="0" x2="' + (i * 13) + '%" y2="100%" stroke="#B9E3C4"/>';
  }
  let pinHtml = "";
  pins.forEach(function(p, i) {
    const w = MOCK_WORKERS[i % MOCK_WORKERS.length];
    pinHtml +=
      '<button style="position:absolute;transform:translate(-50%,-100%);left:' + p.x + ";top:" + p.y + ';background:none;border:none;cursor:pointer">' +
        '<div style="width:36px;height:36px;border-radius:9999px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.2);overflow:hidden">' +
          '<img src="https://i.pravatar.cc/60?img=' + (w.seed + 9) + '" style="width:100%;height:100%;object-fit:cover"/>' +
        "</div>" +
        '<div style="width:0;height:0;margin:0 auto;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid var(--primaryDark)"></div>' +
      "</button>";
  });
  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      topBar("بالقرب مني", true) +
      '<div style="display:flex;gap:8px;padding:10px 16px;flex-shrink:0;background:var(--card);border-bottom:1px solid var(--border)">' +
        '<button style="flex:1;height:36px;border-radius:9999px;font-size:12px;font-weight:700;border:none;cursor:pointer;background:var(--primary);color:#fff">عمال</button>' +
        '<button style="flex:1;height:36px;border-radius:9999px;font-size:12px;font-weight:700;border:none;cursor:pointer;background:var(--primarySoft);color:var(--primaryDark)">وظائف</button>' +
      "</div>" +
      '<div style="position:relative;flex:1;background:linear-gradient(135deg,#EAF7EE,#DDF3E4)">' +
        '<svg style="position:absolute;inset:0;width:100%;height:100%;opacity:.4">' + gridLines + "</svg>" +
        '<div style="position:absolute;width:16px;height:16px;border-radius:9999px;border:2px solid #fff;left:48%;top:48%;background:#3B82F6"></div>' +
        pinHtml +
      "</div>" +
      '<div style="padding:12px 16px;flex-shrink:0;background:var(--card);border-top:1px solid var(--border);font-size:11px;color:var(--sub);text-align:center">' +
        "البحث الجغرافي الفعلي قيد التطوير — هذه معاينة توضيحية" +
      "</div>" +
    "</div>"
  );
}

function screenMessages() {
  if (!STATE.currentUser) {
    return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' + authRequiredCard("سجّل الدخول لعرض رسائلك") + "</div>";
  }
  const convData = ensureLoaded("conversations", function() { return apiGet("/conversations").then(function(r) { return r.conversations; }); });

  let chatList = loadingRow();
  if (cacheStatus("conversations") === "error") chatList = errorRow(STATE.cache.conversations.error);
  else if (convData) {
    chatList = convData.length ? convData.map(function(c) {
      const other = c.otherUser || { fullName: "مستخدم" };
      const last = c.lastMessage ? c.lastMessage.content : "لا توجد رسائل بعد";
      const unread = c.lastMessage && !c.lastMessage.read && c.lastMessage.senderId !== STATE.currentUser.id;
      return (
        '<button onclick="go(\'chat\', \'' + c.id + '\')" style="width:100%;display:flex;align-items:center;gap:12px;padding:12px 20px;text-align:right;background:none;border:none;border-bottom:1px solid var(--border);cursor:pointer">' +
          avatar(seedFromId(other.id), 48, false) +
          '<div style="flex:1;min-width:0">' +
            '<div style="display:flex;align-items:center;justify-content:space-between">' +
              '<span style="font-weight:700;font-size:13px;color:var(--text)">' + other.fullName + "</span>" +
              '<span style="font-size:10.5px;color:' + (unread ? "var(--primary)" : "var(--sub)") + '">' + timeAgo(c.lastMessageAt) + "</span>" +
            "</div>" +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px">' +
              '<span style="font-size:12px;color:' + (unread ? "var(--text)" : "var(--sub)") + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">' + last + "</span>" +
              (unread ? '<span style="width:10px;height:10px;border-radius:9999px;flex-shrink:0;background:var(--primary)"></span>' : "") +
            "</div>" +
          "</div>" +
        "</button>"
      );
    }).join("") : emptyRow("لا توجد محادثات بعد");
  }

  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      '<div style="padding:16px 20px 12px;flex-shrink:0;background:var(--card);border-bottom:1px solid var(--border)">' +
        '<div style="font-weight:700;font-size:16px;margin-bottom:12px;color:var(--text)">الرسائل</div>' +
        '<div style="display:flex;align-items:center;gap:8px;border-radius:16px;padding:0 14px;height:40px;background:var(--primarySofter)">' +
          icon("search", 15, "var(--sub)") +
          '<input placeholder="البحث داخل الرسائل" style="flex:1;background:transparent;border:none;font-size:12.5px;color:var(--text)"/>' +
        "</div>" +
      "</div>" +
      '<div class="scroll">' + chatList + "</div>" +
    "</div>"
  );
}

function screenChat() {
  if (!STATE.currentUser) {
    return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' + authRequiredCard("سجّل الدخول لعرض المحادثة") + "</div>";
  }
  const convId = STATE.payload;
  ensureLoaded("conversations", function() { return apiGet("/conversations").then(function(r) { return r.conversations; }); });
  const convEntry = STATE.cache.conversations;
  const conv = convEntry && convEntry.status === "loaded" ? convEntry.data.find(function(c) { return c.id === convId; }) : null;
  const other = (conv && conv.otherUser) || { fullName: "..." };

  const messagesData = ensureLoaded("messages:" + convId, function() { return apiGet("/conversations/" + convId + "/messages").then(function(r) { return r.messages; }); });

  let messagesHtml = loadingRow();
  if (cacheStatus("messages:" + convId) === "error") messagesHtml = errorRow(STATE.cache["messages:" + convId].error);
  else if (messagesData) {
    messagesHtml = messagesData.map(function(m) {
      const mine = m.senderId === STATE.currentUser.id;
      return (
        '<div style="max-width:75%;display:flex;flex-direction:column;align-self:' + (mine ? "flex-end" : "flex-start") + ";align-items:" + (mine ? "flex-end" : "flex-start") + '">' +
          '<div style="border-radius:16px;padding:10px 14px;font-size:12.5px;line-height:1.5;' +
            "background:" + (mine ? "var(--primary)" : "var(--card)") + ";" +
            "color:" + (mine ? "#fff" : "var(--text)") + ";" +
            "border:" + (mine ? "none" : "1px solid var(--border)") + ";" +
            "border-bottom-left-radius:" + (mine ? "4px" : "16px") + ";" +
            'border-bottom-right-radius:' + (mine ? "16px" : "4px") + '">' + m.content + "</div>" +
          '<span style="font-size:9.5px;margin-top:4px;color:var(--sub)">' + timeAgo(m.createdAt) + "</span>" +
        "</div>"
      );
    }).join("");
  }

  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      '<div style="display:flex;align-items:center;gap:12px;padding:0 16px;height:56px;flex-shrink:0;background:var(--card);border-bottom:1px solid var(--border)">' +
        '<button class="icon-btn" onclick="go(\'messages\')">' + icon("chevron-right", 22, "var(--text)") + "</button>" +
        avatar(seedFromId(other.id), 36, false) +
        '<div style="flex:1">' +
          '<div style="font-weight:700;font-size:13px;color:var(--text)">' + other.fullName + "</div>" +
        "</div>" +
        (other.id ? '<button class="icon-btn" style="background:var(--primarySoft)" onclick="go(\'call\', \'' + other.id + '\')">' + icon("phone", 16, "var(--primaryDark)") + "</button>" : "") +
      "</div>" +
      '<div class="scroll" id="chat-scroll" style="padding:16px;display:flex;flex-direction:column;gap:10px">' + messagesHtml + "</div>" +
      '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;flex-shrink:0;background:var(--card);border-top:1px solid var(--border)">' +
        '<input id="chat-input" placeholder="اكتب رسالتك..." onkeydown="if(event.key===\'Enter\') sendChat(\'' + convId + '\')" style="flex:1;height:40px;border-radius:9999px;padding:0 16px;font-size:12.5px;border:none;background:var(--primarySofter);color:var(--text)"/>' +
        '<button class="icon-btn" style="background:var(--primary)" onclick="sendChat(\'' + convId + '\')">' + icon("send", 16, "#fff") + "</button>" +
      "</div>" +
    "</div>"
  );
}

function startCallTimer() {
  STATE.callSeconds = 15;
  STATE.callTimer = setInterval(function() {
    STATE.callSeconds++;
    const el = document.getElementById("call-timer");
    if (el) {
      const mm = String(Math.floor(STATE.callSeconds / 60)).padStart(2, "0");
      const ss = String(STATE.callSeconds % 60).padStart(2, "0");
      el.textContent = "مكالمة صوتية · " + mm + ":" + ss;
    }
  }, 1000);
}

function stopCallTimer() {
  if (STATE.callTimer) { clearInterval(STATE.callTimer); STATE.callTimer = null; }
}

function toggleMic()     { STATE.callMicOn      = !STATE.callMicOn;      render(); }
function toggleSpeaker() { STATE.callSpeakerOn  = !STATE.callSpeakerOn;  render(); }

function screenCall() {
  // Cosmetic call screen — no real audio/video is transmitted. Peer name
  // is resolved from whatever's already cached (worker profile or
  // conversation list) to avoid an extra request.
  const id = STATE.payload;
  const peer = resolveCallPeer(id);
  const mm = String(Math.floor(STATE.callSeconds / 60)).padStart(2, "0");
  const ss = String(STATE.callSeconds % 60).padStart(2, "0");
  return (
    '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:56px 32px;background:linear-gradient(180deg,#0F2A1B,#0A1F14)">' +
      '<div style="display:flex;flex-direction:column;align-items:center">' +
        '<img src="https://i.pravatar.cc/160?img=' + peer.seed + '" style="width:112px;height:112px;border-radius:9999px;object-fit:cover;border:4px solid rgba(255,255,255,.1)"/>' +
        '<div style="color:#fff;font-weight:700;font-size:18px;margin-top:16px">' + peer.name + "</div>" +
        '<div id="call-timer" style="color:rgba(255,255,255,.6);font-size:13px;margin-top:4px">مكالمة صوتية · ' + mm + ":" + ss + "</div>" +
      "</div>" +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px">' +
        '<button onclick="toggleSpeaker()" style="display:flex;flex-direction:column;align-items:center;gap:8px;background:none;border:none;cursor:pointer">' +
          '<div style="width:56px;height:56px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:' + (STATE.callSpeakerOn ? "#fff" : "rgba(255,255,255,.12)") + '">' + icon("volume-2", 22, STATE.callSpeakerOn ? "#0A1F14" : "#fff") + "</div>" +
          '<span style="color:rgba(255,255,255,.7);font-size:11px">سماعة</span>' +
        "</button>" +
        '<button onclick="toggleMic()" style="display:flex;flex-direction:column;align-items:center;gap:8px;background:none;border:none;cursor:pointer">' +
          '<div style="width:56px;height:56px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:' + (!STATE.callMicOn ? "#fff" : "rgba(255,255,255,.12)") + '">' + icon(STATE.callMicOn ? "mic" : "mic-off", 22, !STATE.callMicOn ? "#0A1F14" : "#fff") + "</div>" +
          '<span style="color:rgba(255,255,255,.7);font-size:11px">كتم</span>' +
        "</button>" +
        '<button style="display:flex;flex-direction:column;align-items:center;gap:8px;background:none;border:none;cursor:pointer">' +
          '<div style="width:56px;height:56px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.12)">' + icon("video", 22, "#fff") + "</div>" +
          '<span style="color:rgba(255,255,255,.7);font-size:11px">كاميرا</span>' +
        "</button>" +
      "</div>" +
      '<button onclick="back()" style="width:64px;height:64px;border-radius:9999px;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;background:var(--danger)">' + icon("phone-off", 26, "#fff") + "</button>" +
    "</div>"
  );
}

function accountTypeLabel(t) {
  return t === "employer" ? "صاحب عمل" : t === "worker" ? "عامل حر / مهني" : "باحث عن عمل";
}

function screenProfile() {
  if (!STATE.currentUser) {
    return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' + authRequiredCard("سجّل الدخول لعرض ملفك الشخصي") + "</div>";
  }
  const u = STATE.currentUser;
  const items = [
    { id: "post-job",  icon: "briefcase",    label: "وظائفي" },
    { id: "favorites", icon: "heart",         label: "المفضلة" },
    { id: "activity",  icon: "trending-up",   label: "سجل النشاط" },
    { id: "ratings",   icon: "star",           label: "التقييمات" },
    { id: "settings",  icon: "settings",       label: "الإعدادات" },
    { id: "support",   icon: "help-circle",    label: "المساعدة والدعم" },
  ];
  let menuItems = "";
  items.forEach(function(it, i) {
    menuItems +=
      '<button onclick="go(\'' + it.id + '\')" style="width:100%;display:flex;align-items:center;gap:12px;padding:14px 16px;background:none;border:none;cursor:pointer;' + (i < items.length - 1 ? "border-bottom:1px solid var(--border)" : "") + '">' +
        '<div style="width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--primarySoft)">' + icon(it.icon, 16, "var(--primaryDark)") + "</div>" +
        '<span style="flex:1;text-align:right;font-size:13px;font-weight:600;color:var(--text)">' + it.label + "</span>" +
        icon("chevron-left", 16, "var(--sub)") +
      "</button>";
  });
  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      '<div style="padding:20px 20px 16px;flex-shrink:0;background:var(--card);border-bottom:1px solid var(--border)">' +
        '<div style="display:flex;align-items:center;gap:12px">' +
          avatar(seedFromId(u.id), 58) +
          '<div style="flex:1">' +
            '<div style="display:flex;align-items:center;gap:4px">' +
              '<span style="font-weight:900;font-size:15px;color:var(--text)">' + u.fullName + "</span>" +
              (u.identityVerified ? icon("badge-check", 15, "var(--primary)") : "") +
            "</div>" +
            '<div style="font-size:11.5px;color:var(--sub)">' + accountTypeLabel(u.accountType) + "</div>" +
          "</div>" +
          '<button onclick="go(\'edit-profile\')" style="font-size:11.5px;font-weight:700;padding:0 12px;height:32px;border-radius:9999px;border:none;cursor:pointer;background:var(--primarySoft);color:var(--primaryDark)">تعديل</button>' +
        "</div>" +
      "</div>" +
      '<div class="scroll" style="padding:16px 20px">' +
        '<div class="card" style="border-radius:16px;overflow:hidden">' + menuItems + "</div>" +
        '<button onclick="doLogout()" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:20px;padding:12px;border-radius:16px;font-weight:700;font-size:13px;border:none;cursor:pointer;color:#EF4444;background:#FEF2F2">' +
          icon("log-out", 16) + " تسجيل الخروج" +
        "</button>" +
      "</div>" +
    "</div>"
  );
}

function postMenuSheet() {
  if (!STATE.menuOpen) return "";
  return (
    '<div class="sheet-overlay">' +
      '<div class="sheet-backdrop" onclick="closeSheet()"></div>' +
      '<div class="sheet fade-in" style="padding:20px;display:flex;flex-direction:column;gap:12px">' +
        '<div style="width:40px;height:4px;border-radius:9999px;background:rgba(0,0,0,.1);margin:0 auto 4px"></div>' +
        '<button onclick="go(\'post-job\')" style="display:flex;align-items:center;gap:12px;border-radius:16px;padding:16px;text-align:right;border:none;cursor:pointer;background:var(--primarySofter)">' +
          '<div style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--primary)">' + icon("briefcase", 19, "#fff") + "</div>" +
          '<div><div style="font-weight:700;font-size:13.5px;color:var(--text)">نشر وظيفة</div><div style="font-size:11.5px;color:var(--sub)">ابحث عن عامل مناسب لعملك</div></div>' +
        "</button>" +
        '<button onclick="go(\'post-service\')" style="display:flex;align-items:center;gap:12px;border-radius:16px;padding:16px;text-align:right;border:none;cursor:pointer;background:var(--primarySofter)">' +
          '<div style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--primary)">' + icon("wrench", 19, "#fff") + "</div>" +
          '<div><div style="font-weight:700;font-size:13.5px;color:var(--text)">نشر خدمة</div><div style="font-size:11.5px;color:var(--sub)">قدّم مهاراتك وخدماتك للعملاء</div></div>' +
        "</button>" +
      "</div>" +
    "</div>"
  );
}

function doPostJob() {
  if (!requireAuthOr("سجّل الدخول لنشر وظيفة")) return;
  if (STATE.currentUser.accountType !== "employer") { alert("نشر الوظائف متاح لحسابات أصحاب العمل فقط"); return; }
  const title = val("job-title");
  const description = val("job-desc");
  const city = val("job-city");
  const salary = val("job-salary");
  const workersNeeded = val("job-workers") || "1";
  const experienceYears = val("job-exp");
  if (!title || !description || !city) { alert("عبّئ العنوان والوصف والمدينة على الأقل"); return; }

  const body = { title: title, description: description, city: city, workersNeeded: Number(workersNeeded), jobType: "full_time" };
  if (salary) body.salary = salary;
  if (experienceYears) body.experienceYears = Number(experienceYears);

  apiPost("/jobs", body).then(function() {
    invalidate("jobs"); invalidate("allJobs");
    go("home");
  }).catch(function(err) { alert(err.message || "تعذر نشر الوظيفة"); });
}

function screenPostJob() {
  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      topBar("نشر وظيفة", true) +
      '<div class="scroll" style="padding:16px 20px;display:flex;flex-direction:column;gap:12px">' +
        field("", "عنوان الوظيفة", "job-title") +
        '<textarea id="job-desc" placeholder="وصف الوظيفة" rows="4" style="border-radius:16px;padding:12px 14px;font-size:13px;background:var(--primarySofter);border:1px solid var(--border);color:var(--text)"></textarea>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' + field("dollar-sign", "الراتب", "job-salary") + field("map-pin", "المدينة", "job-city") + "</div>" +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' + field("", "عدد العمال المطلوبين", "job-workers", 'value="1"') + field("", "سنوات الخبرة", "job-exp") + "</div>" +
      "</div>" +
      '<div style="padding:16px 20px;flex-shrink:0;background:var(--card);border-top:1px solid var(--border)">' + btn("نشر الإعلان", "doPostJob()") + "</div>" +
    "</div>"
  );
}

function doPostService() {
  if (!requireAuthOr("سجّل الدخول لنشر خدمة")) return;
  if (STATE.currentUser.accountType !== "worker") { alert("نشر الخدمات متاح لحسابات العمال المهنيين فقط"); return; }
  const name = val("svc-name");
  const description = val("svc-desc");
  const price = val("svc-price");
  const durationEstimate = val("svc-duration");
  const city = val("svc-city");
  if (!name || !description || !city) { alert("عبّئ اسم الخدمة والوصف والمدينة على الأقل"); return; }

  const body = { name: name, description: description, city: city };
  if (price) body.price = price;
  if (durationEstimate) body.durationEstimate = durationEstimate;

  apiPost("/services", body).then(function() {
    invalidate("allServices");
    go("home");
  }).catch(function(err) { alert(err.message || "تعذر نشر الخدمة"); });
}

function screenPostService() {
  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      topBar("نشر خدمة", true) +
      '<div class="scroll" style="padding:16px 20px;display:flex;flex-direction:column;gap:12px">' +
        field("", "اسم الخدمة", "svc-name") +
        '<textarea id="svc-desc" placeholder="وصف الخدمة" rows="4" style="border-radius:16px;padding:12px 14px;font-size:13px;background:var(--primarySofter);border:1px solid var(--border);color:var(--text)"></textarea>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' + field("dollar-sign", "السعر", "svc-price") + field("clock", "مدة الإنجاز", "svc-duration") + "</div>" +
        field("map-pin", "المدينة", "svc-city") +
      "</div>" +
      '<div style="padding:16px 20px;flex-shrink:0;background:var(--card);border-top:1px solid var(--border)">' + btn("نشر الخدمة", "doPostService()") + "</div>" +
    "</div>"
  );
}

function screenNotifications() {
  if (!STATE.currentUser) {
    return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' + authRequiredCard("سجّل الدخول لعرض إشعاراتك") + "</div>";
  }
  const tab = STATE.notifTab || "all";
  function iconFor(t) { return t === "job" ? "briefcase" : t === "worker" ? "user" : t === "message" ? "message-circle" : "bell"; }
  const filterTabs = [{ id: "all", l: "الكل" }, { id: "job", l: "وظائف" }, { id: "worker", l: "عمال" }];
  let tabHtml = "";
  filterTabs.forEach(function(t) {
    tabHtml += '<button onclick="STATE.notifTab=\'' + t.id + '\';render()" class="chip" style="background:' + (tab === t.id ? "var(--primary)" : "var(--primarySoft)") + ";color:" + (tab === t.id ? "#fff" : "var(--primaryDark)") + '">' + t.l + "</button>";
  });

  const notifData = ensureLoaded("notifications", function() { return apiGet("/notifications").then(function(r) { return r.notifications; }); });
  let notifList = loadingRow();
  if (cacheStatus("notifications") === "error") notifList = errorRow(STATE.cache.notifications.error);
  else if (notifData) {
    const filtered = notifData.filter(function(n) { return tab === "all" || n.type === tab; });
    notifList = filtered.length ? filtered.map(function(n) {
      return (
        '<div style="display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--border);background:' + (n.read ? "transparent" : "var(--primarySofter)") + '">' +
          '<div style="width:40px;height:40px;border-radius:9999px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--primarySoft)">' + icon(iconFor(n.type), 17, "var(--primaryDark)") + "</div>" +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-weight:700;font-size:12.5px;color:var(--text)">' + n.title + "</div>" +
            (n.body ? '<div style="font-size:11.5px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + n.body + "</div>" : "") +
            '<div style="font-size:10px;margin-top:2px;color:var(--sub)">' + timeAgo(n.createdAt) + "</div>" +
          "</div>" +
          (!n.read ? '<span style="width:8px;height:8px;border-radius:9999px;flex-shrink:0;background:var(--primary)"></span>' : "") +
        "</div>"
      );
    }).join("") : emptyRow("لا توجد إشعارات");
  }

  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      topBar("الإشعارات", true) +
      '<div style="display:flex;gap:8px;padding:10px 20px;flex-shrink:0;background:var(--card);border-bottom:1px solid var(--border)">' + tabHtml + "</div>" +
      '<div class="scroll">' + notifList + "</div>" +
    "</div>"
  );
}

function screenAI() {
  if (!STATE.aiMessages) STATE.aiMessages = [{ from: "ai", text: "مرحباً بك في خدمني 👋 كيف يمكنني مساعدتك اليوم؟" }];
  const messages = STATE.aiMessages;
  const suggestions = ["أريد عمالاً بالقرب مني", "أبحث عن عامل سباكة", "اكتب لي سيرة ذاتية", "اقترح راتباً مناسباً"];
  let msgHtml = "";
  messages.forEach(function(m) {
    msgHtml +=
      '<div style="max-width:80%;border-radius:16px;padding:10px 16px;font-size:12.5px;line-height:1.5;align-self:' + (m.from === "me" ? "flex-end" : "flex-start") + ";" +
        "background:" + (m.from === "me" ? "var(--primary)" : "var(--card)") + ";" +
        "color:" + (m.from === "me" ? "#fff" : "var(--text)") + ";" +
        "border:" + (m.from === "me" ? "none" : "1px solid var(--border)") + '">' + m.text + "</div>";
  });
  let suggHtml = "";
  if (messages.length < 2) {
    suggestions.forEach(function(s) {
      suggHtml += '<button onclick="sendAI(\'' + s + '\')" style="text-align:right;border-radius:16px;padding:10px 16px;font-size:12px;font-weight:600;border:none;cursor:pointer;background:var(--primarySoft);color:var(--primaryDark)">' + s + "</button>";
    });
    suggHtml = '<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">' + suggHtml + "</div>";
  }
  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      topBar("المساعد الذكي", true, icon("sparkles", 18, "var(--primary)")) +
      '<div class="scroll" id="ai-scroll" style="padding:16px 20px;display:flex;flex-direction:column;gap:12px">' +
        msgHtml + suggHtml +
      "</div>" +
      '<div style="display:flex;align-items:center;gap:8px;padding:12px 16px;flex-shrink:0;background:var(--card);border-top:1px solid var(--border)">' +
        '<button class="icon-btn" style="background:var(--primarySoft)">' + icon("mic", 16, "var(--primaryDark)") + "</button>" +
        '<input id="ai-input" placeholder="اكتب لي، بالصوت أو النص..." onkeydown="if(event.key===\'Enter\') sendAI()" style="flex:1;height:40px;border-radius:9999px;padding:0 16px;font-size:12.5px;border:none;background:var(--primarySofter);color:var(--text)"/>' +
        '<button class="icon-btn" style="background:var(--primary)" onclick="sendAI()">' + icon("send", 16, "#fff") + "</button>" +
      "</div>" +
    "</div>"
  );
}

function sendAI(text) {
  const input = document.getElementById("ai-input");
  const q = text || (input && input.value.trim());
  if (!q) return;
  STATE.aiMessages.push({ from: "me", text: q });
  if (input) input.value = "";
  render();
  setTimeout(function() {
    STATE.aiMessages.push({ from: "ai", text: "وجدت لك بعض النتائج المناسبة بناءً على طلبك، يمكنك مراجعتها في صفحة النتائج." });
    render();
    const scroll = document.getElementById("ai-scroll");
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }, 600);
}

function screenFavorites() {
  if (!STATE.currentUser) {
    return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' + authRequiredCard("سجّل الدخول لعرض المفضلة") + "</div>";
  }
  loadFavoritesIfNeeded();
  const entry = STATE.cache.favorites;
  let items = loadingRow();
  if (entry && entry.status === "error") items = errorRow(entry.error);
  else if (entry && entry.status === "loaded") {
    const workerFavs = entry.data.filter(function(f) { return f.targetType === "worker" && f.target; });
    items = workerFavs.length ? workerFavs.map(function(f) {
      const w = mapWorkerCard(f.target);
      return (
        '<button onclick="go(\'worker-profile\', \'' + w.id + '\')" class="card" style="width:100%;border-radius:16px;padding:12px;display:flex;align-items:center;gap:12px;text-align:right;cursor:pointer">' +
          avatar(w.seed, 46, w.available) +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-weight:700;font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + w.name + "</div>" +
            '<div style="font-size:11px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + w.job + "</div>" +
            stars(w.rating, 11) +
          "</div>" +
          '<span onclick="event.stopPropagation();toggleFav(\'worker\',\'' + w.id + '\')">' + icon("heart", 17, "#EF4444", 'fill="#EF4444"') + "</span>" +
        "</button>"
      );
    }).join("") : emptyRow("لا توجد عناصر محفوظة بعد");
  }
  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      topBar("المفضلة", true) +
      '<div class="scroll" style="padding:16px 20px;display:flex;flex-direction:column;gap:12px">' + items + "</div>" +
    "</div>"
  );
}

function screenActivity() {
  // Demo-only screen — real activity/usage stats endpoints aren't built yet.
  const rows = [
    { l: "طلبات مرسلة",   v: 12, icon: "send" },
    { l: "طلبات مستلمة",  v: 8,  icon: "file-text" },
    { l: "أعمال منجزة",   v: 24, icon: "check-circle-2" },
    { l: "عمليات بحث",    v: 47, icon: "search" },
  ];
  let cards = "";
  rows.forEach(function(r) {
    cards +=
      '<div class="card" style="border-radius:16px;padding:16px">' +
        icon(r.icon, 17, "var(--primary)") +
        '<div style="font-weight:900;font-size:18px;margin-top:8px;color:var(--text)">' + r.v + "</div>" +
        '<div style="font-size:11px;color:var(--sub)">' + r.l + "</div>" +
      "</div>";
  });
  let jobCards = "";
  MOCK_JOBS.forEach(function(j) { jobCards += jobCard(j); });
  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      topBar("سجل النشاط", true) +
      '<div class="scroll" style="padding:16px 20px">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">' + cards + "</div>" +
        '<div style="font-weight:700;font-size:13px;margin-bottom:8px;color:var(--text)">الوظائف السابقة</div>' +
        '<div style="display:flex;flex-direction:column;gap:10px">' + jobCards + "</div>" +
      "</div>" +
    "</div>"
  );
}

function screenRatings() {
  // Demo-only screen — real ratings aggregation UI isn't built yet
  // (the "ratings" table and average exist on the backend already).
  const revs = [
    { name: "شركة البناء الحديث",  v: 5, text: "التزام وجودة عالية في العمل، أنصح بالتعامل معه",  seed: 30 },
    { name: "مؤسسة النقل السريع",  v: 4, text: "عمل جيد لكن كان هناك تأخير بسيط",                  seed: 31 },
    { name: "سارة أحمد",            v: 5, text: "احترافية عالية وسرعة في الإنجاز",                   seed: 32 },
  ];
  let bars = "";
  [5, 4, 3, 2, 1].forEach(function(n) {
    bars +=
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="font-size:10px;width:12px;color:var(--sub)">' + n + "</span>" +
        '<div style="flex:1;height:6px;border-radius:9999px;background:var(--border)">' +
          '<div style="height:100%;border-radius:9999px;width:' + (n === 5 ? 70 : n === 4 ? 20 : 5) + '%;background:var(--amber)"></div>' +
        "</div>" +
      "</div>";
  });
  let allStars5 = "";
  for (let i = 0; i < 5; i++) allStars5 += icon("star", 13, "var(--amber)", 'fill="var(--amber)"');
  let reviewCards = "";
  revs.forEach(function(r) {
    let rStars = "";
    for (let j = 0; j < 5; j++) rStars += icon("star", 11, "var(--amber)", j < r.v ? 'fill="var(--amber)"' : "");
    reviewCards +=
      '<div class="card" style="border-radius:16px;padding:14px">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
          avatar(r.seed, 34) +
          '<div style="flex:1">' +
            '<div style="font-weight:700;font-size:12.5px;color:var(--text)">' + r.name + "</div>" +
            '<div style="display:flex;gap:2px">' + rStars + "</div>" +
          "</div>" +
        "</div>" +
        '<p style="font-size:12px;line-height:1.6;color:var(--sub)">' + r.text + "</p>" +
      "</div>";
  });
  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      topBar("التقييمات", true) +
      '<div class="scroll" style="padding:16px 20px">' +
        '<div class="card" style="border-radius:16px;padding:20px;display:flex;align-items:center;gap:20px;margin-bottom:16px">' +
          '<div style="text-align:center">' +
            '<div style="font-weight:900;font-size:28px;color:var(--primaryDark)">4.7</div>' +
            '<div style="display:flex;gap:2px">' + allStars5 + "</div>" +
            '<div style="font-size:10.5px;margin-top:4px;color:var(--sub)">256 تقييم</div>' +
          "</div>" +
          '<div style="flex:1;display:flex;flex-direction:column;gap:6px">' + bars + "</div>" +
        "</div>" +
        '<div style="display:flex;flex-direction:column;gap:12px">' + reviewCards + "</div>" +
      "</div>" +
    "</div>"
  );
}

function screenEditProfile() {
  const u = STATE.currentUser || {};
  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      topBar("تعديل الملف الشخصي", true) +
      '<div class="scroll" style="padding:16px 20px;display:flex;flex-direction:column;gap:12px">' +
        '<div style="display:flex;flex-direction:column;align-items:center;margin-bottom:8px">' +
          avatar(u.id ? seedFromId(u.id) : 12, 72) +
        "</div>" +
        field("user",      "الاسم الكامل",       "", "", u.fullName || "") +
        field("map-pin",   "المدينة",            "", "", u.city || "") +
        field("briefcase", "المهنة",             "", "", u.profession || "") +
        field("phone",     "رقم الهاتف",         "", "", u.phone || "") +
        field("mail",      "البريد الإلكتروني",  "", "", u.email || "") +
        '<div style="font-size:11.5px;color:var(--sub);text-align:center;margin-top:8px">حفظ التعديلات قيد التطوير حالياً</div>' +
      "</div>" +
      '<div style="padding:16px 20px;flex-shrink:0;background:var(--card);border-top:1px solid var(--border)">' + btn("رجوع", "go('profile')") + "</div>" +
    "</div>"
  );
}

function settingsRow(iconName, label, rightHtml, onclick) {
  onclick = onclick || "";
  return (
    '<button onclick="' + onclick + '" style="width:100%;display:flex;align-items:center;gap:12px;padding:14px 16px;background:none;border:none;cursor:pointer;border-bottom:1px solid var(--border);text-align:right">' +
      '<div style="width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--primarySoft)">' + icon(iconName, 16, "var(--primaryDark)") + "</div>" +
      '<span style="flex:1;text-align:right;font-size:13px;font-weight:600;color:var(--text)">' + label + "</span>" +
      rightHtml +
    "</button>"
  );
}

function screenSettings() {
  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      topBar("الإعدادات", true) +
      '<div class="scroll" style="padding:16px 20px;display:flex;flex-direction:column;gap:16px">' +
        '<div class="card" style="border-radius:16px;overflow:hidden">' +
          settingsRow("user", "تعديل البيانات",        icon("chevron-left", 16, "var(--sub)"),  "go('edit-profile')") +
          settingsRow("lock", "تغيير كلمة المرور",     icon("chevron-left", 16, "var(--sub)")) +
        "</div>" +
        '<div class="card" style="border-radius:16px;overflow:hidden">' +
          settingsRow("globe", "اللغة",
            '<span style="font-size:12px;font-weight:700;color:var(--primary)">' + (STATE.lang === "ar" ? "العربية" : "Français") + "</span>",
            "STATE.lang = STATE.lang==='ar'?'fr':'ar'; render()"
          ) +
          settingsRow("moon", "الوضع الليلي",
            '<button class="toggle" style="background:' + (STATE.dark ? "var(--primary)" : "var(--border)") + '" onclick="event.stopPropagation();STATE.dark=!STATE.dark;render()"><span style="' + (STATE.dark ? "right:2px" : "right:18px") + '"></span></button>'
          ) +
        "</div>" +
        '<div class="card" style="border-radius:16px;overflow:hidden">' +
          settingsRow("shield",   "إعدادات الخصوصية والأمان",  icon("chevron-left", 16, "var(--sub)")) +
          settingsRow("bell",     "إعدادات الإشعارات",          icon("chevron-left", 16, "var(--sub)")) +
          settingsRow("map-pin",  "إعدادات الموقع",             icon("chevron-left", 16, "var(--sub)")) +
        "</div>" +
        '<div style="text-align:center;font-size:11px;margin-top:8px;color:var(--sub)">خدمني v1.0.0</div>' +
      "</div>" +
    "</div>"
  );
}

function screenSupport() {
  const faqs = ["كيف أنشر إعلان وظيفة؟", "كيف أفعّل حالة متاح الآن؟", "كيف أوثّق حسابي؟", "كيف أستعيد كلمة المرور؟"];
  let faqItems = "";
  faqs.forEach(function(f, i) {
    faqItems +=
      '<button style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:none;border:none;cursor:pointer;' + (i < faqs.length - 1 ? "border-bottom:1px solid var(--border)" : "") + '">' +
        icon("chevron-left", 15, "var(--sub)") +
        '<span style="flex:1;text-align:right;font-size:12.5px;color:var(--text)">' + f + "</span>" +
      "</button>";
  });
  return (
    '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      topBar("المساعدة والدعم", true) +
      '<div class="scroll" style="padding:16px 20px;display:flex;flex-direction:column;gap:16px">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
          '<button class="card" style="border-radius:16px;padding:16px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer">' + icon("message-circle", 20, "var(--primary)") + '<span style="font-size:12px;font-weight:700;color:var(--text)">تواصل مع الدعم</span></button>' +
          '<button class="card" style="border-radius:16px;padding:16px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer">' + icon("file-text", 20, "var(--primary)") + '<span style="font-size:12px;font-weight:700;color:var(--text)">الإبلاغ عن مشكلة</span></button>' +
        "</div>" +
        "<div>" +
          '<div style="font-weight:700;font-size:13.5px;margin-bottom:8px;color:var(--text)">الأسئلة الشائعة</div>' +
          '<div class="card" style="border-radius:16px;overflow:hidden">' + faqItems + "</div>" +
        "</div>" +
        '<div style="border-radius:16px;padding:16px;background:var(--primarySoft)">' +
          '<div style="font-weight:700;font-size:13px;margin-bottom:4px;color:var(--primaryDark)">لديك اقتراح؟</div>' +
          '<textarea placeholder="اكتب اقتراحك هنا..." rows="3" style="width:100%;border-radius:12px;padding:8px 12px;font-size:12.5px;background:#fff;border:1px solid var(--border);color:var(--text);margin-top:4px"></textarea>' +
          '<button class="btn btn-primary" style="height:40px;font-size:12.5px;margin-top:8px;width:100%">إرسال</button>' +
        "</div>" +
      "</div>" +
    "</div>"
  );
}

/* ============================================================
   RENDER LOOP
   ============================================================ */
const SCREENS = {
  "splash":        screenSplash,
  "welcome":       screenWelcome,
  "account-type":  screenAccountType,
  "signup-form":   screenSignupForm,
  "otp":           screenOtp,
  "login":         screenLogin,
  "home":          screenHome,
  "search":        screenSearch,
  "results":       screenResults,
  "worker-profile": screenWorkerProfile,
  "nearby":        screenNearby,
  "messages":      screenMessages,
  "chat":          screenChat,
  "call":          screenCall,
  "profile":       screenProfile,
  "edit-profile":  screenEditProfile,
  "post-job":      screenPostJob,
  "post-service":  screenPostService,
  "notifications": screenNotifications,
  "ai":            screenAI,
  "favorites":     screenFavorites,
  "activity":      screenActivity,
  "ratings":       screenRatings,
  "settings":      screenSettings,
  "support":       screenSupport,
};

function render() {
  const root = document.getElementById("screen-root");
  if (!root) return;
  const fn = SCREENS[STATE.screen] || screenHome;
  let html = fn();
  if (NAV_SCREENS.includes(STATE.screen)) html += bottomNav();
  html += filterSheet();
  html += postMenuSheet();
  root.innerHTML = html;
  if (window.lucide) lucide.createIcons();
}

checkSession();
render();