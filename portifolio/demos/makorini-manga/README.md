# Makorini Manga
Projeto pessoal de estudo, feito com HTML, CSS e JavaScript puro.

## Abrir no computador
Extraia codigo-fonte.zip e abra index.html no navegador. Não é necessário instalar dependências. O código usa fontes externas do Google, com fontes locais de reserva.

## Arquivos
- index.html: estrutura geral e referências aos arquivos.
- style.css: visual, temas e regras responsivas.
- app.js: catálogo `obras`, busca, favoritos, detalhes e leitor.

## Primeiro exercício
1. Abra app.js num editor.
2. Altere `titulo` e `sinopse` do primeiro item de `obras`.
3. Salve e recarregue a página.
4. Confira catálogo e detalhes. Ambos usam o mesmo dado.

## Exercício seguinte
Substitua a função `painel` por imagens suas, usando elementos `<img>` em ordem. A seleção de arquivos já permite experimentar isso temporariamente no leitor.

## Estrutura e limites
Catálogo -> obra -> capítulos -> páginas.
Dados fictícios e capas/painéis SVG originais. As notas são ilustrativas.
Favoritos, tema e progresso persistem em localStorage apenas neste navegador. Limpar os dados do navegador os remove. O comportamento em URLs file:// pode variar; para servir por HTTP local com Python instalado: `python -m http.server 8000`, depois abra http://localhost:8000.
Imagens selecionadas são temporárias e não são enviadas a servidor. Não existe login próprio, banco remoto, painel de publicação, upload permanente nem atualização automática.

## Por que scans se parecem e atualizam rápido?
Temas e plugins podem fornecer interfaces semelhantes. O acervo de cada instalação é independente. Publicação em lote, equipes, agendamento e integrações autorizadas reduzem trabalho. Frequência de atualização não permite concluir qual método um site específico usa.

## Evolução possível
Servidor/API, tabelas obras/capitulos/paginas, armazenamento de imagens e painel autenticado. A importação em lote deve validar tipo/tamanho e ordem das páginas. A publicação agendada precisa de um serviço executando fora do navegador.

## Identidade visual
Azul, roxo e degradês definidos em style.css. A imagem assets/nuvem-azul-roxa.png aparece apenas na tela inicial. Ajuste a opacidade em body.home::before (0.32 no tema claro, 0.075 no escuro). O arquivo da imagem deve permanecer na pasta assets.

O tema escuro usa preto como base, com azul e roxo em realces e degradês.
