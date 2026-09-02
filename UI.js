// Classe principal da interface
class UI {

  // Estados do aplicativo
  static get States() {
    return {
      AskingPermission: 0,
      Walking: 1,
      MotionError: 2,
      APIError: 3,
    };
  }

  // Direções cardinais
  static get CardinalDirection() {
    return {
      North: 0,
      East: 1,
      South: 2,
      West: 3,
    };
  }

  // Paleta de cores do tema (preto, branco e cinzas)
  static get Theme() {
    return {
      background: [10, 10, 13],
      text: [230, 230, 230],
      textMuted: [135, 135, 135],
      textDim: [60, 60, 60],
    };
  }

  static get FontTitle() {
    return "'JetBrains Mono', monospace";
  }

  static get FontBody() {
    return "'Lora', Georgia, serif";
  }

  constructor(title) {
    // Instâncias dos módulos
    this.wikipedia = new WikipediaFetch();
    this.sensors = new SensorData();

    // Enum de estados
    this.currentState = UI.States.AskingPermission;

    // Estado do sensor
    this.LINK_DISTANCE = 5.0; //metros
    this.lastLinkPos = { x: 0, y: 0 };
    this.curCardinalHeading = UI.CardinalDirection.North;
    this.lastLinkHeading = UI.CardinalDirection.North;

    // Estado da wikipedia
    this.curLinkTitle = title;
    this.lastLinkTitle = null;
    this.closestLink = null;
    this.distanceFromLast = 0.0;
    this.curLinkConnections = [];

    // Evita que uma navegação atrasada sobrescreva uma mais recente
    this.loadGeneration = 0;
  }

  // Inicializa o link atual e suas conexões
  async initLinks() {
    const generation = ++this.loadGeneration;

    try {
      await this.wikipedia.fetchPageByTitle(this.curLinkTitle);

      const connections = [...this.wikipedia.pageCache[this.curLinkTitle].links];

      // Busca todas as conexões em paralelo (bem mais rápido que uma por vez)
      await Promise.all(
        connections.map((link) => this.wikipedia.fetchPageByTitle(link))
      );

      // Preenche com páginas aleatórias se faltar alguma direção
      while (connections.length < 4) {
        const randomTitle = await this.wikipedia.fetchRandomPage();
        if (randomTitle !== null) {
          connections.push(randomTitle);
        }
      }

      // Uma navegação mais recente já começou enquanto isso rodava? Descarta.
      if (generation !== this.loadGeneration) return;

      this.curLinkConnections = connections;

      // Adianta em segundo plano os links dos vizinhos, sem bloquear a UI,
      // para que a próxima transição já encontre tudo pronto no cache.
      this.prefetchNeighbors();
      
    } catch (error) {
      console.error("Failed to initialize links:", error);
      this.currentState = UI.States.APIError;
    }
  }

  // Busca (sem aguardar) os links de cada vizinho da posição atual
  prefetchNeighbors() {
    for (const title of this.curLinkConnections) {
      const neighbor = this.wikipedia.pageCache[title];
      if (!neighbor) continue;

      for (const nextTitle of neighbor.links) {
        this.wikipedia.fetchPageByTitle(nextTitle);
      }
    }
  }

  // O conteúdo necessário para desenhar o quadro atual já está no cache?
  isContentReady() {
    if (!this.wikipedia.pageCache[this.curLinkTitle]) return false;
    if (this.closestLink && !this.wikipedia.pageCache[this.closestLink]) return false;
    return true;
  }

  // Testa se o aparelho é compatível
  askPermission() {
    if (!this.sensors.requestPermission()) {
      this.currentState = UI.States.MotionError;
    } else {
      this.currentState = UI.States.Walking;
    }
  }

  run() {
    // AskPermission -> Clicar na tela para pedir permissão
    // Walk -> Anda e navega entre links
    // Errors -> Mostra mensagem de erro

    if (this.currentState == UI.States.AskingPermission) {
      if (mouseIsPressed) {
        this.askPermission();
      }
    } else if (this.currentState == UI.States.Walking) {
      this.updateLinks();
    }

    this.render();
  }

