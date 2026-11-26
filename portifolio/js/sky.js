/* ============================================================
   CÉU ESTRELADO COM CONSTELAÇÕES
   Estrelas que piscam e se movem devagar; as próximas entre si
   (e do cursor) se ligam formando constelações. De vez em quando
   passa uma estrela cadente.
   ============================================================ */
(function () {
    const canvas = document.getElementById("sky");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let w, h, stars = [], shooting = null, starRGB = "255,255,255";
    const mouse = { x: -9999, y: -9999 };
    const LINK = 130;          // distância máxima para ligar estrelas
    const palette = ["255,255,255", "170,205,255", "200,175,255", "140,190,255"];

    function readColor() {
        starRGB = getComputedStyle(document.documentElement).getPropertyValue("--star").trim() || "255,255,255";
    }

    function resize() {
        w = window.innerWidth;
        h = window.innerHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const count = Math.round(Math.min(170, (w * h) / 9000));
        stars = Array.from({ length: count }, () => ({
            x: Math.random() * w,
            y: Math.random() * h,
            r: Math.random() * 1.4 + 0.3,
            vx: (Math.random() - 0.5) * 0.08,
            vy: (Math.random() - 0.5) * 0.08,
            phase: Math.random() * Math.PI * 2,
            speed: 0.01 + Math.random() * 0.02,
            tint: palette[(Math.random() * palette.length) | 0],
            linker: Math.random() < 0.45   // só parte das estrelas forma constelações
        }));
    }

    function isLight() { return document.documentElement.dataset.theme === "light"; }

    function draw() {
        ctx.clearRect(0, 0, w, h);
        const light = isLight();

        // Linhas das constelações
        for (let i = 0; i < stars.length; i++) {
            const a = stars[i];
            if (!a.linker) continue;
            for (let j = i + 1; j < stars.length; j++) {
                const b = stars[j];
                if (!b.linker) continue;
                const dx = a.x - b.x, dy = a.y - b.y;
                const d = dx * dx + dy * dy;
                if (d < LINK * LINK) {
                    const alpha = (1 - Math.sqrt(d) / LINK) * (light ? 0.5 : 0.22);
                    ctx.strokeStyle = light ? `rgba(45,38,140,${alpha})` : `rgba(160,170,255,${alpha})`;
                    ctx.lineWidth = 0.7;
                    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
                }
            }
            // Ligação com o cursor
            const mx = a.x - mouse.x, my = a.y - mouse.y;
            const md = Math.sqrt(mx * mx + my * my);
            if (md < 170) {
                ctx.strokeStyle = light ? `rgba(70,40,170,${(1 - md / 170) * 0.6})` : `rgba(196,166,255,${(1 - md / 170) * 0.5})`;
                ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
            }
        }

        // Estrelas
        for (const s of stars) {
            s.phase += s.speed;
            const tw = 0.55 + Math.sin(s.phase) * 0.45;
            const rgb = light ? starRGB : s.tint;
            // No modo claro as estrelas ficam mais escuras, quase sempre visíveis e 40% maiores.
            ctx.fillStyle = `rgba(${rgb},${light ? 0.55 + tw * 0.45 : tw})`;
            ctx.beginPath(); ctx.arc(s.x, s.y, light ? s.r * 1.4 : s.r, 0, Math.PI * 2); ctx.fill();
            if (s.r > 1.25 && !light) {               // brilho nas estrelas maiores
                ctx.fillStyle = `rgba(${rgb},${tw * 0.12})`;
                ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2); ctx.fill();
            }
        }

        // Estrela cadente
        if (shooting) {
            const s = shooting;
            const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 14, s.y - s.vy * 14);
            grad.addColorStop(0, `rgba(220,230,255,${s.life})`);
            grad.addColorStop(1, "rgba(160,140,255,0)");
            ctx.strokeStyle = grad; ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 14, s.y - s.vy * 14); ctx.stroke();
        }
    }

    function step() {
        for (const s of stars) {
            s.x += s.vx; s.y += s.vy;
            if (s.x < -10) s.x = w + 10; else if (s.x > w + 10) s.x = -10;
            if (s.y < -10) s.y = h + 10; else if (s.y > h + 10) s.y = -10;
        }
        if (shooting) {
            shooting.x += shooting.vx; shooting.y += shooting.vy; shooting.life -= 0.012;
            if (shooting.life <= 0) shooting = null;
        } else if (Math.random() < 0.003 && !isLight()) {
            shooting = { x: Math.random() * w * 0.7 + w * 0.2, y: Math.random() * h * 0.35, vx: -(6 + Math.random() * 4), vy: 2.5 + Math.random() * 2, life: 1 };
        }
    }

    function loop() {
        step(); draw();
        requestAnimationFrame(loop);
    }

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
    window.addEventListener("pointerleave", () => { mouse.x = mouse.y = -9999; });
    document.addEventListener("themechange", readColor);

    readColor(); resize();
    if (reduce) draw(); else loop();
})();
