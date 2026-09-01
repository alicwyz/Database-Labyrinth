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

  constructor() {
    // Instâncias dos módulos
    this.wikipedia = new WikipediaFetch();
    this.sensors = new SensorData();

    // Enum de estados
    this.currentState = UI.States.AskingPermission;

    // Estado do sensor
    this.LINK_DISTANCE = 10.0; //metros
    this.lastLinkPos = { x: 0, y: 0 };
    this.curCardinalHeading = UI.CardinalDirection.North;
    this.lastLinkHeading = UI.CardinalDirection.North;

    // Estado da wikipedia
    this.curLinkTitle = "Banco de dados";
    this.lastLinkTitle = null;
    this.closestLink = null;
    this.distanceFromLast = 0.0;
    this.curLinkConnections = [];
    //this.initLinks();
  }

  // Inicializa o link atual e suas conexões
  async initLinks() {
    try {
      await this.wikipedia.fetchPageByTitle(this.curLinkTitle);

      // Adiciona conexões ao cache
      const connections = this.wikipedia.pageCache[this.curLinkTitle].links;
      this.curLinkConnections = [];

      for (let link of connections) {
        this.curLinkConnections.push(link);

        await this.wikipedia.fetchPageByTitle(link);

        // fetch secondary links
        /*
        for (let link2 of this.wikipedia.pageCache[link].links) {
          await this.wikipedia.fetchPageByTitle(link2);
        }
        */
      }
      if (connections.length < 4) {
        for (let i = 0; i < 4 - connections.length; i++) {
          let randomTitle = await this.wikipedia.fetchRandomPage();
          if (randomTitle !== null) {
            this.curLinkConnections.push(randomTitle);
            
            // fetch secondary links
            /*
            for (let link2 of this.wikipedia.pageCache[randomTitle].links) {
              await this.wikipedia.fetchPageByTitle(link2);
            }            
            */
          } else {
            i--;
          }
        }
      }
      
    } catch (error) {
      console.error("Failed to initialize links:", error);
      this.currentState = UI.States.APIError;
      return;
    }
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
    
    //const curHeading = this.sensors.currentHeading; //Mudar -> Orientação em relação ao último ponto
    //this.curCardinalHeading = this.cardinalFromHeading(curHeading);

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

  render() {
    background(220);
    textAlign(CENTER);
    textWrap(WORD);
    textSize(16);
    stroke(100)
    
    //text(`${this.curLinkTitle}, ${this.closestLink}, ${this.distanceFromLast} \n ${this.sensors.displacement.x}, ${this.sensors.displacement.y}`, width/2, 10);
    
    if (this.currentState == UI.States.AskingPermission) {
      
      text("Clique na tela para iniciar...", width/2, height/2);

    } else if (this.currentState == UI.States.Walking) {
      
      //let rads = radians(this.sensors.currentHeading);
      //line(width/2, height * 3/4, width/2 + 20*sin(rads), height*3/4 + 20*cos(rads));
      
      
      if (this.wikipedia.isLoading) {
        
        text("Carregando artigos...", width/2, height/2);
        
      } else {
        
        let {title, extract} = this.mixTexts();
        
        textStyle(BOLD);
        text(title.trim(), width/2, height/8);
        
        textStyle(NORMAL);
        textAlign(LEFT);
        text(extract.trim(), 10, height/4, width-20);
        
      }
      
    } else if (this.currentState == UI.States.APIError) {
      
      let s = "⚠️ Erro na API da Wikipedia! \n (Cheque o console para possíveis erros)";
      text(s, width/2, height/2);
      
    } else if (this.currentState == UI.States.MotionError) {

      let s = "⚠️ Seu dispositivo não tem suporte! \n (Cheque o console para possíveis erros)";
      text(s, width/2, height/2);
      
    }
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
