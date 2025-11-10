// Load JSON helper
async function loadJSON(path) {
  const response = await fetch(path);
  return await response.json();
}

// HERO SECTION
loadJSON("data/hero.json").then(data => {
  document.querySelector("#hero-title").innerText = data.title;
  document.querySelector("#hero-charity").innerText = data.charity_number;
  document.querySelector("#hero-bg").style.backgroundImage = `url('${data.background}')`;

  let btnContainer = document.querySelector("#hero-buttons");
  btnContainer.innerHTML = "";
  data.buttons.forEach(btn => {
    btnContainer.innerHTML += `
      <a href="${btn.link}" class="btn ${btn.style} px-4 py-3">${btn.text}</a>
    `;
  });
});

// IMPACT SECTION
loadJSON("data/impact.json").then(data => {
  document.querySelector("#impact-count").innerText = data.young_people_supported;
  document.querySelector("#impact-donation").innerText = data.donation_message;
  document.querySelector("#impact-volunteer").innerText = data.volunteer_message;
});

// PROGRAMMES SECTION
loadJSON("data/whatwedo.json").then(data => {
  let container = document.querySelector("#programmes-list");
  container.innerHTML = "";
  data.items.forEach(item => {
    container.innerHTML += `
      <div class="cause-entry">
        <a class="img" style="background-image: url('${item.image}');"></a>
        <div class="text p-3 p-md-4">
          <h3>${item.title}</h3>
          <p>${item.description}</p>
        </div>
      </div>
    `;
  });
});

// EVENTS SECTION
loadJSON("data/events.json").then(data => {
  let container = document.querySelector("#events-list");
  container.innerHTML = "";
  data.items.forEach(item => {
    container.innerHTML += `
      <div class="col-md-4 d-flex ftco-animate">
        <div class="blog-entry align-self-stretch">
          <a class="block-20" style="background-image: url('${item.image}');"></a>
          <div class="text p-4 d-block">
            <h3 class="heading mb-4">${item.title}</h3>
            <p>${item.description}</p>
            <p><a href="${item.link}">Join Event <i class="ion-ios-arrow-forward"></i></a></p>
          </div>
        </div>
      </div>
    `;
  });
});

// PARTNERS SECTION
loadJSON("data/partners.json").then(data => {
  let container = document.querySelector("#partners-list");
  container.innerHTML = "";
  data.items.forEach(partner => {
    container.innerHTML += `
      <div class="col-md-3 col-6 ftco-animate">
        <a href="${partner.link}" target="_blank">
          <img src="${partner.logo}" alt="${partner.name}" class="img-fluid mb-3">
        </a>
      </div>
    `;
  });
});

// FOOTER SECTION
loadJSON("data/footer.json").then(data => {
  document.querySelector("#footer-email").innerText = data.email;
  document.querySelector("#footer-phone").innerText = data.phone;
  document.querySelector("#footer-company").innerText = data.company;
  document.querySelector("#footer-company-no").innerText = data.company_no;
  document.querySelector("#footer-charity-no").innerText = data.charity_no;

  // Socials
  let socials = document.querySelector("#footer-socials");
  socials.innerHTML = "";
  data.socials.forEach(s => {
    socials.innerHTML += `
      <a href="${s.url}" target="_blank"><span class="${s.icon}"></span></a>
    `;
  });
});
