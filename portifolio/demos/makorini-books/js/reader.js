// Leitor de capítulos estilo e-reader.
// Scripts clássicos carregados em ordem (core → catalog → admin → reader → main) e compartilham o escopo global.
//
// Três modos, escolhidos pelo conteúdo do capítulo:
//  - texto: páginas (colunas CSS, vira com toque/setas) ou rolagem; tema, fonte, tamanho, espaçamento e margens;
//  - imagens: vertical (webtoon/manhwa) ou página a página (mangá), com sentido direita→esquerda;
//  - PDF: pdf.js página a página (com retorno ao visualizador do navegador se não carregar).
// Tudo que é do leitor (preferências, posição, marcadores, grifos) fica no navegador (localStorage).

// ------------------------------------------------------------------
// Armazenamento local
// ------------------------------------------------------------------
const READER_DEFAULTS={theme:'auto',font:'serif',size:19,line:1.7,margin:'medium',width:720,textMode:'paged'};
const FONTS={serif:"'Literata',Georgia,serif",sans:"'DM Sans',system-ui,sans-serif",classic:"Georgia,'Times New Roman',serif",legible:"Verdana,Tahoma,sans-serif"};
const MARGINS={narrow:16,medium:44,wide:88};
const WORDS_PER_MINUTE=230;
function storeGet(key,fallback){try{const v=JSON.parse(localStorage.getItem(key)||'null');return v&&typeof v==='object'?v:fallback}catch{return fallback}}
function storeSet(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function readerPrefs(){return {...READER_DEFAULTS,...storeGet('makorini-reader',{})}}
function saveReaderPrefs(patch){storeSet('makorini-reader',{...storeGet('makorini-reader',{}),...patch})}
function localProgress(){return storeGet('makorini-progress',{})}
function saveLocalProgress(bookId,chapterId){storeSet('makorini-progress',{...localProgress(),[bookId]:chapterId});storeSet('makorini-last',{bookId,chapterId,at:Date.now()});markReadingDay();try{const b=state.books.find(x=>x.id===Number(bookId)),c=b?.chapters.find(x=>x.id===Number(chapterId));if(b&&c)markChapterSeen(b,c)}catch{}}
function chapterPosition(chapterId){return Number(storeGet('makorini-pos',{})[chapterId])||0}
function saveChapterPosition(chapterId,frac){storeSet('makorini-pos',{...storeGet('makorini-pos',{}),[chapterId]:Math.round(Math.max(0,Math.min(1,frac))*10000)/10000})}
function readChapters(){return storeGet('makorini-read',{})}
function markChapterRead(chapterId){const r=readChapters();if(!r[chapterId]){r[chapterId]=Date.now();storeSet('makorini-read',r)}}
// Modo de imagens por obra: mangá abre página a página (direita→esquerda); manhwa/webtoon na vertical.
function imagePrefs(b){const saved=storeGet('makorini-book-prefs',{})[b.id]||{};const manga=b.format==='Mangá';return {imageMode:saved.imageMode||(manga?'paged':'vertical'),direction:saved.direction||(manga?'rtl':'ltr'),fit:saved.fit||'screen'}}
function saveImagePrefs(b,patch){const all=storeGet('makorini-book-prefs',{});all[b.id]={...imagePrefs(b),...patch};storeSet('makorini-book-prefs',all)}
// Marcadores e grifos: {bookId:[{id,type,chapterId,number,frac,offset,quote,note,created}]}
function bookNotes(bookId){return storeGet('makorini-notes',{})[bookId]||[]}
function saveBookNotes(bookId,list){const all=storeGet('makorini-notes',{});all[bookId]=list;storeSet('makorini-notes',all)}
// Salto pendente ao abrir um capítulo (busca, nota, voltar ao final do anterior).
function setReaderJump(jump){try{sessionStorage.setItem('makorini-jump',JSON.stringify(jump))}catch{}}
function takeReaderJump(chapterId){try{const j=JSON.parse(sessionStorage.getItem('makorini-jump')||'null');sessionStorage.removeItem('makorini-jump');return j&&Number(j.chapterId)===Number(chapterId)?j:null}catch{return null}}
// Progresso do servidor (administradora) ou deste navegador (leitores), apenas se o capítulo ainda estiver visível.
function continueChapterId(b){const idValue=b.progress?.chapter_id??localProgress()[b.id];return b.chapters.some(c=>Number(c.id)===Number(idValue))?idValue:null}

// ------------------------------------------------------------------
// Texto com grifos e resultado de busca destacados
// ------------------------------------------------------------------
function locateQuote(content,quote,hint){
 if(!quote)return -1;
 if(content.substr(hint,quote.length)===quote)return hint;
 const after=content.indexOf(quote,Math.max(0,hint-200));return after>=0?after:content.indexOf(quote);
}
function textWithMarks(content,notes,hit){
 const ranges=[];
 for(const n of notes){if(n.type!=='highlight')continue;const at=locateQuote(content,n.quote,n.offset);if(at>=0)ranges.push({start:at,end:at+n.quote.length,html:s=>`<mark class="kr-hl" data-note="${esc(n.id)}" title="${esc(n.note||'Grifo')}">${s}</mark>`})}
 if(hit&&hit.length>0)ranges.push({start:hit.offset,end:hit.offset+hit.length,html:s=>`<mark class="kr-hit" id="kr-hit">${s}</mark>`});
 ranges.sort((a,b)=>a.start-b.start);
 let html='',pos=0;
 for(const r of ranges){if(r.start<pos)continue;html+=esc(content.slice(pos,r.start))+r.html(esc(content.slice(r.start,r.end)));pos=r.end}
 return html+esc(content.slice(pos));
}

// ------------------------------------------------------------------
// pdf.js (carregado sob demanda do CDN; sem internet volta ao visualizador do navegador)
// ------------------------------------------------------------------
const PDFJS_VERSION='4.0.379';
let pdfjsPromise=null;
function loadPdfJs(){
 pdfjsPromise??=import(`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.mjs`).then(lib=>{lib.GlobalWorkerOptions.workerSrc=`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;return lib}).catch(e=>{pdfjsPromise=null;throw e});
 return pdfjsPromise;
}

// ------------------------------------------------------------------
// Leitor
// ------------------------------------------------------------------
let readerCleanup=null;
async function reader(c,b){
 readerCleanup?.();
 const cleanup=new AbortController();readerCleanup=()=>{cleanup.abort();readerCleanup=null;document.body.classList.remove('reading','reading-focus')};
 const signal=cleanup.signal;
 document.title=`Capítulo ${c.number} — ${b.title} | Makorini Books`;
 document.body.classList.add('reading');
 const index=b.chapters.findIndex(x=>x.id===c.id),prev=b.chapters[index-1],next=b.chapters[index+1];
 const kind=c.pages.length?'images':c.pdf_filename?'pdf':'text';
 const prefs=readerPrefs(),img=imagePrefs(b);
 // Um grifo guarda o trecho; se o texto mudou, procura o trecho perto da posição antiga.
 const resolveJump=j=>{if(j?.quote&&c.content){const at=locateQuote(c.content,j.quote,j.offset);if(at>=0)j.offset=at}return j};
 let jump=resolveJump(takeReaderJump(c.id));
 // Só retoma a posição salva do capítulo que a pessoa estava lendo (como no Kindle).
 // Abrir outro capítulo (próximo, anterior, sumário) começa do início, e um capítulo já
 // terminado volta para o começo — evita "pular para o fim" por posições antigas.
 const resumable=Number(localProgress()[b.id])===Number(c.id)||Number(b.progress?.chapter_id)===Number(c.id);
 let frac=jump?.frac??(resumable?chapterPosition(c.id):0);
 if(!jump&&frac>=0.97)frac=0;
 const words=String(c.content||'').split(/\s+/).filter(Boolean).length;
 const subtitle=chapterExtraTitle(c);
 const tool=(id,label,icon,attrs='')=>`<button type="button" class="kr-tool" id="${id}" title="${label}" aria-label="${label}" ${attrs}>${icon}</button>`;
 app.innerHTML=`<section class="kreader" id="kreader" data-kind="${kind}">
  <div class="kr-top">
   <a class="kr-back" href="#obra/${b.id}" title="Voltar à obra">← <span>${esc(b.title)}</span></a>
   <div class="kr-title"><b>Capítulo ${c.number}</b>${subtitle?`<small>${esc(subtitle)}</small>`:''}</div>
   <div class="kr-tools" role="toolbar" aria-label="Ferramentas de leitura">
    ${tool('kr-toc','Sumário','☰','data-panel="toc"')}${tool('kr-search','Buscar no livro','⌕','data-panel="search"')}${tool('kr-notes','Marcadores e notas','❏','data-panel="notes"')}${tool('kr-bookmark','Marcar esta posição','🔖')}${tool('kr-settings','Aparência e modo de leitura','Aa','data-panel="settings"')}${tool('kr-offline','Baixar capítulo para ler sem internet','⤓')}${tool('kr-focus','Modo foco (tela cheia)','⛶')}
   </div>
  </div>
  <aside class="kr-panel" id="kr-panel" hidden></aside>
  <div class="kr-body" id="kr-body"></div>
  <div class="kr-foot">
   <div class="kr-progress" aria-hidden="true"><span id="kr-bar"></span></div>
   <div class="kr-foot-row">
    ${prev?`<a class="kr-chapter-link" href="${readerHref(prev,b)}">← Cap. ${prev.number}</a>`:'<span></span>'}
    <span id="kr-status" class="kr-status" role="status" aria-live="polite"></span>
    ${next?`<a class="kr-chapter-link" href="${readerHref(next,b)}">Cap. ${next.number} →</a>`:`<a class="kr-chapter-link" href="#obra/${b.id}">Fim ✓</a>`}
   </div>
  </div>
  ${b.can_edit?`<p class="reader-admin-link"><a class="back" href="#capitulo/${c.id}">Editar este capítulo</a></p>`:''}
 </section><div class="kr-selection" id="kr-selection" hidden><button type="button" id="kr-highlight">Grifar</button><button type="button" id="kr-highlight-note">Grifar com nota</button></div>`;
 const root=$('#kreader'),body=$('#kr-body'),panel=$('#kr-panel'),statusEl=$('#kr-status'),bar=$('#kr-bar');
 saveLocalProgress(b.id,c.id);

 // ---------- aparência ----------
 function applyAppearance(){
  const p=readerPrefs();
  root.classList.remove('kr-theme-light','kr-theme-sepia','kr-theme-dark');
  if(p.theme!=='auto')root.classList.add('kr-theme-'+p.theme);
  root.style.setProperty('--kr-font',FONTS[p.font]||FONTS.serif);
  root.style.setProperty('--kr-size',p.size+'px');
  root.style.setProperty('--kr-line-h',String(p.line));
  root.style.setProperty('--kr-margin',(MARGINS[p.margin]??44)+'px');
  root.style.setProperty('--kr-width',p.width+'px');
 }
 applyAppearance();

 // ---------- progresso ----------
 let pageLabel='';
 function updateStatus(){
  const bookFrac=b.chapters.length?(index+Math.min(1,frac))/b.chapters.length:0;
  bar.style.width=(bookFrac*100).toFixed(2)+'%';
  const parts=[pageLabel,`${Math.round(frac*100)}% do capítulo`,`${Math.round(bookFrac*100)}% da obra`];
  if(kind==='text'&&words){const min=Math.ceil(words*(1-frac)/WORDS_PER_MINUTE);parts.push(min<=1?'menos de 1 min restante':`${min} min restantes`)}
  statusEl.textContent=parts.filter(Boolean).join(' · ');
 }
 let saveTimer=0;
 function setFrac(value){
  frac=Math.max(0,Math.min(1,value));updateStatus();
  clearTimeout(saveTimer);saveTimer=setTimeout(()=>{saveChapterPosition(c.id,frac);if(frac>=0.97)markChapterRead(c.id)},250);
  if(frac>0.7&&next)prefetchNext();
 }
 let prefetched=false;
 async function prefetchNext(){
  if(prefetched)return;prefetched=true;
  try{const n=await api('/chapters/'+next.id);n.pages.slice(0,3).forEach(pg=>{const i=new Image();i.src=imageURL(pg.filename)})}catch{}
 }
 const goChapter=(target,toEnd)=>{if(!target)return;if(toEnd)setReaderJump({chapterId:target.id,frac:1});location.hash=readerHref(target,b)};

 // ---------- navegação comum (teclado e gestos) ----------
 let turn=()=>{};// turn(+1|-1), definido por cada modo
 document.addEventListener('keydown',e=>{
  if(!root.isConnected){readerCleanup?.();return}
  if(e.target?.closest?.('input,textarea,select,[contenteditable]')||e.altKey||e.ctrlKey||e.metaKey)return;
  const rtl=kind==='images'&&img.imageMode==='paged'&&img.direction==='rtl';
  const map={ArrowRight:rtl?-1:1,ArrowLeft:rtl?1:-1,PageDown:1,PageUp:-1,' ':e.shiftKey?-1:1};
  if(e.key==='Escape'){closePanel();document.body.classList.remove('reading-focus');return}
  if(!(e.key in map))return;
  if(!body.querySelector('.kr-paged'))return; // na rolagem, o navegador cuida das teclas
  e.preventDefault();turn(map[e.key]);
 },{signal});
 let touchStart=null;
 body.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')touchStart={x:e.clientX,y:e.clientY,t:Date.now()}},{signal});
 body.addEventListener('pointerup',e=>{
  if(!touchStart||!body.querySelector('.kr-paged'))return;
  const dx=e.clientX-touchStart.x,dy=e.clientY-touchStart.y;const quick=Date.now()-touchStart.t<600;touchStart=null;
  if(quick&&Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5&&!body.querySelector('.kr-zoomed')&&!getSelection()?.toString()){const rtl=kind==='images'&&img.direction==='rtl';swipedAt=Date.now();turn((dx<0)!==rtl?1:-1)}
 },{signal});
 // Após um gesto de arrastar, ignora o "clique" que o navegador dispara na zona de toque.
 let swipedAt=0;
 const zone=fn=>()=>{if(Date.now()-swipedAt>400)fn()};

 // Modos paginados ocupam exatamente a tela (do topo do elemento até o rodapé do leitor).
 function fitToScreen(el){
  const top=el.getBoundingClientRect().top+scrollY,foot=root.querySelector('.kr-foot').offsetHeight;
  el.style.height=Math.max(300,innerHeight-top-foot-6)+'px';
 }
 // ---------- modo texto ----------
 let textLayout=null;
 function renderText(){
  const p=readerPrefs(),paged=p.textMode==='paged';
  const hit=jump?.length?{offset:jump.offset,length:jump.length}:null;
  body.innerHTML=`<div class="kr-text ${paged?'kr-paged':'kr-scroll'}"><div class="kr-viewport" id="kr-viewport"><div class="kr-flow" id="kr-flow">${textWithMarks(c.content,bookNotes(b.id).filter(n=>Number(n.chapterId)===Number(c.id)),hit)}</div></div>${paged?'<button type="button" class="kr-zone kr-zone-prev" aria-label="Página anterior"></button><button type="button" class="kr-zone kr-zone-next" aria-label="Próxima página"></button>':''}</div>`;
  const viewport=$('#kr-viewport'),flow=$('#kr-flow');
  if(paged){
   let page=0,pages=1,step=1;
   const show=()=>{flow.style.transform=`translateX(${-page*step}px)`;pageLabel=`Página ${page+1} de ${pages}`;setFrac(pages>1?page/(pages-1):1)};
   textLayout=()=>{
    fitToScreen(viewport);
    // Uma coluna = uma página: largura exata da área de texto (sem as margens internas).
    const gap=MARGINS[readerPrefs().margin]*2||88;
    flow.style.width='auto';const w=Math.max(120,Math.floor(flow.getBoundingClientRect().width));
    flow.style.width=w+'px';flow.style.columnWidth=w+'px';flow.style.columnGap=gap+'px';step=w+gap;
    flow.style.transform='none';
    pages=Math.max(1,Math.round((flow.scrollWidth+gap)/step));
    const mark=jump?.offset!=null?flow.querySelector('#kr-hit')||locateOffset(flow,jump.offset):null;
    if(mark){page=Math.min(pages-1,Math.max(0,Math.floor((mark.getBoundingClientRect().left-flow.getBoundingClientRect().left+1)/step)));jump=null}
    else page=Math.min(pages-1,Math.round(frac*(pages-1)));
    show();
   };
   turn=d=>{const n=page+d;if(n<0)return goChapter(prev,true);if(n>=pages){markChapterRead(c.id);return goChapter(next,false)}page=n;show()};
   body.querySelector('.kr-zone-prev').onclick=zone(()=>turn(-1));
   body.querySelector('.kr-zone-next').onclick=zone(()=>turn(1));
   textLayout();
   if(document.fonts?.ready)document.fonts.ready.then(()=>{if(flow.isConnected)textLayout()});
  }else{
   pageLabel='';
   textLayout=()=>{
    const mark=jump?.offset!=null?flow.querySelector('#kr-hit')||locateOffset(flow,jump.offset):null;
    if(mark){mark.scrollIntoView({block:'center'});jump=null}
    else{const top=viewport.getBoundingClientRect().top+scrollY,span=Math.max(1,viewport.offsetHeight-innerHeight*0.6);scrollTo(0,top+frac*span-80)}
    onScroll();
   };
   const onScroll=()=>{if(!viewport.isConnected)return;const r=viewport.getBoundingClientRect(),span=Math.max(1,r.height-innerHeight*0.6);setFrac((-r.top+80)/span)};
   window.addEventListener('scroll',onScroll,{passive:true,signal});
   requestAnimationFrame(textLayout);
  }
  bindSelection(flow);
  flow.addEventListener('click',e=>{const m=e.target.closest('.kr-hl');if(m)showHighlight(m.dataset.note)});
 }
 // Encontra o nó de texto de um deslocamento (para saltar até um grifo sem marca de busca).
 function locateOffset(flow,offset){
  const walker=document.createTreeWalker(flow,NodeFilter.SHOW_TEXT);let pos=0,node;
  while((node=walker.nextNode())){if(pos+node.length>offset){const r=document.createRange();r.setStart(node,offset-pos);r.setEnd(node,Math.min(node.length,offset-pos+1));return {getBoundingClientRect:()=>r.getBoundingClientRect(),scrollIntoView:o=>{const span=document.createElement('span');r.insertNode(span);span.scrollIntoView(o);span.remove()}}}pos+=node.length}
  return null;
 }

 // ---------- grifos ----------
 function bindSelection(flow){
  const pop=$('#kr-selection');let pending=null;
  const check=()=>{
   const sel=getSelection();
   if(!sel||sel.isCollapsed||!sel.rangeCount){pop.hidden=true;pending=null;return}
   const range=sel.getRangeAt(0);if(!flow.contains(range.commonAncestorContainer)){pop.hidden=true;return}
   const quote=range.toString();if(quote.trim().length<2||quote.length>2000){pop.hidden=true;return}
   const pre=document.createRange();pre.setStart(flow,0);pre.setEnd(range.startContainer,range.startOffset);
   pending={quote,offset:pre.toString().length};
   const rect=range.getBoundingClientRect();pop.hidden=false;
   const above=rect.top-pop.offsetHeight-10;pop.style.top=(above>8?above:rect.bottom+10)+'px';pop.style.left=Math.max(8,Math.min(innerWidth-pop.offsetWidth-8,rect.left+rect.width/2-pop.offsetWidth/2))+'px';
  };
  document.addEventListener('selectionchange',()=>{clearTimeout(check.t);check.t=setTimeout(check,250)},{signal});
  const save=withNote=>{
   if(!pending)return;let note='';
   if(withNote){note=prompt('Escreva sua nota para este trecho:','');if(note===null)return}
   const list=bookNotes(b.id);list.push({id:crypto.randomUUID?.()||String(Date.now()),type:'highlight',chapterId:c.id,number:c.number,offset:pending.offset,quote:pending.quote,note:note.trim().slice(0,2000),frac,created:Date.now()});
   saveBookNotes(b.id,list);getSelection().removeAllRanges();pop.hidden=true;pending=null;
   renderText();toast('Trecho grifado.');
  };
  $('#kr-highlight').onclick=()=>save(false);$('#kr-highlight-note').onclick=()=>save(true);
 }
 function showHighlight(noteId){
  const n=bookNotes(b.id).find(x=>x.id===noteId);if(!n)return;
  openPanel('notes');panel.querySelector(`[data-note-row="${CSS.escape(noteId)}"]`)?.classList.add('kr-flash');
 }

 // ---------- modo imagens ----------
 function renderImages(){
  const ip=imagePrefs(b);Object.assign(img,ip);
  const intro=c.content?`<details class="kr-intro"><summary>Texto do capítulo</summary><div class="kr-flow-static">${esc(c.content)}</div></details>`:'';
  if(ip.imageMode==='vertical'){
   pageLabel='';
   body.innerHTML=`${intro}<div class="kr-strip kr-scroll ${ip.fit==='screen'?'kr-fit-screen':''}" id="kr-strip">${c.pages.map((pg,j)=>`<img src="${imageURL(pg.filename)}" alt="Página ${j+1}" loading="${j<3?'eager':'lazy'}" decoding="async">`).join('')}</div>`;
   const strip=$('#kr-strip'),imgs=[...strip.querySelectorAll('img')];
   // Posição = imagem no meio da tela (as alturas mudam enquanto as imagens carregam).
   let restored=frac<=0;
   const onScroll=()=>{if(!strip.isConnected||!restored)return;
    // No topo da página é sempre o começo do capítulo (as imagens ainda podem estar carregando).
    if(scrollY<12){pageLabel=`Página 1 de ${imgs.length}`;setFrac(0);return}
    const mid=innerHeight/2;const current=imgs.findIndex(i=>{const q=i.getBoundingClientRect();return q.top<=mid&&q.bottom>=mid});if(current<0)return;pageLabel=`Página ${current+1} de ${imgs.length}`;const lastImg=imgs.at(-1),last=lastImg.getBoundingClientRect();setFrac(lastImg.complete&&lastImg.naturalHeight&&last.bottom<=innerHeight+4?1:imgs.length>1?current/(imgs.length-1):1)};
   window.addEventListener('scroll',onScroll,{passive:true,signal});
   turn=()=>{};
   // Restaura a página salva: carrega a imagem-alvo e a mantém no topo (scroll anchoring segura a posição).
   const target=imgs[Math.round(frac*(imgs.length-1))];
   const restore=()=>{if(!target.isConnected)return;target.scrollIntoView({block:'start'});restored=true;onScroll()};
   if(!restored){target.loading='eager';target.complete?requestAnimationFrame(restore):target.addEventListener('load',restore,{once:true});target.addEventListener('error',restore,{once:true})}
   else requestAnimationFrame(onScroll);
   return;
  }
  // página a página
  const total=c.pages.length;let page=Math.min(total-1,Math.round(frac*(total-1)));
  body.innerHTML=`${intro}<p class="kr-hint kr-image-hint">${ip.direction==='rtl'?'Leitura da direita para a esquerda: toque à esquerda para avançar.':'Toque à direita para avançar.'} Clique duas vezes na imagem para ampliar.</p><div class="kr-pageview kr-paged ${ip.direction==='rtl'?'kr-rtl':''}" id="kr-pageview"><div class="kr-pageframe" id="kr-pageframe"><img id="kr-page-img" alt=""></div><button type="button" class="kr-zone kr-zone-prev" aria-label="${ip.direction==='rtl'?'Próxima página':'Página anterior'}"></button><button type="button" class="kr-zone kr-zone-next" aria-label="${ip.direction==='rtl'?'Página anterior':'Próxima página'}"></button></div>`;
  const frame=$('#kr-pageframe'),pic=$('#kr-page-img');fitToScreen(frame);textLayout=()=>fitToScreen(frame);
  const show=()=>{
   pic.src=imageURL(c.pages[page].filename);pic.alt=`Página ${page+1} de ${total}`;frame.classList.remove('kr-zoomed');frame.scrollTo(0,0);
   pageLabel=`Página ${page+1} de ${total}`;setFrac(total>1?page/(total-1):1);
   c.pages.slice(page+1,page+3).forEach(pg=>{const i=new Image();i.src=imageURL(pg.filename)}); // pré-carrega as próximas
  };
  turn=d=>{const n=page+d;if(n<0)return goChapter(prev,true);if(n>=total){markChapterRead(c.id);return goChapter(next,false)}page=n;show()};
  // Em RTL, a zona da esquerda avança.
  body.querySelector('.kr-zone-prev').onclick=zone(()=>turn(ip.direction==='rtl'?1:-1));
  body.querySelector('.kr-zone-next').onclick=zone(()=>turn(ip.direction==='rtl'?-1:1));
  frame.addEventListener('dblclick',e=>{frame.classList.toggle('kr-zoomed');if(frame.classList.contains('kr-zoomed')){const r=frame.getBoundingClientRect();frame.scrollTo((e.clientX-r.left)/r.width*frame.scrollWidth-r.width/2,(e.clientY-r.top)/r.height*frame.scrollHeight-r.height/2)}});
  show();
 }

 // ---------- modo PDF ----------
 async function renderPDF(){
  const url=imageURL(c.pdf_filename);
  const intro=c.content?`<details class="kr-intro"><summary>Texto do capítulo</summary><div class="kr-flow-static">${esc(c.content)}</div></details>`:'';
  body.innerHTML=`${intro}<div class="kr-pdf kr-paged" id="kr-pdf"><div class="kr-pdf-bar"><button type="button" class="btn secondary" id="kr-pdf-prev" aria-label="Página anterior">‹</button><span id="kr-pdf-label">Carregando PDF…</span><button type="button" class="btn secondary" id="kr-pdf-next" aria-label="Próxima página">›</button><button type="button" class="btn secondary" id="kr-pdf-zoom-out" aria-label="Diminuir">−</button><button type="button" class="btn secondary" id="kr-pdf-zoom-in" aria-label="Ampliar">+</button><a class="btn secondary" href="${url}" target="_blank" rel="noopener">Abrir ↗</a></div><div class="kr-pdf-page" id="kr-pdf-page"><canvas id="kr-pdf-canvas"></canvas><button type="button" class="kr-zone kr-zone-prev" aria-label="Página anterior"></button><button type="button" class="kr-zone kr-zone-next" aria-label="Próxima página"></button></div></div>`;
  let doc,page=1,zoom=1,rendering=null;
  try{const lib=await loadPdfJs();doc=await lib.getDocument({url}).promise}
  catch{
   if(!root.isConnected)return;
   $('#kr-pdf').innerHTML=`<p class="kr-hint">Não foi possível carregar o leitor de PDF (é preciso internet na primeira vez). Usando o visualizador do navegador.</p><iframe class="kr-pdf-frame" src="${url}#view=FitH" title="PDF do capítulo"></iframe>`;
   pageLabel='';setFrac(frac);return;
  }
  if(!root.isConnected)return;
  const canvas=$('#kr-pdf-canvas'),holder=$('#kr-pdf-page'),total=doc.numPages;
  page=Math.min(total,Math.max(1,Math.round(frac*(total-1))+1));
  async function draw(){
   const pdfPage=await doc.getPage(page);
   const base=pdfPage.getViewport({scale:1});
   fitToScreen(holder);const fit=Math.min(((holder.clientWidth||700)-28)/base.width,(holder.clientHeight-28)/base.height);
   const scale=Math.max(0.3,fit*zoom),ratio=devicePixelRatio||1,vp=pdfPage.getViewport({scale:scale*ratio});
   canvas.width=vp.width;canvas.height=vp.height;canvas.style.width=(vp.width/ratio)+'px';canvas.style.height=(vp.height/ratio)+'px';
   rendering?.cancel?.();rendering=pdfPage.render({canvasContext:canvas.getContext('2d'),viewport:vp});
   try{await rendering.promise}catch{}
   $('#kr-pdf-label').textContent=`${page} / ${total}`;pageLabel=`Página ${page} de ${total}`;setFrac(total>1?(page-1)/(total-1):1);
   holder.classList.toggle('kr-zoomed',zoom>1);
  }
  turn=d=>{const n=page+d;if(n<1)return goChapter(prev,true);if(n>total){markChapterRead(c.id);return goChapter(next,false)}page=n;draw()};
  $('#kr-pdf-prev').onclick=()=>turn(-1);$('#kr-pdf-next').onclick=()=>turn(1);
  holder.querySelector('.kr-zone-prev').onclick=zone(()=>turn(-1));holder.querySelector('.kr-zone-next').onclick=zone(()=>turn(1));
  $('#kr-pdf-zoom-in').onclick=()=>{zoom=Math.min(4,zoom*1.25);draw()};$('#kr-pdf-zoom-out').onclick=()=>{zoom=Math.max(0.5,zoom/1.25);draw()};
  textLayout=()=>draw();
  await draw();
 }

 function renderBody(){textLayout=null;if(kind==='images')renderImages();else if(kind==='pdf')renderPDF();else if(c.content)renderText();else{body.innerHTML='<div class="empty"><h3>Capítulo ainda vazio</h3><p>Este capítulo ainda não tem texto, páginas ou PDF.</p></div>';pageLabel='';setFrac(1)}}
 let resizeTimer=0;
 window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>textLayout?.(),150)},{signal});

 // ---------- painéis ----------
 let openName='';
 function closePanel(){panel.hidden=true;openName='';root.querySelectorAll('[data-panel]').forEach(x=>x.classList.remove('active'))}
 function openPanel(name){
  if(openName===name){closePanel();return}
  openName=name;panel.hidden=false;root.querySelectorAll('[data-panel]').forEach(x=>x.classList.toggle('active',x.dataset.panel===name));
  const head=t=>`<div class="kr-panel-head"><h2>${t}</h2><button type="button" class="kr-tool" id="kr-panel-close" aria-label="Fechar">✕</button></div>`;
  if(name==='toc'){
   const read=readChapters();
   panel.innerHTML=head('Sumário')+`<ol class="kr-toc">${b.chapters.map(x=>`<li class="${x.id===c.id?'current':''}"><a href="${readerHref(x,b)}"><span>Capítulo ${x.number}${chapterExtraTitle(x)?' — '+esc(chapterExtraTitle(x)):''}</span>${read[x.id]?'<small title="Lido">✓</small>':x.id===c.id?'<small>lendo</small>':''}</a></li>`).join('')}</ol>`;
   panel.querySelector('.current')?.scrollIntoView({block:'center'});
  }else if(name==='search'){
   panel.innerHTML=head('Buscar no livro')+`<form id="kr-search-form" class="kr-search-form"><input id="kr-search-q" type="search" minlength="2" maxlength="100" placeholder="Palavra ou trecho…" required><button class="btn">Buscar</button></form><div id="kr-search-results" class="kr-results"><p class="kr-hint">A busca procura no texto de todos os capítulos (imagens e PDFs não entram).</p></div>`;
   const q=$('#kr-search-q');q.focus();
   $('#kr-search-form').onsubmit=async e=>{e.preventDefault();const out=$('#kr-search-results');out.innerHTML='<p class="kr-hint">Buscando…</p>';
    try{const r=await api('/books/'+b.id+'/search?q='+encodeURIComponent(q.value));
     out.innerHTML=r.results.length?`<p class="kr-hint">${r.results.length}${r.limited?'+':''} resultado(s)</p>`+r.results.map((x,i)=>`<button type="button" class="kr-result" data-result="${i}"><b>Capítulo ${x.number}</b><span>…${esc(x.before)}<mark>${esc(x.match)}</mark>${esc(x.after)}…</span></button>`).join(''):'<p class="kr-hint">Nada encontrado.</p>';
     out.querySelectorAll('[data-result]').forEach(el=>el.onclick=()=>{const x=r.results[Number(el.dataset.result)];setReaderJump({chapterId:x.chapter_id,offset:x.offset,length:x.length});const target=b.chapters.find(y=>y.id===x.chapter_id);if(target&&target.id!==c.id)location.hash=readerHref(target,b);else{jump=resolveJump(takeReaderJump(c.id));closePanel();renderBody()}});
    }catch(err){out.innerHTML=`<p class="error">${esc(err.message)}</p>`}};
  }else if(name==='notes'){
   const order=new Map(b.chapters.map((x,i)=>[x.id,i]));
   const list=bookNotes(b.id).filter(n=>order.has(Number(n.chapterId))).sort((x,y)=>order.get(x.chapterId)-order.get(y.chapterId)||(x.offset??x.frac*1e9)-(y.offset??y.frac*1e9));
   panel.innerHTML=head('Marcadores e notas')+(list.length?`<ul class="kr-notes">${list.map(n=>`<li data-note-row="${esc(n.id)}"><button type="button" class="kr-note-go" data-go="${esc(n.id)}"><small>${n.type==='bookmark'?'🔖 Marcador':'🖍 Grifo'} · Capítulo ${esc(n.number)}${n.type==='bookmark'?` · ${Math.round(n.frac*100)}%`:''}</small>${n.quote?`<q>${esc(n.quote.length>220?n.quote.slice(0,220)+'…':n.quote)}</q>`:''}${n.note?`<span class="kr-note-text">${esc(n.note)}</span>`:''}</button><button type="button" class="kr-tool" data-edit-note="${esc(n.id)}" title="Editar nota" aria-label="Editar nota">✎</button><button type="button" class="kr-tool" data-del-note="${esc(n.id)}" title="Excluir" aria-label="Excluir">🗑</button></li>`).join('')}</ul>`:'<p class="kr-hint">Nenhum marcador ainda. Use 🔖 para marcar a posição atual ou selecione um trecho do texto para grifar.</p>')+'<p class="kr-hint">Marcadores e grifos ficam salvos neste navegador.</p>';
   panel.querySelectorAll('[data-go]').forEach(el=>el.onclick=()=>{
    const n=list.find(x=>x.id===el.dataset.go),target=b.chapters.find(x=>x.id===Number(n.chapterId));if(!target)return;
    setReaderJump(n.type==='highlight'?{chapterId:target.id,offset:n.offset,quote:n.quote}:{chapterId:target.id,frac:n.frac});
    if(target.id!==c.id){location.hash=readerHref(target,b);return}
    jump=resolveJump(takeReaderJump(c.id));if(jump?.frac!=null)frac=jump.frac;closePanel();renderBody();
   });
   panel.querySelectorAll('[data-del-note]').forEach(el=>el.onclick=()=>{if(!confirm('Excluir este item?'))return;saveBookNotes(b.id,bookNotes(b.id).filter(x=>x.id!==el.dataset.delNote));openName='';openPanel('notes');if(kind==='text')renderBody()});
   panel.querySelectorAll('[data-edit-note]').forEach(el=>el.onclick=()=>{const all=bookNotes(b.id),n=all.find(x=>x.id===el.dataset.editNote);const text=prompt('Nota:',n.note||'');if(text===null)return;n.note=text.trim().slice(0,2000);saveBookNotes(b.id,all);openName='';openPanel('notes');if(kind==='text')renderBody()});
  }else if(name==='settings'){
   const p=readerPrefs(),ip=imagePrefs(b);
   const choice=(group,value,label,current)=>`<button type="button" class="kr-choice ${current===value?'active':''}" data-${group}="${value}" aria-pressed="${current===value}">${label}</button>`;
   panel.innerHTML=head('Aparência')+`
    <div class="kr-setting"><span>Tema</span><div class="kr-choices">${choice('theme','auto','Do site',p.theme)}${choice('theme','light','Claro',p.theme)}${choice('theme','sepia','Sépia',p.theme)}${choice('theme','dark','Escuro',p.theme)}</div></div>
    ${kind==='images'?`<div class="kr-setting"><span>Modo das imagens</span><div class="kr-choices">${choice('imagemode','vertical','Vertical (webtoon)',ip.imageMode)}${choice('imagemode','paged','Página a página',ip.imageMode)}</div></div>
    <div class="kr-setting"><span>Sentido da leitura</span><div class="kr-choices">${choice('direction','rtl','Direita → esquerda (mangá)',ip.direction)}${choice('direction','ltr','Esquerda → direita',ip.direction)}</div></div>
    <div class="kr-setting"><span>Largura das imagens</span><div class="kr-choices">${choice('imgfit','screen','Tela toda',ip.fit)}${choice('imgfit','fixed','Largura fixa',ip.fit)}</div></div>
    ${ip.fit==='fixed'?`<label class="kr-setting"><span>Largura das páginas <b id="kr-width-v">${p.width}px</b></span><input type="range" data-pref="width" min="320" max="1400" step="20" value="${p.width}"></label>`:''}`:''}
    ${kind==='text'?`<div class="kr-setting"><span>Modo</span><div class="kr-choices">${choice('textmode','paged','Páginas',p.textMode)}${choice('textmode','scroll','Rolagem',p.textMode)}</div></div>
    <div class="kr-setting"><span>Fonte</span><div class="kr-choices">${choice('font','serif','<span style="font-family:Literata,Georgia,serif">Literata</span>',p.font)}${choice('font','classic','<span style="font-family:Georgia,serif">Georgia</span>',p.font)}${choice('font','sans','<span style="font-family:DM Sans,sans-serif">Sem serifa</span>',p.font)}${choice('font','legible','<span style="font-family:Verdana,sans-serif">Legível</span>',p.font)}</div></div>
    <label class="kr-setting"><span>Tamanho do texto <b id="kr-size-v">${p.size}px</b></span><input type="range" data-pref="size" min="14" max="32" value="${p.size}"></label>
    <label class="kr-setting"><span>Espaçamento entre linhas <b id="kr-line-v">${p.line}</b></span><input type="range" data-pref="line" min="1.3" max="2.3" step="0.1" value="${p.line}"></label>
    <div class="kr-setting"><span>Margens</span><div class="kr-choices">${choice('margin','narrow','Estreitas',p.margin)}${choice('margin','medium','Médias',p.margin)}${choice('margin','wide','Largas',p.margin)}</div></div>
    <label class="kr-setting"><span>Largura máxima da coluna <b id="kr-width-v">${p.width}px</b></span><input type="range" data-pref="width" min="420" max="1200" step="20" value="${p.width}"></label>`:''}
    <button type="button" class="btn secondary" id="kr-reset">Restaurar padrão</button>`;
   const relayout=(full)=>{applyAppearance();if(full)renderBody();else textLayout?.()};
   panel.querySelectorAll('[data-theme]').forEach(el=>el.onclick=()=>{saveReaderPrefs({theme:el.dataset.theme});applyAppearance();openName='';openPanel('settings')});
   panel.querySelectorAll('[data-font]').forEach(el=>el.onclick=()=>{saveReaderPrefs({font:el.dataset.font});relayout(false);openName='';openPanel('settings')});
   panel.querySelectorAll('[data-margin]').forEach(el=>el.onclick=()=>{saveReaderPrefs({margin:el.dataset.margin});relayout(false);openName='';openPanel('settings')});
   panel.querySelectorAll('[data-textmode]').forEach(el=>el.onclick=()=>{saveReaderPrefs({textMode:el.dataset.textmode});relayout(true);openName='';openPanel('settings')});
   panel.querySelectorAll('[data-imagemode]').forEach(el=>el.onclick=()=>{saveImagePrefs(b,{imageMode:el.dataset.imagemode});relayout(true);openName='';openPanel('settings')});
   panel.querySelectorAll('[data-imgfit]').forEach(el=>el.onclick=()=>{saveImagePrefs(b,{fit:el.dataset.imgfit});relayout(true);openName='';openPanel('settings')});
   panel.querySelectorAll('[data-direction]').forEach(el=>el.onclick=()=>{saveImagePrefs(b,{direction:el.dataset.direction});relayout(true);openName='';openPanel('settings')});
   panel.querySelectorAll('[data-pref]').forEach(el=>el.oninput=()=>{const key=el.dataset.pref,v=Number(el.value);saveReaderPrefs({[key]:v});const label=$(`#kr-${key}-v`);if(label)label.textContent=key==='line'?v:v+'px';relayout(false)});
   $('#kr-reset').onclick=()=>{storeSet('makorini-reader',{});const all=storeGet('makorini-book-prefs',{});delete all[b.id];storeSet('makorini-book-prefs',all);relayout(true);openName='';openPanel('settings')};
  }
  $('#kr-panel-close').onclick=closePanel;
 }
 root.querySelectorAll('[data-panel]').forEach(el=>el.onclick=()=>openPanel(el.dataset.panel));

 // ---------- marcador, foco e offline ----------
 $('#kr-bookmark').onclick=()=>{
  const list=bookNotes(b.id);
  const near=list.find(n=>n.type==='bookmark'&&Number(n.chapterId)===Number(c.id)&&Math.abs(n.frac-frac)<0.01);
  if(near){saveBookNotes(b.id,list.filter(n=>n!==near));toast('Marcador removido.');return}
  let quote='';const flow=$('#kr-flow');
  if(flow&&kind==='text'){const at=Math.floor(frac*c.content.length);quote=c.content.slice(at,at+120).trim()}
  list.push({id:crypto.randomUUID?.()||String(Date.now()),type:'bookmark',chapterId:c.id,number:c.number,frac,quote,note:'',created:Date.now()});
  saveBookNotes(b.id,list);toast(`Marcador salvo (${pageLabel||Math.round(frac*100)+'%'}).`);
 };
 $('#kr-focus').onclick=async()=>{
  const on=!document.body.classList.contains('reading-focus');document.body.classList.toggle('reading-focus',on);
  try{if(on&&!document.fullscreenElement)await document.documentElement.requestFullscreen?.();else if(!on&&document.fullscreenElement)await document.exitFullscreen?.()}catch{}
  setTimeout(()=>textLayout?.(),200);
 };
 document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)document.body.classList.remove('reading-focus');setTimeout(()=>textLayout?.(),200)},{signal});
 $('#kr-offline').onclick=async()=>{
  if(!('caches' in window)){toast('Este navegador não permite leitura offline.');return}
  const btn=$('#kr-offline');btn.disabled=true;
  try{
   const urls=['/','/index.html','/api/bootstrap','/api/books/'+b.id,'/api/chapters/'+c.id,...c.pages.map(pg=>imageURL(pg.filename)),...(c.pdf_filename?[imageURL(c.pdf_filename)]:[])];
   const cache=await caches.open('makorini-offline');let done=0;
   for(const u of urls){await cache.add(new Request(u,{credentials:'same-origin'}));done++;statusEl.textContent=`Baixando para ler offline… ${done}/${urls.length}`}
   toast('Capítulo disponível sem internet neste navegador.');
  }catch{toast('Não foi possível baixar tudo. Verifique a conexão e tente de novo.')}
  finally{btn.disabled=false;updateStatus()}
 };

 // Toque/clique no conteúdo mostra as setas ↑↓ (e some sozinho depois de alguns segundos).
 let controlsTimer=0;
 const showControls=()=>{document.body.classList.add('reading-controls');clearTimeout(controlsTimer);controlsTimer=setTimeout(()=>document.body.classList.remove('reading-controls'),3500)};
 body.addEventListener('click',e=>{
  if(e.target.closest('a,button,input,select,textarea,.kr-zone,.kr-hl')||getSelection()?.toString())return;
  if(document.body.classList.contains('reading-controls')){document.body.classList.remove('reading-controls');clearTimeout(controlsTimer)}else showControls();
 },{signal});
 signal.addEventListener('abort',()=>{clearTimeout(controlsTimer);document.body.classList.remove('reading-controls')});
 renderBody();
 if(state.admin)api('/chapters/'+c.id+'/progress','POST',{}).catch(()=>{});
}
