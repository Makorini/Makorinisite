// Servidor pessoal: Node.js 24+, SQLite nativo, sem pacotes npm.

// ------------------------------------------------------------------
// Bibliotecas nativas e recursos
// ------------------------------------------------------------------
import http from 'node:http';
import {writeZip} from './zip.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

// ------------------------------------------------------------------
// Configuracao do servidor
// ------------------------------------------------------------------
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const DATA=path.resolve(process.env.MAKORINI_DATA||path.join(ROOT,'data'));
const PORT=Number(process.env.MAKORINI_PORT||3000);
const PUBLIC_ORIGIN=process.env.MAKORINI_PUBLIC_ORIGIN||'';
const allowedOrigins=['http://localhost:'+PORT,'http://127.0.0.1:'+PORT];
if(PUBLIC_ORIGIN){const parsed=new URL(PUBLIC_ORIGIN);if(!['http:','https:'].includes(parsed.protocol)||parsed.origin!==PUBLIC_ORIGIN)throw Error('MAKORINI_PUBLIC_ORIGIN deve ser uma origem, sem caminho nem barra final.');allowedOrigins.push(PUBLIC_ORIGIN)}
const BIND=process.env.MAKORINI_BIND||'127.0.0.1';
const setupCode=randomBytes(12).toString('hex');
const loginAttempts=new Map();


