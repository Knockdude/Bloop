async function executeSearch() {
  const queryInput = document.getElementById('query');
  const q = queryInput.value.trim();
  if (!q) return;

  const aiText = document.getElementById('aiText');
  const imageGrid = document.getElementById('imageGrid');
  const resultsList = document.getElementById('resultsList');

  aiText.innerText = "Consultando fuentes web en tiempo real y procesando síntesis...";
  imageGrid.innerHTML = "";
  resultsList.innerHTML = "Cargando resultados...";

  try {

    const wikiUrl = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&origin=*`;
    const response = await fetch(wikiUrl);
    const data = await response.json();

    resultsList.innerHTML = "";
    const searchResults = [];

    if (data.query && data.query.search.length > 0) {
      data.query.search.slice(0, 5).forEach((item, index) => {
        const cleanSnippet = item.snippet.replace(/<\/?[^>]+(>|$)/g, "");
        const pageUrl = `https://es.wikipedia.org/wiki/${encodeURIComponent(item.title)}`;
        
        searchResults.push({ title: item.title, snippet: cleanSnippet, url: pageUrl });

        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `<h4>${item.title}</h4><p>${cleanSnippet}...</p>`;
        card.onclick = () => openInBrowser(pageUrl);
        resultsList.appendChild(card);

        
        if (index === 0) openInBrowser(pageUrl);
      });
    } else {
      resultsList.innerHTML = "<p style='color:var(--muted);'>No se encontraron resultados para esta búsqueda.</p>";
    }

    // 2. Render de imágenes dinámicas
    const images = [
      `https://picsum.photos/seed/${encodeURIComponent(q)}1/400/300`,
      `https://picsum.photos/seed/${encodeURIComponent(q)}2/400/300`,
      `https://picsum.photos/seed/${encodeURIComponent(q)}3/400/300`
    ];

    images.forEach(url => {
      const img = document.createElement('img');
      img.src = url;
      imageGrid.appendChild(img);
    });

    
    aiText.innerText = generateAISummary(q, searchResults);

  } catch (err) {
    aiText.innerText = "Error obteniendo datos de la red.";
  }
}


function generateAISummary(prompt, results) {
  if (results.length === 0) {
    return `### Resumen de IA\nNo se localizó información suficiente sobre "${prompt}".`;
  }

  let summary = `### Resumen de Inteligencia Artificial para "${prompt}"\n\n`;
  summary += `Puntos clave extraídos de las fuentes web:\n\n`;

  results.forEach(res => {
    summary += `• **${res.title}**: ${res.snippet}.\n`;
  });

  summary += `\n*Puedes interactuar con las tarjetas del listado para abrir los sitios directamente en el panel navegable de la derecha.*`;

  return summary;
}

// Abrir página en el Iframe
function openInBrowser(url) {
  document.getElementById('browserUrl').innerText = url;
  document.getElementById('webFrame').src = url;
}