  updateLinks() {
    // Atualiza posição
    const curPos = this.sensors.displacement;

    const dispX = curPos.x - this.lastLinkPos.x;
    const dispY = curPos.y - this.lastLinkPos.y;
    const dispTotal = sqrt(dispX * dispX + dispY * dispY);

    const curHeading = degrees(atan2(dispY, dispX)) + 180;
    this.curCardinalHeading = this.cardinalFromHeading(curHeading);

    // Passou do limite?
    if (dispTotal > this.LINK_DISTANCE) {
      this.lastLinkPos = {x: curPos.x, y: curPos.y};
      this.distanceFromLast = 0.0;

      // Qual o próximo link?
      // Primeira conexão? (sem volta) ou outra direção
      if (
        this.lastLinkTitle === null ||
        this.curCardinalHeading != (this.lastLinkHeading + 2) % 4
      ) {
        this.lastLinkTitle = this.curLinkTitle;
        this.curLinkTitle = this.curLinkConnections[this.curCardinalHeading];

        // Voltando
      } else {
        const curTitle = this.curLinkTitle;
        this.curLinkTitle = this.lastLinkTitle;
        this.lastLinkTitle = curTitle;
      }

      this.lastLinkHeading = this.curCardinalHeading;
      this.closestLink = this.curLinkTitle;

      // Roda em segundo plano: o título atual já está no cache (foi um dos
      // vizinhos pré-carregados), então a tela não precisa esperar por isso.
      this.initLinks();
      return;
    }

    // Não passou do limite -> Meio Termo

    this.distanceFromLast = dispTotal;

    // Qual é o mais próximo
    // Primeira conexão? (sem volta) ou outra direção
    if (
      this.lastLinkTitle === null ||
      this.curCardinalHeading != (this.lastLinkHeading + 2) % 4
    ) {
      this.closestLink = this.curLinkConnections[this.curCardinalHeading];

      // Voltando
    } else {
      this.closestLink = this.lastLinkTitle;
    }
  }

  // ---------------------------------------------------------------------
  // Renderização
  // ---------------------------------------------------------------------

  render() {
    this.paintBackground();

    if (this.currentState == UI.States.AskingPermission) {
      this.renderPermissionScreen();
    } else if (this.currentState == UI.States.Walking) {
      this.renderWalkingScreen();
    } else if (this.currentState == UI.States.APIError) {
      this.renderMessageScreen(
        "Erro na API",
        "Não foi possível carregar os artigos da Wikipédia.\nCheque sua conexão e o console."
      );
    } else if (this.currentState == UI.States.MotionError) {
      this.renderMessageScreen(
        "Sensor não suportado",
        "Este navegador ou dispositivo não oferece suporte\naos sensores de movimento necessários."
      );
    }
  }

  // Usado também pela tela de carregamento inicial, antes do primeiro frame
  renderBootScreen(message) {
    this.paintBackground();
    this.renderPulsingMessage(message);
  }

  paintBackground() {
    background(...UI.Theme.background);
  }

  renderPermissionScreen() {
    const theme = UI.Theme;
    const cx = width / 2;
    const cy = height / 2;

    // Nota: quando text() recebe uma largura de quebra, x/y viram o canto
    // superior esquerdo da caixa (mesmo com textAlign CENTER) — por isso a
    // caixa é centralizada manualmente subtraindo metade da sua largura.
    fill(...theme.text);
    noStroke();
    textFont(UI.FontTitle);
    textStyle(BOLD);
    textSize(16);
    textAlign(CENTER, TOP);
    let boxWidth = width - 60;

    // Cursor de terminal piscando (liga/desliga, sem transição suave)
    const cursor = millis() % 1000 < 500 ? "█" : " ";
    text(`> TOQUE NA TELA PARA COMEÇAR ${cursor}`, cx - boxWidth / 2, cy - 14, boxWidth);

    fill(...theme.textMuted);
    textFont(UI.FontBody);
    textStyle(NORMAL);
    textSize(14);
    boxWidth = width - 80;
    text(
      "Ande pelo mundo real para caminhar entre artigos da wikipédia",
      cx - boxWidth / 2,
      cy + 18,
      boxWidth
    );
  }

  renderMessageScreen(title, message) {
    const theme = UI.Theme;
    const cx = width / 2;
    const cy = height / 2;

    fill(...theme.text);
    noStroke();
    textFont(UI.FontTitle);
    textStyle(BOLD);
    textSize(16);
    textAlign(CENTER, TOP);
    let boxWidth = width - 60;
    text(`[!] ${title.toUpperCase()}`, cx - boxWidth / 2, cy - 40, boxWidth);

    // Filete fino separando o título da mensagem, como num terminal
    stroke(...theme.textDim);
    strokeWeight(1);
    line(cx - 70, cy - 12, cx + 70, cy - 12);
    noStroke();

    fill(...theme.textMuted);
    textFont(UI.FontBody);
    textStyle(NORMAL);
    textSize(14);
    textLeading(20);
    boxWidth = width - 80;
    text(message, cx - boxWidth / 2, cy, boxWidth);
  }

