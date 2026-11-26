/* ============================================================
   CARTÃO DE VISITA — PORTUGUÊS / INGLÊS
   A escolha fica salva no navegador ("makorini-lang") e vale
   também para o portfólio (./portifolio/).
   ============================================================ */
(function () {
  const textos = {
    pt: {
      "title": "Makorini — Onde sua ideia se moderniza",
      "nav.projects": "Ver projetos",
      "nav.cv": "Currículo",
      "nav.contact": "Contato",
      "hero.subtitle": "Onde sua ideia se moderniza",
      "hero.text": "A Makorini desenvolve sites, sistemas e aplicações sob medida. Cada projeto é construído para acompanhar a evolução de quem o idealizou.",
      "btn.projects": "Ver projetos",
      "btn.cv": "Currículo",
      "btn.contact": "Entrar em contato",
      "footer.contact": "Contato",
      "dialog.title": "Entrar em contato",
      "dialog.text": "Escreva sua mensagem. Ela chega direto no meu e-mail.",
      "dialog.name": "Nome",
      "dialog.email": "Seu e-mail",
      "dialog.message": "Mensagem",
      "dialog.send": "Enviar"
    },
    en: {
      "title": "Makorini — Where ideas come to life",
      "nav.projects": "See projects",
      "nav.cv": "Resume",
      "nav.contact": "Contact",
      "hero.subtitle": "Where ideas come to life",
      "hero.text": "Makorini builds custom websites, systems, and applications—each one designed to grow alongside the person who dreamed it up.",
      "btn.projects": "See projects",
      "btn.cv": "Resume",
      "btn.contact": "Get in touch",
      "footer.contact": "Contact",
      "dialog.title": "Get in touch",
      "dialog.text": "Write your message and it'll go straight to my inbox.",
      "dialog.name": "Name",
      "dialog.email": "Your email",
      "dialog.message": "Message",
      "dialog.send": "Send"
    }
  };
  const cv = {
    pt: "./portifolio/assets/curriculo-bianca-maccarini.pdf",
    en: "./portifolio/assets/curriculo-bianca-maccarini-en.pdf"
  };

  function idiomaAtual() {
    try {
      const salvo = localStorage.getItem("makorini-lang");
      if (salvo === "pt" || salvo === "en") return salvo;
    } catch (e) {}
    return (navigator.language || "pt").toLowerCase().startsWith("pt") ? "pt" : "en";
  }

  function aplicar(lang) {
    try { localStorage.setItem("makorini-lang", lang); } catch (e) {}
    const t = textos[lang];
    document.documentElement.lang = lang === "en" ? "en" : "pt-BR";
    document.title = t.title;
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t[el.dataset.i18n] || el.textContent; });
    document.querySelectorAll("[data-cv]").forEach((a) => { a.href = cv[lang]; });
    document.querySelectorAll(".lang-option").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === lang));
  }

  document.querySelectorAll(".lang-option").forEach((b) => b.addEventListener("click", () => aplicar(b.dataset.lang)));
  aplicar(idiomaAtual());
})();
