/* ============================================================
   JANELA "ENTRAR EM CONTATO" DO CARTÃO DE VISITA
   Abre um formulário e envia a mensagem para makorini.dev@gmail.com
   pelo serviço gratuito FormSubmit (o GitHub Pages não tem servidor).
   Na 1ª mensagem, o FormSubmit manda um e-mail de ativação para esse endereço.
   Qualquer link com o atributo data-open-contact abre esta janela.
   ============================================================ */
(function () {
  const janela = document.getElementById("contact-dialog");
  const form = document.getElementById("contact-dialog-form");
  const status = document.getElementById("contact-dialog-status");
  if (!janela || !form) return;

  const msg = {
    pt: { sending: "Enviando…", ok: "Mensagem enviada! Obrigada pelo contato ✦", err: "Não foi possível enviar agora. Escreva para makorini.dev@gmail.com.", ativacao: "O formulário ainda precisa ser ativado: a dona do site recebeu um e-mail do FormSubmit para confirmar. Enquanto isso, escreva para makorini.dev@gmail.com." },
    en: { sending: "Sending…", ok: "Message sent! Thank you for reaching out ✦", err: "Couldn't send right now. Please email makorini.dev@gmail.com.", ativacao: "This form still needs to be activated (a confirmation email was sent to the site owner). Meanwhile, please email makorini.dev@gmail.com." }
  };
  const lang = () => (document.documentElement.lang === "en" ? "en" : "pt");
  let voltarPara = null;

  function abrir(e) {
    if (e) e.preventDefault();
    voltarPara = document.activeElement;
    // Se o menu lateral estiver aberto, fecha antes de abrir a janela.
    const navbar = document.querySelector("[data-navbar].active");
    if (navbar) document.querySelector("[data-nav-toggle-btn]").click();
    status.textContent = "";
    status.className = "contact-dialog-status";
    janela.hidden = false;
    document.body.classList.add("contact-open");
    setTimeout(() => form.querySelector('input[name="nome"]').focus(), 50);
  }
  function fechar() {
    janela.hidden = true;
    document.body.classList.remove("contact-open");
    if (voltarPara && voltarPara.focus) voltarPara.focus();
  }

  document.querySelectorAll("[data-open-contact]").forEach((el) => el.addEventListener("click", abrir));
  janela.querySelectorAll("[data-close-contact]").forEach((el) => el.addEventListener("click", fechar));
  // Clique fora da caixa ou tecla Esc fecham a janela.
  janela.addEventListener("click", (e) => { if (e.target === janela) fechar(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !janela.hidden) fechar(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (form._honey.value) return; // robô preencheu o campo escondido
    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true;
    status.className = "contact-dialog-status";
    status.textContent = msg[lang()].sending;
    try {
      const dados = Object.fromEntries(new FormData(form));
      const resp = await fetch(form.action.replace("formsubmit.co/", "formsubmit.co/ajax/"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(dados)
      });
      // O FormSubmit responde 200 mesmo quando recusa (ex.: formulário ainda não ativado),
      // então é preciso ler "success" e "message" da resposta.
      let r = {};
      try { r = await resp.json(); } catch (x) {}
      if (!resp.ok || String(r.success) !== "true") {
        const erro = new Error(r.message || String(resp.status));
        erro.ativacao = /activat/i.test(r.message || "");
        throw erro;
      }
      form.reset();
      status.className = "contact-dialog-status ok";
      status.textContent = msg[lang()].ok;
    } catch (err) {
      status.className = "contact-dialog-status err";
      status.textContent = err.ativacao ? msg[lang()].ativacao : msg[lang()].err;
      console.warn("FormSubmit:", err.message);
    } finally {
      botao.disabled = false;
    }
  });
})();
