// Núcleo: estado, utilitários, API, capas e avaliações.
// Scripts clássicos carregados em ordem (core → catalog → admin → reader → main) e compartilham o escopo global.

// ------------------------------------------------------------------
// Estado global e utilitarios
// ------------------------------------------------------------------
const app=document.querySelector('#app');let state={books:[],genres:[],token:'',admin:false,configured:false},routeVersion=0,dirty=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imageURL=n=>'uploads/'+encodeURIComponent(n);
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
/* MODO ESTÁTICO (Makorini Books no GitHub Pages): lê JSON exportado em vez do servidor. */
const STATIC_READONLY='Esta é uma demonstração somente leitura do Makorini Books.';
const foldTxt=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
async function staticJSON(p){const r=await fetch(p);if(!r.ok)throw Error('Conteúdo não encontrado.');return r.json()}
async function api(url,method='GET',body){
 const [p,qs]=url.split('?');let m;
 if(method!=='GET'){if(/\/progress$/.test(p))return {ok:true};throw Error(STATIC_READONLY)}
 if(p==='/bootstrap')return staticJSON('data/bootstrap.json');
 if((m=p.match(/^\/books\/(\d+)$/)))return staticJSON('data/books/'+m[1]+'.json');
 if((m=p.match(/^\/chapters\/(\d+)$/)))return staticJSON('data/chapters/'+m[1]+'.json');
 if((m=p.match(/^\/books\/(\d+)\/search$/))){
  const q=foldTxt(new URLSearchParams(qs).get('q')||'').trim();if(q.length<2||q.length>100)throw Error('Digite de 2 a 100 caracteres para buscar.');
  const b=await staticJSON('data/books/'+m[1]+'.json');const results=[];
  for(const ch of b.chapters){const c=await staticJSON('data/chapters/'+ch.id+'.json');if(!c.content)continue;
   const text=foldTxt(c.content);let at=text.indexOf(q),hits=0;
   while(at>=0&&results.length<100&&hits<20){const s=at,e=at+q.length;results.push({chapter_id:c.id,number:c.number,title:c.title,offset:s,length:e-s,before:c.content.slice(Math.max(0,s-60),s),match:c.content.slice(s,e),after:c.content.slice(e,e+60)});hits++;at=text.indexOf(q,e)}
   if(results.length>=100)break}
  return {results,limited:results.length>=100};
 }
 throw Error(STATIC_READONLY);
}
async function apiServidorOriginal(url,method='GET',body){let r;try{r=await fetch('/api'+url,{method,headers:{'Content-Type':'application/json','X-Makorini-Token':state.token},body:body===undefined?undefined:JSON.stringify(body)})}catch{throw Error('O servidor está fechado ou indisponível. Abra INICIAR-WINDOWS.bat e tente novamente.')}let data;try{data=await r.json()}catch{throw Error(r.ok?'Resposta inválida do servidor.':`Erro ${r.status} no servidor. Tente novamente.`)}if(!r.ok)throw Error(data.error||'Não foi possível concluir.');return data}
async function refresh(){state=await api('/bootstrap');$('#navigation').innerHTML='<a href="#inicio">Explorar</a><a href="#categorias">Gêneros</a><a href="#favoritos">Minha estante</a>';{const l=$('#account-label');if(l)l.textContent=state.me?(String(state.me.name||'Minha conta').split(' ')[0].slice(0,14)):'Entrar'}$('#admin-links').innerHTML=state.me?`<span class="menu-user">${esc(state.me.name)}</span><a href="#painel">${state.admin?'Painel da administração':'Meu painel'}</a>${state.admin?'<a href="#usuarios">Usuários</a>':''}<a href="#conta">Minha conta</a><a href="#sair">Sair</a>`:'<a href="#entrar">Entrar</a><a href="#cadastro">Criar conta</a>'}

