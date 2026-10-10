(function(){
  "use strict";

  const PREFIX="drp_sales_clerk_profile:";
  const $=s=>document.querySelector(s);

  const session=()=>window.__drpSession||{};

  const uid=()=>String(
    session().user_id||
    session().userId||
    session().id||
    "salesclerk"
  );

  const key=s=>`${PREFIX}${uid()}:${s}`;

  const name=s=>String(
    s.full_name||
    s.fullName||
    s.display_name||
    s.displayName||
    s.username||
    "Sales Clerk"
  ).trim();

  const uname=s=>String(
    s.username||
    "salesclerk"
  ).trim();

  const role=s=>
    String(
      s.access_role||
      s.accessRole||
      s.role||
      s.roles?.[0]||
      "salesclerk"
    ).toLowerCase()==="salesclerk"
      ? "Sales Clerk"
      : String(
          s.access_role||
          s.role||
          "User"
        );

  const initials=n=>
    n.trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0,2)
      .map(x=>x[0].toUpperCase())
      .join("")||"SC";

  const toast=m=>{
    const t=$("#profileToast");
    if(!t)return;

    t.textContent=m;
    t.classList.add("show");

    clearTimeout(toast.timer);

    toast.timer=setTimeout(
      ()=>t.classList.remove("show"),
      2600
    );
  };

  function setProfile(){
    const s=session();
    const n=name(s);

    $("#profileName").textContent=n;
    $("#profileUsername").textContent="@"+uname(s);
    $("#profileRoleText").textContent=role(s);

    $("#profileInitials").textContent=initials(n);

    $("#fullName").value=n;
    $("#username").value=uname(s);
    $("#role").value=role(s);

    $("#email").value=s.email||"";

    $("#contactNumber").value=
      s.contact_number||
      s.contactNumber||
      "";

    renderPhoto();

    applyTheme(
      localStorage.getItem(key("theme"))||
      "blue"
    );
  }

  function renderPhoto(){
    const a=$("#profileAvatar");
    const p=localStorage.getItem(key("photo"));
    const i=$("#profileInitials");

    a.querySelector("img")?.remove();

    if(p){
      const img=document.createElement("img");

      img.src=p;
      img.alt="Profile photo";

      a.prepend(img);

      i.style.display="none";
    }else{
      i.style.display="";
    }
  }

  function applyTheme(t){
    const c=$("#profileCover");

    c.className="profile-cover theme-"+t;

    document
      .querySelectorAll(".theme-swatch")
      .forEach(b=>
        b.classList.toggle(
          "active",
          b.dataset.theme===t
        )
      );
  }

  function pickPhoto(){
    $("#photoInput").click();
  }

  $("#changePhotoBtn").addEventListener(
    "click",
    pickPhoto
  );

  $("#changePhotoHeaderBtn").addEventListener(
    "click",
    pickPhoto
  );

  $("#changePhotoSideBtn").addEventListener(
    "click",
    pickPhoto
  );

  $("#photoInput").addEventListener(
    "change",
    e=>{
      const f=e.target.files?.[0];

      e.target.value="";

      if(!f)return;

      if(!f.type.startsWith("image/"))
        return toast("Please choose an image.");

      if(f.size>4*1024*1024)
        return toast(
          "Please choose an image smaller than 4 MB."
        );

      const r=new FileReader();

      r.onload=()=>{
        localStorage.setItem(
          key("photo"),
          r.result
        );

        renderPhoto();

        toast("Profile photo updated.");
      };

      r.readAsDataURL(f);
    }
  );

  document
    .querySelectorAll(".theme-swatch")
    .forEach(b=>
      b.addEventListener(
        "click",
        ()=>{
          const t=b.dataset.theme;

          localStorage.setItem(
            key("theme"),
            t
          );

          applyTheme(t);

          toast("Profile background updated.");
        }
      )
    );

  document
    .querySelectorAll(".profile-tab")
    .forEach(b=>
      b.addEventListener(
        "click",
        ()=>{
          const sec=
            b.dataset.tab==="security";

          $("#accountTab")
            .classList
            .toggle("d-none",sec);

          $("#securityTab")
            .classList
            .toggle("d-none",!sec);

          document
            .querySelectorAll(".profile-tab")
            .forEach(x=>
              x.classList.toggle(
                "active",
                x===b
              )
            );

          $("#saveAllTopBtn").innerHTML=
            sec
              ? '<i class="fa-solid fa-key"></i> Update Password'
              : '<i class="fa-solid fa-floppy-disk"></i> Save Changes';

          $("#saveBottomBtn").innerHTML=
            sec
              ? '<i class="fa-solid fa-key"></i> Update Password'
              : '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
        }
      )
    );

  function api(){
    return location.port
      ? "http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1"
      : "../pharma-api/v1";
  }

  function headers(){
    const h={
      "Content-Type":"application/json",
      "X-Requested-With":"XMLHttpRequest"
    };

    try{
      const t=
        localStorage.getItem("pharma_tab_token")||
        sessionStorage.getItem("pharma_tab_token");

      if(t)
        h["X-Tab-Token"]=t;

    }catch{}

    return h;
  }

  async function post(url,body){

    const r=await fetch(
      url,
      {
        method:"POST",
        headers:headers(),
        credentials:"include",
        body:JSON.stringify(body)
      }
    );

    const text=await r.text();

    let d;

    try{
      d=JSON.parse(text);
    }catch{
      throw new Error(
        "Server returned an invalid response."
      );
    }

    if(
      !r.ok||
      d.success===false
    ){
      throw new Error(
        d.message||
        "Request failed."
      );
    }

    return d;
  }

  async function saveAccount(){

    const b=$("#saveAllTopBtn");

    b.disabled=true;

    try{

      await post(
        api()+"/auth/update_profile.php",
        {
          full_name:
            $("#fullName").value.trim(),

          email:
            $("#email").value.trim(),

          contact_number:
            $("#contactNumber").value.trim()
        }
      );

      window.__drpSession={
        ...session(),

        full_name:
          $("#fullName").value.trim(),

        email:
          $("#email").value.trim(),

        contact_number:
          $("#contactNumber").value.trim()
      };

      window
        .__drpNavbarProfileDisplay
        ?.cache(
          window.__drpSession
        );

      window
        .__drpNavbarProfileDisplay
        ?.render(
          $("#navbar-container"),
          window.__drpSession,
          {cache:true}
        );

      setProfile();

      toast(
        "Account information saved."
      );

    }catch(e){

      toast(e.message);

    }finally{

      b.disabled=false;

    }
  }

  async function savePassword(){

    const c=
      $("#currentPassword").value;

    const n=
      $("#newPassword").value;

    const x=
      $("#confirmPassword").value;

    if(!c||!n||!x)
      return toast(
        "Please complete all password fields."
      );

    if(n.length<8)
      return toast(
        "New password must be at least 8 characters."
      );

    if(n!==x)
      return toast(
        "New password and confirmation do not match."
      );

    const b=
      $("#updatePasswordBtn");

    b.disabled=true;

    try{

      await post(
        api()+"/auth/update_password.php",
        {
          current_password:c,
          new_password:n,
          confirm_password:x
        }
      );

      $("#currentPassword").value="";
      $("#newPassword").value="";
      $("#confirmPassword").value="";

      toast(
        "Password updated successfully."
      );

    }catch(e){

      toast(e.message);

    }finally{

      b.disabled=false;

    }
  }

  $("#accountForm").addEventListener(
    "submit",
    e=>{
      e.preventDefault();
      saveAccount();
    }
  );

  $("#passwordForm").addEventListener(
    "submit",
    e=>{
      e.preventDefault();
      savePassword();
    }
  );

  async function topSave(){

    if(
      !$("#securityTab")
        .classList
        .contains("d-none")
    ){
      return savePassword();
    }

    return saveAccount();
  }

  $("#saveAllTopBtn").addEventListener(
    "click",
    topSave
  );

  $("#saveBottomBtn").addEventListener(
    "click",
    topSave
  );

  $("#cancelBtn").addEventListener(
    "click",
    ()=>{
      setProfile();

      toast(
        "Changes discarded."
      );
    }
  );

  function clock(){

    const n=new Date();

    $("#currentDate").textContent=
      n.toLocaleDateString(
        "en-PH",
        {
          weekday:"short",
          month:"short",
          day:"2-digit",
          year:"numeric"
        }
      );

    $("#currentTime").textContent=
      n.toLocaleTimeString(
        "en-PH",
        {
          hour:"2-digit",
          minute:"2-digit",
          second:"2-digit",
          hour12:true
        }
      );
  }

  setInterval(
    clock,
    1000
  );

  clock();

  function boot(){

    if(!window.__drpSession)
      return;

    setProfile();
  }

  if(window.__drpSession){

    boot();

  }else{

    window.addEventListener(
      "pharma:session-ready",
      boot,
      {once:true}
    );

  }

})();