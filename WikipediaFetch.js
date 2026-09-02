// Módulo artigos da Wikipeda
class WikipediaFetch {
  constructor() {
    // Wikipedia API
    this.LINKS_PER_PAGE = 4; //Número de links para selecionar

    // Cache
    this.pageCache = {};

    // Fetches em andamento (evita pedidos duplicados para o mesmo título)
    this.pendingFetches = {};
  }

  // Um título já está pronto para uso (título + extrato + links)?
  isCached(title) {
    return !!this.pageCache[title];
  }

  // Garante que a página está (ou vai ficar) no cache.
  // Chamadas repetidas para o mesmo título compartilham o mesmo fetch.
  fetchPageByTitle(title) {
    if (this.pageCache[title]) {
      return Promise.resolve(this.pageCache[title]);
    }

    if (this.pendingFetches[title]) {
      return this.pendingFetches[title];
    }

    const promise = this.loadPage(title).finally(() => {
      delete this.pendingFetches[title];
    });

    this.pendingFetches[title] = promise;
    return promise;
  }

  // Busca de fato o título + extrato + links, em paralelo
  async loadPage(title) {
    console.log(`Fetching page: ${title}`);

    // Fetch -> Título + primeiro parágrafo
    const summaryUrl = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      title
    )}`;

    // Hyperlinks da página
    const linksUrl = `https://pt.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      title
    )}&prop=links&pllimit=50&format=json&origin=*`;

    // As duas requisições não dependem uma da outra -> em paralelo
    const [summaryResponse, linksResponse] = await Promise.all([
      fetch(summaryUrl),
      fetch(linksUrl),
    ]);
    const [summaryData, linksData] = await Promise.all([
      summaryResponse.json(), //.title, .extract
      linksResponse.json(), //query.pages.links
    ]);

    // Extrair páginas
    const pages = linksData.query.pages;
    const pageId = Object.keys(pages)[0];
    const rawLinks = pages[pageId].links || [];

    // Filtra os links
    const validLinks = this.filterValidLinks(rawLinks);
    //console.log(`Found ${validLinks.length} valid links`);

    const selectedLinks = validLinks
      .map((value) => ({ value, sort: random(1) }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ value }) => value)
      .slice(0, this.LINKS_PER_PAGE);
    // .ns .title

    // Cria página para o cache
    const page = {
      title: summaryData.title || "Sem título disponível",
      extract: summaryData.extract || "Sem descrição disponível",
      links: selectedLinks
    };

    this.pageCache[title] = page;
    console.log("Page loaded successfully!");

    return page;
  }

  // Verifica se o hyperlink é válido
  filterValidLinks(rawLinks) {
    // Filtra páginas meta etc
    const invalidPrefixes = [
      "Wikipédia:",
      "Ajuda:",
      "Predefinição",
      "Categoria:",
      "Arquivo:",
      "Portal:",
      "Especial:",
      "Discussão:",
      "Usuário:",
      "Módulo:",
      "MediaWiki:",
      "Livro:",
    ];

    let validLinks = [];

    // Filtra cada link por prefixo e tamanho
    for (let link of rawLinks) {
      const title = link.title;

      let isValid = true;
      for (let prefix of invalidPrefixes) {
        if (title.startsWith(prefix)) {
          isValid = false;
          break;
        }
      }

      if (isValid && title.length > 2) {
        validLinks.push(title);
      }
    }

    return validLinks;
  }

  // Adiciona uma página aleatória
  async fetchRandomPage() {
    console.log("Fetching random page...");

    try {
      // API página aleatória
      const randomUrl = `https://pt.wikipedia.org/api/rest_v1/page/random/summary`;
      const response = await fetch(randomUrl);
      const data = await response.json();

      await this.fetchPageByTitle(data.title);
      return data.title;

    } catch (error) {
      console.error("Error fetching random page:", error);
      return null;
    }
  }
}
