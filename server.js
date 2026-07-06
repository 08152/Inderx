const express = require('express');
const cors = require('cors');
const { decode } = require('html-entities');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS erlauben, damit Ihre HTML-Seite mit dem Server sprechen darf
app.use(cors());
app.use(express.json());

// Statische HTML-Dateien ausliefern
app.use(express.static(__dirname));

// Die Such-Funktion für das echte Internet
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Kein Suchbegriff angegeben.' });

    try {
        // Nutzen eines freien, unzensierten HTML-Such-Gateways (SearXNG/Google-Scraper-Format)
        const searchUrl = `https://duckduckgo.com{encodeURIComponent(query)}`;
        
        const response = await fetch(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        if (!response.ok) throw new Error('Netzwerk-Antwort war nicht im grünen Bereich.');
        const html = await response.text();

        const webResults = [];
        let firstDefinition = '';

        // Extrem schneller, serverseitiger Text-Filter für URLs und Titel
        // Filtert Muster wie: <a class="result__url" href="URL"> und <a class="result__snippet">
        const resultBlocks = html.split('class="result__body"');
        
        // Die ersten 5 saubersten Ergebnisse herausschneiden
        for (let i = 1; i < Math.min(resultBlocks.length, 6); i++) {
            const block = resultBlocks[i];
            
            // URL extrahieren
            const urlMatch = block.match(/href="([^"]+)"/);
            // Titel extrahieren
            const titleMatch = block.match(/class="result__snippet"[^>]*>([^<]+)</);
            // Beschreibung extrahieren
            const snippetMatch = block.match(/class="result__snippet"[^>]*>([^<]+)</) || block.match(/<a class="result__url"[^>]*>([^<]+)</);

            if (urlMatch && urlMatch[1]) {
                // Bereinigen von DuckDuckGo-Redirect-Pfaden, falls vorhanden
                let finalUrl = urlMatch[1];
                if (finalUrl.includes('uddg=')) {
                    finalUrl = decodeURIComponent(finalUrl.split('uddg=')[1].split('&')[0]);
                }

                // Erste gefundene Beschreibung als Definition nutzen
                const rawSnippet = snippetMatch ? snippetMatch[1].trim() : 'Keine Vorschau verfügbar.';
                const cleanSnippet = decode(rawSnippet);

                if (i === 1) {
                    firstDefinition = `Automatische Web-Definition für "${query}": ` + cleanSnippet;
                }

                const rawTitle = titleMatch ? titleMatch[1].trim() : 'Webseite';

                webResults.push({
                    titel: decode(rawTitle),
                    url: finalUrl,
                    text: cleanSnippet
                });
            }
        }

        if (webResults.length === 0) {
            firstDefinition = `Keine direkten Einträge im Web-Index für "${query}" gefunden.`;
        }

        // Daten an die HTML-KI zurücksenden
        res.json({
            definition: firstDefinition,
            links: webResults
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Das Internet konnte nicht durchforstet werden.' });
    }
});

app.listen(PORT, () => {
    console.log(`Indexer-Server läuft auf Port ${PORT}`);
});
