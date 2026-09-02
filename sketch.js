let ui;

async function setup() {
  createCanvas(windowWidth, windowHeight);
  frameRate(30);

  ui = new UI("Banco de dados");
  ui.renderBootScreen("Carregando");

  await ui.initLinks();
}

function draw() {
  ui.run();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}