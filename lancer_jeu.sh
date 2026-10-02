#!/bin/sh
# Lance le jeu « Le Donjon des Os » dans le navigateur (nécessite Python 3).
cd "$(dirname "$0")/game" || exit 1
URL=http://localhost:8000
( sleep 1; (command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") ) &
python3 -m http.server 8000