  renderPulsingMessage(message) {
    const theme = UI.Theme;

    // Reticências animadas, ao estilo de um terminal esperando uma resposta
    const dotCount = floor(millis() / 400) % 4;
    const dots = ".".repeat(dotCount);

    fill(...theme.textMuted);
    noStroke();
    textFont(UI.FontTitle);
    textStyle(NORMAL);
    textSize(14);
    textAlign(CENTER, CENTER);
    text(message + dots, width / 2, height / 2);
  }

  renderWalkingScreen() {
    if (!this.isContentReady()) {
      this.renderPulsingMessage("Carregando artigos");
      return;
    }

    const theme = UI.Theme;
    const { title, extract } = this.mixTexts();
    if (this.currentState !== UI.States.Walking) return; // mixTexts pode ter mudado o estado

    const margin = 24;
    const topPad = height * 0.12;
    const titleBoxWidth = width - margin * 2;
    const titleLineHeight = 30;

    // Título (com o efeito de "scramble" entre os dois artigos)
    fill(...theme.text);
    noStroke();
    textFont(UI.FontTitle);
    textStyle(BOLD);
    textSize(min(26, width / 15));
    textAlign(CENTER, TOP);
    textLeading(titleLineHeight);

    // Mede quantas linhas o título vai ocupar (o mesmo algoritmo de quebra
    // que text() usa por baixo dos panos) para nunca cravar a régua e o
    // corpo do texto em cima de um título que quebrou em mais de uma linha.
    const titleLines = this.wrapTextLines(title.trim(), titleBoxWidth);
    const titleBottom = topPad + titleLines.length * titleLineHeight;

    // Caixa de largura width-margin*2, centralizada -> canto esquerdo = margin
    text(title.trim(), margin, topPad, titleBoxWidth);

    // Filete abaixo do título, como o cabeçalho de um artigo de wiki
    const ruleY = titleBottom + 16;
    stroke(...theme.textDim);
    strokeWeight(1);
    line(margin, ruleY, width - margin, ruleY);
    noStroke();

    // Área reservada pro rodapé (barra de progresso), pra o texto do artigo
    // nunca poder desenhar por cima dela, não importa o quão longo ele seja.
    const footerHeight = 56;
    const bodyTop = ruleY + 20;
    const bodyBottom = height - footerHeight;

    // Texto do artigo, recortado à área acima — se for mais longo do que
    // cabe, o excesso é cortado em vez de vazar por cima do rodapé.
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(0, bodyTop, width, bodyBottom - bodyTop);
    drawingContext.clip();

    fill(...theme.textMuted);
    textFont(UI.FontBody);
    textStyle(NORMAL);
    textSize(16);
    textAlign(LEFT, TOP);
    textLeading(24);
    text(extract.trim(), margin, bodyTop, width - margin * 2);

    drawingContext.restore();

    // Progresso até o próximo artigo, centralizado no rodapé
    this.drawProgressBar(width / 2, bodyBottom + footerHeight / 2);
  }

  // Quebra um texto em linhas que cabem em maxWidth, usando a fonte/tamanho
  // atualmente configurados — mesma lógica de quebra por palavra que text()
  // usa internamente, mas nos dá o número de linhas de antemão.
  wrapTextLines(str, maxWidth) {
    const words = str.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return [""];

    const lines = [];
    let current = words[0];

    for (let i = 1; i < words.length; i++) {
      const test = `${current} ${words[i]}`;
      if (textWidth(test) > maxWidth) {
        lines.push(current);
        current = words[i];
      } else {
        current = test;
      }
    }
    lines.push(current);

    return lines;
  }

  // Barra de progresso em blocos até a próxima transição
  drawProgressBar(cx, cy) {
    const theme = UI.Theme;
    const factor = constrain(this.distanceFromLast / this.LINK_DISTANCE, 0, 1);

    const barLength = 18;
    const filled = round(factor * barLength);
    const bar = "█".repeat(filled) + "░".repeat(barLength - filled);
    const pct = round(factor * 100);

    fill(...theme.text);
    noStroke();
    textFont(UI.FontTitle);
    textStyle(NORMAL);
    // Acompanha a mesma lógica de escala do título/corpo, em vez de um
    // tamanho fixo, para ficar proporcional em qualquer tamanho de tela.
    textSize(constrain(width / 34, 12, 16));
    textAlign(CENTER, CENTER);
    text(`${bar} ${pct}%`, cx, cy);
  }