// ------------------------------------------------------------------
// Inicializacao do banco e migracoes
// ------------------------------------------------------------------
fs.mkdirSync(path.join(DATA,'uploads'),{recursive:true});
const db=new DatabaseSync(path.join(DATA,'makorini.sqlite'));
db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE;');
db.exec(fs.readFileSync(path.join(ROOT,'schema.sql'),'utf8'));
// Atualiza bancos de instalações anteriores sem apagar nenhuma obra.
if(!db.prepare('PRAGMA table_info(books)').all().some(c=>c.name==='release_year'))db.exec('ALTER TABLE books ADD COLUMN release_year INTEGER CHECK(release_year IS NULL OR release_year BETWEEN 1800 AND 2100)');
if(!db.prepare('PRAGMA table_info(books)').all().some(c=>c.name==='featured'))db.exec('ALTER TABLE books ADD COLUMN featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1))');
if(!db.prepare('PRAGMA table_info(books)').all().some(c=>c.name==='cover_fit'))db.exec("ALTER TABLE books ADD COLUMN cover_fit TEXT NOT NULL DEFAULT 'cover' CHECK(cover_fit IN ('cover','contain'))");
if(!db.prepare('PRAGMA table_info(books)').all().some(c=>c.name==='cover_focus_x'))db.exec("ALTER TABLE books ADD COLUMN cover_focus_x INTEGER NOT NULL DEFAULT 50 CHECK(cover_focus_x BETWEEN 0 AND 100)");
if(!db.prepare('PRAGMA table_info(books)').all().some(c=>c.name==='cover_focus_y'))db.exec("ALTER TABLE books ADD COLUMN cover_focus_y INTEGER NOT NULL DEFAULT 50 CHECK(cover_focus_y BETWEEN 0 AND 100)");
if(!db.prepare('PRAGMA table_info(chapters)').all().some(c=>c.name==='published_at'))db.exec('ALTER TABLE chapters ADD COLUMN published_at TEXT');
// Migrações aditivas: não alteram nem excluem obras, capítulos ou páginas existentes.
if(!db.prepare('PRAGMA table_info(books)').all().some(c=>c.name==='featured_order'))db.exec('ALTER TABLE books ADD COLUMN featured_order INTEGER');
for(const [name,definition] of [['import_status',"TEXT NOT NULL DEFAULT 'complete'"],['import_expected','INTEGER NOT NULL DEFAULT 0'],['import_kind',"TEXT NOT NULL DEFAULT ''"]]){
 if(!db.prepare('PRAGMA table_info(chapters)').all().some(c=>c.name===name))db.exec(`ALTER TABLE chapters ADD COLUMN ${name} ${definition}`);
}
// Atribui ordem estável também aos destaques criados antes desta versão.
let featuredNext=db.prepare('SELECT coalesce(max(featured_order),0)+1 AS n FROM books WHERE featured=1').get().n;
for(const b of db.prepare('SELECT id FROM books WHERE featured=1 AND featured_order IS NULL ORDER BY updated_at DESC,id DESC').all()){
 db.prepare('UPDATE books SET featured_order=? WHERE id=?').run(featuredNext++,b.id);
}
// Permite o formato "Livros" também nas instalações que já têm obras cadastradas.
// A restrição CHECK da tabela books não pode ser ampliada por ALTER COLUMN no SQLite.
// A migração recria SOMENTE a tabela books preservando colunas, IDs, índices e gatilhos.
function enableBookFormatLivros(){
 const ddl=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='books'").get()?.sql;
 if(!ddl)throw Error('Tabela de obras não encontrada.');
 const check=ddl.match(/CHECK\s*\(\s*format\s+IN\s*\(([^)]*)\)\s*\)/i);
 if(!check||/['"]Livros['"]/.test(check[1]))return;
 const revised=ddl.replace(check[0],check[0].replace(/\)\s*\)$/,",'Livros'))"));
 const create=revised.replace(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["`]books["`]|\[books\]|books)\s*\(/i,'CREATE TABLE books__format_new (');
 if(create===revised||create.includes('CHECK(format IN (')&&!create.includes("'Livros'"))throw Error('Estrutura da tabela books não reconhecida para migração de formato.');
 const objects=db.prepare("SELECT type,name,sql FROM sqlite_master WHERE tbl_name='books' AND type IN ('index','trigger') AND sql IS NOT NULL").all();
 db.exec('PRAGMA foreign_keys=OFF');
 try{
  db.exec('BEGIN IMMEDIATE');
  db.exec(create);
  db.exec('INSERT INTO books__format_new SELECT * FROM books');
  db.exec('DROP TABLE books');
  db.exec('ALTER TABLE books__format_new RENAME TO books');
  for(const item of objects)db.exec(item.sql);
  db.exec('COMMIT');
 }catch(error){
  try{db.exec('ROLLBACK')}catch{}
  throw error;
 }finally{db.exec('PRAGMA foreign_keys=ON')}
 const broken=db.prepare('PRAGMA foreign_key_check').all();
 if(broken.length)throw Error('A migração identificou referências inválidas no banco. Consulte o backup.');
}
enableBookFormatLivros();
// Gêneros iniciais; não repovoa um banco já configurado pelo usuário.
if(!fs.existsSync(path.join(DATA,'.initialized'))){for(const n of ['Romance','Fantasia','Drama','Aventura','Comédia','Cotidiano','Mistério'])db.prepare('INSERT OR IGNORE INTO genres(name) VALUES(?)').run(n);fs.writeFileSync(path.join(DATA,'.initialized'),'1');}

// ------------------------------------------------------------------
// Consultas e validacoes
// ------------------------------------------------------------------
const all=(sql,...v)=>db.prepare(sql).all(...v),one=(sql,...v)=>db.prepare(sql).get(...v),run=(sql,...v)=>db.prepare(sql).run(...v);
function fail(message,status=400){throw Object.assign(new Error(message),{status})}
function tx(fn){db.exec('BEGIN');try{const x=fn();db.exec('COMMIT');return x}catch(e){db.exec('ROLLBACK');throw e}}
const str=(v,max=200)=>{if(typeof v!=='string'||v.length>max)fail(`Texto inválido (máximo ${max} caracteres).`);return v.trim()};
const id=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)fail('Identificador inválido.');return n};
function required(v,max){const s=str(v,max);if(!s)fail('Preencha os campos obrigatórios.');return s}
function exists(table,i){const x=one(`SELECT * FROM ${table} WHERE id=?`,i);if(!x)fail('Registro não encontrado.',404);return x}
function touch(i){run("UPDATE books SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",i)}

// ------------------------------------------------------------------
// Montagem de obras e permissoes
// ------------------------------------------------------------------
function book(i,admin=true,voter=''){const b=exists('books',i);if(!admin&&b.visibility!=='published')fail('História não encontrada.',404);b.genres=all('SELECT g.* FROM genres g JOIN book_genres bg ON bg.genre_id=g.id WHERE bg.book_id=? ORDER BY g.name',i);b.chapters=all('SELECT c.id,c.book_id,c.number,c.title,c.visibility,c.pdf_filename,c.pdf_original_name,c.created_at,c.updated_at,c.published_at,c.import_status,c.import_expected,c.import_kind, (SELECT count(*) FROM pages p WHERE p.chapter_id=c.id) AS page_count FROM chapters c WHERE book_id=? ORDER BY number',i).filter(c=>admin||c.visibility==='published');b.progress=one('SELECT * FROM reading_progress WHERE book_id=?',i)||null;if(!admin){b.favorite=0;b.progress=null}b.rating=one('SELECT round(avg(score),1) AS average,count(*) AS count FROM ratings WHERE book_id=?',i);b.my_rating=voter?(one('SELECT score FROM ratings WHERE book_id=? AND voter_hash=?',i,voter)?.score||null):null;return b}

// ------------------------------------------------------------------
// Recebimento de imagens e PDFs
// ------------------------------------------------------------------
function imageFile(data){if(typeof data!=='string')fail('Imagem inválida.');const m=data.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);if(!m)fail('Use imagens PNG, JPG ou WebP.');const buf=Buffer.from(m[2],'base64');if(!buf.length||buf.length>12*1024*1024)fail('Cada imagem deve ter até 12 MB.');let ext='';if(buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))ext='png';else if(buf[0]===255&&buf[1]===216&&buf[2]===255)ext='jpg';else if(buf.subarray(0,4).toString()==='RIFF'&&buf.subarray(8,12).toString()==='WEBP')ext='webp';if(!ext)fail('O arquivo não é uma imagem suportada.');const filename=randomUUID()+'.'+ext;fs.writeFileSync(path.join(DATA,'uploads',filename),buf);return filename}
function removeFiles(names){for(const n of names.filter(Boolean))try{fs.unlinkSync(path.join(DATA,'uploads',path.basename(n)))}catch{}}
function pdfFile(data){if(typeof data!=='string')fail('PDF inválido.');const m=data.match(/^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/);if(!m)fail('Selecione um arquivo PDF.');const buffer=Buffer.from(m[1],'base64');if(buffer.length>40*1024*1024)fail('O PDF deve ter até 40 MB.');if(buffer.subarray(0,5).toString()!=='%PDF-')fail('O arquivo não contém um PDF válido.');const filename=randomUUID()+'.pdf';fs.writeFileSync(path.join(DATA,'uploads',filename),buffer);return filename}

// ------------------------------------------------------------------
// Seguranca, tipos de arquivo e servidor HTTP
// ------------------------------------------------------------------
const TOKEN=randomBytes(24).toString('hex');
const MIME={'.svg':'image/svg+xml','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.pdf':'application/pdf','.ttf':'font/ttf'};

// ------------------------------------------------------------------
// API, arquivos estaticos e rotas
// ------------------------------------------------------------------
const server=http.createServer(async(req,res)=>{
 const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
 try{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','SAMEORIGIN');
  if(!allowedOrigins.map(x=>new URL(x).host).includes(req.headers.host))fail('Host não permitido.',403);
  const origin=req.headers.origin;if(origin&&!allowedOrigins.includes(origin))fail('Origem não permitida.',403);
  const url=new URL(req.url,'http://localhost:'+PORT);const p=url.pathname;const method=req.method;
  const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('makorini_session='))?.split('=')[1]||'';
  const sessionHash=createHash('sha256').update(cookie).digest('hex');
  const admin=!!one('SELECT 1 FROM sessions WHERE id=? AND expires>?',sessionHash,Date.now());
  const configured=!!one('SELECT 1 FROM admin_account WHERE id=1');
  let readerCookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('makorini_reader='))?.slice('makorini_reader='.length)||'';
  if(!/^[a-f0-9]{64}$/.test(readerCookie)){readerCookie='';if(p==='/api/bootstrap'&&method==='GET'){readerCookie=randomBytes(32).toString('hex');res.setHeader('Set-Cookie',`makorini_reader=${readerCookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${PUBLIC_ORIGIN.startsWith('https:')?'; Secure':''}`)}}
  const voter=readerCookie?createHash('sha256').update(readerCookie).digest('hex'):'';
  const ratingRequest=/^\/api\/books\/[1-9][0-9]*\/rating$/.test(p)&&['POST','DELETE'].includes(method);

  function session(){run('DELETE FROM sessions WHERE expires<=?',Date.now());const raw=randomBytes(32).toString('hex');run('INSERT INTO sessions VALUES(?,?)',createHash('sha256').update(raw).digest('hex'),Date.now()+8*60*60*1000);res.setHeader('Set-Cookie',`makorini_session=${raw}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${PUBLIC_ORIGIN.startsWith('https:')?'; Secure':''}`)}

  if(!['GET','POST','PUT','DELETE'].includes(method))fail('Método não permitido.',405);
  let body={};
  if(method!=='GET'){
   if(req.headers['x-makorini-token']!==TOKEN)fail('Recarregue a página para continuar.',403);
   if(!String(req.headers['content-type']).startsWith('application/json'))fail('Use JSON.',415);
   if(Number(req.headers['content-length'])>58*1024*1024)fail('Arquivo muito grande.',413);
   let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>58*1024*1024)fail('Arquivo muito grande.',413);chunks.push(chunk)}
   try{body=JSON.parse(Buffer.concat(chunks).toString()||'{}')}catch{fail('JSON inválido.')}
   if(!body||Array.isArray(body)||typeof body!=='object')fail('Dados inválidos.');
  }
  if(method!=='GET'&&!admin&&!ratingRequest&&!['/api/login','/api/setup'].includes(p))fail('Entre no painel da autora para alterar conteúdo.',401);
  const parts=p.split('/').filter(Boolean);let out;
  if(['/api/login','/api/setup'].includes(p)&&method==='POST'){
   const key=req.socket.remoteAddress,now=Date.now();let attempt=loginAttempts.get(key);if(!attempt||attempt.until<now)attempt={count:0,until:now+60000};attempt.count++;loginAttempts.set(key,attempt);if(attempt.count>10)fail('Muitas tentativas. Aguarde um minuto.',429);
   const password=required(body.password,200);
   if(p==='/api/setup'){if(configured)fail('A conta já foi configurada.',409);if(body.code!==setupCode)fail('Código de configuração incorreto.',403);if(password.length<12)fail('Use uma senha com pelo menos 12 caracteres.');const salt=randomBytes(16).toString('hex');run('INSERT INTO admin_account VALUES(1,?,?)',salt,scryptSync(password,salt,64).toString('hex'))}
   else{const a=one('SELECT * FROM admin_account WHERE id=1');if(!a||!timingSafeEqual(scryptSync(password,a.salt,64),Buffer.from(a.password_hash,'hex')))fail('Senha incorreta.',401)}
   session();loginAttempts.delete(key);json(200,{ok:true});return;
  }
  if(p==='/api/logout'&&method==='POST'){run('DELETE FROM sessions WHERE id=?',sessionHash);res.setHeader('Set-Cookie','makorini_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');json(200,{ok:true});return}

  if(p==='/api/bootstrap'&&method==='GET')out={token:TOKEN,admin,configured,genres:all('SELECT * FROM genres ORDER BY name'),books:all('SELECT id,visibility FROM books ORDER BY updated_at DESC,id DESC').filter(b=>admin||b.visibility==='published').map(b=>book(b.id,admin,voter))};
  else if(ratingRequest){
   const bid=id(parts[2]);const b=exists('books',bid);if(b.visibility!=='published')fail('Apenas obras publicadas podem receber avaliações.',404);
   if(!voter)fail('Ative os cookies e recarregue a página para avaliar.',400);
   if(method==='POST'){if(!Number.isInteger(body.score)||body.score<1||body.score>5)fail('Escolha uma nota inteira de 1 a 5.');run("INSERT INTO ratings(book_id,voter_hash,score) VALUES(?,?,?) ON CONFLICT(book_id,voter_hash) DO UPDATE SET score=excluded.score,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",bid,voter,body.score)}
   else run('DELETE FROM ratings WHERE book_id=? AND voter_hash=?',bid,voter);
   out=book(bid,admin,voter);
  }
  else if(p==='/api/genres'&&method==='POST'){const n=required(body.name,60);out={id:Number(run('INSERT INTO genres(name) VALUES(?)',n).lastInsertRowid)}}
  else if(parts[1]==='genres'&&parts.length===3&&['PUT','DELETE'].includes(method)){const i=id(parts[2]);exists('genres',i);if(method==='PUT')run('UPDATE genres SET name=? WHERE id=?',required(body.name,60),i);else{if(one('SELECT 1 FROM book_genres WHERE genre_id=?',i))fail('Este gênero está em uso. Remova-o das obras antes de excluir.');run('DELETE FROM genres WHERE id=?',i)}out={ok:true}}
  // Destaques independentes da edição de obras: seleciona, remove e reordena.
  else if(parts[1]==='featured'&&parts.length===3&&parts[2]==='order'&&method==='PUT'){
   if(!Array.isArray(body.ids))fail('Informe a ordem dos destaques.');
   const ids=body.ids.map(id),current=all("SELECT id FROM books WHERE featured=1 AND visibility='published'").map(x=>x.id);
   if(ids.length!==current.length||ids.length>10||new Set(ids).size!==ids.length||ids.some(x=>!Number.isSafeInteger(x)||!current.includes(x)))fail('Ordem de destaques inválida.');
   tx(()=>ids.forEach((id,index)=>run('UPDATE books SET featured_order=? WHERE id=?',index+1,id)));
   out={ok:true};
  }
  else if(parts[1]==='featured'&&parts.length===3&&method==='POST'){
   const i=id(parts[2]),b=exists('books',i),enabled=body.enabled===true;
   if(enabled&&b.visibility!=='published')fail('Publique a obra antes de destacá-la.');
   if(enabled&&!b.featured&&one('SELECT count(*) AS n FROM books WHERE featured=1').n>=10)fail('Limite de dez destaques.');
   const order=enabled?(b.featured&&b.featured_order!=null?b.featured_order:one('SELECT coalesce(max(featured_order),0)+1 AS n FROM books').n):null;
   run('UPDATE books SET featured=?,featured_order=? WHERE id=?',enabled?1:0,order,i);
   out={ok:true,featured:enabled,featured_order:order};
  }
  // Importação em lote: cria rascunho pendente, permite retomada e confirma só após receber todos os arquivos.
  else if(parts[1]==='books'&&parts[3]==='import-chapters'&&parts.length===4&&method==='POST'){
   const bid=id(parts[2]);exists('books',bid);
   const number=Number(body.number),expected=Number(body.expected),kind=body.kind;
   if(!Number.isFinite(number)||number<0||number>1000000||!Number.isInteger(expected)||expected<1||expected>3000||!['images','pdf'].includes(kind)||(kind==='pdf'&&expected!==1))fail('Capítulo ou quantidade de arquivos inválidos.');
   // O nome da pasta/PDF identifica somente o numero; nao vira titulo do capitulo.
   const title='',existing=one('SELECT * FROM chapters WHERE book_id=? AND number=?',bid,number);
   if(existing){
    if(existing.import_status==='pending'&&existing.import_expected===expected&&existing.import_kind===kind){out={id:existing.id,status:'resume'};}
    else out={id:existing.id,status:'exists'};
   }else{
    const result=run("INSERT INTO chapters(book_id,number,title,visibility,import_status,import_expected,import_kind) VALUES(?,?,?,'draft','pending',?,?)",bid,number,title,expected,kind);
    touch(bid);out={id:Number(result.lastInsertRowid),status:'created'};
   }
  }
  else if(parts[1]==='chapters'&&parts[3]==='import-finish'&&parts.length===4&&method==='POST'){
   const c=exists('chapters',id(parts[2]));
   if(c.import_status!=='pending')fail('Este capítulo não está aguardando importação.');
   const received=c.import_kind==='pdf'?(c.pdf_filename?1:0):one('SELECT count(*) AS n FROM pages WHERE chapter_id=?',c.id).n;
   if(received!==c.import_expected)fail(`Importação incompleta: ${received} de ${c.import_expected} arquivos.`,409);
   const visibility=body.publish===true?'published':'draft';
   run("UPDATE chapters SET import_status='complete',visibility=?,published_at=CASE WHEN ?='published' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",visibility,visibility,c.id);
   touch(c.book_id);out={ok:true,visibility};
  }
  else if((p==='/api/books'&&method==='POST')||(parts[1]==='books'&&parts.length===3&&method==='PUT')){
   const i=method==='PUT'?id(parts[2]):null;if(i)exists('books',i);
   const visibility=body.visibility||'draft';if(!['draft','published'].includes(visibility))fail('Visibilidade inválida.');const format=body.format||'Novel';if(!['Novel','Mangá','Manhwa','Webtoon','Livros'].includes(format))fail('Tipo de obra inválido.');
   const title=required(body.title,200),synopsis=str(body.synopsis??'',20000),author=str(body.author??'',200),status=body.status||'Em andamento';
   if(!['Em andamento','Concluída','Pausada'].includes(status))fail('Status inválido.');
   const releaseYear=(body.release_year===''||body.release_year==null)?null:Number(body.release_year);if(releaseYear!==null&&(!Number.isInteger(releaseYear)||releaseYear<1800||releaseYear>2100))fail('Informe um ano de lançamento válido entre 1800 e 2100.');
   const coverFit=(body.cover_fit==='contain')?'contain':'cover';
   const coverFocusX=Number(body.cover_focus_x);const coverFocusY=Number(body.cover_focus_y);
   if(!Number.isFinite(coverFocusX)||coverFocusX<0||coverFocusX>100||!Number.isFinite(coverFocusY)||coverFocusY<0||coverFocusY>100)fail('Posição da capa inválida.');
   const featured=body.featured===true?1:0;
   if(featured&&visibility!=='published')fail('Publique a obra antes de colocá-la nos destaques.');
   if(featured&&one('SELECT count(*) AS n FROM books WHERE featured=1 AND id!=?',i||-1).n>=10)fail('O limite é de 10 obras em destaque. Remova um destaque antes de adicionar outro.');
   if(!Array.isArray(body.genres))fail('Gêneros inválidos.');const genres=[...new Set(body.genres.map(id))];genres.forEach(g=>exists('genres',g));
   out=tx(()=>{let bid=i;if(i){
    const old=exists('books',i),order=featured?(old.featured&&old.featured_order!=null?old.featured_order:one('SELECT coalesce(max(featured_order),0)+1 AS n FROM books').n):null;
    run('UPDATE books SET title=?,synopsis=?,author=?,status=?,format=?,visibility=?,release_year=?,cover_fit=?,cover_focus_x=?,cover_focus_y=?,featured=?,featured_order=? WHERE id=?',title,synopsis,author,status,format,visibility,releaseYear,coverFit,Math.round(coverFocusX),Math.round(coverFocusY),featured,order,i);
   }else{
    const order=featured?one('SELECT coalesce(max(featured_order),0)+1 AS n FROM books').n:null;
    bid=Number(run('INSERT INTO books(title,synopsis,author,status,format,visibility,release_year,cover_fit,cover_focus_x,cover_focus_y,featured,featured_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',title,synopsis,author,status,format,visibility,releaseYear,coverFit,Math.round(coverFocusX),Math.round(coverFocusY),featured,order).lastInsertRowid);
   }run('DELETE FROM book_genres WHERE book_id=?',bid);genres.forEach(g=>run('INSERT INTO book_genres VALUES(?,?)',bid,g));touch(bid);return {id:bid}});
  }
  else if(parts[1]==='books'&&parts.length===3&&method==='GET')out=book(id(parts[2]),admin,voter);
  else if(parts[1]==='books'&&parts.length===3&&method==='DELETE'){
   const i=id(parts[2]),b=exists('books',i);const files=all('SELECT p.filename FROM pages p JOIN chapters c ON c.id=p.chapter_id WHERE c.book_id=?',i).map(x=>x.filename);const pdfs=all('SELECT pdf_filename FROM chapters WHERE book_id=?',i).map(x=>x.pdf_filename);run('DELETE FROM books WHERE id=?',i);removeFiles([...files,b.cover,...pdfs]);out={ok:true};
  }
  else if(parts[1]==='books'&&parts[3]==='cover'&&parts.length===4&&['POST','DELETE'].includes(method)){
   const i=id(parts[2]),b=exists('books',i);const filename=method==='POST'?imageFile(body.image):null;try{run('UPDATE books SET cover=? WHERE id=?',filename,i);touch(i)}catch(e){removeFiles([filename]);throw e}removeFiles([b.cover]);out={ok:true};
  }
  else if(parts[1]==='books'&&parts[3]==='favorite'&&method==='POST'){const i=id(parts[2]);exists('books',i);run('UPDATE books SET favorite=1-favorite WHERE id=?',i);out={ok:true}}
  // Alteração de visibilidade em lote: apenas capítulos da mesma obra e importações concluídas.
  // Não modifica texto, imagens, PDFs, números nem a visibilidade da obra.
  else if(parts[1]==='books'&&parts[3]==='chapters'&&parts[4]==='visibility'&&parts.length===5&&method==='PUT'){
   const bid=id(parts[2]);exists('books',bid);
   const visibility=body.visibility;
   if(!['draft','published'].includes(visibility))fail('Selecione Publicado ou Rascunho.');
   if(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>5000)fail('Selecione entre 1 e 5000 capítulos.');
   const ids=body.ids.map(id);
   if(ids.some(x=>!Number.isSafeInteger(x)||x<1)||new Set(ids).size!==ids.length)fail('A seleção de capítulos é inválida.');
   const byId=new Map(all('SELECT id,visibility,import_status FROM chapters WHERE book_id=?',bid).map(c=>[c.id,c]));
   if(ids.some(x=>!byId.has(x)))fail('Um dos capítulos selecionados não pertence a esta obra.',400);
   if(ids.some(x=>byId.get(x).import_status==='pending'))fail('Finalize as importações pendentes antes de alterar sua visibilidade.',409);
   const changed=tx(()=>{
    let total=0;
    for(const cid of ids){
     if(byId.get(cid).visibility===visibility)continue;
     const result=run("UPDATE chapters SET visibility=?,published_at=CASE WHEN ?='published' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND book_id=? AND import_status<>'pending'",visibility,visibility,cid,bid);
     if(result.changes!==1)fail('Não foi possível atualizar um dos capítulos.');
     total++;
    }
    if(total)touch(bid);
    return total;
   });
   out={ok:true,selected:ids.length,changed,visibility};
  }
  else if((parts[1]==='books'&&parts[3]==='chapters'&&parts.length===4&&method==='POST')||(parts[1]==='chapters'&&parts.length===3&&method==='PUT')){
   const cid=method==='PUT'?id(parts[2]):null;const bid=cid?exists('chapters',cid).book_id:id(parts[2]);exists('books',bid);
   const visibility=body.visibility||'draft';if(!['draft','published'].includes(visibility))fail('Visibilidade inválida.');
   if(cid&&visibility==='published'&&exists('chapters',cid).import_status==='pending')fail('Finalize a importação deste capítulo antes de publicar.');
   if(body.number===''||body.number===null)fail('Informe o número do capítulo.');const n=Number(body.number);if(!Number.isFinite(n)||n<0||n>1e6)fail('Número de capítulo inválido.');const title=str(body.title??'',200),content=str(body.content??'',1000000);
   out=tx(()=>{let c=cid;if(c)run("UPDATE chapters SET number=?,title=?,content=?,visibility=?,published_at=CASE WHEN ?='published' AND visibility<>'published' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') WHEN ?='draft' THEN NULL ELSE published_at END,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",n,title,content,visibility,visibility,visibility,c);else c=Number(run("INSERT INTO chapters(book_id,number,title,content,visibility,published_at) VALUES(?,?,?,?,?,CASE WHEN ?='published' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END)",bid,n,title,content,visibility,visibility).lastInsertRowid);touch(bid);return {id:c}});
  }
  else if(parts[1]==='chapters'&&parts.length===3&&method==='GET'){const c=exists('chapters',id(parts[2]));if(!admin&&(c.visibility!=='published'||exists('books',c.book_id).visibility!=='published'))fail('Capítulo não encontrado.',404);out={...c,pages:all('SELECT * FROM pages WHERE chapter_id=? ORDER BY position',c.id)}}
  else if(parts[1]==='chapters'&&parts.length===3&&method==='DELETE'){const c=exists('chapters',id(parts[2]));const files=all('SELECT filename FROM pages WHERE chapter_id=?',c.id);tx(()=>{run('DELETE FROM chapters WHERE id=?',c.id);touch(c.book_id)});removeFiles([...files.map(x=>x.filename),c.pdf_filename]);out={ok:true}}
  else if(parts[1]==='chapters'&&parts[3]==='pdf'&&parts.length===4&&['POST','DELETE'].includes(method)){
   const c=exists('chapters',id(parts[2]));if(c.import_status==='pending'&&c.import_kind!=='pdf')fail('Este capítulo está importando imagens, não PDF.');const name=method==='POST'?required(body.name,255):null;const filename=method==='POST'?pdfFile(body.pdf):null;
   try{run('UPDATE chapters SET pdf_filename=?,pdf_original_name=? WHERE id=?',filename,name,c.id);touch(c.book_id)}catch(e){removeFiles([filename]);throw e}removeFiles([c.pdf_filename]);out={ok:true};
  }
  else if(parts[1]==='chapters'&&parts[3]==='pages'&&parts.length===4&&method==='POST'){
   const c=exists('chapters',id(parts[2])),name=required(body.name,255);
   if(c.import_status==='pending'&&c.import_kind!=='images')fail('Este capítulo não está importando imagens.');
   const same=c.import_status==='pending'?one('SELECT id FROM pages WHERE chapter_id=? AND original_name=?',c.id,name):null;
   if(same){out={id:same.id,alreadyReceived:true};}
   else{
    if(c.import_status==='pending'&&one('SELECT count(*) AS n FROM pages WHERE chapter_id=?',c.id).n>=c.import_expected)fail('O limite de páginas da importação foi atingido.');
    const filename=imageFile(body.image);
    try{out=tx(()=>{const pos=one('SELECT coalesce(max(position),0)+1 AS n FROM pages WHERE chapter_id=?',c.id).n;const i=Number(run('INSERT INTO pages(chapter_id,position,filename,original_name) VALUES(?,?,?,?)',c.id,pos,filename,name).lastInsertRowid);touch(c.book_id);return {id:i}})}catch(e){removeFiles([filename]);throw e}
   }
  }
  else if(parts[1]==='chapters'&&parts[3]==='order'&&method==='PUT'){
   const c=exists('chapters',id(parts[2])),current=all('SELECT id FROM pages WHERE chapter_id=?',c.id).map(x=>x.id);if(!Array.isArray(body.ids))fail('Ordem inválida.');const next=body.ids.map(id);if(next.length!==current.length||new Set(next).size!==next.length||next.some(x=>!current.includes(x)))fail('Ordem inválida.');tx(()=>{const max=one('SELECT coalesce(max(position),0) AS n FROM pages WHERE chapter_id=?',c.id).n;run('UPDATE pages SET position=position+? WHERE chapter_id=?',max+1,c.id);next.forEach((x,i)=>run('UPDATE pages SET position=? WHERE id=?',i+1,x));touch(c.book_id)});out={ok:true};
  }
  else if(parts[1]==='pages'&&parts.length===3&&method==='DELETE'){const pg=exists('pages',id(parts[2]));run('DELETE FROM pages WHERE id=?',pg.id);removeFiles([pg.filename]);out={ok:true}}
  else if(parts[1]==='chapters'&&parts[3]==='progress'&&method==='POST'){const c=exists('chapters',id(parts[2]));run("INSERT INTO reading_progress(book_id,chapter_id) VALUES(?,?) ON CONFLICT(book_id) DO UPDATE SET chapter_id=excluded.chapter_id,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",c.book_id,c.id);out={ok:true}}
  else if(p==='/api/backup'&&method==='POST'){
   // Cópia consistente: SQLite é síncrono e nenhum pedido altera arquivos durante esta operação.
   const target=path.join(DATA,'backups',new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,6));fs.mkdirSync(target,{recursive:true});db.prepare('VACUUM INTO ?').run(path.join(target,'makorini.sqlite'));fs.cpSync(path.join(DATA,'uploads'),path.join(target,'uploads'),{recursive:true});fs.writeFileSync(path.join(target,'.initialized'),'1');const copy=new DatabaseSync(path.join(target,'makorini.sqlite'));copy.exec('DELETE FROM sessions');copy.close();const entries=[{name:'makorini.sqlite',path:path.join(target,'makorini.sqlite')},{name:'.initialized',path:path.join(target,'.initialized')},...fs.readdirSync(path.join(target,'uploads')).map(n=>({name:'uploads/'+n,path:path.join(target,'uploads',n)}))];writeZip(target+'.zip',entries);out={ok:true,folder:target,download:'/api/backups/'+path.basename(target)+'.zip'};
  }
  else if(parts[1]==='backups'&&parts.length===3&&method==='GET'){
   if(!admin)fail('Entre como autora para baixar backups.',401);const n=parts[2];if(!/^[0-9TZ-]+-[a-f0-9]{6}\.zip$/.test(n))fail('Backup inválido.',404);const file=path.join(DATA,'backups',n);if(!fs.existsSync(file))fail('Backup não encontrado.',404);res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="Makorini-Backup.zip"','Content-Length':fs.statSync(file).size,'Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);return;
  }
  else if(p.startsWith('/api/'))fail('Rota não encontrada.',404);
  else if(method==='GET'){
   let file;if(p.startsWith('/uploads/')){const n=decodeURIComponent(p.slice(9));if(!/^[a-f0-9-]+\.(png|jpg|webp|pdf)$/.test(n))fail('Arquivo inválido.',404);if(!admin&&!one("SELECT 1 FROM books WHERE cover=? AND visibility='published' UNION ALL SELECT 1 FROM pages p JOIN chapters c ON c.id=p.chapter_id JOIN books b ON b.id=c.book_id WHERE p.filename=? AND c.visibility='published' AND b.visibility='published' UNION ALL SELECT 1 FROM chapters c JOIN books b ON b.id=c.book_id WHERE c.pdf_filename=? AND c.visibility='published' AND b.visibility='published'",n,n,n))fail('Imagem não encontrada.',404);file=path.join(DATA,'uploads',n)}else{const rel=decodeURIComponent(p==='/'?'/index.html':p);const base=path.join(ROOT,'public');file=path.resolve(base,'.'+rel);if(!file.startsWith(base+path.sep))fail('Arquivo inválido.',404)}
   if(!fs.existsSync(file)||!fs.statSync(file).isFile())fail('Arquivo não encontrado.',404);
   const ext=path.extname(file);if(!MIME[ext])fail('Tipo não permitido.',404);const size=fs.statSync(file).size;const headers={'Content-Type':MIME[ext],'Cache-Control':'no-cache','Accept-Ranges':'bytes'};
   if(ext==='.pdf')headers['Content-Disposition']='inline; filename="capitulo.pdf"';
   const range=req.headers.range;if(range){const m=range.match(/^bytes=(\d+)-(\d*)$/);if(!m)fail('Intervalo inválido.',416);const start=Number(m[1]),end=m[2]?Math.min(Number(m[2]),size-1):size-1;if(start> end||start>=size)fail('Intervalo inválido.',416);res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});fs.createReadStream(file,{start,end}).pipe(res)}else{res.writeHead(200,{...headers,'Content-Length':size});fs.createReadStream(file).pipe(res)}return;
  }else fail('Rota não encontrada.',404);
  json(200,out);
 }catch(e){const constraint=String(e.message).includes('UNIQUE constraint');const status=constraint?409:e.status||500;json(status,{error:constraint?'Já existe um gênero com esse nome ou um capítulo com esse número nesta obra.':status===500?'Não foi possível salvar. Verifique espaço e permissões na pasta data.':e.message});if(status===500)console.error(e)}
});

// ------------------------------------------------------------------
// Inicializacao e erros de porta
// ------------------------------------------------------------------
server.listen(PORT,BIND,()=>{if(!one('SELECT 1 FROM admin_account WHERE id=1'))console.log('CODIGO DE PRIMEIRO ACESSO: '+setupCode);console.log(`Makorini Stories: http://localhost:${PORT}\nBanco: ${path.join(DATA,'makorini.sqlite')}\nMantenha esta janela aberta. Ctrl+C encerra.`)});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`A porta ${PORT} já está em uso. Verifique se a Makorini já está aberta.`:e);db.close();process.exit(1)});
process.on('SIGINT',()=>server.close(()=>{db.close();process.exit()}));
process.on('SIGTERM',()=>server.close(()=>{db.close();process.exit()}));
