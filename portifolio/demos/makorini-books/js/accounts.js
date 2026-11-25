// Contas: entrar, criar conta, minha conta e gestão de usuários (administração).
// Scripts clássicos carregados em ordem (core → catalog → admin → accounts → reader → main) e compartilham o escopo global.

// Nome do painel conforme o papel de quem está logado.
function panelTitle(){return state.admin?'Painel da administração':'Meu painel'}
// Contas da comunidade: cada pessoa vê e edita as próprias obras; a administração vê tudo.
function myBooks(){return state.books.filter(b=>b.can_edit&&(state.admin||b.owner_id===state.me?.id))}

// ------------------------------------------------------------------
// Entrar
// ------------------------------------------------------------------
function login(){
 if(state.me){location.hash='#painel';return}
 // Primeiro acesso da conta principal da administração (código mostrado no terminal do servidor).
 const setup=!state.configured?`<details class="form-panel setup-box"><summary><b>Primeiro acesso da administração</b></summary><p class="hint">No terminal do servidor, copie o “CODIGO DE PRIMEIRO ACESSO” e crie a senha da conta principal da administração (pelo menos 8 caracteres).</p><form id="setup-form"><label>Código de primeiro acesso<input name="code" required autocomplete="off"></label><label>Nova senha<input name="password" type="password" required minlength="8" maxlength="200" autocomplete="new-password"></label><label>Repita a senha<input name="confirm" type="password" required minlength="8" autocomplete="new-password"></label><button class="btn">Criar acesso da administração</button><p id="setup-error" class="error" role="alert"></p></form></details>`:'';
 app.innerHTML=`<div class="guide auth-page">${mascot('moti')}<span class="eyebrow">Comunidade Makorini</span><h1>Entrar</h1><p>Entre para publicar e gerenciar as suas obras.</p><form class="form-panel" id="login-form"><label>E-mail<input name="email" type="email" required maxlength="200" autocomplete="email"></label><label>Senha<input name="password" type="password" required maxlength="200" autocomplete="current-password"></label><button class="btn">Entrar</button><p id="form-error" class="error" role="alert"></p></form><p>Ainda não tem conta? <a class="link" href="#cadastro">Criar conta grátis</a></p><p class="hint">Conta da administração sem senha? Use <a class="link" href="#cadastro">Criar conta</a> com o e-mail dela. Esqueceu a senha? Peça à administração uma senha provisória pelo e-mail de <a class="link" href="#contato">contato</a>. O catálogo publicado pode ser lido sem conta.</p>${setup}</div>`;
 $('#login-form').onsubmit=async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button');btn.disabled=true;try{const f=new FormData(e.currentTarget);await api('/login','POST',{email:f.get('email'),password:f.get('password')});location.hash='#painel'}catch(err){formError(err)}finally{btn.disabled=false}};
 $('#setup-form')?.addEventListener('submit',async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button'),out=$('#setup-error');btn.disabled=true;out.textContent='';try{const f=new FormData(e.currentTarget);if(f.get('password')!==f.get('confirm'))throw Error('As senhas não coincidem.');await api('/setup','POST',{password:f.get('password'),code:f.get('code')});location.hash='#painel'}catch(err){out.textContent=err.message}finally{btn.disabled=false}});
}

// ------------------------------------------------------------------
// Criar conta
// ------------------------------------------------------------------
function register(){
 if(state.me){location.hash='#painel';return}
 app.innerHTML=`<div class="guide auth-page">${mascot('hoshi')}<span class="eyebrow">Comunidade Makorini</span><h1>Criar conta</h1><p>Com uma conta você publica suas próprias histórias, mangás, webtoons e livros. Só você (e a administração do site) pode editar o que você adicionar.</p><form class="form-panel" id="register-form"><label>Nome ou pseudônimo (aparece nas suas obras)<input name="name" required minlength="2" maxlength="60" autocomplete="nickname"></label><label>E-mail<input name="email" type="email" required maxlength="200" autocomplete="email"></label><label>Senha (mínimo 8 caracteres)<input name="password" type="password" required minlength="8" maxlength="200" autocomplete="new-password"></label><label>Repita a senha<input name="confirm" type="password" required minlength="8" autocomplete="new-password"></label><label class="terms-check"><input type="checkbox" name="terms" required><span>Li e aceito os <a class="link" href="#termos" target="_blank">Termos de Uso</a> e a <a class="link" href="#privacidade" target="_blank">Política de Privacidade</a>, e só vou publicar conteúdo que eu tenho direito de publicar.</span></label><button class="btn">Criar conta</button><p id="form-error" class="error" role="alert"></p></form><p>Já tem conta? <a class="link" href="#entrar">Entrar</a></p></div>`;
 $('#register-form').onsubmit=async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button');btn.disabled=true;try{const f=new FormData(e.currentTarget);if(f.get('password')!==f.get('confirm'))throw Error('As senhas não coincidem.');await api('/register','POST',{name:f.get('name'),email:f.get('email'),password:f.get('password')});toast('Conta criada! Bem-vinda(o) à comunidade.');location.hash='#painel'}catch(err){formError(err)}finally{btn.disabled=false}};
}

// ------------------------------------------------------------------
// Minha conta
// ------------------------------------------------------------------
function account(){
 const me=state.me;
 app.innerHTML=`<a class="back" href="#painel">← ${panelTitle()}</a><div class="intro"><div><span class="eyebrow">${state.admin?'Administração':'Conta da comunidade'}</span><h1>Minha conta</h1><p>${esc(me.email)}</p></div></div>
 <form class="form-panel" id="name-form"><h2>Nome público</h2><label>Nome ou pseudônimo<input name="name" required minlength="2" maxlength="60" value="${esc(me.name)}"></label><button class="btn">Salvar nome</button><p id="name-status" class="hint" role="status"></p></form>
 <form class="form-panel" id="password-form"><h2>Trocar senha</h2><label>Senha atual<input name="current" type="password" required autocomplete="current-password"></label><label>Nova senha (mínimo 8 caracteres)<input name="password" type="password" required minlength="8" maxlength="200" autocomplete="new-password"></label><label>Repita a nova senha<input name="confirm" type="password" required autocomplete="new-password"></label><button class="btn">Trocar senha</button><p id="password-status" class="hint" role="status"></p></form>
 ${state.admin?'':`<section class="form-panel danger-zone"><h2>Apagar minha conta</h2><p class="hint">Apaga a sua conta e <b>todas as obras, capítulos e imagens</b> que você adicionou. Não dá para desfazer.</p><form id="delete-form"><label>Confirme com sua senha<input name="password" type="password" required autocomplete="current-password"></label><button class="btn secondary danger">Apagar minha conta e minhas obras</button><p id="delete-status" class="error" role="alert"></p></form></section>`}`;
 $('#name-form').onsubmit=async e=>{e.preventDefault();const s=$('#name-status');try{await api('/me','PUT',{name:new FormData(e.currentTarget).get('name')});s.textContent='Nome atualizado.';await refresh()}catch(err){s.textContent=err.message}};
 $('#password-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),s=$('#password-status');try{if(f.get('password')!==f.get('confirm'))throw Error('As senhas novas não coincidem.');await api('/me/password','POST',{current:f.get('current'),password:f.get('password')});e.currentTarget.reset();s.textContent='Senha trocada. As outras sessões foram encerradas.'}catch(err){s.textContent=err.message}};
 $('#delete-form')?.addEventListener('submit',async e=>{e.preventDefault();const s=$('#delete-status');const count=myBooks().length;if(!confirm(`Apagar sua conta e ${count} obra(s)? Esta ação não pode ser desfeita.`))return;try{await api('/me','DELETE',{password:new FormData(e.currentTarget).get('password')});toast('Conta apagada.');location.hash='#inicio'}catch(err){s.textContent=err.message}});
}

// ------------------------------------------------------------------
// Usuários (somente administração)
// ------------------------------------------------------------------
async function usersScreen(){
 const data=await api('/users');
 const date=d=>new Date(d).toLocaleDateString('pt-BR');
 const missing=data.admin_emails.filter(e=>!data.users.some(u=>u.email.toLowerCase()===e));
 const row=u=>`<article class="admin-row user-row ${u.blocked?'is-blocked':''}"><div><h3>${esc(u.name)} ${u.role==='admin'?'<span class="pill role-pill">Administração</span>':''}${u.blocked?'<span class="pill blocked-pill">Bloqueada</span>':''}</h3><small class="hint">${esc(u.email)} · desde ${date(u.created_at)} · ${u.books} obra(s) · ${u.chapters} capítulo(s)${u.has_password?'':' · sem senha definida'}</small></div><div class="actions"><button class="btn secondary" data-user-reset="${u.id}">Senha provisória</button>${u.role==='admin'?'':`<button class="btn secondary" data-user-block="${u.id}" data-blocked="${u.blocked?1:0}">${u.blocked?'Desbloquear':'Bloquear'}</button><button class="btn secondary danger" data-user-delete="${u.id}">Apagar</button>`}</div></article>`;
 app.innerHTML=`<a class="back" href="#painel">← ${panelTitle()}</a><section class="intro"><div><span class="eyebrow">Administração</span><h1>Usuários</h1><p>${data.users.length} conta(s). A administração pode editar e apagar qualquer obra; as demais contas só mexem no que adicionaram.</p></div></section>
 <section class="form-panel"><h2>E-mails da administração</h2><p class="hint">Estes e-mails têm acesso total e são reservados (ninguém consegue se cadastrar com eles). A lista fica em <code>server.mjs</code> (ou na variável <code>MAKORINI_ADMIN_EMAILS</code>).</p><ul class="admin-email-list">${data.admin_emails.map(e=>`<li>${esc(e)} ${missing.includes(e)?`<button class="btn secondary" data-create-admin="${esc(e)}">Criar conta com senha provisória</button>`:'<span class="hint">✓ conta criada</span>'}</li>`).join('')}</ul><p id="temp-password" class="notice" hidden role="status"></p></section>
 <section class="form-panel"><h2>Criar conta para alguém</h2><form id="create-user" class="form-grid"><label>Nome<input name="name" maxlength="60" placeholder="Opcional"></label><label>E-mail<input name="email" type="email" required maxlength="200"></label><button class="btn">Criar com senha provisória</button></form></section>
 <div class="toolbar"><input id="user-search" type="search" placeholder="Buscar por nome ou e-mail…" aria-label="Buscar usuário"></div><div id="user-list">${data.users.map(row).join('')}</div><p id="users-error" class="error" role="alert"></p>`;
 const showPassword=(email,pass)=>{const el=$('#temp-password');el.hidden=false;el.innerHTML=`Senha provisória de <b>${esc(email)}</b>: <code class="temp-pass">${esc(pass)}</code><br><small>Copie e entregue a essa pessoa por um canal seguro. Ela não aparecerá de novo. Peça para trocar em “Minha conta” depois de entrar.</small>`;el.scrollIntoView({block:'center'})};
 const fail=e=>{$('#users-error').textContent=e.message};
 const create=async(email,name)=>{try{const r=await api('/users','POST',{email,name});await usersScreen();showPassword(email,r.password)}catch(e){fail(e)}};
 app.querySelectorAll('[data-create-admin]').forEach(b=>b.onclick=()=>create(b.dataset.createAdmin,''));
 $('#create-user').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget);create(f.get('email'),f.get('name'))};
 $('#user-search').oninput=e=>{const q=e.target.value.toLowerCase();$('#user-list').innerHTML=data.users.filter(u=>(u.name+' '+u.email).toLowerCase().includes(q)).map(row).join('')||'<p class="hint">Nenhum usuário encontrado.</p>';bind()};
 function bind(){
  app.querySelectorAll('[data-user-reset]').forEach(b=>b.onclick=async()=>{const u=data.users.find(x=>x.id===Number(b.dataset.userReset));if(!confirm(`Gerar uma senha provisória para ${u.email}? A senha atual deixa de funcionar e a pessoa é desconectada.`))return;try{const r=await api(`/users/${u.id}/reset-password`,'POST',{});showPassword(u.email,r.password)}catch(e){fail(e)}});
  app.querySelectorAll('[data-user-block]').forEach(b=>b.onclick=async()=>{const blocked=b.dataset.blocked!=='1';const u=data.users.find(x=>x.id===Number(b.dataset.userBlock));if(blocked&&!confirm(`Bloquear ${u.email}? A pessoa é desconectada e não consegue entrar. As obras dela continuam no site (você pode ocultá-las editando cada uma).`))return;try{await api('/users/'+u.id,'PUT',{blocked});await usersScreen()}catch(e){fail(e)}});
  app.querySelectorAll('[data-user-delete]').forEach(b=>b.onclick=async()=>{const u=data.users.find(x=>x.id===Number(b.dataset.userDelete));let books='delete';if(u.books){const keep=confirm(`${u.email} tem ${u.books} obra(s).\n\nOK = TRANSFERIR as obras para a sua conta e apagar só a conta.\nCancelar = escolher apagar tudo.`);if(keep)books='transfer';else if(!confirm(`Apagar a conta de ${u.email} E TODAS as ${u.books} obra(s), capítulos e imagens? Não dá para desfazer.`))return}else if(!confirm(`Apagar a conta de ${u.email}?`))return;try{await api('/users/'+u.id,'DELETE',{books});toast('Conta apagada.');await refresh();await usersScreen()}catch(e){fail(e)}});
 }
 bind();
}
