// Módulo artigos da Wikipeda
class WikipediaFetch {
  constructor() {
    // Wikipedia API
    this.LINKS_PER_PAGE = 4; //Número de links para selecionar

    // Cache
    this.pageCache = {};

    // Loading
    this.isLoading = false;
  }

  // Adiciona conteúdos da página ao cache
  async fetchPageByTitle(title) {
    // Checa se está no cache
    if (this.pageCache[title]) {
      this.isLoading = false;
      return;
    }

    console.log(`Fetching page: ${title}`);
    this.isLoading = true;

    // Fetch -> Título + primeiro parágrafo
    const summaryUrl = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      title
    )}`;
    const summaryResponse = await fetch(summaryUrl);
    const summaryData = await summaryResponse.json(); //.title, .extract

    //console.log("Summary fetched", summaryData.title);

    // Hyperlinks da página
    const linksUrl = `https://pt.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      title
    )}&prop=links&pllimit=50&format=json&origin=*`;
    const linksResponse = await fetch(linksUrl);
    const linksData = await linksResponse.json(); //query.pages.links

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

    this.isLoading = false;
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
    this.isLoading = true;
    let returnTitle = null;

    try {
      // API página aleatória
      const randomUrl = `https://pt.wikipedia.org/api/rest_v1/page/random/summary`;
      const response = await fetch(randomUrl);
      const data = await response.json();

      await this.fetchPageByTitle(data.title);
      returnTitle = data.title;
      
    } catch (error) {
      console.error("Error fetching random page:", error);
      this.isLoading = false;
      return returnTitle;
    }

    return returnTitle;
  }
}
