function requestRegistrationOtp(body){var path="/auth/register/request-otp";return apiPost(path,body);}
function verifyOtpRequest(body){var path="/auth/register/verify-otp";return apiPost(path,body);}
function doRegister(){
  var fullName=val("reg-fullname"),email=val("reg-email"),phone=val("reg-phone"),password=val("reg-password"),confirm=val("reg-confirm");
  if(!fullName||fullName.length<2)return alert("أدخل الاسم الكامل");
  if(!phone)return alert("رقم الهاتف مطلوب");
  if(!password||password.length<8)return alert("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
  if(password!==confirm)return alert("كلمتا المرور غير متطابقتين");
  var body={fullName:fullName,phone:phone,password:password,accountType:STATE.userType};
  if(email)body.email=email;
  requestRegistrationOtp(body).then(function(res){STATE.pendingRegistration=body;STATE.pendingRegistration.phone=res.phone||phone;go("otp");}).catch(function(err){alert(err.message||"تعذر إرسال رمز التحقق");});
}
function otpCode(){var s="";for(var i=0;i<6;i++){var e=document.getElementById("otp-"+i);s+=e?e.value:"";}return s;}
function sixDigits(s){if(!s||s.length!==6)return false;for(var i=0;i<6;i++){var n=s.charCodeAt(i);if(n<48||n>57)return false;}return true;}
function verifyRegistrationOtp(){
  var p=STATE.pendingRegistration;if(!p)return go("signup-form");
  var code=otpCode();if(!sixDigits(code))return alert("أدخل رمز التحقق المكوّن من 6 أرقام");
  verifyOtpRequest({phone:p.phone,code:code}).then(function(res){STATE.pendingRegistration=null;STATE.currentUser=res.user;invalidateAll();go("home");}).catch(function(err){alert(err.message||"رمز التحقق غير صحيح");});
}
function resendRegistrationOtp(){var p=STATE.pendingRegistration;if(!p)return go("signup-form");requestRegistrationOtp(p).then(function(res){p.phone=res.phone||p.phone;alert("تم إرسال رمز جديد إلى هاتفك");}).catch(function(err){alert(err.message||"تعذر إعادة إرسال الرمز");});}
function screenOtp(){
  var p=STATE.pendingRegistration||{},inputs="";
  for(var i=0;i<6;i++)inputs+='<input id="otp-'+i+'" inputmode="numeric" maxlength="1" style="width:44px;height:54px;text-align:center;font-size:20px;font-weight:800;border-radius:14px;border:1.5px solid var(--border);background:var(--card);color:var(--text)" oninput="if(this.value&&this.nextElementSibling)this.nextElementSibling.focus()" />';
  return '<div style="background:var(--bg);flex:1;display:flex;flex-direction:column">'+topBar("تأكيد رقم الهاتف",true)+'<div style="flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;padding:32px 18px 0"><div style="width:64px;height:64px;border-radius:20px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;background:var(--primarySoft)">'+icon("shield-check",28,"var(--primary)")+'</div><div style="font-weight:800;font-size:16px;color:var(--text)">أدخل رمز التحقق</div><div style="font-size:12.5px;line-height:1.7;margin:6px 0 24px;color:var(--sub)">أرسلنا رمزاً من 6 أرقام إلى<br><strong style="color:var(--text)">'+(p.phone||"هاتفك")+'</strong></div><div style="display:flex;gap:7px" dir="ltr">'+inputs+'</div><button onclick="resendRegistrationOtp()" style="font-size:12.5px;font-weight:700;margin-top:24px;background:none;border:none;color:var(--primary);cursor:pointer">إعادة إرسال الرمز</button></div><div style="padding:24px 20px">'+btn("تأكيد وإنشاء الحساب","verifyRegistrationOtp()")+'</div></div>';
}
SCREENS.otp=screenOtp;
