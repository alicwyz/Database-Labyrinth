// Módulo de sensor
class SensorData {
  // Variáveis gerais
  constructor() {
    // Permissão para acessar dispositivo?
    this.permissionGranted = false;

    // Dados do acelerômetro
    this.stepThreshold = 1.75;
    this.lastStepTime = 0;
    this.steepCooldown = 500; //ms

    // Dados de direção
    this.currentHeading = 0; //(0 - 360 = Norte)

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
    // Testa se o acelerômetro inclui gravidade
    let acc;
    if (!event.acceleration) {
      acc = event.accelerationIncludingGravity;
      acc.z -= 9.8;
    } else {
      acc = event.acceleration;
    }

    // Dados disponíveis?
    if (!acc) {
      console.log("No acceleration data available");
      return;
    }

    // Magnitude do movimento
    const { x, y, z } = acc;
    const magnitude = sqrt(x * x + y * y + z * z);
    const currentTime = millis();
    const timeSinceLastStep = currentTime - this.lastStepTime;

    // Limiar de passo
    if (
      magnitude > this.stepThreshold &&
      timeSinceLastStep > this.steepCooldown
    ) {
      this.lastStepTime = currentTime;
      //console.log("STEP DETECTED!");

      // Deslocamento
      const headingRad = radians(this.currentHeading);
      const dx = this.STEP_LENGTH * sin(headingRad);
      const dy = this.STEP_LENGTH * cos(headingRad);

      this.displacement.x += dx;
      this.displacement.y += dy;
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

    if (heading) {
      // Interpolação para evitar spikes nos dados
      this.currentHeading = lerp(this.currentHeading, heading, 0.05);
    }
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
