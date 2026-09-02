// Módulo de sensor
class SensorData {
  // Variáveis gerais
  constructor() {
    // Permissão para acessar dispositivo?
    this.permissionGranted = false;

    // Dados do acelerômetro
    // Em vez de um limiar fixo sobre a magnitude bruta (que assume o celular
    // sempre na mesma orientação), acompanhamos uma linha de base com um
    // filtro low pass e detectamos passos como desvios (picos) acima dela.
    // Isso funciona independente de como o celular está sendo segurado.
    this.smoothedMagnitude = 9.8; // linha de base (~gravidade em repouso)
    // alpha baixo -> linha de base reage devagar, então a oscilação real de
    // andar (que não é um pico isolado, e sim um vaivém contínuo) não é
    // "perseguida" e cancelada pelo próprio filtro.
    this.baselineFilterAlpha = 0.05; // 0..1, quanto maior mais rápido a linha de base se adapta
    // Preferimos contar passos demais a contar de menos: limiares mais
    // baixos, então balançar o celular ainda dispara passos, mas andar
    // normal também passa a ser detectado.
    this.stepThreshold = 0.9; // desvio acima da linha de base para contar um passo
    this.stepReleaseThreshold = 0.35; // precisa cair abaixo disso para permitir o próximo passo
    this.aboveThreshold = false; // detecção por borda (evita contar o mesmo pico várias vezes)
    this.lastStepTime = 0;
    this.stepCooldown = 350; //ms

    // Dados de direção
    this.currentHeading = 0; //(0 - 360 = Norte)
    this.headingSmoothing = 0.15;

    // Distância percorrida
    this.STEP_LENGTH = 0.75;
    this.displacement = { x: 0, y: 0 };
  }

  // Permissão para usar dispositivo
  requestPermission() {
    console.log("Requesting permission...");

    // Testa se DeviceMotion está disponível
    if (
      typeof DeviceMotionEvent === "undefined" ||
      typeof DeviceOrientationEvent === "undefined"
    ) {
      console.log("Motion sensors not available");
      return false;
    }

    // O navegador é firefox? (não tem suporte)
    if (navigator.userAgent.toLowerCase().includes("firefox")) {
      console.log("Firefox is not supported");
      return false;
    }

    // Usando celular?
    if (!navigator.userAgent.toLowerCase().includes("mobile")) {
      console.log("DeviceMotion only available on mobile devices");
      return false;
    }

    // iOS 13+ pede permissao
    if (typeof DeviceMotionEvent.requestPermission === "function") {
      DeviceMotionEvent.requestPermission()
        .then((response) => {
          console.log("DeviceMotion permission:", response);

          if (response !== "granted") {
            return false;
          }
        })
        .catch((err) => {
          console.error("Error requesting DeviceMotion:", err);
          return false;
        });

      if (typeof DeviceOrientationEvent.requestPermission === "function") {
        DeviceOrientationEvent.requestPermission()
          .then((response) => {
            console.log("DeviceOrientation permission:", response);
          })
          .catch((err) => {
            console.error("Error requesting DeviceOrientation", err);
            return false;
          });
      }
    }

    this.permissionGranted = true;
    this.setupSensors();
    console.log("Listening to sensors!");

    return true;
  }

  // Associa eventos a funções
  setupSensors() {
    window.addEventListener("devicemotion", (ev) => this.handleMotion(ev));
    window.addEventListener("deviceorientationabsolute", (ev) =>
      this.handleOrientation(ev)
    );
    window.addEventListener("deviceorientation", (ev) =>
      this.handleOrientation(ev)
    );
  }

  // Responde ao acelerômetro
  handleMotion(event) {
    // Usa aceleração sem gravidade quando disponível; senão cai para o
    // total (com gravidade) e deixa o filtro passa-baixa abaixo absorver
    // a parcela constante da gravidade, seja qual for a orientação do aparelho.
    const acc = event.acceleration || event.accelerationIncludingGravity;

    // Dados disponíveis?
    if (!acc || acc.x === null) {
      console.log("No acceleration data available");
      return;
    }

    // Magnitude do movimento (invariante à orientação do aparelho)
    const { x, y, z } = acc;
    const magnitude = sqrt(x * x + y * y + z * z);

    // Linha de base adaptativa: acompanha devagar o "repouso" atual
    // (gravidade + tendência de baixa frequência), independente de como
    // o celular está sendo carregado.
    this.smoothedMagnitude =
      this.smoothedMagnitude * (1 - this.baselineFilterAlpha) +
      magnitude * this.baselineFilterAlpha;

    const deviation = magnitude - this.smoothedMagnitude;

    const currentTime = millis();
    const timeSinceLastStep = currentTime - this.lastStepTime;

    // Detecção por borda: só conta um novo passo depois que o sinal
    // voltou a cair, evitando contar o mesmo pico várias vezes.
    if (
      !this.aboveThreshold &&
      deviation > this.stepThreshold &&
      timeSinceLastStep > this.stepCooldown
    ) {
      this.aboveThreshold = true;
      this.lastStepTime = currentTime;
      //console.log("STEP DETECTED!");

      // Deslocamento
      const headingRad = radians(this.currentHeading);
      const dx = this.STEP_LENGTH * sin(headingRad);
      const dy = this.STEP_LENGTH * cos(headingRad);

      this.displacement.x += dx;
      this.displacement.y += dy;
    } else if (deviation < this.stepReleaseThreshold) {
      this.aboveThreshold = false;
    }
  }

  // Responde à orientação
  handleOrientation(event) {
    let heading = null;

    // iOS webkit
    if (event.webkitCompassHeading !== undefined) {
      heading = event.webkitCompassHeading;
    } else if (event.alpha !== null) {
      heading = event.absolute ? 360 - event.alpha : this.compassHeading(event.alpha, event.beta, event.gamma);
    }

    // (heading pode ser 0, então comparamos com null/undefined, não com falsy)
    if (heading !== null && heading !== undefined && !isNaN(heading)) {
      // Interpolação circular para evitar saltos de 360° -> 0°
      this.currentHeading = this.lerpAngle(
        this.currentHeading,
        heading,
        this.headingSmoothing
      );
    }
  }

  // Interpola entre dois ângulos (graus) pelo caminho mais curto do círculo
  lerpAngle(from, to, amt) {
    let delta = ((to - from + 540) % 360) - 180; // diferença no intervalo [-180, 180)
    return (from + delta * amt + 360) % 360;
  }

  //Conversor eixos em orientação: stackoverflow.com
  compassHeading(alpha, beta, gamma) {
    // Convert degrees to radians
    let alphaRad = radians(alpha);
    let betaRad = radians(beta);
    let gammaRad = radians(gamma);

    // Calculate equation components
    let cA = cos(alphaRad);
    let sA = sin(alphaRad);
    let cB = cos(betaRad);
    let sB = sin(betaRad);
    let cG = cos(gammaRad);
    let sG = sin(gammaRad);

    // Calculate A, B, C rotation components
    let rA = -cA * sG - sA * sB * cG;
    let rB = -sA * sG + cA * sB * cG;
    let rC = -cB * cG;

    // Calculate compass heading
    let compassHeading = atan(rA / rB);

    // Convert from half unit circle to whole unit circle
    if (rB < 0) {
      compassHeading += PI;
    } else if (rA < 0) {
      compassHeading += 2 * PI;
    }

    // Convert radians to degrees
    return degrees(compassHeading);
  }
}
