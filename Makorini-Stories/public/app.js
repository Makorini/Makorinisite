// Interface -> API local (server.mjs) -> SQLite (data/makorini.sqlite).

// ------------------------------------------------------------------
// Estado global e utilitarios
// ------------------------------------------------------------------
const app=document.querySelector('#app');let state={books:[],genres:[],token:'',admin:false,configured:false},routeVersion=0,dirty=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imageURL=n=>'/uploads/'+encodeURIComponent(n);
// Enderecos legiveis: #obra/nome-da-obra/capitulo-50, sem IDs na URL.
// Slugs repetidos ganham -2, -3 etc., preservando a URL da primeira obra.
// Obras publicadas recebem prioridade, para manter o mesmo link para visitantes.
function bookSlug(title){return String(title||'obra').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'obra'}
function bookRouteSlug(book){
 const ordered=[...state.books].sort((a,b)=>Number(a.id)-Number(b.id));
 const listed=[...ordered.filter(b=>b.visibility==='published'),...ordered.filter(b=>b.visibility!=='published')];
 const used=new Set();
 for(const item of listed){
   const base=bookSlug(item.title);let slug=base,n=2;
   while(used.has(slug))slug=`${base}-${n++}`;
   used.add(slug);
   if(Number(item.id)===Number(book.id))return slug;
 }
 return bookSlug(book.title);
}
function readerHref(chapter,book){return `#obra/${bookRouteSlug(book)}/capitulo-${Number(chapter.number)}`}
function readerHrefById(book,chapterId){const chapter=book.chapters?.find(c=>Number(c.id)===Number(chapterId));return chapter?readerHref(chapter,book):`#ler/${chapterId}`}
// Links de versoes anteriores continuam abrindo: #ler/253 e #ler/obra/capitulo-50-253.
function readerIdFromRoute(key,chapterPath){
 if(/^\d+$/.test(key||''))return Number(key);
 const match=/^capitulo-[0-9]+(?:\.[0-9]+)?-(\d+)$/.exec(chapterPath||'');
 return match?Number(match[1]):null;
}
// Resolve nome da obra + numero do capitulo para seu ID interno.
function readerChapterFromPrettyRoute(bookSlugPart,chapterSlugPart){
 const book=state.books.find(b=>bookRouteSlug(b)===bookSlugPart);
 const match=/^capitulo-(\d+(?:\.\d+)?)$/.exec(chapterSlugPart||'');
 if(!book||!match)throw Error('Obra ou capítulo não encontrado.');
 const chapter=book.chapters.find(c=>Number(c.number)===Number(match[1]));
 if(!chapter)throw Error('Capítulo não encontrado ou indisponível.');
 return {book,chapter};
}

const $=s=>document.querySelector(s);
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),3500)}

// ------------------------------------------------------------------
// Tema claro e escuro
// ------------------------------------------------------------------
try{document.body.classList.toggle('dark',localStorage.getItem('makorini-theme')==='dark')}catch{}
$('#theme').onclick=()=>{document.body.classList.toggle('dark');try{localStorage.setItem('makorini-theme',document.body.classList.contains('dark')?'dark':'light')}catch{}};

// ------------------------------------------------------------------
// Comunicacao com a API e menu
// ------------------------------------------------------------------
async function api(url,method='GET',body){let r;try{r=await fetch('/api'+url,{method,headers:{'Content-Type':'application/json','X-Makorini-Token':state.token},body:body===undefined?undefined:JSON.stringify(body)})}catch{throw Error('O servidor está fechado ou indisponível. Abra INICIAR-WINDOWS.bat e tente novamente.')}const data=await r.json();if(!r.ok)throw Error(data.error||'Não foi possível concluir.');return data}
async function refresh(){state=await api('/bootstrap');$('#navigation').innerHTML='<a href="#inicio">Explorar</a><a href="#categorias">Gêneros</a><a href="#favoritos">Favoritos</a>';$('#admin-links').innerHTML=state.admin?'<a href="#painel">Painel da administradora</a><a href="#sair">Sair</a>':'<a href="#entrar">Área da administradora</a>'}

// ------------------------------------------------------------------
// Capas e informacoes das obras
// ------------------------------------------------------------------
function coverFit(b){return b?.cover_fit==='contain'?'contain':'cover'}
function coverPosX(b){const n=Number(b?.cover_focus_x);return Number.isFinite(n)?Math.max(0,Math.min(100,n)):50}
function coverPosY(b){const n=Number(b?.cover_focus_y);return Number.isFinite(n)?Math.max(0,Math.min(100,n)):50}
function coverInlineStyle(b,fitOverride=''){const fit=fitOverride||coverFit(b);return `style="object-fit:${fit};object-position:${coverPosX(b)}% ${coverPosY(b)}%;"`}
function coverPlaceholder(b){return `<div class="cover-empty"><span>✦</span><strong>${esc(b.title)}</strong><small>MAKORINI STORIES</small></div>`}
function cover(b){return b.cover?`<img src="${imageURL(b.cover)}" alt="Capa de ${esc(b.title)}" loading="lazy" ${coverInlineStyle(b)}>`:coverPlaceholder(b)}
function catalogCover(b){
 if(!b.cover)return coverPlaceholder(b);
 const src=imageURL(b.cover);
 if(coverFit(b)==='contain')return `<img class="catalog-cover-backdrop" src="${src}" alt="" aria-hidden="true" loading="lazy"><img class="catalog-cover-art" src="${src}" alt="Capa de ${esc(b.title)}" loading="lazy" ${coverInlineStyle(b,'contain')}>`;
 return `<img class="catalog-cover-art catalog-cover-fill" src="${src}" alt="Capa de ${esc(b.title)}" loading="lazy" ${coverInlineStyle(b,'cover')}>`;
}
const genreNames=b=>b.genres.map(g=>g.name).join(' · ')||'Sem gênero';
// A média é uma avaliação dos leitores, separada de favoritos e destaques.

// ------------------------------------------------------------------
// Avaliacoes dos leitores
// ------------------------------------------------------------------
function ratingSummary(b){const r=b.rating||{average:null,count:0};const label=r.count?`${Number(r.average).toLocaleString('pt-BR',{minimumFractionDigits:1})} / 5 · ${r.count} ${r.count===1?'avaliação':'avaliações'}`:'Sem avaliações';return `<div class="rating-summary" aria-label="${esc(label)}"><span class="rating-display" aria-hidden="true"><span>★★★★★</span><span class="rating-fill" style="width:${r.count?Number(r.average)/5*100:0}%">★★★★★</span></span><span>${esc(label)}</span></div>`}
function ratingPanel(b){if(b.visibility!=='published')return '<p class="hint">As avaliações ficam disponíveis quando a obra é publicada.</p>';return `<section class="rating-panel"><div><h2>O que você achou desta obra?</h2><p class="hint">Escolha de 1 a 5 estrelas. Você pode alterar sua nota depois.</p></div><div class="rating-buttons" role="group" aria-label="Sua avaliação">${[1,2,3,4,5].map(n=>`<button type="button" data-score="${n}" class="rating-star ${n<=b.my_rating?'selected':''}" aria-label="Avaliar com ${n} ${n===1?'estrela':'estrelas'}" aria-pressed="${n===b.my_rating}">★</button>`).join('')}</div><p class="hint">${b.my_rating?`Sua nota neste navegador: ${b.my_rating} de 5.`:'Você ainda não avaliou neste navegador.'} O voto é identificado por um cookie deste navegador.</p>${b.my_rating?'<button class="btn secondary" id="remove-rating">Remover minha avaliação</button>':''}<p id="rating-error" class="error" role="alert"></p></section>`}
function bindRatings(b){const buttons=[...document.querySelectorAll('[data-score]')];async function vote(method,score){buttons.forEach(x=>x.disabled=true);try{await api('/books/'+b.id+'/rating',method,score?{score}:{});const updated=await api('/books/'+b.id);detail(updated);toast(method==='DELETE'?'Avaliação removida.':'Avaliação salva.')}catch(e){const el=$('#rating-error');if(el)el.textContent=e.message;buttons.forEach(x=>x.disabled=false)}}buttons.forEach(btn=>btn.onclick=()=>vote('POST',Number(btn.dataset.score)));$('#remove-rating')?.addEventListener('click',()=>vote('DELETE'))}

// ------------------------------------------------------------------
// Pagina de generos
// ------------------------------------------------------------------
function categories(){app.innerHTML=`<section class="intro"><div><span class="eyebrow">Encontre seu próximo universo</span><h1>Explore por gênero</h1><p>Uma história pode aparecer em mais de um gênero.</p></div><a class="btn secondary" href="#inicio">Ver todas as obras</a></section><div class="genre-grid">${state.genres.map(g=>{const count=state.books.filter(b=>b.genres.some(x=>x.id===g.id)).length;return `<a class="genre-card" href="#inicio/${g.id}"><span>✦</span><h2>${esc(g.name)}</h2><p>${count} ${count===1?'obra':'obras'} disponíveis</p><small>Explorar →</small></a>`}).join('')||'<p>Nenhum gênero cadastrado ainda.</p>'}</div>`}

// ------------------------------------------------------------------
// Aviso NOVO dos capitulos
// ------------------------------------------------------------------
function newChapter(c){const date=c?.published_at?new Date(c.published_at).getTime():NaN;const age=Date.now()-date;return c?.visibility==='published'&&Number.isFinite(date)&&age>=0&&age<7*86400000}
function newTag(c){return newChapter(c)?'<span class="chapter-new">NOVO</span>':''}

