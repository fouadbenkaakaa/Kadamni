/* Khadimni: real profile editing + real search. Kept separate so OTP/auth code is untouched. */
(function () {
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function profileAvatar(user, size) {
    size = size || 72;
    if (user && user.avatarUrl) {
      return '<img src="' + esc(user.avatarUrl) + '" alt="الصورة الشخصية" style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;object-fit:cover;border:2px solid var(--border)" />';
    }
    return avatar(user ? seedFromId(user.id) : 12, size, false);
  }

  function csvToArray(value) {
    return String(value || "")
      .split(",")
      .map(function (v) { return v.trim(); })
      .filter(Boolean);
  }

  function arrayToCsv(value) {
    return Array.isArray(value) ? value.join(", ") : "";
  }

  window.__KHADIMNI_PROFILE_AVATAR__ = null;

  window.prepareProfileAvatar = function (input) {
    var file = input && input.files && input.files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      alert("اختر صورة JPG أو PNG أو WebP");
      input.value = "";
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 300;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        var ctx = canvas.getContext("2d");
        if (!ctx) {
          alert("تعذر تجهيز الصورة");
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        window.__KHADIMNI_PROFILE_AVATAR__ = canvas.toDataURL("image/jpeg", 0.78);
        var preview = document.getElementById("profile-avatar-preview");
        if (preview) preview.innerHTML = '<img src="' + esc(window.__KHADIMNI_PROFILE_AVATAR__) + '" alt="معاينة" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />';
        var label = document.getElementById("profile-avatar-file-name");
        if (label) label.textContent = file.name;
      };
      img.onerror = function () { alert("تعذر قراءة الصورة"); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  window.doSaveProfile = function () {
    if (!STATE.currentUser) return requireAuthOr("سجّل الدخول أولاً");

    var body = {
      fullName: val("edit-fullname"),
      city: val("edit-city"),
      profession: val("edit-profession"),
      bio: val("edit-bio"),
      experienceYears: Number(val("edit-experience") || 0),
      skills: csvToArray(val("edit-skills")),
      languages: csvToArray(val("edit-languages")),
    };

    if (!body.fullName) {
      alert("الاسم الكامل مطلوب");
      return;
    }
    if (window.__KHADIMNI_PROFILE_AVATAR__) body.avatarUrl = window.__KHADIMNI_PROFILE_AVATAR__;

    apiPatch("/users/me", body).then(function (res) {
      STATE.currentUser = res.user;
      window.__KHADIMNI_PROFILE_AVATAR__ = null;
      invalidateAll();
      go("profile");
    }).catch(function (err) {
      alert(err.message || "تعذر حفظ الملف الشخصي");
    });
  };

  window.screenEditProfile = function () {
    if (!STATE.currentUser) return authRequiredCard("سجّل الدخول لتعديل ملفك الشخصي");
    var u = STATE.currentUser;
    window.__KHADIMNI_PROFILE_AVATAR__ = null;
    return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      '<div style="padding:14px 18px;display:flex;align-items:center;gap:10px;background:var(--card);border-bottom:1px solid var(--border)">' +
        '<button onclick="back()" class="icon-btn">' + icon("arrow-right", 18, "var(--text)") + '</button>' +
        '<div style="font-weight:700;font-size:16px;color:var(--text)">تعديل الملف الشخصي</div>' +
      '</div>' +
      '<div style="flex:1;overflow:auto;padding:20px">' +
        '<div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:20px">' +
          '<label for="edit-avatar" style="cursor:pointer;position:relative" title="اختيار صورة شخصية">' +
            '<div id="profile-avatar-preview" style="width:92px;height:92px;border-radius:50%;overflow:hidden">' + profileAvatar(u, 92) + '</div>' +
            '<span style="position:absolute;right:0;bottom:0;width:30px;height:30px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center">' + icon("camera", 15, "#fff") + '</span>' +
          '</label>' +
          '<input id="edit-avatar" type="file" accept="image/jpeg,image/png,image/webp" onchange="prepareProfileAvatar(this)" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none" />' +
          '<label for="edit-avatar" style="display:inline-flex;align-items:center;justify-content:center;gap:7px;min-width:150px;height:40px;padding:0 16px;border-radius:12px;background:var(--primary);color:#fff;font-size:12px;font-weight:700;cursor:pointer">' + icon("upload", 15, "#fff") + 'اختيار صورة شخصية</label>' +
          '<div id="profile-avatar-file-name" style="min-height:16px;font-size:11px;color:var(--sub)">JPG أو PNG أو WebP</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:10px">' +
          profileInput("edit-fullname", "الاسم الكامل", u.fullName || "") +
          profileInput("edit-city", "المدينة", u.city || "") +
          profileInput("edit-profession", "المهنة", u.profession || "") +
          profileInput("edit-experience", "سنوات الخبرة", u.experienceYears == null ? "" : u.experienceYears, "number") +
          profileInput("edit-skills", "المهارات — افصل بينها بفواصل", arrayToCsv(u.skills)) +
          profileInput("edit-languages", "اللغات — افصل بينها بفواصل", arrayToCsv(u.languages)) +
          '<textarea id="edit-bio" placeholder="نبذة عنك" style="width:100%;min-height:110px;border:1px solid var(--border);border-radius:14px;padding:12px;background:var(--card);color:var(--text);resize:vertical">' + esc(u.bio || "") + '</textarea>' +
          '<button onclick="doSaveProfile()" style="margin-top:8px;width:100%;height:46px;border:0;border-radius:14px;background:var(--primary);color:#fff;font-weight:700;cursor:pointer">حفظ التعديلات</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  };

  function profileInput(id, label, value, type) {
    return '<label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--sub)">' +
      esc(label) +
      '<input id="' + id + '" type="' + (type || "text") + '" value="' + esc(value) + '" style="width:100%;height:44px;border:1px solid var(--border);border-radius:14px;padding:0 12px;background:var(--card);color:var(--text)" />' +
    '</label>';
  }

  window.screenProfile = function () {
    if (!STATE.currentUser) return authRequiredCard("سجّل الدخول لعرض ملفك الشخصي");
    var u = STATE.currentUser;
    var skills = Array.isArray(u.skills) ? u.skills : [];
    return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      '<div style="padding:16px 20px 12px;background:var(--card);border-bottom:1px solid var(--border)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between">' +
          '<div style="font-weight:700;font-size:18px;color:var(--text)">حسابي</div>' +
          '<button onclick="go(\'edit-profile\')" class="icon-btn" title="تعديل">' + icon("pencil", 17, "var(--primary)") + '</button>' +
        '</div>' +
      '</div>' +
      '<div style="flex:1;overflow:auto;padding:24px 20px">' +
        '<div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">' + profileAvatar(u, 78) + '<div><div style="font-size:18px;font-weight:800;color:var(--text)">' + esc(u.fullName) + '</div><div style="font-size:12px;color:var(--sub);margin-top:4px">' + esc(u.profession || "باحث عن عمل") + (u.city ? ' · ' + esc(u.city) : '') + '</div></div></div>' +
        '<div class="card" style="padding:16px;border-radius:16px;display:flex;flex-direction:column;gap:12px">' +
          '<div><div style="font-size:11px;color:var(--sub)">نبذة</div><div style="font-size:13px;color:var(--text);margin-top:4px">' + esc(u.bio || "لم تضف نبذة بعد") + '</div></div>' +
          '<div><div style="font-size:11px;color:var(--sub)">الخبرة</div><div style="font-size:13px;color:var(--text);margin-top:4px">' + esc(u.experienceYears == null ? "غير محددة" : u.experienceYears + " سنة") + '</div></div>' +
          '<div><div style="font-size:11px;color:var(--sub)">المهارات</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' + (skills.length ? skills.map(function(s){ return '<span style="padding:5px 9px;border-radius:999px;background:var(--primarySofter);font-size:11px;color:var(--text)">' + esc(s) + '</span>'; }).join("") : '<span style="font-size:12px;color:var(--sub)">لا توجد مهارات مضافة</span>') + '</div></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  };

  STATE.searchQuery = STATE.searchQuery || "";
  STATE.searchCity = STATE.searchCity || "";
  STATE.searchProfession = STATE.searchProfession || "";
  STATE.searchJobType = STATE.searchJobType || "";
  STATE.searchAvailable = STATE.searchAvailable || false;
  STATE.searchMinRating = STATE.searchMinRating || "";

  function runSearch() {
    invalidate("searchJobs");
    invalidate("searchWorkers");
    render();
  }

  window.applySearchFilters = function () {
    STATE.searchCity = val("search-city");
    STATE.searchProfession = val("search-profession");
    STATE.searchJobType = val("search-jobtype");
    STATE.searchAvailable = !!document.getElementById("search-available")?.checked;
    STATE.searchMinRating = val("search-min-rating");
    STATE.filterOpen = false;
    runSearch();
  };

  window.closeSheet = function () {
    STATE.filterOpen = false;
    render();
  };

  window.screenSearch = function () {
    var tab = STATE.searchTab || "all";
    var query = STATE.searchQuery || "";
    var qsWorkers = new URLSearchParams();
    if (STATE.searchCity) qsWorkers.set("city", STATE.searchCity);
    if (STATE.searchProfession) qsWorkers.set("profession", STATE.searchProfession);
    if (STATE.searchAvailable) qsWorkers.set("availableNow", "true");
    if (STATE.searchMinRating) qsWorkers.set("minRating", STATE.searchMinRating);

    var qsJobs = new URLSearchParams();
    if (STATE.searchCity) qsJobs.set("city", STATE.searchCity);
    if (STATE.searchJobType) qsJobs.set("jobType", STATE.searchJobType);

    var jobsData = null;
    var workersData = null;
    if (tab === "all" || tab === "jobs") jobsData = ensureLoaded("searchJobs", function () { return apiGet("/jobs?limit=50&" + qsJobs.toString()).then(function (r) { return r.jobs; }); });
    if (tab === "all" || tab === "workers") workersData = ensureLoaded("searchWorkers", function () { return apiGet("/workers?limit=50&" + qsWorkers.toString()).then(function (r) { return r.workers; }); });

    function matchesText(value) { return !query || String(value || "").toLowerCase().indexOf(query.toLowerCase()) !== -1; }
    function jobMatches(j) { return matchesText(j.title) || matchesText(j.city) || matchesText(j.employer && j.employer.fullName); }
    function workerMatches(w) { return matchesText(w.fullName) || matchesText(w.profession) || matchesText(w.city) || (Array.isArray(w.skills) && w.skills.some(matchesText)); }

    var html = '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' +
      '<div style="padding:16px 20px 12px;flex-shrink:0;background:var(--card);border-bottom:1px solid var(--border)">' +
        '<div style="font-weight:700;font-size:16px;margin-bottom:12px;color:var(--text)">البحث</div>' +
        '<div style="display:flex;gap:8px">' +
          '<div style="flex:1;display:flex;align-items:center;gap:8px;border-radius:16px;padding:0 14px;height:44px;background:var(--primarySofter);border:1px solid var(--border)">' + icon("search",16,"var(--sub)") +
            '<input id="search-query" value="' + esc(query) + '" placeholder="ابحث عن عمل أو عامل أو خدمة..." onkeydown="if(event.key===\'Enter\'){STATE.searchQuery=this.value.trim();runSearch()}" style="flex:1;background:transparent;border:none;outline:none;font-size:13px;color:var(--text)" />' +
          '</div>' +
          '<button onclick="STATE.searchQuery=val(\'search-query\');runSearch()" style="width:44px;height:44px;border-radius:16px;border:none;background:var(--primary);color:#fff;cursor:pointer">' + icon("search",17,"#fff") + '</button>' +
          '<button onclick="STATE.filterOpen=true;render()" style="width:44px;height:44px;border-radius:16px;border:none;background:var(--primary);color:#fff;cursor:pointer">' + icon("filter",17,"#fff") + '</button>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px">' +
          [ ["all","الكل"],["jobs","وظائف"],["workers","عمال"] ].map(function(t){ return '<button onclick="STATE.searchTab=\''+t[0]+'\';invalidate(\'searchJobs\');invalidate(\'searchWorkers\');render()" style="padding:8px 14px;border-radius:999px;border:1px solid var(--border);background:'+(tab===t[0]?'var(--primary)':'var(--card)')+';color:'+(tab===t[0]?'#fff':'var(--text)')+';cursor:pointer;font-size:11px">'+t[1]+'</button>'; }).join("") +
        '</div>' +
      '</div>' +
      '<div style="flex:1;overflow:auto;padding:14px 20px">';

    if ((tab === "all" || tab === "jobs")) {
      html += '<div style="font-weight:700;font-size:13px;color:var(--text);margin:6px 0 10px">الوظائف</div>';
      if (cacheStatus("searchJobs") === "error") html += errorRow(STATE.cache.searchJobs.error);
      else if (!jobsData) html += loadingRow();
      else {
        var jobs = jobsData.filter(jobMatches);
        html += jobs.length ? jobs.map(function(j){ return jobCard(mapJobCard(j)); }).join("") : emptyRow("لا توجد وظائف مطابقة");
      }
    }
    if ((tab === "all" || tab === "workers")) {
      html += '<div style="font-weight:700;font-size:13px;color:var(--text);margin:18px 0 10px">العمال والمهنيون</div>';
      if (cacheStatus("searchWorkers") === "error") html += errorRow(STATE.cache.searchWorkers.error);
      else if (!workersData) html += loadingRow();
      else {
        var workers = workersData.filter(workerMatches);
        html += workers.length ? workers.map(function(wRaw){ var w=mapWorkerCard(wRaw); return '<button onclick="go(\'worker-profile\',\''+esc(w.id)+'\')" class="card" style="width:100%;border-radius:16px;padding:12px;display:flex;align-items:center;gap:12px;text-align:right;cursor:pointer;margin-bottom:8px">' + profileAvatar(wRaw,44) + '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13px;color:var(--text)">'+esc(w.name)+'</div><div style="font-size:11px;color:var(--sub)">'+esc(w.job)+' · '+esc(w.city)+'</div>'+stars(w.rating,11)+'</div></button>'; }).join("") : emptyRow("لا يوجد عمال مطابقون");
      }
    }
    html += '</div>' + bottomNav() + '</div>';

    if (STATE.filterOpen) {
      html += '<div class="sheet-overlay"><div class="sheet-backdrop" onclick="closeSheet()"></div><div class="sheet fade-in" style="padding:20px;display:flex;flex-direction:column;gap:12px">' +
        '<div style="font-weight:700;font-size:16px;color:var(--text)">الفلاتر</div>' +
        profileInput("search-city","المدينة",STATE.searchCity) +
        profileInput("search-profession","المهنة",STATE.searchProfession) +
        '<label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--sub)">نوع الوظيفة<select id="search-jobtype" style="height:44px;border:1px solid var(--border);border-radius:14px;padding:0 10px;background:var(--card);color:var(--text)"><option value="">الكل</option><option value="full_time" '+(STATE.searchJobType==='full_time'?'selected':'')+'>دوام كامل</option><option value="part_time" '+(STATE.searchJobType==='part_time'?'selected':'')+'>دوام جزئي</option><option value="freelance" '+(STATE.searchJobType==='freelance'?'selected':'')+'>عمل حر</option><option value="remote" '+(STATE.searchJobType==='remote'?'selected':'')+'>عن بعد</option></select></label>' +
        profileInput("search-min-rating","أقل تقييم",STATE.searchMinRating,"number") +
        '<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text)"><input id="search-available" type="checkbox" '+(STATE.searchAvailable?'checked':'')+' /> متاح الآن</label>' +
        '<button onclick="applySearchFilters()" style="height:46px;border:0;border-radius:14px;background:var(--primary);color:#fff;font-weight:700;cursor:pointer">تطبيق الفلاتر</button>' +
        '<button onclick="STATE.searchQuery=\'\';STATE.searchCity=\'\';STATE.searchProfession=\'\';STATE.searchJobType=\'\';STATE.searchAvailable=false;STATE.searchMinRating=\'\';closeSheet()" style="height:42px;border:1px solid var(--border);border-radius:14px;background:var(--card);color:var(--text);cursor:pointer">مسح الفلاتر</button>' +
      '</div></div>';
    }
    return html;
  };
})();
