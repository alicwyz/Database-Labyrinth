let ui;

async function setup() {
  createCanvas(windowWidth, windowHeight);
  frameRate(24);
  
  ui = new UI();
  
  background(220);
  textAlign(CENTER);
  textSize(16);
  stroke(100)
  
  text("Carregando...", width/2, height/2);
  
  await ui.initLinks();
}

function draw() {
  ui.run();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}