// ------------------------------------------------------------------
// Cards do catalogo
// ------------------------------------------------------------------
// Preferências públicas locais: isoladas dos favoritos administrativos.
// Serão migradas para contas depois da implantação da autenticação multiusuário.
function localFavs(){try{return JSON.parse(localStorage.getItem('makorini-public-favs')||'{}')}catch{return {}}}
function saveFavs(obj){localStorage.setItem('makorini-public-favs',JSON.stringify(obj))}
function isFav(id){return Object.hasOwn(localFavs(),String(id))}
function toggleFav(id){const f=localFavs();if(Object.hasOwn(f,String(id)))delete f[id];else f[id]={love:5,added:Date.now()};saveFavs(f)}
function rankBooks(){return state.books.filter(b=>Number(b.rating?.count)>0).sort((a,b)=>Number(b.rating.average)-Number(a.rating.average)||Number(b.rating.count)-Number(a.rating.count)).slice(0,10)}
function card(b){const c=b.chapters.at(-1),rating=b.rating||{};return `<article class="card modern-card"><div class="cover-wrap"><a href="#obra/${b.id}" class="cover-link"><div class="cover">${catalogCover(b)}<span class="badge">${esc(b.format)}</span>${newChapter(c)?'<span class="cover-new">NOVO</span>':''}</div></a><button type="button" class="favorite-heart ${isFav(b.id)?'active':''}" data-heart="${b.id}" title="${isFav(b.id)?'Remover dos favoritos':'Adicionar aos favoritos'}" aria-label="${isFav(b.id)?'Remover dos favoritos':'Adicionar aos favoritos'}" aria-pressed="${isFav(b.id)}">${isFav(b.id)?'♥':'♡'}</button></div><a href="#obra/${b.id}"><h3>${esc(b.title)}</h3></a><p>${esc(genreNames(b))}</p><div class="compact-rating"><span aria-hidden="true">★</span> ${rating.count?Number(rating.average).toLocaleString('pt-BR',{minimumFractionDigits:1}):'—'} <small>${rating.count?`(${rating.count})`:'Sem avaliações'}</small></div>${c?`<a class="chapter-link" href="${readerHref(c,b)}"><b>Capítulo ${c.number}</b> ${newTag(c)}</a>`:'<span class="status-pill">Em preparação</span>'}</article>`}
function catalog(favorites=false,selectedGenre=''){
 const perPage=20;let page=1,slide=0;
 const highlighted=state.books.filter(b=>b.featured&&b.visibility==='published').sort((a,b)=>(a.featured_order??999)-(b.featured_order??999)||a.id-b.id).slice(0,10);
 const top=rankBooks();
 const banner=!favorites&&highlighted.length?`<section class="featured-section"><div class="featured-heading"><h2>Em destaque</h2><span id="featured-position"></span></div><div id="featured-slide"></div><div class="featured-controls"><button id="featured-prev" type="button" aria-label="Destaque anterior">←</button><div id="featured-dots"></div><button id="featured-next" type="button" aria-label="Destaque seguinte">→</button></div></section>`:'';
 app.innerHTML=`${banner}<div class="layout catalog-layout"><section class="catalog-main"><div class="section-title"><h2><span class="dot"></span>${favorites?'Meus favoritos':'Explore o catálogo'}</h2><small id="result-count"></small></div><div class="toolbar"><input id="search" type="search" placeholder="Buscar uma história…" aria-label="Buscar obra"><select id="sort" aria-label="Ordenar catálogo"><option value="recent">Mais recentes</option><option value="rating">Melhor avaliadas</option><option value="az">Título A–Z</option>${favorites?'<option value="love">Nível de satisfação</option>':''}</select><select id="status-filter" aria-label="Filtrar pelo status da obra"><option value="">Todos os status</option><option value="Concluída">Concluídas</option><option value="Em andamento">Em andamento</option><option value="Pausada">Pausadas</option></select><select id="genre-filter" aria-label="Gênero"><option value="">Todos os gêneros</option>${state.genres.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select><select id="format-filter" aria-label="Tipo"><option value="">Todos os tipos</option>${['Novel','Mangá','Manhwa','Webtoon','Livros'].map(f=>`<option>${f}</option>`).join('')}</select></div><div id="genre-chips" class="chips"><button class="chip active" type="button" data-genre="">Todos</button>${state.genres.map(g=>`<button type="button" class="chip" data-genre="${g.id}">${esc(g.name)}</button>`).join('')}</div><div id="grid" class="grid"></div><div class="pagination" id="pagination"></div></section>${favorites?'':`<aside class="top-ranking"><h3>Top 10 melhores do momento</h3>${top.length?top.map((b,i)=>`<a href="#obra/${b.id}" class="rank"><b>${String(i+1).padStart(2,'0')}</b><div class="cover">${cover(b)}</div><div><h4>${esc(b.title)}</h4><small>★ ${Number(b.rating.average).toLocaleString('pt-BR',{minimumFractionDigits:1})} · ${b.rating.count} avaliações</small></div></a>`).join(''):'<p class="hint">O ranking aparecerá quando as obras receberem avaliações.</p>'}</aside>`}</div>`;
 function showSlide(){if(!highlighted.length)return;const b=highlighted[slide],c=b.chapters.at(-1);$('#featured-slide').innerHTML=`<section class="feature-spot" style="--feature-image:url('${b.cover?imageURL(b.cover):''}')"><a class="feature-cover" href="#obra/${b.id}">${cover(b)}</a><div class="feature-copy"><h2>${esc(b.title)}</h2><p class="feature-meta">${esc(b.format)} · ${b.chapters.length} capítulos · ★ ${b.rating?.count?Number(b.rating.average).toLocaleString('pt-BR',{minimumFractionDigits:1}):'Sem avaliações'}</p><p class="feature-synopsis">${esc((b.synopsis||'Descubra esta história.').slice(0,260))}</p><a class="btn" href="#obra/${b.id}">Conhecer obra →</a>${newChapter(c)?'<span class="chapter-new">NOVO</span>':''}</div></section>`;$('#featured-position').textContent=`${slide+1} de ${highlighted.length}`;$('#featured-dots').innerHTML=highlighted.map((_,i)=>`<button type="button" class="feature-dot ${i===slide?'active':''}" data-slide="${i}" aria-label="Destaque ${i+1}" aria-current="${i===slide}"></button>`).join('');document.querySelectorAll('[data-slide]').forEach(x=>x.onclick=()=>{slide=Number(x.dataset.slide);showSlide()});$('#featured-prev').disabled=$('#featured-next').disabled=highlighted.length<2}
 if(highlighted.length&&!favorites){$('#featured-prev').onclick=()=>{slide=(slide-1+highlighted.length)%highlighted.length;showSlide()};$('#featured-next').onclick=()=>{slide=(slide+1)%highlighted.length;showSlide()};showSlide()}
 function filter(){const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),q=norm($('#search').value),g=Number($('#genre-filter').value);const fav=localFavs();let result=state.books.filter(b=>(!favorites||isFav(b.id))&&(!$('#format-filter').value||b.format===$('#format-filter').value)&&(!$('#status-filter').value||b.status===$('#status-filter').value)&&(!g||b.genres.some(x=>x.id===g))&&norm(b.title+' '+b.author).includes(q));const sort=$('#sort').value;result.sort((a,b)=>sort==='az'?a.title.localeCompare(b.title,'pt-BR'):sort==='love'?((fav[b.id]?.love??5)-(fav[a.id]?.love??5)||a.title.localeCompare(b.title,'pt-BR')):sort==='rating'?Number(b.rating?.average||0)-Number(a.rating?.average||0):String(b.updated_at||'').localeCompare(String(a.updated_at||'')));const pages=Math.max(1,Math.ceil(result.length/perPage));page=Math.min(page,pages);$('#grid').innerHTML=result.slice((page-1)*perPage,page*perPage).map(b=>`${favorites?card(b).replace('</article>',`<div class="love-meter"><label for="love-${b.id}">Nível de satisfação <strong>${fav[b.id]?.love||5}/10</strong></label><input type="range" id="love-${b.id}" min="1" max="10" value="${fav[b.id]?.love||5}" data-love="${b.id}"></div></article>`):card(b)}`).join('')||'<div class="empty">Nenhuma obra encontrada.</div>';$('#result-count').textContent=`${result.length} obras`;
 $('#pagination').innerHTML=pages>1?`<span>Página ${page} de ${pages}</span><button data-page="1" ${page===1?'disabled':''}>Primeira</button><button data-page="${page-1}" ${page===1?'disabled':''}>Anterior</button>${Array.from({length:Math.min(pages,7)},(_,i)=>Math.max(1,Math.min(pages-6,page-3))+i).filter(n=>n<=pages).map(n=>`<button data-page="${n}" ${n===page?'aria-current="page"':''}>${n}</button>`).join('')}<button data-page="${page+1}" ${page===pages?'disabled':''}>Próxima</button><button data-page="${pages}" ${page===pages?'disabled':''}>Última</button>`:'';
 document.querySelectorAll('[data-heart]').forEach(x=>x.onclick=()=>{toggleFav(Number(x.dataset.heart));filter()});document.querySelectorAll('[data-page]').forEach(x=>x.onclick=()=>{page=Number(x.dataset.page);filter();$('.catalog-main').scrollIntoView({behavior:'smooth'})});document.querySelectorAll('[data-love]').forEach(x=>{x.oninput=()=>{const f=localFavs(),v=Number(x.value);f[x.dataset.love].love=v;saveFavs(f);x.previousElementSibling.querySelector('strong').textContent=`${v}/10`};x.onchange=()=>{if($('#sort').value==='love')filter()}})}
 $('#search').oninput=()=>{page=1;filter()};$('#genre-filter').value=selectedGenre;$('#genre-filter').onchange=()=>{page=1;document.querySelectorAll('[data-genre]').forEach(x=>x.classList.toggle('active',x.dataset.genre===$('#genre-filter').value));filter()};document.querySelectorAll('[data-genre]').forEach(x=>x.onclick=()=>{$('#genre-filter').value=x.dataset.genre;$('#genre-filter').onchange()});$('#sort').onchange=()=>{page=1;filter()};$('#status-filter').onchange=()=>{page=1;filter()};$('#format-filter').onchange=()=>{page=1;filter()};if(favorites)$('#sort').value='love';filter()
}

