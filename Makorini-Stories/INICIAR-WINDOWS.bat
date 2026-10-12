@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Instale Node.js 24 ou superior em https://nodejs.org/ e abra este arquivo novamente.
 pause
 exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<24)process.exit(1)"
if errorlevel 1 (
 echo Atualize o Node.js para a versao 24 ou superior: https://nodejs.org/
 pause
 exit /b 1
)
echo Makorini Stories - biblioteca pessoal
echo Abra http://localhost:3000 no navegador.
echo Mantenha esta janela aberta enquanto usa o sistema.
node server.mjs
pause