  // Direção a partir do ângulo
  cardinalFromHeading(angle) {
    if (angle <= 45 || angle > 315) {
      return UI.CardinalDirection.North;
    } else if (angle > 45 && angle <= 135) {
      return UI.CardinalDirection.East;
    } else if (angle > 135 && angle <= 225) {
      return UI.CardinalDirection.South;
    } else if (angle > 225 && angle <= 315) {
      return UI.CardinalDirection.West;
    }
  }

  // Mistura dois textos
  mixTexts() {
    const factor = constrain(this.distanceFromLast / this.LINK_DISTANCE, 0, 1);

    const pageA = this.wikipedia.pageCache[str(this.curLinkTitle)];

    if (pageA == undefined) {
      this.currentState = UI.States.APIError;
      return {title: "", extract: ""};
    }

    if (this.closestLink == undefined || this.curLinkTitle == this.closestLink) {
      return {title: pageA.title, extract: pageA.extract};
    }

    const pageB = this.wikipedia.pageCache[str(this.closestLink)];

    if (pageB == undefined) {
      // Ainda não chegou (não deveria acontecer graças ao pré-carregamento,
      // mas evita travar caso aconteça)
      return {title: pageA.title, extract: pageA.extract};
    }

    const titleA = pageA.title || "";
    const titleB = pageB.title || "";

    const extractA = pageA.extract || "";
    const extractB = pageB.extract || "";

    const maxLenTitle = max(titleA.length, titleB.length);
    const maxLenExtract = max(extractA.length, extractB.length);

    const scrambleChars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
    const transitionStart = 0.25;
    const transitionEnd = 0.75;

    const localProgress =
      (factor - transitionStart) / (transitionEnd - transitionStart);
    const scrambleChance = localProgress * (1 - localProgress) * 2;

    let resultTitle = "";

    // Título aleatório
    for (let i = 0; i < maxLenTitle; i++) {
      const charA = i < titleA.length ? titleA[i] : " ";
      const charB = i < titleB.length ? titleB[i] : " ";

      // Fora da transição?
      if (factor < transitionStart) {
        resultTitle += charA;
        continue;
      } else if (factor > transitionEnd) {
        resultTitle += charB;
        continue;
      }

      // Dentro da transição
      // Espaços
      if (charA === " " && charB === " ") {
        resultTitle += " ";
      } else if (charA === " " || charB === " ") {
        if (localProgress < 0.5) {
          resultTitle += charA;
        } else {
          resultTitle += charB;
        }
      } else {
        const rScramble = random(1);

        if (rScramble < scrambleChance) {
          const scrambleIndex = floor(random(scrambleChars.length));
          resultTitle += scrambleChars.charAt(scrambleIndex);
          continue;
        }

        const r = random(1);
        if (r < localProgress) {
          resultTitle += charB;
        } else {
          resultTitle += charA;
        }
      }
    }

    let resultExtract = "";

    // Texto aleatório
    for (let i = 0; i < maxLenExtract; i++) {
      const charA = i < extractA.length ? extractA[i] : " ";
      const charB = i < extractB.length ? extractB[i] : " ";

      // Fora da transição?
      if (factor < transitionStart) {
        resultExtract += charA;
        continue;
      } else if (factor > transitionEnd) {
        resultExtract += charB;
        continue;
      }

      // Dentro da transição
      // Espaços
      if (charA === " " && charB === " ") {
        resultExtract += " ";
      } else if (charA === " " || charB === " ") {
        if (localProgress < 0.5) {
          resultExtract += charA;
        } else {
          resultExtract += charB;
        }
      } else {
        const rScramble = random(1);

        if (rScramble < scrambleChance) {
          const scrambleIndex = floor(random(scrambleChars.length));
          resultExtract += scrambleChars.charAt(scrambleIndex);
          continue;
        }

        const r = random(1);
        if (r < localProgress) {
          resultExtract += charB;
        } else {
          resultExtract += charA;
        }
      }
    }

    return { title: resultTitle, extract: resultExtract };
  }
}
