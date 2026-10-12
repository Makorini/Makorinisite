#!/bin/sh
cd "$(dirname "$0")" || exit 1
node -e 'if(Number(process.versions.node.split(".")[0])<24)process.exit(1)' || { echo 'Instale Node.js 24 ou superior: https://nodejs.org/'; exit 1; }
node server.mjs