// ------------------------------------------------------------------
// Capas e informacoes das obras
// ------------------------------------------------------------------
function coverFit(b){return b?.cover_fit==='contain'?'contain':'cover'}
function coverPosX(b){const n=Number(b?.cover_focus_x);return Number.isFinite(n)?Math.max(0,Math.min(100,n)):50}
function coverPosY(b){const n=Number(b?.cover_focus_y);return Number.isFinite(n)?Math.max(0,Math.min(100,n)):50}
function coverInlineStyle(b,fitOverride=''){const fit=fitOverride||coverFit(b);return `style="object-fit:${fit};object-position:${coverPosX(b)}% ${coverPosY(b)}%;"`}
function coverPlaceholder(b){return `<div class="cover-empty"><span>✦</span><strong>${esc(b.title)}</strong><small>MAKORINI STORIES</small></div>`}
function coverBase(b){return b.cover?`<img src="${imageURL(b.cover)}" alt="Capa de ${esc(b.title)}" loading="lazy" ${coverInlineStyle(b)}>`:coverPlaceholder(b)}
function catalogCoverBase(b){
 if(!b.cover)return coverPlaceholder(b);
 const src=imageURL(b.cover);
 if(coverFit(b)==='contain')return `<img class="catalog-cover-backdrop" src="${src}" alt="" aria-hidden="true" loading="lazy"><img class="catalog-cover-art" src="${src}" alt="Capa de ${esc(b.title)}" loading="lazy" ${coverInlineStyle(b,'contain')}>`;
 return `<img class="catalog-cover-art catalog-cover-fill" src="${src}" alt="Capa de ${esc(b.title)}" loading="lazy" ${coverInlineStyle(b,'cover')}>`;
}
// ------------------------------------------------------------------
// Conteúdo +18 (como nas scans): selo, capa borrada e confirmação de idade.
// A confirmação fica salva neste navegador; quem edita a obra não precisa confirmar.
// ------------------------------------------------------------------
function adultOk(){try{return localStorage.getItem('makorini-adult-ok')==='1'}catch{return false}}
function setAdultOk(){try{localStorage.setItem('makorini-adult-ok','1')}catch{}document.body.classList.add('adult-ok')}
const needsAdultGate=b=>!!b?.adult&&!adultOk()&&!b.can_edit;
// Marca as imagens da capa (o CSS borra enquanto a idade não for confirmada) e põe o selo +18.
function adultCover(b,html){return b.adult?html.replace(/<img /g,'<img data-adult="1" ')+'<span class="adult-badge" title="Conteúdo adulto (+18)">+18</span>':html}
function cover(b){return adultCover(b,coverBase(b))}
function catalogCover(b){return adultCover(b,catalogCoverBase(b))}
// Tela de aviso antes de abrir obra ou capítulo +18.
function adultGate(b){
 app.innerHTML=`<section class="adult-gate" role="alertdialog" aria-labelledby="adult-title" aria-describedby="adult-text"><div class="adult-gate-icon" aria-hidden="true">+18</div><h1 id="adult-title">Conteúdo para maiores de 18 anos</h1><p id="adult-text"><b>${esc(b.title)}</b> contém conteúdo adulto (cenas de sexo, violência explícita ou outros temas sensíveis). Só continue se você tiver 18 anos ou mais.</p><div class="actions"><button class="btn" type="button" id="adult-yes">Tenho 18 anos ou mais</button><a class="btn secondary" href="#inicio">Voltar ao catálogo</a></div><p class="hint">Sua resposta fica salva neste navegador. As capas de obras +18 aparecem borradas até a confirmação.</p></section>`;
 $('#adult-yes').onclick=()=>{setAdultOk();render()};
 $('#adult-yes').focus();
}
try{if(adultOk())document.body.classList.add('adult-ok')}catch{}
// Data em que a obra entrou no site (created_at), no formato brasileiro.
const addedDate=b=>{const d=new Date(b?.created_at||'');return Number.isFinite(d.getTime())?d.toLocaleDateString('pt-BR'):''};
const genreNames=b=>b.genres.map(g=>g.name).join(' · ')||'Sem gênero';
// A média é uma avaliação dos leitores, separada de favoritos e destaques.

// ------------------------------------------------------------------
// Avaliacoes dos leitores
// ------------------------------------------------------------------
function ratingSummary(b){const r=b.rating||{average:null,count:0};const label=r.count?`${Number(r.average).toLocaleString('pt-BR',{minimumFractionDigits:1})} / 5 · ${r.count} ${r.count===1?'avaliação':'avaliações'}`:'Sem avaliações';return `<div class="rating-summary" aria-label="${esc(label)}"><span class="rating-display" aria-hidden="true"><span>★★★★★</span><span class="rating-fill" style="width:${r.count?Number(r.average)/5*100:0}%">★★★★★</span></span><span>${esc(label)}</span></div>`}
function ratingPanel(b){if(b.visibility!=='published')return '<p class="hint">As avaliações ficam disponíveis quando a obra é publicada.</p>';return `<section class="rating-panel"><div><h2>O que você achou desta obra?</h2><p class="hint">Escolha de 1 a 5 estrelas. Você pode alterar sua nota depois.</p></div><div class="rating-buttons" role="group" aria-label="Sua avaliação">${[1,2,3,4,5].map(n=>`<button type="button" data-score="${n}" class="rating-star ${n<=b.my_rating?'selected':''}" aria-label="Avaliar com ${n} ${n===1?'estrela':'estrelas'}" aria-pressed="${n===b.my_rating}">★</button>`).join('')}</div><p class="hint">${b.my_rating?`Sua nota neste navegador: ${b.my_rating} de 5.`:'Você ainda não avaliou neste navegador.'} O voto é identificado por um cookie deste navegador.</p>${b.my_rating?'<button class="btn secondary" id="remove-rating">Remover minha avaliação</button>':''}<p id="rating-error" class="error" role="alert"></p></section>`}
function bindRatings(b){const buttons=[...document.querySelectorAll('[data-score]')];async function vote(method,score){buttons.forEach(x=>x.disabled=true);try{await api('/books/'+b.id+'/rating',method,score?{score}:{});const updated=await api('/books/'+b.id);detail(updated);toast(method==='DELETE'?'Avaliação removida.':'Avaliação salva.')}catch(e){const el=$('#rating-error');if(el)el.textContent=e.message;buttons.forEach(x=>x.disabled=false)}}buttons.forEach(btn=>btn.onclick=()=>vote('POST',Number(btn.dataset.score)));$('#remove-rating')?.addEventListener('click',()=>vote('DELETE'))}


