/* Final feature wiring: OTP-preserving registration, job applications/details, safe chat and real phone calling. */
(function () {
  "use strict";
  var esc = window.khadimniEscape || function (x) { return String(x == null ? "" : x); };

  window.doRegister = function () {
    var fullName = val("reg-fullname"), email = val("reg-email"), phone = val("reg-phone");
    var password = val("reg-password"), confirm = val("reg-confirm");
    if (!fullName || fullName.length < 2) return alert("أدخل الاسم الكامل");
    if (!phone) return alert("رقم الهاتف مطلوب لتأكيد الحساب");
    if (password.length < 8) return alert("كلمة المرور يجب أن تحتوي على 8 أحرف على الأقل");
    if (password !== confirm) return alert("كلمتا المرور غير متطابقتين");
    var body = { fullName: fullName, phone: phone, password: password, accountType: STATE.userType };
    if (email) body.email = email;
    if (typeof requestRegistrationOtp === "function") {
      requestRegistrationOtp(body).then(function (res) {
        STATE.pendingRegistration = body; STATE.pendingRegistration.phone = res.phone || phone; go("otp");
      }).catch(function (e) { alert(e.message || "تعذر إرسال رمز التحقق"); });
    } else {
      alert("نظام التحقق غير متاح");
    }
  };

  window.applyJob = function (jobId) {
    if (!requireAuthOr("سجّل الدخول للتقديم على الوظيفة")) return;
    var message = prompt("رسالة قصيرة لصاحب العمل (اختياري):", "");
    apiPost("/jobs/" + jobId + "/applications", { message: message || null }).then(function () {
      alert("تم إرسال طلب التوظيف بنجاح"); invalidate("activity");
    }).catch(function (e) { alert(e.message || "تعذر إرسال الطلب"); });
  };

  window.screenJobDetails = function () {
    var id = STATE.payload;
    if (!id) return '<div style="background:var(--bg);flex:1">' + topBar("تفاصيل الوظيفة", true) + emptyRow("الوظيفة غير محددة") + '</div>';
    var data = ensureLoaded("job:" + id, function () { return apiGet("/jobs/" + id).then(function (r) { return r.job; }); });
    if (!data) return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' + topBar("تفاصيل الوظيفة", true) + loadingRow() + '</div>';
    var canApply = STATE.currentUser && String(data.employerId) !== String(STATE.currentUser.id);
    return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' + topBar("تفاصيل الوظيفة", true) +
      '<div class="scroll" style="padding:16px 20px"><div class="card" style="border-radius:18px;padding:18px"><div style="font-size:18px;font-weight:900;color:var(--text)">' + esc(data.title) + '</div><div style="font-size:12px;color:var(--sub);margin-top:6px">' + esc(data.city) + ' · ' + esc(data.jobType || "") + '</div><div style="margin-top:14px;font-size:13px;line-height:1.8;color:var(--text)">' + esc(data.description) + '</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px"><div class="card" style="padding:12px;border-radius:14px"><small style="color:var(--sub)">الراتب</small><div style="font-weight:900;color:var(--primaryDark)">' + (data.salary ? Number(data.salary).toLocaleString("ar") + ' دج' : 'غير محدد') + '</div></div><div class="card" style="padding:12px;border-radius:14px"><small style="color:var(--sub)">الخبرة</small><div style="font-weight:900;color:var(--text)">' + (data.experienceYears == null ? 'غير محدد' : data.experienceYears + ' سنوات') + '</div></div></div></div>' +
      (canApply ? '<button class="btn btn-primary" style="width:100%;margin-top:14px" onclick="applyJob(\'' + id + '\')">التقديم على الوظيفة</button>' : '') + '</div></div>';
  };

  window.jobCard = function (j) {
    return '<button onclick="go(\'job-details\',\'' + j.id + '\')" class="card" style="width:100%;border-radius:16px;padding:14px;display:flex;align-items:center;gap:12px;text-align:right;cursor:pointer"><div style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--primarySoft)">' + icon("briefcase",18,"var(--primaryDark)") + '</div><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(j.title) + '</div><div style="font-size:11px;color:var(--sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(j.company || "") + '</div><div style="font-size:10.5px;color:var(--sub);margin-top:4px">' + esc(j.city || "") + (j.dist ? ' · ' + esc(j.dist) + ' كم' : '') + ' · ' + esc(j.time || "") + '</div></div><div style="text-align:left"><div style="font-weight:900;color:var(--primaryDark);font-size:12px">' + esc(j.salary || "—") + '</div><div style="font-size:9.5px;color:var(--sub)">دج</div></div></button>';
  };

  window.screenChat = function () {
    if (!requireAuthOr("سجّل الدخول للمراسلة")) return "";
    var id = STATE.payload;
    var convEntry = STATE.cache.conversations;
    var convs = convEntry && convEntry.status === "loaded" ? convEntry.data : ensureLoaded("conversations", function () { return apiGet("/conversations").then(function (r) { return r.conversations; }); });
    var conv = convs && convs.find(function (c) { return String(c.id) === String(id); });
    var messages = ensureLoaded("messages:" + id, function () { return apiGet("/conversations/" + id + "/messages").then(function (r) { return r.messages; }); });
    if (!messages) return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' + topBar("المحادثة", true) + loadingRow() + '</div>';
    var title = conv && conv.otherUser ? conv.otherUser.fullName : "المحادثة";
    var rows = messages.map(function (m) { var mine = String(m.senderId) === String(STATE.currentUser.id); return '<div style="max-width:78%;align-self:' + (mine ? 'flex-end' : 'flex-start') + ';background:' + (mine ? 'var(--primary)' : 'var(--card)') + ';color:' + (mine ? '#fff' : 'var(--text)') + ';border:1px solid ' + (mine ? 'transparent' : 'var(--border)') + ';border-radius:16px;padding:9px 12px;font-size:12.5px;line-height:1.5">' + esc(m.content) + '</div>'; }).join("");
    return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column;overflow:hidden">' + topBar(esc(title), true) + '<div class="scroll" id="chat-scroll" style="padding:16px 20px;display:flex;flex-direction:column;gap:8px">' + (rows || emptyRow("لا توجد رسائل بعد")) + '</div><div style="display:flex;gap:8px;padding:10px 12px;background:var(--card);border-top:1px solid var(--border)"><input id="chat-input" onkeydown="if(event.key===\'Enter\')sendChat(\'' + id + '\')" placeholder="اكتب رسالة..." style="flex:1;height:42px;border-radius:999px;border:1px solid var(--border);background:var(--primarySofter);padding:0 14px;color:var(--text)"><button class="icon-btn" onclick="sendChat(\'' + id + '\')" style="background:var(--primary);color:#fff">' + icon("send",16,"#fff") + '</button></div></div>';
  };

  window.screenCall = function () {
    var id = STATE.payload;
    var entry = ensureLoaded("call-peer:" + id, function () { return apiGet("/workers/" + id).then(function (r) { return r.worker; }); });
    if (!entry) return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' + topBar("الاتصال", true) + loadingRow() + '</div>';
    var phone = entry.phone || "";
    return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">' + topBar("الاتصال", true) + '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center">' + avatar(seedFromId(entry.id),96,entry.availableNow) + '<div style="font-weight:900;font-size:18px;color:var(--text)">' + esc(entry.fullName) + '</div><div style="font-size:12px;color:var(--sub)">' + esc(entry.profession || "عامل") + '</div><div style="font-size:12px;color:var(--sub)">الاتصال الهاتفي يتم عبر رقم الهاتف المسجل في الحساب.</div>' + (phone ? '<a class="btn btn-primary" href="tel:' + esc(phone) + '" style="width:100%;text-decoration:none">' + icon("phone",16,"#fff") + ' اتصال هاتفي</a>' : '<div style="font-size:12px;color:var(--danger)">رقم الهاتف غير متاح</div>') + '</div></div>';
  };

  if (typeof SCREENS !== "undefined") {
    SCREENS["job-details"] = window.screenJobDetails;
    SCREENS["chat"] = window.screenChat;
    SCREENS["call"] = window.screenCall;
  }
  window.jobCard = window.jobCard;
  if (typeof render === "function") render();
})();
