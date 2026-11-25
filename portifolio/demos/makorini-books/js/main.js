// Login, páginas institucionais, rotas e controles gerais.
// Scripts clássicos carregados em ordem (core → catalog → admin → reader → main) e compartilham o escopo global.
// ------------------------------------------------------------------
// Autenticacao da autora
// ------------------------------------------------------------------
// Páginas institucionais públicas; ferramentas de backup ficam na administração.
function publicPage(screen){const title={sobre:'Sobre nós',privacidade:'Política de Privacidade',termos:'Termos de Uso',contato:'Contato'}[screen];const mail='<a href="mailto:Makorini.dev@gmail.com?subject=Contato%20Makorini%20Stories">Makorini.dev@gmail.com</a>';const body=screen==='sobre'?`A Makorini Books reúne obras para leitura e descoberta. Sugestões, melhorias e pedidos de inclusão de obras podem ser enviados para ${mail}. Publicações dependem das autorizações necessárias.`:screen==='contato'?`Para sugestões, melhorias ou indicação de obras: ${mail}. O link abre seu aplicativo de e-mail.`:screen==='privacidade'?`Para quem cria conta guardamos nome, e-mail e senha (cifrada, nunca em texto puro), usados só para entrar e identificar as obras publicadas. Favoritos, progresso, marcadores e grifos ficam apenas no seu navegador; avaliações usam um identificador anônimo em cookie. Você pode apagar sua conta e suas obras a qualquer momento em “Minha conta”. Dúvidas e pedidos: ${mail}.`:`Qualquer pessoa com conta pode publicar obras. Publique apenas conteúdo seu ou que você tenha autorização para publicar; conteúdo ilegal, de terceiros sem permissão ou ofensivo será removido e a conta poderá ser bloqueada. A administração pode editar, ocultar ou apagar qualquer obra. Denúncias e pedidos de remoção: ${mail}.`;app.innerHTML=`<section class="institutional"><h1>${title}</h1><p>${body}</p></section>`}

// ------------------------------------------------------------------
// Aviso sobre mudancas nao salvas
// ------------------------------------------------------------------
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(dirty&&a&&a.hash!==location.hash&&!confirm('Há alterações não salvas. Sair sem salvar?'))e.preventDefault();else if(a)dirty=false});