// ------------------------------------------------------------------
// Titulos dos capitulos: evita repetir "Capitulo 1 — Capitulo 1".
// Preserva titulos personalizados, sem alterar os registros existentes.
// ------------------------------------------------------------------
function chapterExtraTitle(c){
 const title=String(c.title??'').trim();
 if(!title)return '';
 const clean=title.normalize('NFC');
 const automatic=/^(?:(?:cap[ií]tulo|cap|chapter|chap|ch|epis[oó]dio|epis|ep)\.?\s*[-_#:]?\s*)?0*(\d+(?:[.,]\d+)?)[\s.:-]*$/i.exec(clean);
 if(automatic&&Number(automatic[1].replace(',','.'))===Number(c.number))return '';
 return title;
}

// ------------------------------------------------------------------
// Detalhes da obra
// ------------------------------------------------------------------
// ------------------------------------------------------------------
// Atualização da obra: data mais recente dos capítulos publicados.
// Não considera alterações administrativas na sinopse ou no catálogo.
// ------------------------------------------------------------------
function lastChapterUpdate(b){
 const timestamps=(b.chapters||[])
   .filter(c=>c.visibility==='published'&&c.import_status!=='pending')
   .map(c=>Date.parse(c.published_at||c.updated_at||''))
   .filter(Number.isFinite);
 if(!timestamps.length)return '';
 const days=Math.max(0,Math.floor((Date.now()-Math.max(...timestamps))/86400000));
 return days===0?'Atualizada hoje':days===1?'Atualizada há 1 dia':`Atualizada há ${days} dias`;
}
function detail(b){app.innerHTML=`<a class="back" href="#inicio">← Catálogo</a><section class="detail"><div class="cover">${cover(b)}</div><div class="detail-info"><span class="eyebrow">${esc(b.format)} · ${esc(genreNames(b))}</span><h1>${esc(b.title)}</h1><div class="book-status-row"><span class="pill">Status: ${esc(b.status)}</span>${lastChapterUpdate(b)?`<span class="pill book-updated">${esc(lastChapterUpdate(b))}</span>`:''}${b.release_year?`<span class="pill">Lançamento: ${b.release_year}</span>`:''}</div>${ratingSummary(b)}<div class="genre-tags">${b.genres.map(g=>`<a class="chip" href="#inicio/${g.id}">${esc(g.name)}</a>`).join('')}</div><p class="book-summary">${esc(b.synopsis||'Sinopse ainda não adicionada.')}</p><small>${esc(b.author||'Autoria não informada')} · ${b.chapters.length} capítulos</small><div class="actions">${b.chapters.length?`<a class="btn" href="${readerHref(b.chapters[0],b)}">Começar a ler →</a>`:''}<button class="btn secondary" id="favorite">${isFav(b.id)?'♥ Favoritada':'♡ Favoritar'}</button>${b.progress?`<a class="btn secondary" href="${readerHrefById(b,b.progress.chapter_id)}">Continuar</a>`:''}</div>${state.admin?`<div class="book-detail-actions"><a class="back" href="#editar/${b.id}">Editar história</a><a class="back" href="#capitulo/novo/${b.id}">+ Adicionar capítulo</a></div>`:''}</div></section>${ratingPanel(b)}<div class="section-title"><h2>Capítulos</h2><small>Em ordem de leitura</small></div><div class="chapters">${b.chapters.map(c=>`<a href="${readerHref(c,b)}"><span>Capítulo ${c.number}${chapterExtraTitle(c)?' — '+esc(chapterExtraTitle(c)):''} ${newTag(c)}</span><small>Ler →</small></a>`).join('')||'<div class="empty">Ainda não há capítulos. Use “Adicionar capítulo” para começar.</div>'}</div>`;bindRatings(b);$('#favorite')?.addEventListener('click',()=>{toggleFav(b.id);detail(b)})}

// ------------------------------------------------------------------
// Painel administrativo
// ------------------------------------------------------------------
function panel(){const chapters=state.books.reduce((n,b)=>n+b.chapters.length,0);app.innerHTML=`<section class="intro"><div><span class="eyebrow">Seu ateliê de histórias</span><h1>Painel da administradora</h1><p>Crie, organize e continue de onde parou.</p></div><a class="btn" href="#editar/nova">+ Nova história</a></section><div class="stats"><div><b>${state.books.length}</b><small>Histórias</small></div><div><b>${chapters}</b><small>Capítulos</small></div><div><b>${state.genres.length}</b><small>Gêneros</small></div></div><div class="actions"><a class="btn secondary" href="#generos">Gerenciar gêneros</a><a class="btn secondary" href="#destaques">Gerenciar destaques</a><a class="btn secondary" href="#ajuda">Backup e instruções</a></div><div class="section-title"><h2>Suas histórias</h2></div>${state.books.map(b=>`<article class="admin-row"><div><h3>${esc(b.title)}</h3><small class="hint">${esc(b.format)} · ${esc(genreNames(b))} · ${b.chapters.length} capítulos · ${b.visibility==='published'?'Publicada':'Rascunho'}</small></div><div class="actions"><a class="btn secondary" href="#obra/${b.id}">Ver</a><a class="btn secondary" href="#editar/${b.id}">Editar</a><div class="actions"><a class="btn secondary" href="#importar/${b.id}">Importar capítulos em lote</a><a class="btn" href="#capitulo/novo/${b.id}">+ Capítulo</a></div></div></article>`).join('')||'<div class="empty"><h3>Um espaço para suas próprias histórias.</h3><p>Comece clicando em “Nova história”.</p></div>'}`}

// ------------------------------------------------------------------
// Formulario: validacao e arquivos
// ------------------------------------------------------------------
function formError(e){const el=$('#form-error');if(el){el.textContent=e.message;el.scrollIntoView({block:'nearest'})}else toast(e.message)}
function trackForm(){dirty=false;const f=$('form');if(f)f.addEventListener('input',()=>dirty=true)}
function fileData(file){return new Promise((resolve,reject)=>{if(file.size>12*1024*1024)return reject(Error('Cada imagem deve ter até 12 MB.'));if(!['image/png','image/jpeg','image/webp'].includes(file.type))return reject(Error('Use PNG, JPG ou WebP.'));const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Não foi possível ler '+file.name));r.readAsDataURL(file)})}

// ------------------------------------------------------------------
// Cadastro e edicao das obras
// ------------------------------------------------------------------
// A história precisa existir no banco antes da criação ou importação de capítulos.
function newStoryNextRoute(choice,bookId){
 if(choice==='single')return '#capitulo/novo/'+bookId;
 if(choice==='batch')return '#importar/'+bookId;
 return '#obra/'+bookId;
}
function editBook(b){const fresh=!b;b=b||{title:'',synopsis:'',author:'',format:'Novel',genres:[],visibility:'draft',status:'Em andamento',release_year:null,featured:0,cover_fit:'cover',cover_focus_x:50,cover_focus_y:50,chapters:[]};app.innerHTML=`<a class="back" href="#painel">← Painel da administradora</a><div class="intro"><h1>${fresh?'Nova história':'Editar história'}</h1></div><form id="book-form" class="form-panel"><label>Título *<input name="title" required maxlength="200" value="${esc(b.title)}" placeholder="Qual é o nome do seu universo?"></label><div class="form-grid"><label>Autora / pseudônimo<input name="author" maxlength="200" value="${esc(b.author)}"></label><label>Status<select name="status">${['Em andamento','Concluída','Pausada'].map(x=>`<option ${x===b.status?'selected':''}>${x}</option>`).join('')}</select></label></div><label>Ano de lançamento<input name="release_year" type="number" min="1800" max="2100" step="1" placeholder="Ex.: 2024" value="${b.release_year??''}"></label><label>Tipo da obra<select name="format">${['Novel','Mangá','Manhwa','Webtoon','Livros'].map(x=>`<option ${x===b.format?'selected':''}>${x}</option>`).join('')}</select></label><label>Visibilidade<select name="visibility"><option value="draft" ${b.visibility==='draft'?'selected':''}>Rascunho — só você vê</option><option value="published" ${b.visibility==='published'?'selected':''}>Publicado — aparece para os leitores</option></select></label><label class="featured-option"><input type="checkbox" name="featured" ${b.featured?'checked':''}> Exibir nos destaques da página Explorar</label><small class="hint">Apenas obras publicadas podem ser destacadas. Limite: 10 obras.</small><label>Sinopse<textarea name="synopsis" rows="5" maxlength="20000">${esc(b.synopsis)}</textarea></label><fieldset><legend>Gêneros (pode marcar vários)</legend>${state.genres.map(g=>`<label><input type="checkbox" name="genres" value="${g.id}" ${b.genres.some(x=>x.id===g.id)?'checked':''}>${esc(g.name)}</label>`).join('')||'<p>Cadastre os gêneros no painel.</p>'}</fieldset><a class="back" href="#generos">+ Criar ou editar gêneros no painel</a><label>${b.cover?'Substituir capa':'Capa'}<input type="file" id="cover" accept="image/png,image/jpeg,image/webp"></label><small class="hint">PNG, JPG ou WebP · até 12 MB. A imagem será copiada para a pasta do projeto.</small><section class="cover-editor"><div><strong>Ajuste da capa</strong><small class="hint">Você pode fazer a imagem preencher todo o card ou mostrar a capa inteira.</small><div id="cover-preview" class="cover-editor-preview"></div></div><div class="cover-editor-controls"><label>Modo da capa<select name="cover_fit"><option value="cover" ${coverFit(b)==='cover'?'selected':''}>Preencher o quadro</option><option value="contain" ${coverFit(b)==='contain'?'selected':''}>Mostrar inteira</option></select></label><label>Posição horizontal <span id="cover-focus-x-value">${coverPosX(b)}%</span><input type="range" name="cover_focus_x" min="0" max="100" step="1" value="${coverPosX(b)}"></label><label>Posição vertical <span id="cover-focus-y-value">${coverPosY(b)}%</span><input type="range" name="cover_focus_y" min="0" max="100" step="1" value="${coverPosY(b)}"></label><small class="hint">No modo “Preencher o quadro”, arraste os controles para decidir qual parte aparece no card. No modo “Mostrar inteira”, nada é cortado.</small></div></section>${b.cover?'<label><input type="checkbox" name="removeCover">Remover a capa atual</label>':''}${fresh?`<fieldset class="new-story-chapters"><legend>Capítulos: o que deseja fazer depois de salvar?</legend><p class="hint">Primeiro a história será cadastrada. Em seguida, abriremos a opção escolhida.</p><label class="new-story-chapters-option"><input type="radio" name="afterSave" value="single"><span><strong>Adicionar um capítulo</strong><small>Criar um capítulo com texto, imagens ou PDF.</small></span></label><label class="new-story-chapters-option"><input type="radio" name="afterSave" value="batch"><span><strong>Importar capítulos em lote</strong><small>Enviar vários capítulos de uma pasta de uma só vez.</small></span></label><label class="new-story-chapters-option"><input type="radio" name="afterSave" value="later" checked><span><strong>Adicionar depois</strong><small>Salvar a história e continuar no catálogo.</small></span></label></fieldset>`:''}<p id="form-error" class="error" role="alert"></p><div class="actions"><button class="btn" type="submit">${fresh?'Salvar história':'Salvar alterações'}</button><a class="btn secondary" href="#painel">Cancelar</a></div></form>${!fresh?`<div class="section-title"><h2>Capítulos desta história</h2><div class="actions"><a class="btn secondary" href="#importar/${b.id}">Importar capítulos em lote</a><a class="btn" href="#capitulo/novo/${b.id}">+ Capítulo</a></div></div>${b.chapters.length?`<section class="bulk-visibility form-panel" aria-labelledby="bulk-visibility-title"><h3 id="bulk-visibility-title">Visibilidade dos capítulos</h3><p class="hint">Publique ou oculte vários capítulos sem editar um por um. Marque os capítulos desejados; importações pendentes não podem ser publicadas.</p>${b.visibility!=='published'?'<p class="notice">Esta obra ainda está em rascunho. Mesmo após publicar os capítulos, é necessário publicar a obra acima para que os leitores consigam acessá-los.</p>':''}<label class="bulk-select-all"><input id="bulk-select-all" type="checkbox" ${b.chapters.some(c=>c.import_status!=='pending')?'checked':''} ${b.chapters.every(c=>c.import_status==='pending')?'disabled':''}> Selecionar todos os capítulos concluídos</label><div class="bulk-actions"><span id="bulk-selected-count" class="hint"></span><button id="bulk-publish" type="button" class="btn">Publicar selecionados</button><button id="bulk-hide" type="button" class="btn secondary">Ocultar selecionados</button></div><p id="bulk-feedback" class="hint" role="status" aria-live="polite"></p></section>`:''}${b.chapters.map(c=>`<div class="admin-row bulk-chapter-row"><label class="bulk-chapter-check" title="${c.import_status==='pending'?'Importação pendente':'Selecionar capítulo '+c.number}"><input type="checkbox" data-bulk-chapter="${c.id}" ${c.import_status==='pending'?'disabled':'checked'} aria-label="Selecionar capítulo ${c.number}"></label><div><h3>${c.number} — ${esc(c.title||'Sem título')}</h3><small class="hint">${c.page_count} páginas · ${c.import_status==='pending'?'Importação pendente':c.visibility==='published'?'Publicado':'Rascunho'}</small></div><div class="actions"><a class="btn secondary" href="${readerHref(c,b)}">Ler</a><a class="btn" href="#capitulo/${c.id}">Editar capítulo</a></div></div>`).join('')}<div class="notice">Excluir esta história também remove seus capítulos e imagens. Faça um backup antes, se quiser guardá-los.</div><button id="delete-book" class="btn secondary danger">Excluir história</button>`:''}`;
trackForm();
const coverInput=$('#cover'),coverPreview=$('#cover-preview'),coverFitField=document.querySelector('[name=cover_fit]'),coverXField=document.querySelector('[name=cover_focus_x]'),coverYField=document.querySelector('[name=cover_focus_y]');
let coverPreviewURL='';
function coverPreviewMarkup(src){const temp={title:b.title||'Prévia da capa',cover:src?src.replace(/^\/uploads\//,''):'',cover_fit:coverFitField.value,cover_focus_x:coverXField.value,cover_focus_y:coverYField.value};if(src&&/^blob:|^data:|^https?:|^\/uploads\//.test(src)){const fit=coverFitField.value==='contain'?'contain':'cover';return `<div class="cover cover-editor-frame">${fit==='contain'?`<img class="catalog-cover-backdrop" src="${src}" alt="" aria-hidden="true"><img class="catalog-cover-art" src="${src}" alt="Prévia da capa" style="object-fit:contain;object-position:${coverXField.value}% ${coverYField.value}%">`:`<img class="catalog-cover-art catalog-cover-fill" src="${src}" alt="Prévia da capa" style="object-fit:cover;object-position:${coverXField.value}% ${coverYField.value}%">`}</div>`}return `<div class="cover cover-editor-frame">${coverPlaceholder(temp)}</div>`}
function refreshCoverPreview(){const usingCover=coverInput.files?.[0]?coverPreviewURL:(b.cover?imageURL(b.cover):'');coverPreview.innerHTML=coverPreviewMarkup(usingCover);$('#cover-focus-x-value').textContent=`${coverXField.value}%`;$('#cover-focus-y-value').textContent=`${coverYField.value}%`;const disable=coverFitField.value==='contain';coverXField.disabled=coverYField.disabled=disable;coverPreview.classList.toggle('contain-mode',disable)}
coverInput?.addEventListener('change',()=>{if(coverPreviewURL)URL.revokeObjectURL(coverPreviewURL);coverPreviewURL=coverInput.files?.[0]?URL.createObjectURL(coverInput.files[0]):'';refreshCoverPreview()});
[coverFitField,coverXField,coverYField].forEach(el=>el?.addEventListener('input',refreshCoverPreview));
refreshCoverPreview();
$('#book-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,button=f.querySelector('button[type=submit]');button.disabled=true;$('#form-error').textContent='';let savedId;try{const fd=new FormData(f),file=$('#cover').files[0];const afterSave=fd.get('afterSave');const data=file?await fileData(file):null;const result=await api('/books'+(fresh?'':'/'+b.id),fresh?'POST':'PUT',{title:fd.get('title'),author:fd.get('author'),synopsis:fd.get('synopsis'),status:fd.get('status'),release_year:fd.get('release_year'),format:fd.get('format'),visibility:fd.get('visibility'),featured:fd.has('featured'),cover_fit:fd.get('cover_fit'),cover_focus_x:Number(fd.get('cover_focus_x')),cover_focus_y:Number(fd.get('cover_focus_y')),genres:fd.getAll('genres').map(Number)});savedId=result.id;dirty=false;if(data)await api('/books/'+savedId+'/cover','POST',{image:data});else if(fd.get('removeCover'))await api('/books/'+savedId+'/cover','DELETE',{});toast('História salva no banco.');location.hash=fresh?newStoryNextRoute(afterSave,savedId):'#obra/'+savedId}catch(err){if(savedId){location.hash='#editar/'+savedId;toast('História salva, mas a capa falhou. Abra a edição e tente novamente.')}else formError(err)}finally{button.disabled=false}};
// Seleção em lote para publicar ou ocultar capítulos concluídos sem abrir um a um.
if(!fresh&&b.chapters.length){
 const checkboxes=[...document.querySelectorAll('[data-bulk-chapter]:not(:disabled)')];
 const allCheckbox=$('#bulk-select-all'),count=$('#bulk-selected-count');
 const publishButton=$('#bulk-publish'),hideButton=$('#bulk-hide'),feedback=$('#bulk-feedback');
 function selectedIds(){return checkboxes.filter(el=>el.checked).map(el=>Number(el.dataset.bulkChapter))}
 function updateSelection(){
  const selected=selectedIds().length;
  count.textContent=`${selected} de ${checkboxes.length} capítulos concluídos selecionados`;
  publishButton.disabled=hideButton.disabled=selected===0;
  allCheckbox.checked=checkboxes.length>0&&selected===checkboxes.length;
  allCheckbox.indeterminate=selected>0&&selected<checkboxes.length;
 }
 allCheckbox?.addEventListener('change',()=>{checkboxes.forEach(el=>el.checked=allCheckbox.checked);updateSelection()});
 checkboxes.forEach(el=>el.addEventListener('change',updateSelection));
 async function setVisibility(visibility){
  if(dirty){feedback.textContent='Salve as alterações da obra antes de alterar os capítulos.';return}
  const ids=selectedIds();if(!ids.length)return;
  const action=visibility==='published'?'publicar':'ocultar';
  if(!confirm(`Deseja ${action} ${ids.length} capítulo(s) selecionado(s) de “${b.title}”? ${visibility==='published'?'Os capítulos ficarão públicos se a obra estiver publicada.':'Eles deixarão de aparecer para os leitores.'}`))return;
  publishButton.disabled=hideButton.disabled=true;
  feedback.textContent='Atualizando a visibilidade dos capítulos…';
  try{
   const result=await api('/books/'+b.id+'/chapters/visibility','PUT',{ids,visibility});
   toast(`${result.changed} capítulo(s) alterado(s).`);
   await render();
  }catch(err){feedback.textContent=err.message;updateSelection()}
 }
 publishButton.addEventListener('click',()=>setVisibility('published'));
 hideButton.addEventListener('click',()=>setVisibility('draft'));
 updateSelection();
}
$('#delete-book')?.addEventListener('click',async()=>{if(!confirm('Excluir “'+b.title+'”, todos os capítulos e imagens? Esta ação não pode ser desfeita.'))return;try{await api('/books/'+b.id,'DELETE',{});dirty=false;location.hash='#painel'}catch(e){toast(e.message)}})}

// ------------------------------------------------------------------
// Cadastro e edicao de capitulos
// ------------------------------------------------------------------
async function editChapter(c,b){const fresh=!c;c=c||{number:b.chapters.length?Math.floor(Math.max(...b.chapters.map(x=>x.number)))+1:1,title:'',content:'',visibility:'draft',pdf_filename:null,pages:[]};app.innerHTML=`<a class="back" href="#editar/${b.id}">← ${esc(b.title)}</a><div class="intro"><div><span class="eyebrow">${esc(b.title)}</span><h1>${fresh?'Novo capítulo':'Editar capítulo'}</h1></div>${!fresh?`<a class="btn secondary" href="${readerHref(c,b)}">Ver no leitor</a>`:''}</div><form class="form-panel" id="chapter-form"><div class="form-grid"><label>Número *<input name="number" type="number" min="0" max="1000000" step="any" required value="${c.number}"></label><label>Título do capítulo<input name="title" maxlength="200" value="${esc(c.title)}"></label></div><label>Visibilidade do capítulo<select name="visibility"><option value="draft" ${c.visibility==='draft'?'selected':''}>Rascunho — só você vê</option><option value="published" ${c.visibility==='published'?'selected':''}>Publicado — visível se a obra também estiver publicada</option></select></label><label>Texto da história<textarea name="content" rows="14" maxlength="1000000" placeholder="Escreva seu capítulo aqui…">${esc(c.content)}</textarea></label><p class="hint">Você pode usar texto, imagens ou os dois. O texto aparece antes das páginas. Salve o capítulo para adicionar imagens ou um PDF completo.</p><p id="form-error" class="error" role="alert"></p><button class="btn" type="submit">Salvar capítulo</button></form>${!fresh?`<section class="form-panel"><h2>PDF do capítulo</h2><div id="pdf-current">${c.pdf_filename?`<p><a class="btn secondary" href="${imageURL(c.pdf_filename)}" target="_blank" rel="noopener">Abrir ${esc(c.pdf_original_name)}</a></p>`:'<p class="hint">Nenhum PDF adicionado.</p>'}</div><label>Enviar ou substituir PDF<input id="pdf-input" type="file" accept="application/pdf,.pdf"></label><p class="hint">Um PDF completo por capítulo, até 40 MB. Um livro inteiro também pode ser guardado como um capítulo chamado “Volume completo”.</p><div class="actions"><button id="upload-pdf" class="btn">Salvar PDF</button><button id="remove-pdf" class="btn secondary danger" ${c.pdf_filename?'':'hidden'}>Remover PDF</button></div><p id="pdf-status" class="hint" role="status"></p></section><section class="form-panel"><h2>Páginas do capítulo</h2><label>Adicionar imagens<input id="pages-input" type="file" multiple accept="image/png,image/jpeg,image/webp"></label><p class="hint">Selecionadas em ordem de nome: 001.jpg, 002.jpg… Até 12 MB por imagem. Novas páginas são adicionadas ao final.</p><button id="upload-pages" class="btn">Enviar páginas</button><p id="upload-status" class="hint" role="status"></p><div id="page-list"></div></section><div class="chapter-bottom-actions"><button class="btn secondary danger" id="delete-chapter">Excluir capítulo</button><a class="btn" id="next-chapter" href="#capitulo/novo/${b.id}">+ Próximo capítulo</a></div>`:''}`;
trackForm();$('#chapter-form').onsubmit=async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button');btn.disabled=true;$('#form-error').textContent='';try{const fd=new FormData(e.currentTarget);const result=await api(fresh?'/books/'+b.id+'/chapters':'/chapters/'+c.id,fresh?'POST':'PUT',{number:Number(fd.get('number')),title:fd.get('title'),content:fd.get('content'),visibility:fd.get('visibility')});dirty=false;toast('Capítulo salvo.');if(fresh)location.hash='#capitulo/'+result.id;else await render()}catch(err){formError(err)}finally{btn.disabled=false}};
if(fresh)return;
async function updatePDF(){const latest=await api('/chapters/'+c.id);c.pdf_filename=latest.pdf_filename;c.pdf_original_name=latest.pdf_original_name;$('#pdf-current').innerHTML=c.pdf_filename?`<a class="btn secondary" href="${imageURL(c.pdf_filename)}" target="_blank" rel="noopener">Abrir ${esc(c.pdf_original_name)}</a>`:'<p class="hint">Nenhum PDF adicionado.</p>';$('#remove-pdf').hidden=!c.pdf_filename}
$('#upload-pdf').onclick=async()=>{if(dirty){toast('Salve o texto antes de enviar o PDF.');return}const file=$('#pdf-input').files[0],btn=$('#upload-pdf'),msg=$('#pdf-status');if(!file){toast('Selecione um PDF primeiro.');return}btn.disabled=true;msg.textContent='Salvando PDF…';try{if(file.size>40*1024*1024)throw Error('O PDF deve ter até 40 MB.');const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).replace(/^data:[^;]*;/,'data:application/pdf;'));reader.onerror=()=>reject(Error('Falha ao ler o PDF.'));reader.readAsDataURL(file)});await api('/chapters/'+c.id+'/pdf','POST',{name:file.name,pdf:base64});await updatePDF();$('#pdf-input').value='';msg.textContent='PDF salvo no capítulo.'}catch(e){msg.textContent=e.message}finally{btn.disabled=false}};
$('#remove-pdf').onclick=async()=>{if(!confirm('Remover o PDF deste capítulo?'))return;try{await api('/chapters/'+c.id+'/pdf','DELETE',{});await updatePDF()}catch(e){toast(e.message)}};
async function pages(){const latest=await api('/chapters/'+c.id);c.pages=latest.pages;$('#page-list').innerHTML=c.pages.map((pg,i)=>`<div class="page-row"><img src="${imageURL(pg.filename)}" alt="Página ${i+1}" loading="lazy"><div class="page-name">${i+1}. ${esc(pg.original_name)}</div><button class="btn secondary" data-move="${pg.id}" data-dir="-1" ${i===0?'disabled':''} aria-label="Mover página ${i+1} para cima">↑</button><button class="btn secondary" data-move="${pg.id}" data-dir="1" ${i===c.pages.length-1?'disabled':''} aria-label="Mover página ${i+1} para baixo">↓</button><button class="btn secondary danger" data-delete="${pg.id}">Excluir</button></div>`).join('')||'<p class="hint">Nenhuma página de imagem adicionada.</p>';$('#page-list').querySelectorAll('[data-move]').forEach(el=>el.onclick=async()=>{const ids=c.pages.map(p=>p.id),i=ids.indexOf(Number(el.dataset.move)),j=i+Number(el.dataset.dir);[ids[i],ids[j]]=[ids[j],ids[i]];try{await api('/chapters/'+c.id+'/order','PUT',{ids});await pages()}catch(e){toast(e.message)}});$('#page-list').querySelectorAll('[data-delete]').forEach(el=>el.onclick=async()=>{if(!confirm('Excluir esta página de imagem?'))return;try{await api('/pages/'+el.dataset.delete,'DELETE',{});await pages()}catch(e){toast(e.message)}})}
await pages();$('#upload-pages').onclick=async()=>{const input=$('#pages-input'),btn=$('#upload-pages'),status=$('#upload-status');const files=[...input.files].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR',{numeric:true}));if(!files.length){toast('Selecione as imagens primeiro.');return}if(dirty){toast('Salve o texto do capítulo antes de enviar imagens.');return}btn.disabled=true;input.disabled=true;let sent=0;try{for(const file of files){status.textContent=`Enviando ${sent+1} de ${files.length}: ${file.name}`;await api('/chapters/'+c.id+'/pages','POST',{name:file.name,image:await fileData(file)});sent++}status.textContent=`${sent} páginas salvas no computador.`;input.value=''}catch(e){status.textContent=`${sent} páginas foram salvas. Envio interrompido: ${e.message} Selecione apenas os arquivos que faltam para continuar.`;input.value=''}finally{btn.disabled=false;input.disabled=false;await pages()}};
$('#next-chapter').addEventListener('click',e=>{if(dirty&&!confirm('Você tem alterações não salvas neste capítulo. Deseja descartá-las para criar o próximo?'))e.preventDefault();else dirty=false});$('#delete-chapter').onclick=async()=>{if(!confirm('Excluir o capítulo e todas as suas páginas?'))return;try{await api('/chapters/'+c.id,'DELETE',{});dirty=false;location.hash='#editar/'+b.id}catch(e){toast(e.message)}}}

// ------------------------------------------------------------------
// Leitor e navegacao de capitulos
// ------------------------------------------------------------------
async function reader(c,b){
 document.title=`Capítulo ${c.number} — ${b.title} | Makorini Stories`;
 const i=b.chapters.findIndex(x=>x.id===c.id),prev=b.chapters[i-1],next=b.chapters[i+1];
 const nav=(position='')=>`<div class="reader-nav reader-nav-card ${position}"><div class="reader-nav-side">${prev?`<a class="btn secondary" href="${readerHref(prev,b)}">← Capítulo anterior</a>`:'<span class="reader-nav-placeholder"></span>'}</div><a class="reader-nav-center" href="#obra/${b.id}">Lista de capítulos</a><div class="reader-nav-side">${next?`<a class="btn" href="${readerHref(next,b)}">Próximo capítulo →</a>`:`<a class="btn" href="#obra/${b.id}">Voltar à obra ✓</a>`}</div></div>`;
 app.innerHTML=`<a class="back" href="#obra/${b.id}">← ${esc(b.title)}</a><section class="reader-shell"><div class="reader-head-card"><div class="reader-title"><span class="eyebrow">${esc(b.title)}</span><h1>Capítulo ${c.number}</h1>${chapterExtraTitle(c)?`<p class="reader-subtitle">${esc(chapterExtraTitle(c))}</p>`:''}</div><div class="read-controls"><label class="reader-field"><span>Capítulo</span><select id="chapter-select" aria-label="Selecionar capítulo">${b.chapters.map(x=>`<option value="${x.id}" ${x.id===c.id?'selected':''}>Capítulo ${x.number}</option>`).join('')}</select></label><label class="reader-field"><span>Largura da página</span><input id="width" type="range" min="320" max="1000" value="680"></label><label class="reader-field"><span>Tamanho do texto</span><input id="font-size" type="range" min="15" max="28" value="18"></label></div></div>${nav('top')}<div class="reader-stage"><div class="reader" id="reader" style="max-width:680px">${c.content?`<div class="chapter-text">${esc(c.content)}</div>`:''}${c.pdf_filename?`<div class="pdf-reader"><div class="pdf-reader-head"><a class="btn secondary" href="${imageURL(c.pdf_filename)}" target="_blank" rel="noopener">Abrir PDF completo ↗</a><p class="hint">Se o navegador não mostrar o documento abaixo, use o botão para abrir ou baixar.</p></div><iframe src="${imageURL(c.pdf_filename)}#view=FitH" title="PDF: ${esc(c.title||b.title)}"></iframe></div>`:''}${c.pages.map((pg,j)=>`<img src="${imageURL(pg.filename)}" alt="Página ${j+1} de ${esc(b.title)}" loading="${j===0?'eager':'lazy'}">`).join('')}${!c.content&&!c.pages.length&&!c.pdf_filename?'<div class="empty"><h3>Capítulo ainda vazio</h3><p>Este capítulo ainda não tem texto, páginas ou PDF.</p></div>':''}</div></div>${nav('bottom')}${state.admin?`<p class="reader-admin-link"><a class="back" href="#capitulo/${c.id}">Editar este capítulo</a></p>`:''}</section>`;
 $('#chapter-select').onchange=e=>location.hash=readerHrefById(b,e.target.value);
 $('#width').oninput=e=>$('#reader').style.maxWidth=e.target.value+'px';
 $('#font-size').oninput=e=>{const t=$('.chapter-text');if(t)t.style.fontSize=e.target.value+'px'};
 if(state.admin)await api('/chapters/'+c.id+'/progress','POST',{})
}

// ------------------------------------------------------------------
// Gerenciamento de generos
// ------------------------------------------------------------------
// Destaques: seleção pelo formulário de edição de cada obra.
// ------------------------------------------------------------------
// Importacao de capitulos em lote: compara números e envia arquivos um a um.
// ------------------------------------------------------------------
function readPDFData(file){
 return new Promise((resolve,reject)=>{
  if(file.size>40*1024*1024)return reject(Error('PDF acima do limite de 40 MB: '+file.name));
  const r=new FileReader();
  r.onload=()=>resolve(String(r.result).replace(/^data:[^;]*;/,'data:application/pdf;'));
  r.onerror=()=>reject(Error('Falha ao ler PDF: '+file.name));r.readAsDataURL(file);
 });
}
function parseImportNumber(name){
 const text=name.normalize('NFC').trim();
 const m=text.match(/^(?:(?:cap[ií]tulo|cap|chapter|chap|ch|epis[oó]dio|epis|ep|parte|vol(?:ume)?)\.?[\s_-]*)?(\d+(?:[.,]\d+)?)(?=$|[\s_.-])/i);
 if(!m)return null;
 const num=Number(m[1].replace(',','.'));
 return Number.isFinite(num)&&num>=0&&num<=1000000?num:null;
}
function folderChapters(files){
 const found=new Map(),warnings=[];
 const collator=new Intl.Collator('pt-BR',{numeric:true,sensitivity:'base'});
 for(const file of files){
  const parts=(file.webkitRelativePath||file.name).split('/').filter(Boolean);
  if(parts.some(x=>x.startsWith('.')))continue;
  const ext=file.name.split('.').pop().toLowerCase();
  let label;
  if(['jpg','jpeg','png','webp'].includes(ext)&&parts.length>=3)label=parts[1];
  else if(ext==='pdf')label=parts.length>=3?parts[1]:file.name.replace(/\.pdf$/i,'');
  else continue;
  const number=parseImportNumber(label);
  if(number===null){warnings.push('Sem número reconhecido: '+label);continue}
  const key=String(number);
  // Não mistura pastas distintas que representam o mesmo número de capítulo.
  const source=parts.length>=3?parts.slice(0,-1).join('/'):parts.slice(0,-1).join('/')+'/'+file.name;
  if(!found.has(key))found.set(key,{number,title:'',source,duplicateSource:false,images:[],pdfs:[]});
  const chapter=found.get(key);
  if(chapter.source!==source)chapter.duplicateSource=true;
  if(ext==='pdf')chapter.pdfs.push(file);else chapter.images.push(file);
 }
 const chapters=[...found.values()].sort((a,b)=>a.number-b.number);
 for(const c of chapters){
  c.images.sort((a,b)=>(a.webkitRelativePath||a.name).localeCompare(b.webkitRelativePath||b.name,'pt-BR',{numeric:true}));
  c.pdfs.sort((a,b)=>collator.compare(a.name,b.name));
  c.kind=c.images.length?'images':'pdf';c.files=c.kind==='images'?c.images:c.pdfs;
  c.error=c.duplicateSource?'Existem duas pastas diferentes com o mesmo número de capítulo.':c.pdfs.length&&c.images.length?'A pasta possui imagens e PDF; separe os formatos.':c.pdfs.length>1?'Há mais de um PDF para este capítulo.':c.kind==='images'&&new Set(c.files.map(f=>f.name.toLowerCase())).size!==c.files.length?'Existem páginas com o mesmo nome nesta pasta.':c.files.length>3000?'Limite de 3.000 imagens por capítulo.':c.files.some(f=>f.size>(c.kind==='pdf'?40:12)*1024*1024)?'Um arquivo excede o limite de tamanho.':'';
 }
 return {chapters,warnings};
}
function importChaptersScreen(b){
 let parsed=[];
 app.innerHTML=`<a class="back" href="#editar/${b.id}">← ${esc(b.title)}</a><section class="intro"><div><span class="eyebrow">Painel da administradora</span><h1>Importar capítulos em lote</h1><p>Adicione somente os capítulos que faltam. Os existentes não serão substituídos.</p></div></section><div class="form-panel bulk-import"><label for="bulk-folder">Selecione uma pasta com subpastas como “Capítulo 01”, “Capítulo 02”… ou PDFs “Capítulo 03.pdf”</label><input type="file" id="bulk-folder" webkitdirectory directory multiple><p class="hint">Cada subpasta representa um capítulo. Imagens JPG, PNG e WebP são enviadas na ordem dos nomes. PDFs também são aceitos. Funciona melhor no Chrome ou Edge. Para um ZIP, extraia-o primeiro.</p><label class="bulk-publish"><input id="bulk-publish" type="checkbox"> Publicar os novos capítulos ao concluir (desmarcado: salvar como rascunho)</label><div id="bulk-summary" class="hint" role="status">Selecione uma pasta para analisar.</div><div id="bulk-preview" class="bulk-preview"></div><div class="actions"><button class="btn" id="bulk-start" type="button" disabled>Importar capítulos faltantes</button><a class="btn secondary" href="#editar/${b.id}">Voltar à obra</a></div><progress id="bulk-progress" max="100" value="0" hidden></progress><p id="bulk-status" role="status" class="hint"></p><p id="bulk-error" role="alert" class="error"></p></div>`;
 const input=$('#bulk-folder'),preview=$('#bulk-preview'),summary=$('#bulk-summary'),start=$('#bulk-start'),status=$('#bulk-status'),error=$('#bulk-error'),progress=$('#bulk-progress');
 const existing=()=>new Map((state.books.find(x=>x.id===b.id)?.chapters||[]).map(x=>[String(x.number),x]));
 input.onchange=()=>{
  const result=folderChapters([...input.files]);parsed=result.chapters;
  const have=existing(),valid=parsed.filter(c=>!c.error&&(!have.has(String(c.number))||have.get(String(c.number)).import_status==='pending'));
  const skipped=parsed.filter(c=>have.has(String(c.number))&&have.get(String(c.number)).import_status!=='pending').length;
  const invalid=parsed.filter(c=>c.error).length;
  summary.textContent=`${parsed.length} capítulos reconhecidos · ${skipped} já cadastrados (ignorados) · ${valid.length} novos ou pendentes · ${invalid} com problemas.`;
  preview.innerHTML=parsed.map(c=>{const stored=have.get(String(c.number));const label=c.error?c.error:stored?.import_status==='pending'?'Retomar importação pendente':stored?'Já cadastrado — ignorar':'Novo capítulo';return `<div class="bulk-item ${c.error?'bulk-invalid':stored?.import_status==='pending'?'bulk-resume':stored?'bulk-skip':'bulk-new'}"><span>Capítulo ${esc(c.number)} · ${c.files.length} ${c.kind==='pdf'?'PDF':'imagens'}</span><small>${esc(label)}</small></div>`}).join('')||'<p class="hint">Nenhum capítulo reconhecido. Confira os nomes das pastas e arquivos.</p>';
  error.textContent=result.warnings.length?`Itens ignorados (até 5): ${result.warnings.slice(0,5).join(' | ')}`:'';
  start.disabled=!valid.length;
 };
 start.onclick=async()=>{
  start.disabled=true;input.disabled=true;$('#bulk-publish').disabled=true;error.textContent='';progress.hidden=false;progress.value=0;
  const have=existing(),tasks=parsed.filter(c=>!c.error&&(!have.has(String(c.number))||have.get(String(c.number)).import_status==='pending'));
  const total=tasks.reduce((n,c)=>n+c.files.length,0),errors=[];let uploaded=0,finished=0;
  for(const chapter of tasks){
   try{
    status.textContent=`Preparando capítulo ${chapter.number}…`;
    const begin=await api('/books/'+b.id+'/import-chapters','POST',{number:chapter.number,expected:chapter.files.length,kind:chapter.kind});
    if(begin.status==='exists'){errors.push(`Capítulo ${chapter.number}: já cadastrado com outra estrutura; não foi alterado.`);continue}
    const current=await api('/chapters/'+begin.id);
    // Uma retomada só pode usar os mesmos arquivos da pasta original.
    // Isso evita misturar páginas antigas com uma versão diferente do capítulo.
    if(begin.status==='resume'&&chapter.kind==='images'){
     const expectedNames=new Set(chapter.files.map(file=>file.name));
     if(current.pages.some(page=>!expectedNames.has(page.original_name))){
      throw Error('A pasta é diferente da importação pendente. Selecione a pasta original para retomar.');
     }
    }
    if(begin.status==='resume'&&chapter.kind==='pdf'&&current.pdf_original_name&&current.pdf_original_name!==chapter.files[0].name){
     throw Error('O PDF é diferente do arquivo da importação pendente. Selecione o PDF original.');
    }
    if(chapter.kind==='pdf'){
     if(!current.pdf_filename){status.textContent=`Enviando PDF do capítulo ${chapter.number}…`;await api('/chapters/'+begin.id+'/pdf','POST',{name:chapter.files[0].name,pdf:await readPDFData(chapter.files[0])});}
     uploaded++;progress.value=Math.round(uploaded/Math.max(1,total)*100);
    }else{
     const already=new Set(current.pages.map(pg=>pg.original_name));
     for(const file of chapter.files){
      if(!already.has(file.name)){
       status.textContent=`Capítulo ${chapter.number}: página ${chapter.files.indexOf(file)+1} de ${chapter.files.length}…`;
       await api('/chapters/'+begin.id+'/pages','POST',{name:file.name,image:await fileData(file)});
      }
      uploaded++;progress.value=Math.round(uploaded/Math.max(1,total)*100);
     }
    }
    await api('/chapters/'+begin.id+'/import-finish','POST',{publish:$('#bulk-publish').checked});finished++;
    status.textContent=`${finished} capítulo(s) concluído(s).`;
   }catch(e){errors.push(`Capítulo ${chapter.number}: ${e.message}`);break}
  }
  await refresh();
  if(errors.length){error.textContent=errors.join(' | ');status.textContent=`${finished} capítulos concluídos. Selecione a mesma pasta novamente para retomar o pendente.`;}
  else status.textContent=`Importação finalizada: ${finished} capítulo(s) ${$('#bulk-publish').checked?'publicado(s)':'salvo(s) como rascunho'}.`;
  progress.value=errors.length?progress.value:100;input.disabled=false;$('#bulk-publish').disabled=false;input.onchange();
 };
}

function manageFeatured(){
 app.innerHTML=`<a class="back" href="#painel">← Painel da administradora</a><section class="intro"><div><span class="eyebrow">Vitrine pública</span><h1>Gerenciar destaques</h1><p id="featured-count"></p></div></section><div class="form-panel featured-manager"><label for="featured-search">Buscar obra publicada<input id="featured-search" type="search" placeholder="Pesquisar pelo título ou autora…" autocomplete="off"></label><h2>Destaques ativos — ordem de exibição</h2><p class="hint">Use as setas para alterar a ordem exibida no carrossel da página Explorar.</p><div id="featured-selected"></div><h2>Adicionar outras obras</h2><div id="featured-available"></div><p id="featured-error" class="error" role="alert"></p></div>`;
 const manager=$('.featured-manager'),search=$('#featured-search'),message=$('#featured-error');
 const published=()=>state.books.filter(b=>b.visibility==='published');
 const selected=()=>published().filter(b=>b.featured).sort((a,b)=>(a.featured_order??999)-(b.featured_order??999)||a.id-b.id);
 const row=(b,active,index,count)=>`<div class="admin-row featured-admin-row"><div class="featured-admin-book"><div class="featured-mini-cover">${cover(b)}</div><div><b>${esc(b.title)}</b><small>${esc(b.author||b.format)}${active?` · Posição ${index+1}`:''}</small></div></div><div class="featured-row-actions">${active?`<button class="btn secondary featured-move" type="button" data-feature-move="up" data-feature-id="${b.id}" aria-label="Subir destaque" ${index===0?'disabled':''}>↑</button><button class="btn secondary featured-move" type="button" data-feature-move="down" data-feature-id="${b.id}" aria-label="Descer destaque" ${index===count-1?'disabled':''}>↓</button>`:''}<button type="button" class="btn ${active?'featured-active':'secondary'}" data-feature-toggle="${b.id}" aria-pressed="${active}">${active?'✓ Selecionada — remover':'Selecionar'}</button></div></div>`;
 function draw(){const books=published(),chosen=selected(),q=search.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const matches=b=>(b.title+' '+(b.author||'')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q);$('#featured-count').textContent=`${chosen.length} de 10 obras selecionadas.`;$('#featured-selected').innerHTML=chosen.map((b,i)=>row(b,true,i,chosen.length)).join('')||'<p class="hint">Nenhuma obra selecionada.</p>';$('#featured-available').innerHTML=books.filter(b=>!b.featured&&matches(b)).map(b=>row(b,false,0,0)).join('')||'<p class="hint">Nenhuma outra obra encontrada.</p>'}
 search.oninput=draw;
 manager.onclick=async e=>{
  const toggle=e.target.closest('[data-feature-toggle]'),move=e.target.closest('[data-feature-move]');if(!toggle&&!move)return;
  const button=toggle||move,bookId=Number(button.dataset.featureToggle||button.dataset.featureId);button.disabled=true;message.textContent='';
  try{
   if(toggle){const b=state.books.find(x=>x.id===bookId);if(!b)return;const enabled=!b.featured;const result=await api('/featured/'+b.id,'POST',{enabled});b.featured=enabled?1:0;b.featured_order=result.featured_order;toast(enabled?'Obra adicionada aos destaques.':'Destaque removido.');}
   else{const arr=selected(),index=arr.findIndex(x=>x.id===bookId),target=button.dataset.featureMove==='up'?index-1:index+1;
    if(index<0||target<0||target>=arr.length)return;
    [arr[index],arr[target]]=[arr[target],arr[index]];
    await api('/featured/order','PUT',{ids:arr.map(x=>x.id)});
    arr.forEach((b,i)=>b.featured_order=i+1);
   }
   draw();
  }catch(err){message.textContent=err.message;button.disabled=false}
 };
 draw();
}

function genres(){app.innerHTML=`<a class="back" href="#painel">← Painel da administradora</a><div class="intro"><h1>Gêneros das histórias</h1></div><form id="genre-form" class="form-panel"><label>Novo gênero<input name="name" required maxlength="60" placeholder="Ex.: Ficção científica"></label><button class="btn">Adicionar gênero</button><p id="form-error" class="error" role="alert"></p></form><div class="genre-list">${state.genres.map(g=>`<div class="genre-entry"><span>${esc(g.name)}</span><button class="btn secondary" data-edit="${g.id}">Editar</button><button class="btn secondary danger" data-delete="${g.id}">×</button></div>`).join('')}</div><p class="hint">Um gênero em uso só pode ser excluído depois de removido das histórias.</p>`;$('#genre-form').onsubmit=async e=>{e.preventDefault();try{await api('/genres','POST',{name:new FormData(e.currentTarget).get('name')});await render()}catch(e){formError(e)}};document.querySelectorAll('[data-edit]').forEach(el=>el.onclick=async()=>{const g=state.genres.find(g=>g.id===Number(el.dataset.edit)),name=prompt('Nome do gênero:',g.name);if(name===null)return;try{await api('/genres/'+g.id,'PUT',{name});await render()}catch(e){toast(e.message)}});document.querySelectorAll('[data-delete]').forEach(el=>el.onclick=async()=>{if(!confirm('Excluir este gênero?'))return;try{await api('/genres/'+el.dataset.delete,'DELETE',{});await render()}catch(e){toast(e.message)}})}

// ------------------------------------------------------------------
// Pagina de ajuda e backup
// ------------------------------------------------------------------
function help(){app.innerHTML=`<div class="guide"><span class="eyebrow">Um lugar para guardar suas histórias</span><h1>Seu conteúdo fica com você.</h1><article><h2>1. Crie a história</h2><p>No Painel da administradora, clique em Nova história. Preencha título, sinopse, autoria, status, tipo (Novel, Mangá, Manhwa, Webtoon ou Livros) e gêneros. A capa é opcional. Depois de salvar, escolha um capítulo, uma importação em lote ou adicionar depois.</p></article><article><h2>2. Adicione capítulos</h2><p>Cada capítulo pertence a uma história e tem um número único dentro dela. Você pode escrever texto, enviar páginas numeradas em PNG/JPG/WebP, anexar um PDF completo ou combinar formatos. Salve primeiro o capítulo; depois envie imagens numeradas ou um PDF inteiro. Use as setas para ajustar a ordem.</p></article><article><h2>3. Onde os dados ficam</h2><p>O arquivo <code>data/makorini.sqlite</code> guarda histórias, gêneros, capítulos, texto, favoritos e progresso. As imagens ficam em <code>data/uploads</code>. Fechar o navegador ou o servidor não apaga esses arquivos. Tema claro/escuro é a única preferência guardada no navegador.</p></article><article><h2>4. Faça uma cópia de segurança</h2><p>O botão cria uma cópia consistente do banco, das imagens e dos PDFs dentro de <code>data/backups</code>. Baixe o ZIP e guarde uma cópia em outro disco ou serviço de sua escolha.</p><button id="backup" class="btn">Criar backup agora</button><p id="backup-status" class="hint alert-area" role="status"></p><p>Para restaurar: feche o servidor, guarde a pasta data atual com outro nome, crie uma nova pasta data e copie para ela o conteúdo do backup escolhido (makorini.sqlite, uploads e .initialized). Depois inicie o sistema novamente. O backup também inclui sua conta: use a senha que existia na data da cópia.</p></article><article><h2>5. Rodando no seu computador</h2><p>Instale Node.js 24 ou superior, extraia o ZIP e abra <code>INICIAR-WINDOWS.bat</code>. Mantenha a janela aberta e acesse <code>http://localhost:3000</code>. No primeiro acesso, crie sua senha em Área da administradora usando o código exibido no terminal. Não abra index.html diretamente e não use Live Server nesta versão.</p><p>O painel é protegido pela sua senha. Os leitores veem somente obras e capítulos publicados. A instalação padrão roda apenas neste computador. Para publicar na internet, siga HOSPEDAGEM.md, que explica servidor, HTTPS e armazenamento persistente. A prévia online anterior é independente deste banco.</p></article></div>`;$('#backup').onclick=async()=>{const btn=$('#backup');btn.disabled=true;$('#backup-status').textContent='Criando cópia do banco e das imagens…';try{const r=await api('/backup','POST',{});$('#backup-status').innerHTML=`Backup criado. <a class="btn secondary" href="${esc(r.download)}" download>Baixar cópia de segurança ↓</a><br><span>Também salvo em: ${esc(r.folder)}</span>`}catch(e){$('#backup-status').textContent=e.message}finally{btn.disabled=false}}}

// ------------------------------------------------------------------
// Autenticacao da autora
// ------------------------------------------------------------------
// Páginas institucionais públicas; ferramentas de backup ficam na administração.
function publicPage(screen){const title={sobre:'Sobre nós',privacidade:'Política de Privacidade',termos:'Termos de Uso',contato:'Contato'}[screen];const mail='<a href="mailto:Makorini.dev@gmail.com?subject=Contato%20Makorini%20Stories">Makorini.dev@gmail.com</a>';const body=screen==='sobre'?`A Makorini Stories reúne obras para leitura e descoberta. Sugestões, melhorias e pedidos de inclusão de obras podem ser enviados para ${mail}. Publicações dependem das autorizações necessárias.`:screen==='contato'?`Para sugestões, melhorias ou indicação de obras: ${mail}. O link abre seu aplicativo de e-mail.`:screen==='privacidade'?`Esta é uma versão local em preparação. Preferências de favoritos são armazenadas no navegador; avaliações usam um identificador em cookie. Antes de disponibilizar contas públicas, será publicada uma política completa indicando dados coletados, finalidade, retenção e contato para solicitações.`:`O catálogo disponibiliza obras para leitura. Não publique conteúdo sem autorização. Os termos completos para o serviço público serão definidos antes da abertura de cadastros.`;app.innerHTML=`<section class="institutional"><h1>${title}</h1><p>${body}</p></section>`}
function login(){if(state.admin){location.hash='#painel';return}app.innerHTML=`<div class="guide"><span class="eyebrow">Ateliê Makorini</span><h1>${state.configured?'Área da administradora':'Configure sua biblioteca'}</h1><p>${state.configured?'Entre para criar, editar e publicar suas histórias.':'No terminal do servidor, copie o código de primeiro acesso. Crie uma senha com pelo menos 12 caracteres.'}</p><form class="form-panel" id="login-form">${state.configured?'':'<label>Código de primeiro acesso<input name="code" required autocomplete="off"></label>'}<label>Senha<input name="password" type="password" required minlength="${state.configured?1:12}" maxlength="200" autocomplete="${state.configured?'current-password':'new-password'}"></label>${state.configured?'':'<label>Repita a senha<input name="confirm" type="password" required minlength="12" autocomplete="new-password"></label>'}<button class="btn">${state.configured?'Entrar':'Criar acesso de autora'}</button><p id="form-error" class="error" role="alert"></p></form><p class="hint">O catálogo publicado pode ser lido sem conta.</p></div>`;$('#login-form').onsubmit=async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button');btn.disabled=true;try{const f=new FormData(e.currentTarget);if(!state.configured&&f.get('password')!==f.get('confirm'))throw Error('As senhas não coincidem.');await api(state.configured?'/login':'/setup','POST',{password:f.get('password'),code:f.get('code')});if(location.hash==='#painel')await render();else location.hash='#painel'}catch(e){formError(e)}finally{btn.disabled=false}}}

// ------------------------------------------------------------------
// Aviso sobre mudancas nao salvas
// ------------------------------------------------------------------
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(dirty&&a&&a.hash!==location.hash&&!confirm('Há alterações não salvas. Sair sem salvar?'))e.preventDefault();else if(a)dirty=false});

// ------------------------------------------------------------------
// Rotas e atualizacao das paginas
// ------------------------------------------------------------------
async function render(){const v=++routeVersion;dirty=false;document.title='Makorini Stories | Explore histórias';const [screen,key,bookId]=(location.hash.slice(1)||'inicio').split('/');document.body.classList.toggle('home',screen==='inicio');app.innerHTML='<p class="hint">Abrindo sua biblioteca…</p>';try{await refresh();if(v!==routeVersion)return;const b=state.books.find(x=>x.id===Number(key));if(!state.admin&&['painel','editar','capitulo','generos','destaques','importar','ajuda'].includes(screen)){login();return}if(screen==='entrar')login();else if(['sobre','privacidade','termos','contato'].includes(screen))publicPage(screen);else if(screen==='sair'){await api('/logout','POST',{});location.hash='#inicio';return}else if(screen==='inicio'||screen==='favoritos')catalog(screen==='favoritos',key||'');else if(screen==='painel')panel();else if(screen==='generos')genres();else if(screen==='destaques')manageFeatured();else if(screen==='importar'&&b)importChaptersScreen(b);else if(screen==='categorias')categories();else if(screen==='ajuda')help();else if(screen==='obra'&&bookId){const {book,chapter}=readerChapterFromPrettyRoute(key,bookId);const c=await api('/chapters/'+chapter.id);if(v!==routeVersion)return;if(Number(c.book_id)!==Number(book.id))throw Error('Capítulo não pertence à obra.');await reader(c,book)}else if(screen==='obra'&&b)detail(b);else if(screen==='editar'&&(key==='nova'||b))editBook(b);else if(screen==='capitulo'&&key==='novo'){const owner=state.books.find(x=>x.id===Number(bookId));if(!owner)throw Error('História não encontrada.');await editChapter(null,owner)}else if(['capitulo','ler'].includes(screen)){const chapterId=screen==='ler'?readerIdFromRoute(key,bookId):Number(key);if(!Number.isSafeInteger(chapterId)||chapterId<=0)throw Error('Capítulo não encontrado.');const c=await api('/chapters/'+chapterId);if(v!==routeVersion)return;const owner=state.books.find(x=>x.id===c.book_id);if(screen==='ler'){if(!owner)throw Error('Obra não encontrada.');history.replaceState(null,'',readerHref(c,owner));await reader(c,owner)}else await editChapter(c,owner)}else throw Error('Página não encontrada.');window.scrollTo(0,0)}catch(e){if(v===routeVersion)app.innerHTML=`<div class="error-box"><h1>Não foi possível abrir esta tela</h1><p>${esc(e.message)}</p><a class="btn" href="#inicio">Voltar ao catálogo</a></div>`}}
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
