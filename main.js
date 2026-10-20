// STATE DATA PLAYER & CUSTOMIZATION
const player = {
  name: "Chef Roti",
  skinColor: "#ffdbac",
  shirtColor: "#e74c3c",
  hatStyle: "standard",
  x: 400,
  y: 300,
  speed: 4,
  size: 24
};

// UI ELEMENTS
const lobbyScreen = document.getElementById("lobby-screen");
const gameScreen = document.getElementById("game-screen");
const previewCanvas = document.getElementById("avatar-preview");
const previewCtx = previewCanvas.getContext("2d");
const gameCanvas = document.getElementById("game-canvas");
const gameCtx = gameCanvas.getContext("2d");

// INPUT ELEMENTS
const nameInput = document.getElementById("player-name");
const skinInput = document.getElementById("skin-color");
const shirtInput = document.getElementById("shirt-color");
const hatSelect = document.getElementById("hat-style");
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");

// KEYBOARD CONTROLS
const keys = {};

// LISTENERS UNTUK KUSTOMISASI
nameInput.addEventListener("input", (e) => {
  player.name = e.target.value || "Chef";
  document.getElementById("local-player-label").innerText = `${player.name} (Host/You)`;
});

skinInput.addEventListener("input", (e) => {
  player.skinColor = e.target.value;
  drawAvatarPreview();
});

shirtInput.addEventListener("input", (e) => {
  player.shirtColor = e.target.value;
  drawAvatarPreview();
});

hatSelect.addEventListener("change", (e) => {
  player.hatStyle = e.target.value;
  drawAvatarPreview();
});

// FUNGSI MENGGAMBAR AVATAR (DIPAKAI DI PREVIEW & GAMEPLAY)
function drawCharacter(ctx, x, y, pData) {
  // 1. Badan / Baju
  ctx.fillStyle = pData.shirtColor;
  ctx.beginPath();
  ctx.arc(x, y + 8, pData.size * 0.8, 0, Math.PI * 2);
  ctx.fill();

  // 2. Kepala / Kulit
  ctx.fillStyle = pData.skinColor;
  ctx.beginPath();
  ctx.arc(x, y - 4, pData.size * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // 3. Topi Koki
  ctx.fillStyle = "#ffffff";
  if (pData.hatStyle === "standard") {
    ctx.fillRect(x - 10, y - 22, 20, 10);
    ctx.beginPath();
    ctx.arc(x, y - 22, 12, 0, Math.PI * 2);
    ctx.fill();
  } else if (pData.hatStyle === "tall") {
    ctx.fillRect(x - 10, y - 32, 20, 20);
    ctx.beginPath();
    ctx.arc(x, y - 32, 12, 0, Math.PI * 2);
    ctx.fill();
  } else if (pData.hatStyle === "bandana") {
    ctx.fillStyle = "#333333";
    ctx.fillRect(x - 11, y - 14, 22, 6);
  }

  // 4. Mata
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(x - 4, y - 5, 2, 0, Math.PI * 2);
  ctx.arc(x + 4, y - 5, 2, 0, Math.PI * 2);
  ctx.fill();

  // 5. Nama Pemain
  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#333333";
  ctx.textAlign = "center";
  ctx.fillText(pData.name, x, y + 32);
}

function drawAvatarPreview() {
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  drawCharacter(previewCtx, previewCanvas.width / 2, previewCanvas.height / 2 + 5, player);
}

// CHAT SYSTEM (LOCAL PROTOTYPE)
document.getElementById("btn-send-chat").addEventListener("click", sendChat);
chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendChat();
});

function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;

  const msgDiv = document.createElement("div");
  msgDiv.innerHTML = `<strong>${player.name}:</strong> ${text}`;
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  chatInput.value = "";
}

// GAMEPLAY & MOVEMENT LOGIC
window.addEventListener("keydown", (e) => (keys[e.key] = true));
window.addEventListener("keyup", (e) => (keys[e.key] = false));

function updateMovement() {
  if (keys["w"] || keys["W"] || keys["ArrowUp"]) player.y -= player.speed;
  if (keys["s"] || keys["S"] || keys["ArrowDown"]) player.y += player.speed;
  if (keys["a"] || keys["A"] || keys["ArrowLeft"]) player.x -= player.speed;
  if (keys["d"] || keys["D"] || keys["ArrowRight"]) player.x += player.speed;

  // Batas Area Canvas
  player.x = Math.max(player.size, Math.min(gameCanvas.width - player.size, player.x));
  player.y = Math.max(player.size, Math.min(gameCanvas.height - player.size, player.y));
}

function drawKitchenEnvironment() {
  // Area Oven
  gameCtx.fillStyle = "#7f8c8d";
  gameCtx.fillRect(100, 20, 200, 50);
  gameCtx.fillStyle = "#ffffff";
  gameCtx.font = "14px sans-serif";
  gameCtx.fillText("🔥 OVEN", 200, 50);

  // Meja Adonan
  gameCtx.fillStyle = "#d35400";
  gameCtx.fillRect(500, 20, 200, 50);
  gameCtx.fillStyle = "#ffffff";
  gameCtx.fillText("🥣 MEJA ADONAN", 600, 50);

  // Meja Kasir / Display
  gameCtx.fillStyle = "#27ae60";
  gameCtx.fillRect(200, 530, 400, 50);
  gameCtx.fillStyle = "#ffffff";
  gameCtx.fillText("🍞 MEJA SERAH ROTI / KASIR", 400, 560);
}

function gameLoop() {
  if (!gameScreen.classList.contains("active")) return;

  updateMovement();

  // Render Canvas
  gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
  drawKitchenEnvironment();
  drawCharacter(gameCtx, player.x, player.y, player);

  requestAnimationFrame(gameLoop);
}

// NAVIGASI SCREEN
document.getElementById("btn-start-game").addEventListener("click", () => {
  lobbyScreen.classList.remove("active");
  gameScreen.classList.add("active");
  requestAnimationFrame(gameLoop);
});

document.getElementById("btn-back-lobby").addEventListener("click", () => {
  gameScreen.classList.remove("active");
  lobbyScreen.classList.add("active");
});

// INITIAL DRAW
drawAvatarPreview();