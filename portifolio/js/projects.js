/* ============================================================
   LISTA DE PROJETOS
   Para adicionar/editar um projeto, mexa só neste arquivo.

   categorias: "web", "sistema", "ia", "academico"
   en:         textos em inglês (titulo, selo, descricao, legenda, tags); o que faltar aparece em português
   imagem:     caminho em assets/img (ou deixe "" para um cartão estrelado)
   links:      demo  -> página que roda no próprio GitHub Pages
               site  -> versão publicada em outro lugar
               video -> vídeo de demonstração (YouTube)
               codigo-> repositório no GitHub (troque SEU-USUARIO)
   demo:       como aparece na seção "Demonstrações"
               { tipo: "iframe", src: "..." }  roda ao vivo
               { tipo: "imagem", src: "...", legenda: "..." }
               { tipo: "video",  src: "https://www.youtube-nocookie.com/embed/ID" }
   ============================================================ */

window.PROJETOS = [
    {
        id: "vitiexpert",
        titulo: "VitiExpert",
        selo: "TCC",
        ano: "2026",
        categorias: ["sistema", "ia", "academico"],
        descricao: "Sistema especialista para diagnóstico de doenças em videiras com regras SE/ENTÃO e fatores de certeza, catálogo de doenças e pragas, clima e notícias. Em português, inglês e espanhol.",
        en: { selo: "Capstone", descricao: "Expert system that diagnoses grapevine diseases using IF-THEN rules and certainty factors. Includes a disease and pest catalog, local weather, and news, in Portuguese, English, and Spanish.", legenda: "VitiExpert architecture: web interface, inference engine, and knowledge base.", tags: ["Python", "Flask", "Expert Systems", "JavaScript", "Pytest"] },
        tags: ["Python", "Flask", "Sistemas Especialistas", "JavaScript", "Pytest"],
        imagem: "assets/img/capas/vitiexpert.jpg",
        links: { codigo: "https://github.com/SEU-USUARIO/VitiExpert" },
        demo: { tipo: "imagem", src: "assets/img/vitiexpert-arquitetura.png", legenda: "Arquitetura do VitiExpert: interface web, motor de inferência e base de conhecimento." }
    },
    {
        id: "makorini-books",
        titulo: "Makorini Books",
        selo: "Ao vivo",
        ano: "2026",
        categorias: ["web"],
        descricao: "Leitor de contos e histórias curtas: catálogo com busca e gêneros, estante de favoritos, leitor estilo Kindle com sumário, busca no livro, marcadores e temas claro e escuro. Versão estática do front do Makorini Stories.",
        en: { selo: "Live", descricao: "Short-story reader with a searchable catalog, genre filters, a favorites shelf, and a Kindle-style reader with a table of contents, in-book search, bookmarks, and light/dark themes. A static version of the Makorini Stories front end (stories in Portuguese).", tags: ["HTML", "CSS", "JavaScript", "Node.js (full version)", "SQLite"] },
        tags: ["HTML", "CSS", "JavaScript", "Node.js (versão completa)", "SQLite"],
        imagem: "assets/img/capas/makorini-books.jpg",
        links: { demo: "demos/makorini-books/index.html" },
        demo: { tipo: "iframe", src: "demos/makorini-books/index.html" }
    },
    {
        id: "makorini-translator",
        titulo: "Makorini Translator",
        selo: "IA",
        ano: "2025",
        categorias: ["ia", "web"],
        descricao: "Tradutor de scans e webtoons: OCR, tradução com modelo de linguagem local, remoção de texto dos balões, editor e extensão para Chrome.",
        en: { selo: "AI", descricao: "Manga and webtoon translator with OCR, translation by a local language model, speech-bubble text removal, a built-in editor, and a Chrome extension.", legenda: "Makorini Translator editor. Runs locally with Python and Ollama." },
        tags: ["Python", "FastAPI", "EasyOCR", "Ollama", "Chrome Extension"],
        imagem: "assets/img/translator.png",
        links: { codigo: "https://github.com/SEU-USUARIO/makorini-translator" },
        demo: { tipo: "imagem", src: "assets/img/translator.png", legenda: "Editor do Makorini Translator. Roda localmente com Python + Ollama." }
    },
    {
        id: "makorini-biblioteca",
        titulo: "Makorini Biblioteca",
        selo: "Fullstack",
        ano: "2025",
        categorias: ["web", "sistema"],
        descricao: "Plataforma autoral de publicação de novels, mangás, manhwas e webtoons, com catálogo público, painel da autora protegido por senha e capítulos em texto, imagens ou PDF.",
        en: { titulo: "Makorini Library", descricao: "Publishing platform for novels, manga, manhwa, and webtoons, with a public catalog, a password-protected author dashboard, and chapters as text, images, or PDFs.", tags: ["Node.js", "SQLite", "JavaScript", "Authentication"] },
        tags: ["Node.js", "SQLite", "JavaScript", "Autenticação"],
        imagem: "assets/img/capas/makorini-biblioteca.jpg",
        links: { codigo: "https://github.com/SEU-USUARIO/makorini-biblioteca" }
    },
    {
        id: "cinematch",
        titulo: "CineMatch",
        selo: "Equipe",
        ano: "2025",
        categorias: ["web", "academico"],
        descricao: "Sistema de recomendação de filmes com base nos gostos do usuário: gêneros, atores, diretores e avaliações anteriores. Projeto em equipe (CineMasters).",
        en: { selo: "Team", descricao: "Movie recommendation system that suggests titles based on your favorite genres, actors, directors, and past ratings. Team project (CineMasters).", tags: ["React", "Node.js", "REST API"] },
        tags: ["React", "Node.js", "API REST"],
        imagem: "assets/img/capas/cinematch.jpg",
        links: { codigo: "https://github.com/SEU-USUARIO/CineMatch" }
    },
    {
        id: "recappro",
        titulo: "RecapPro",
        selo: "Acadêmico",
        ano: "2024",
        categorias: ["sistema", "academico"],
        descricao: "App de estudos com repetição espaçada e gamificação: cursos, tarefas, pontos e loja de itens cosméticos para o perfil. Disciplina de Programação III.",
        en: { selo: "Academic", descricao: "Study app that combines spaced repetition with gamification: courses, tasks, points, and a shop with cosmetic items for your profile. Built for a Programming III class." },
        tags: ["PHP", "CodeIgniter", "MySQL", "MVC"],
        imagem: "",
        links: { codigo: "https://github.com/SEU-USUARIO/recappro" }
    },
    {
        id: "gestao-salao",
        titulo: "Makorini Sistema Gestão",
        selo: "Gestão",
        ano: "2025",
        categorias: ["sistema", "web"],
        descricao: "Sistema de gestão com login de usuários, agendamento online, página de apresentação, localização e painel interno, feito com Google Apps Script e Google Sheets — sem custo de servidor.",
        en: { titulo: "Makorini Management System", selo: "Management", descricao: "Management system with user login, online booking, a landing page, a location page, and an internal dashboard. Built with Google Apps Script and Google Sheets—no server costs." },
        tags: ["Google Apps Script", "Google Sheets", "HTML", "CSS"],
        imagem: "assets/img/capas/makorini-sistema-gestao.jpg",
        links: { site: "https://script.google.com/macros/s/AKfycbwbTrMEKG1gZw4V8BJuZ4YY0OnjuIDKIDDV_JdqSItHBNS2A0iUz9VR9yGUUb2RU5Ag/exec?pagina=publico" }
    },
    {
        id: "makorini-platform",
        titulo: "Makorini Platform",
        selo: "Em evolução",
        ano: "2025",
        categorias: ["sistema", "web"],
        descricao: "Base de plataforma integrada com cadastro, login com Argon2id, sessões e dashboard responsivo com tema claro pastel e escuro cósmico.",
        en: { selo: "In progress", descricao: "Foundation for an all-in-one platform with sign-up, Argon2id-secured login, sessions, and a responsive dashboard with pastel light and cosmic dark themes." },
        tags: ["Node.js", "Express", "MySQL", "Argon2"],
        imagem: "assets/img/capas/makorini-platform.jpg",
        links: { codigo: "https://github.com/SEU-USUARIO/makorini-platform" }
    }
];
