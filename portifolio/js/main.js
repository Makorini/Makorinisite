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
    const linkNames = { demo: "Ver demonstração ↗", site: "Ver site ↗", video: "Assistir vídeo ↗", codigo: "Código no GitHub ↗" };

    grid.innerHTML = projetos.map((p) => {
        const thumb = p.imagem
            ? `<img src="${esc(p.imagem)}" alt="Tela do projeto ${esc(p.titulo)}" loading="lazy">`
            : `<div class="thumb-mark"><div><small>✦ projeto ✦</small>${esc(p.titulo)}</div></div>`;
        const links = Object.entries(p.links || {})
            .filter(([, url]) => url)
            .map(([k, url]) => `<a href="${esc(url)}"${k === "demo" ? "" : ' target="_blank" rel="noopener"'}>${linkNames[k] || k}</a>`)
            .join("");
        return `
        <article class="project-card reveal" data-cat="${esc(p.categorias.join(" "))}">
            <div class="project-thumb">${thumb}<span class="project-badge">${esc(p.selo)}</span></div>
            <div class="project-body">
                <div class="project-top">${esc(p.ano)}</div>
                <h3>${esc(p.titulo)}</h3>
                <p>${esc(p.descricao)}</p>
                <ul class="tags">${p.tags.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
                <div class="project-links">${links || '<span class="project-top">Projeto privado de cliente</span>'}</div>
            </div>
        </article>`;
    }).join("");

    $$(".filter").forEach((btn) => btn.addEventListener("click", () => {
        $$(".filter").forEach((b) => b.classList.toggle("active", b === btn));
        const f = btn.dataset.filter;
        $$(".project-card").forEach((card) => {
            card.hidden = f !== "todos" && !card.dataset.cat.split(" ").includes(f);
        });
    }));

    /* ---------- Demonstrações ---------- */
    const demos = projetos.filter((p) => p.demo);
    const tabs = $("#demo-tabs"), view = $("#demo-view"), url = $("#demo-url"), open = $("#demo-open");
    const frame = view.parentElement;
    let caption = document.createElement("div");
    caption.className = "demo-caption";
    frame.appendChild(caption);

    function showDemo(p) {
        $$(".demo-tab", tabs).forEach((t) => t.setAttribute("aria-selected", t.dataset.id === p.id));
        const d = p.demo;
        caption.textContent = d.legenda || "";
        if (d.tipo === "iframe") {
            view.innerHTML = `<iframe src="${esc(d.src)}" title="Demonstração: ${esc(p.titulo)}" loading="lazy"></iframe>`;
            url.textContent = "makorini.github.io/Makorinisite/portifolio/" + d.src;
            open.href = d.src;
        } else if (d.tipo === "video") {
            view.innerHTML = `<iframe src="${esc(d.src)}" title="Vídeo: ${esc(p.titulo)}" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
            url.textContent = "Vídeo de demonstração — " + p.titulo;
            open.href = p.links.video || d.src;
        } else {
            view.innerHTML = `<img src="${esc(d.src)}" alt="${esc(d.legenda || p.titulo)}" loading="lazy">`;
            url.textContent = p.links.site ? p.links.site.replace(/^https?:\/\//, "") : p.titulo;
            open.href = p.links.site || d.src;
        }
    }

    tabs.innerHTML = demos.map((p) => `<button class="demo-tab" role="tab" type="button" data-id="${esc(p.id)}">${esc(p.titulo)}</button>`).join("");
    $$(".demo-tab", tabs).forEach((t) => t.addEventListener("click", () => showDemo(demos.find((p) => p.id === t.dataset.id))));
    if (demos.length) showDemo(demos.find((p) => p.demo.tipo === "iframe") || demos[0]);

    /* ---------- Animação de entrada ---------- */
    const rev = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("visible"); rev.unobserve(en.target); } });
    }, { threshold: 0.12 });
    $$(".reveal").forEach((el) => rev.observe(el));

    /* ---------- Formulário de contato (FormSubmit, sem servidor) ---------- */
    const form = $("#contact-form"), status = $("#form-status");
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (form._honey.value) return;               // robô preencheu o campo oculto
        const btn = form.querySelector("button[type=submit]");
        btn.disabled = true;
        status.className = "form-status";
        status.textContent = "Enviando…";
        try {
            const data = Object.fromEntries(new FormData(form));
            const resp = await fetch(form.action.replace("formsubmit.co/", "formsubmit.co/ajax/"), {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(data)
            });
            if (!resp.ok) throw new Error(resp.status);
            form.reset();
            status.className = "form-status ok";
            status.textContent = "Mensagem enviada! Obrigada pelo contato ✦";
        } catch (err) {
            status.className = "form-status err";
            status.innerHTML = 'Não foi possível enviar agora. Escreva direto para <a href="mailto:bianca.maccarini@gmail.com">bianca.maccarini@gmail.com</a>.';
        } finally {
            btn.disabled = false;
        }
    });

    $("#year").textContent = new Date().getFullYear();
})();
