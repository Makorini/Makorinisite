/* ============================================================
   JANELA "ENTRAR EM CONTATO" DO CARTÃO DE VISITA
   Abre um formulário e envia a mensagem para makorini.dev@gmail.com
   pelo App da Web "Contato Makorini" (Google Apps Script), já que o GitHub Pages não tem servidor.
   Qualquer link com o atributo data-open-contact abre esta janela.
   ============================================================ */
(function () {
  const janela = document.getElementById("contact-dialog");
  const form = document.getElementById("contact-dialog-form");
  const status = document.getElementById("contact-dialog-status");
  if (!janela || !form) return;

  const msg = {
    pt: { sending: "Enviando…", ok: "Mensagem enviada! Obrigada pelo contato ✦", err: "Não foi possível enviar: ", abrindo: "O envio não respondeu. Abrimos seu app de e-mail com a mensagem pronta: é só enviar." },
    en: { sending: "Sending…", ok: "Message sent! Thanks for reaching out ✦", err: "Couldn't send your message: ", abrindo: "We couldn't reach the server, so we opened your email app with your message ready—just hit send." }
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
    form.classList.remove("enviado");
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

  // Plano B: se o envio falhar, abre o app de e-mail de quem escreve, com tudo preenchido.
  function abrirEmail(dados) {
    const corpo = `Nome: ${dados.nome || ""}\nE-mail: ${dados.email || ""}\n\n${dados.mensagem || ""}`;
    location.href = "mailto:makorini.dev@gmail.com?subject=" + encodeURIComponent("Contato pelo site Makorini") + "&body=" + encodeURIComponent(corpo);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (form.botcheck && form.botcheck.checked) return; // robô marcou a caixinha escondida
    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true;
    status.className = "contact-dialog-status";
    status.textContent = msg[lang()].sending;
    try {
      const dados = Object.fromEntries(new FormData(form));
      // Espera até 20 segundos pela resposta do Apps Script.
      const ctrl = new AbortController();
      const limite = setTimeout(() => ctrl.abort(), 20000);
      const resp = await fetch(form.action, {
        signal: ctrl.signal,
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(dados)
      });
      clearTimeout(limite);
      // O Apps Script responde { success: true/false, message }.
      let r = {};
      try { r = await resp.json(); } catch (x) {}
      if (!resp.ok || r.success !== true) {
        const erro = new Error(r.message || String(resp.status));
        erro.respondeu = resp.ok; // o script respondeu (ex.: e-mail inválido)
        throw erro;
      }
      form.reset();
      form.classList.add("enviado"); // esconde os campos e mostra a confirmação grande
      status.className = "contact-dialog-status ok";
      status.textContent = msg[lang()].ok;
    } catch (err) {
      status.className = "contact-dialog-status err";
      if (err.respondeu) {
        status.textContent = msg[lang()].err + err.message;
      } else {
        status.textContent = msg[lang()].abrindo;
        abrirEmail(Object.fromEntries(new FormData(form)));
      }
      console.warn("Contato:", err.message);
    } finally {
      botao.disabled = false;
    }
  });
})();