// ------------------------------------------------------------------
// Botão de olho nos campos de senha (mostrar/ocultar)
// Aplicado automaticamente a qualquer <input type="password"> que apareça na página.
// ------------------------------------------------------------------
const EYE_OPEN='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_CLOSED='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a10.4 10.4 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
function addPasswordEyes(root){
 root.querySelectorAll('input[type=password]:not([data-eye])').forEach(input=>{
  input.dataset.eye='1';
  const wrap=document.createElement('span');wrap.className='password-field';
  input.parentNode.insertBefore(wrap,input);wrap.appendChild(input);
  const button=document.createElement('button');
  button.type='button';button.className='password-eye';button.innerHTML=EYE_OPEN;
  button.setAttribute('aria-label','Mostrar senha');button.title='Mostrar senha';button.setAttribute('aria-pressed','false');
  button.onclick=()=>{
   const show=input.type==='password';input.type=show?'text':'password';
   button.innerHTML=show?EYE_CLOSED:EYE_OPEN;
   const label=show?'Ocultar senha':'Mostrar senha';button.setAttribute('aria-label',label);button.title=label;button.setAttribute('aria-pressed',String(show));
   input.focus();
  };
  wrap.appendChild(button);
 });
}
new MutationObserver(()=>addPasswordEyes(app)).observe(app,{childList:true,subtree:true});

