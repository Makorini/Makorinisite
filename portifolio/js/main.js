/* ============================================================
   COMPORTAMENTO DA PÁGINA
   ============================================================ */
(function () {
    const $ = (sel, el = document) => el.querySelector(sel);
    const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    /* ---------- Tema claro/escuro ---------- */
    $("#theme-toggle").addEventListener("click", () => {
        const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem("makorini-theme", next); } catch (e) {}
        document.dispatchEvent(new Event("themechange"));
    });

    /* ---------- Menu no celular ---------- */
    const nav = $("#navigation"), menuBtn = $("#menu-button");
    menuBtn.addEventListener("click", () => {
        const open = nav.classList.toggle("open");
        menuBtn.setAttribute("aria-expanded", open);
    });
    $$("#navigation a").forEach((a) => a.addEventListener("click", () => {
        nav.classList.remove("open");
        menuBtn.setAttribute("aria-expanded", "false");
    }));

    /* ---------- Cabeçalho ao rolar + link ativo ---------- */
    const header = $(".header");
    const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const sections = $$("main section[id]");
    const spy = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
            if (en.isIntersecting) {
                $$("#navigation a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + en.target.id));
            }
        });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach((s) => spy.observe(s));

    /* ---------- Cartões de projeto ---------- */
    const projetos = window.PROJETOS || [];
    const grid = $("#project-grid");
    const linkKeys = { demo: "card.demo", site: "card.site", video: "card.video", codigo: "card.code" };
    // Texto do projeto no idioma atual (campo "en" em projects.js; se faltar, usa o português).
    const L = (p, campo) => (getLang() === "en" && p.en && p.en[campo]) || p[campo] || "";
    let filtroAtual = "todos";

    function renderProjects(jaVisiveis) {
        grid.innerHTML = projetos.map((p) => {
            const thumb = p.imagem
                ? `<img src="${esc(p.imagem)}" alt="${esc(t("card.alt") + p.titulo)}" loading="lazy">`
                : `<div class="thumb-mark"><div><small>${t("card.star")}</small>${esc(p.titulo)}</div></div>`;
            const links = Object.entries(p.links || {})
                .filter(([, url]) => url)
                .map(([k, url]) => `<a href="${esc(url)}"${k === "demo" ? "" : ' target="_blank" rel="noopener"'}>${t(linkKeys[k]) || k}</a>`)
                .join("");
            const oculto = filtroAtual !== "todos" && !p.categorias.includes(filtroAtual);
            return `
            <article class="project-card reveal${jaVisiveis ? " visible" : ""}" data-cat="${esc(p.categorias.join(" "))}"${oculto ? " hidden" : ""}>
                <div class="project-thumb">${thumb}<span class="project-badge">${esc(L(p, "selo"))}</span></div>
                <div class="project-body">
                    <div class="project-top">${esc(p.ano)}</div>
                    <h3>${esc(p.titulo)}</h3>
                    <p>${esc(L(p, "descricao"))}</p>
                    <ul class="tags">${p.tags.map((tag) => `<li>${esc(tag)}</li>`).join("")}</ul>
                    <div class="project-links">${links || `<span class="project-top">${t("card.private")}</span>`}</div>
                </div>
            </article>`;
        }).join("");
    }
    renderProjects(false);

    $$(".filter").forEach((btn) => btn.addEventListener("click", () => {
        $$(".filter").forEach((b) => b.classList.toggle("active", b === btn));
        filtroAtual = btn.dataset.filter;
        $$(".project-card").forEach((card) => {
            card.hidden = filtroAtual !== "todos" && !card.dataset.cat.split(" ").includes(filtroAtual);
        });
    }));

    /* ---------- Demonstrações ---------- */
    const demos = projetos.filter((p) => p.demo);
    const tabs = $("#demo-tabs"), view = $("#demo-view"), url = $("#demo-url"), open = $("#demo-open");
    const frame = view.parentElement;
    let caption = document.createElement("div");
    caption.className = "demo-caption";
    frame.appendChild(caption);
    let demoAtual = null;

    function demoTexts(p) {
        const d = p.demo;
        caption.textContent = (getLang() === "en" && p.en && p.en.legenda) || d.legenda || "";
        if (d.tipo === "iframe") url.textContent = "makorini.github.io/Makorinisite/portifolio/" + d.src;
        else if (d.tipo === "video") url.textContent = t("demos.video") + p.titulo;
        else url.textContent = p.links.site ? p.links.site.replace(/^https?:\/\//, "") : p.titulo;
    }

    function showDemo(p) {
        demoAtual = p;
        $$(".demo-tab", tabs).forEach((tab) => tab.setAttribute("aria-selected", tab.dataset.id === p.id));
        const d = p.demo;
        if (d.tipo === "iframe") {
            view.innerHTML = `<iframe src="${esc(d.src)}" title="${esc(p.titulo)}" loading="lazy"></iframe>`;
            open.href = d.src;
        } else if (d.tipo === "video") {
            view.innerHTML = `<iframe src="${esc(d.src)}" title="${esc(p.titulo)}" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
            open.href = p.links.video || d.src;
        } else {
            view.innerHTML = `<img src="${esc(d.src)}" alt="${esc(d.legenda || p.titulo)}" loading="lazy">`;
            open.href = p.links.site || d.src;
        }
        demoTexts(p);
    }

    tabs.innerHTML = demos.map((p) => `<button class="demo-tab" role="tab" type="button" data-id="${esc(p.id)}">${esc(p.titulo)}</button>`).join("");
    $$(".demo-tab", tabs).forEach((tab) => tab.addEventListener("click", () => showDemo(demos.find((p) => p.id === tab.dataset.id))));
    if (demos.length) showDemo(demos.find((p) => p.demo.tipo === "iframe") || demos[0]);

    /* ---------- Idioma (PT / EN) ---------- */
    function applyLang(lang, mudou) {
        try { localStorage.setItem("makorini-lang", lang); } catch (e) {}
        document.documentElement.lang = lang === "en" ? "en" : "pt-BR";
        document.title = t("meta.title");
        $('meta[name="description"]').setAttribute("content", t("meta.description"));
        $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
        $$("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
        $$("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
        $$(".lang-option").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === lang));
        $$("[data-cv]").forEach((a) => { a.href = lang === "en" ? "assets/curriculo-bianca-maccarini-en.pdf" : "assets/curriculo-bianca-maccarini.pdf"; });
        if (mudou) {
            renderProjects(true);
            if (demoAtual) demoTexts(demoAtual);
            const st = $("#form-status"); if (st) st.textContent = "";
        }
    }
    $$(".lang-option").forEach((b) => b.addEventListener("click", () => applyLang(b.dataset.lang, true)));


    /* ---------- Animação de entrada ---------- */
    const rev = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("visible"); rev.unobserve(en.target); } });
    }, { threshold: 0.12 });
    $$(".reveal").forEach((el) => rev.observe(el));

    /* ---------- Formulário de contato (Google Apps Script, sem servidor) ---------- */
    const form = $("#contact-form"), status = $("#form-status");

    // Plano B: se o envio falhar, abre o app de e-mail de quem escreve, com tudo preenchido.
    function abrirEmail(dados) {
        const corpo = `Nome: ${dados.nome || ""}\nE-mail: ${dados.email || ""}\nAssunto: ${dados.assunto || ""}\n\n${dados.mensagem || ""}`;
        location.href = "mailto:makorini.dev@gmail.com?subject=" + encodeURIComponent("Contato pelo site Makorini") + "&body=" + encodeURIComponent(corpo);
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (form._honey.value) return;               // robô preencheu o campo oculto
        const btn = form.querySelector("button[type=submit]");
        btn.disabled = true;
        status.className = "form-status";
        status.textContent = t("form.sending");
        try {
            const data = Object.fromEntries(new FormData(form));
            // Espera até 20 segundos pela resposta do Apps Script.
            const ctrl = new AbortController();
            const limite = setTimeout(() => ctrl.abort(), 20000);
            const resp = await fetch(form.action, {
                signal: ctrl.signal,
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(data)
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
            status.className = "form-status ok";
            status.textContent = t("form.ok");
        } catch (err) {
            status.className = "form-status err";
            if (err.respondeu) {
                status.textContent = t("form.err2") + err.message;
            } else {
                status.innerHTML = t("form.mailto");
                abrirEmail(Object.fromEntries(new FormData(form)));
            }
            console.warn("Contato:", err.message);
        } finally {
            btn.disabled = false;
        }
    });

    $("#year").textContent = new Date().getFullYear();
    applyLang(getLang(), false);
})();