// ------------------------------------------------------------------
// Rotas e atualizacao das paginas
// ------------------------------------------------------------------
async function render(){const v=++routeVersion;dirty=false;readerCleanup?.();document.title='Makorini Books | Contos e histórias curtas';const [screen,key,bookId]=(location.hash.slice(1)||'inicio').split('/');document.body.classList.toggle('home',screen==='inicio');app.innerHTML='<p class="hint">Abrindo sua biblioteca…</p>';try{await refresh();if(v!==routeVersion)return;try{updateNotifications()}catch{}const b=state.books.find(x=>x.id===Number(key));const needUser=['painel','editar','capitulo','importar','conta','generos'],needAdmin=['destaques','ajuda','usuarios'];if(!state.me&&[...needUser,...needAdmin].includes(screen)){login();return}if(!state.admin&&needAdmin.includes(screen))throw Error('Esta área é exclusiva da administração.');if(['editar','importar'].includes(screen)&&b&&!b.can_edit)throw Error('Você só pode editar as obras que você adicionou.');if(screen==='entrar')login();else if(screen==='cadastro')register();else if(screen==='conta')account();else if(screen==='usuarios')await usersScreen();else if(['sobre','privacidade','termos','contato'].includes(screen))publicPage(screen);else if(screen==='sair'){await api('/logout','POST',{});try{await caches.delete('makorini-runtime')}catch{}location.hash='#inicio';return}else if(screen==='inicio'||screen==='favoritos')catalog(screen==='favoritos',key||'');else if(screen==='painel')panel();else if(screen==='generos')genres();else if(screen==='destaques')manageFeatured();else if(screen==='importar'&&b)importChaptersScreen(b);else if(screen==='categorias')categories();else if(screen==='ajuda')help();else if(screen==='obra'&&bookId){const {book,chapter}=readerChapterFromPrettyRoute(key,bookId);if(needsAdultGate(book)){adultGate(book);return}const c=await api('/chapters/'+chapter.id);if(v!==routeVersion)return;if(Number(c.book_id)!==Number(book.id))throw Error('Capítulo não pertence à obra.');await reader(c,book)}else if(screen==='obra'&&b){if(needsAdultGate(b)){adultGate(b);return}detail(b)}else if(screen==='editar'&&(key==='nova'||b))editBook(b);else if(screen==='capitulo'&&key==='novo'){const owner=state.books.find(x=>x.id===Number(bookId));if(!owner)throw Error('História não encontrada.');if(!owner.can_edit)throw Error('Você só pode editar as obras que você adicionou.');await editChapter(null,owner)}else if(['capitulo','ler'].includes(screen)){const chapterId=screen==='ler'?readerIdFromRoute(key,bookId):Number(key);if(!Number.isSafeInteger(chapterId)||chapterId<=0)throw Error('Capítulo não encontrado.');const c=await api('/chapters/'+chapterId);if(v!==routeVersion)return;const owner=state.books.find(x=>x.id===c.book_id);if(screen==='ler'){if(!owner)throw Error('Obra não encontrada.');if(needsAdultGate(owner)){adultGate(owner);return}history.replaceState(null,'',readerHref(c,owner));await reader(c,owner)}else{if(!owner?.can_edit)throw Error('Você só pode editar as obras que você adicionou.');await editChapter(c,owner)}}else throw Error('Página não encontrada.');window.scrollTo(0,0)}catch(e){if(v===routeVersion)app.innerHTML=`<div class="error-box">${mascot('kuro')}<h1>Não foi possível abrir esta tela</h1><p>${esc(e.message)}</p><a class="btn" href="#inicio">Voltar ao catálogo</a></div>`}}
window.addEventListener('hashchange',render);render();

// Setas da página externa: o leitor nativo de PDF mantém sua própria rolagem.

// ------------------------------------------------------------------
// Setas de rolagem
// ------------------------------------------------------------------
const scrollTopButton=document.querySelector('#scroll-top');
const scrollBottomButton=document.querySelector('#scroll-bottom');
function updateScrollControls(){
 const page=document.scrollingElement||document.documentElement;
 const max=Math.max(0,page.scrollHeight-page.clientHeight);
 scrollTopButton.disabled=page.scrollTop<=2;
 scrollBottomButton.disabled=max-page.scrollTop<=2;
}
function movePage(toEnd){
 const page=document.scrollingElement||document.documentElement;
 const behavior=window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
 window.scrollTo({top:toEnd?Math.max(0,page.scrollHeight-page.clientHeight):0,behavior});
}
scrollTopButton.addEventListener('click',()=>movePage(false));
scrollBottomButton.addEventListener('click',()=>movePage(true));
let scrollFrame=0;
function scheduleScrollUpdate(){if(!scrollFrame)scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;updateScrollControls()})}
window.addEventListener('scroll',scheduleScrollUpdate,{passive:true});
window.addEventListener('resize',scheduleScrollUpdate);
new ResizeObserver(scheduleScrollUpdate).observe(document.body);
updateScrollControls();

// Fecha o menu administrativo ao navegar, sem afetar o login.

// ------------------------------------------------------------------
// Fechamento do menu administrativo
// ------------------------------------------------------------------
document.querySelector('#admin-menu')?.addEventListener('click',e=>{if(e.target.closest('a'))document.querySelector('#admin-menu').open=false});


// ------------------------------------------------------------------
// App instalável e leitura offline (service worker em public/sw.js)
// ------------------------------------------------------------------
if('serviceWorker' in navigator&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname))){
 window.addEventListener('load',()=>Promise.resolve().catch(()=>{}));
}
window.addEventListener('offline',()=>toast('Sem internet: você pode ler os capítulos baixados (⤓) neste navegador.'));