// ------------------------------------------------------------------
// Turminha Makorini: mascotes originais em SVG (Moti, Kuro e Hoshi)
// Usados em telas vazias, erros, login e "Continuar lendo".
// ------------------------------------------------------------------
const MASCOTS={
 moti:'<svg viewBox="0 0 120 130" aria-hidden="true"><ellipse cx="44" cy="40" rx="11" ry="32" fill="#FFF6EC" stroke="#E7C9B7" stroke-width="3" transform="rotate(-8 44 40)"/><ellipse cx="44" cy="44" rx="5" ry="22" fill="#FBD0DC" transform="rotate(-8 44 44)"/><path d="M76 40c10-22 28-26 30-18s-12 22-26 28" fill="#FFF6EC" stroke="#E7C9B7" stroke-width="3"/><circle cx="60" cy="92" r="38" fill="#FFF6EC" stroke="#E7C9B7" stroke-width="3"/><circle cx="48" cy="88" r="3.4" fill="#4A3646"/><circle cx="72" cy="88" r="3.4" fill="#4A3646"/><path d="M55 97q2.5 3 5 0q2.5 3 5 0" fill="none" stroke="#4A3646" stroke-width="2.2" stroke-linecap="round"/><ellipse cx="40" cy="98" rx="6" ry="3.6" fill="#F7A3B8"/><ellipse cx="80" cy="98" rx="6" ry="3.6" fill="#F7A3B8"/><g transform="translate(92 26)"><circle cx="0" cy="-6" r="4.5" fill="#FFC7D6"/><circle cx="6" cy="-1" r="4.5" fill="#FFC7D6"/><circle cx="3.5" cy="6" r="4.5" fill="#FFC7D6"/><circle cx="-3.5" cy="6" r="4.5" fill="#FFC7D6"/><circle cx="-6" cy="-1" r="4.5" fill="#FFC7D6"/><circle cx="0" cy="0" r="3" fill="#FFD66B"/></g></svg>',
 kuro:'<svg viewBox="0 0 70 70" aria-hidden="true"><path d="M14 22L10 6l14 10M50 22l4-16-14 10" fill="#3B3346" stroke="#3B3346" stroke-width="2" stroke-linejoin="round"/><path d="M16 14l-2-5 5 4z" fill="#F7A3B8"/><path d="M48 14l2-5-5 4z" fill="#F7A3B8"/><circle cx="32" cy="36" r="22" fill="#3B3346"/><ellipse cx="24" cy="34" rx="4" ry="5" fill="#FFE07A"/><ellipse cx="40" cy="34" rx="4" ry="5" fill="#FFE07A"/><circle cx="24" cy="35" r="2" fill="#3B3346"/><circle cx="40" cy="35" r="2" fill="#3B3346"/><path d="M29 43q1.5 2 3 0q1.5 2 3 0" fill="none" stroke="#F7A3B8" stroke-width="1.8" stroke-linecap="round"/><path d="M54 52q8-4 6-14" fill="none" stroke="#3B3346" stroke-width="4" stroke-linecap="round"/><path d="M60 33l1.4 2.8 3.1.4-2.2 2.2.5 3.1-2.8-1.5-2.8 1.5.5-3.1-2.2-2.2 3.1-.4z" fill="#FFD66B"/></svg>',
 hoshi:'<svg viewBox="0 0 44 48" aria-hidden="true"><path d="M22 3l5.6 11.4 12.6 1.8-9.1 8.9 2.2 12.5L22 31.7 10.7 37.6l2.2-12.5-9.1-8.9 12.6-1.8z" fill="#FFD66B" stroke="#E8A93A" stroke-width="2" stroke-linejoin="round"/><circle cx="17.5" cy="21" r="1.8" fill="#4A3646"/><circle cx="26.5" cy="21" r="1.8" fill="#4A3646"/><path d="M19.5 25.2q1.25 1.5 2.5 0q1.25 1.5 2.5 0" fill="none" stroke="#4A3646" stroke-width="1.4" stroke-linecap="round"/><ellipse cx="14.5" cy="24.5" rx="2.4" ry="1.4" fill="#F7A3B8"/><ellipse cx="29.5" cy="24.5" rx="2.4" ry="1.4" fill="#F7A3B8"/></svg>'
};
function mascot(name,cls='mascot'){return `<span class="${cls}">${MASCOTS[name]||''}</span>`}
// Flor da barra de progresso (tema claro)
const FLOWER_SVG='<svg class="flower" viewBox="0 0 26 26" aria-hidden="true"><g fill="#FFFFFF" stroke="#D9557F" stroke-width="1.5"><circle cx="13" cy="6" r="5"/><circle cx="20" cy="11" r="5"/><circle cx="17" cy="19" r="5"/><circle cx="9" cy="19" r="5"/><circle cx="6" cy="11" r="5"/></g><circle cx="13" cy="13" r="4" fill="#FFD66B"/></svg>';

// ===== Agregador: obras lidas em outros sites (links) e idioma =====
const LANGUAGES={'pt-BR':['PT-BR','Português (BR)'],'pt-PT':['PT-PT','Português (PT)'],en:['EN','Inglês'],es:['ES','Espanhol'],ja:['JA','Japonês'],ko:['KO','Coreano'],zh:['ZH','Chinês'],fr:['FR','Francês'],it:['IT','Italiano'],de:['DE','Alemão'],outro:['+','Outro idioma']};
function langInfo(b){return LANGUAGES[b?.language]||LANGUAGES['pt-BR']}
function isExternal(b){return (b?.external_links||[]).length>0}
// Só http/https (o servidor também valida); abre em nova aba sem passar dados do nosso site.
function safeExternalURL(u){try{const x=new URL(u);return ['http:','https:'].includes(x.protocol)?x.href:''}catch{return ''}}
function externalButtons(b){return (b.external_links||[]).map(l=>{const u=safeExternalURL(l.url);return u?`<a class="btn external-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer nofollow">Ler em ${esc(l.name)} ↗</a>`:''}).join('')}

// ===== Sequência de leitura (só neste navegador) =====
function dayKey(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function readingDays(){try{const a=JSON.parse(localStorage.getItem('makorini-days')||'[]');return new Set(Array.isArray(a)?a:[])}catch{return new Set()}}
function markReadingDay(){const s=readingDays(),k=dayKey();if(s.has(k))return;s.add(k);try{localStorage.setItem('makorini-days',JSON.stringify([...s].sort().slice(-400)))}catch{}}
function streakInfo(days){const d=new Date();const today=days.has(dayKey(d));if(!today)d.setDate(d.getDate()-1);let n=0;while(days.has(dayKey(d))){n++;d.setDate(d.getDate()-1)}return {streak:n,today}}
// Semana atual, de segunda a domingo
function weekDays(){const now=new Date(),mon=new Date(now);mon.setDate(now.getDate()-((now.getDay()+6)%7));return Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return {key:dayKey(d),isToday:dayKey(d)===dayKey(now)}})}

// ===== Sino: capítulos novos das obras favoritas desde a última visita =====
function seenMap(){try{return JSON.parse(localStorage.getItem('makorini-seen')||'{}')||{}}catch{return {}}}
function latestPublished(b){return b.chapters.filter(c=>c.visibility==='published'&&c.import_status!=='pending').at(-1)}
function markBookSeen(b){const last=latestPublished(b);if(!last)return;const m=seenMap();m[b.id]=last.id;try{localStorage.setItem('makorini-seen',JSON.stringify(m))}catch{}}
// Ler um capítulo marca como visto até ele.
function markChapterSeen(b,ch){const m=seenMap(),cur=b.chapters.find(x=>x.id===m[b.id]);if(cur&&Number(cur.number)>=Number(ch.number))return;m[b.id]=ch.id;try{localStorage.setItem('makorini-seen',JSON.stringify(m))}catch{}}
function updateNotifications(){const m=seenMap();let changed=false;const items=[];
 for(const b of state.books){if(typeof isFav!=='function'||!isFav(b.id))continue;const last=latestPublished(b);if(!last)continue;
  // Favorito novo começa "em dia" para não encher o sino de capítulos antigos.
  if(m[b.id]==null){m[b.id]=last.id;changed=true;continue}
  const seenCh=b.chapters.find(c=>c.id===m[b.id]),seenNum=seenCh?Number(seenCh.number):-Infinity;
  const fresh=b.chapters.filter(c=>c.visibility==='published'&&c.import_status!=='pending'&&Number(c.number)>seenNum);
  if(fresh.length)items.push({b,first:fresh[0],count:fresh.length})}
 if(changed)try{localStorage.setItem('makorini-seen',JSON.stringify(m))}catch{}
 const count=$('#notif-count'),list=$('#notif-list');if(!count||!list)return;
 count.hidden=!items.length;count.textContent=items.length>9?'9+':String(items.length);
 list.innerHTML=items.length?'<strong>Novidades dos seus favoritos</strong>'+items.map(({b,first,count})=>`<a href="${readerHref(first,b)}" data-seen="${b.id}"><b>${esc(b.title)}</b><small>${count===1?'Capítulo '+first.number+' novo':count+' capítulos novos, a partir do '+first.number}</small></a>`).join('')+'<button type="button" class="link" id="notif-clear">Marcar tudo como visto</button>':'<p class="hint">Nenhum capítulo novo nos seus favoritos. Toque no ♡ de uma obra para acompanhar.</p>'}
document.addEventListener('click',e=>{const a=e.target.closest?.('[data-seen]');if(a){const b=state.books.find(x=>x.id===Number(a.dataset.seen));if(b)markBookSeen(b);$('#notif').open=false;updateNotifications()}else if(e.target.closest?.('#notif-clear')){state.books.forEach(b=>{if(isFav(b.id))markBookSeen(b)});updateNotifications()}else if(!e.target.closest?.('#notif')&&$('#notif'))$('#notif').open=false});
// Busca do topo: leva ao catálogo com o termo
const onHome=()=>['','#inicio'].includes(location.hash)&&$('#search');
$('#header-search')?.addEventListener('submit',e=>{e.preventDefault();const q=$('#header-q').value.trim();if(onHome()){$('#search').value=q;$('#search').oninput?.();$('.catalog-main')?.scrollIntoView({block:'start',behavior:'smooth'})}else{pendingSearch=q;location.hash='#inicio'}});
// Na página inicial, o catálogo filtra enquanto você digita no topo.
$('#header-q')?.addEventListener('input',()=>{if(onHome()){$('#search').value=$('#header-q').value.trim();$('#search').oninput?.()}});
// Menus do topo (conta e sino) fecham ao clicar fora deles ou apertar Esc.
document.addEventListener('click',e=>{for(const d of document.querySelectorAll('header details[open]'))if(!d.contains(e.target))d.open=false});
document.addEventListener('keydown',e=>{if(e.key==='Escape')for(const d of document.querySelectorAll('header details[open]')){d.open=false;d.querySelector('summary')?.focus()}});
// Abrir um menu fecha o outro.
document.querySelectorAll('header details').forEach(d=>d.addEventListener('toggle',()=>{if(d.open)document.querySelectorAll('header details[open]').forEach(o=>{if(o!==d)o.open=false})}));
