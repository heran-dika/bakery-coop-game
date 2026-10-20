// STATE DATA PLAYER & CUSTOMIZATION
const player = {
  name: "Chef Roti",
  skinColor: "#ffdbac",
  shirtColor: "#e74c3c",
  hatStyle: "standard",
  // Koordinat Grid/Dunia (Grid 2D)
  x: 200,
  y: 200,
  speed: 3,
  size: 20
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

// FUNGSI KONVERSI KOORDINAT 2D KE ISOMETRIC (3D LOOK)
function toIso(x, y) {
  const isoX = 400 + (x - y) * 0.8;
  const isoY = 100 + (x + y) * 0.4;
  return { x: isoX, y: isoY };
}

// FUNGSI MENGGAMBAR KOTAK 3D ISOMETRIC (MEJA / OVEN)
function drawIsoBlock(ctx, x, y, width, length, height, topColor, sideColor1, sideColor2, label = "") {
  const p1 = toIso(x, y);
  const p2 = toIso(x + width, y);
  const p3 = toIso(x + width, y + length);
  const p4 = toIso(x, y + length);

  // Sisi Kiri / Depan Kiri
  ctx.fillStyle = sideColor1;
  ctx.beginPath();
  ctx.moveTo(p4.x, p4.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.lineTo(p3.x, p3.y - height);
  ctx.lineTo(p4.x, p4.y - height);
  ctx.closePath();
  ctx.fill();

  // Sisi Kanan / Depan Kanan
  ctx.fillStyle = sideColor2;
  ctx.beginPath();
  ctx.moveTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.lineTo(p3.x, p3.y - height);
  ctx.lineTo(p2.x, p2.y - height);
  ctx.closePath();
  ctx.fill();

  // Sisi Atas
  ctx.fillStyle = topColor;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y - height);
  ctx.lineTo(p2.x, p2.y - height);
  ctx.lineTo(p3.x, p3.y - height);
  ctx.lineTo(p4.x, p4.y - height);
  ctx.closePath();
  ctx.fill();

  // Label Meja
  if (label) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    const center = toIso(x + width / 2, y + length / 2);
    ctx.fillText(label, center.x, center.y - height / 2);
  }
}

// FUNGSI MENGGAMBAR AVATAR (ISOMETRIC / 3D LOOK)
function drawCharacter(ctx, isoPos, pData) {
  const x = isoPos.x;
  const y = isoPos.y;

  // Bayangan Bawah (Shadow)
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(x, y, 14, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // 1. Badan / Baju (Silinder 3D Sederhana)
  ctx.fillStyle = pData.shirtColor;
  ctx.beginPath();
  ctx.arc(x, y - 10, pData.size * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // 2. Kepala
  ctx.fillStyle = pData.skinColor;
  ctx.beginPath();
  ctx.arc(x, y - 24, pData.size * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // 3. Topi Koki
  ctx.fillStyle = "#ffffff";
  if (pData.hatStyle === "standard") {
    ctx.fillRect(x - 8, y - 40, 16, 8);
    ctx.beginPath();
    ctx.arc(x, y - 40, 10, 0, Math.PI * 2);
    ctx.fill();
  } else if (pData.hatStyle === "tall") {
    ctx.fillRect(x - 8, y - 48, 16, 16);
    ctx.beginPath();
    ctx.arc(x, y - 48, 10, 0, Math.PI * 2);
    ctx.fill();
  } else if (pData.hatStyle === "bandana") {
    ctx.fillStyle = "#333333";
    ctx.fillRect(x - 9, y - 32, 18, 5);
  }

  // 4. Mata
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(x - 3, y - 24, 1.5, 0, Math.PI * 2);
  ctx.arc(x + 3, y - 24, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // 5. Label Nama
  ctx.font = "bold 12px sans-serif";
  ctx.fillStyle = "#333333";
  ctx.textAlign = "center";
  ctx.fillText(pData.name, x, y + 16);
}

function drawAvatarPreview() {
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  // Gambar preview biasa di layar lobby
  const p = { x: previewCanvas.width / 2, y: previewCanvas.height / 2 + 10 };
  drawCharacter(previewCtx, p, player);
}

// CHAT SYSTEM
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

  // Batas Area Dapur
  player.x = Math.max(30, Math.min(340, player.x));
  player.y = Math.max(30, Math.min(340, player.y));
}

function drawKitchenIsometric() {
  // 1. Lantai Dapur Catur (Isometric Floor Tile)
  for (let x = 0; x < 400; x += 40) {
    for (let y = 0; y < 400; y += 40) {
      const p1 = toIso(x, y);
      const p2 = toIso(x + 40, y);
      const p3 = toIso(x + 40, y + 40);
      const p4 = toIso(x, y + 40);

      gameCtx.fillStyle = (x + y) % 80 === 0 ? "#f0d9b5" : "#b58863";
      gameCtx.beginPath();
      gameCtx.moveTo(p1.x, p1.y);
      gameCtx.lineTo(p2.x, p2.y);
      gameCtx.lineTo(p3.x, p3.y);
      gameCtx.lineTo(p4.x, p4.y);
      gameCtx.closePath();
      gameCtx.fill();
    }
  }

  // 2. Objek Dapur Isometric (Meja, Oven, Kasir)
  // Oven di dinding belakang
  drawIsoBlock(gameCtx, 0, 0, 120, 40, 35, "#95a5a6", "#7f8c8d", "#717d7e", "🔥 OVEN");

  // Meja Adonan
  drawIsoBlock(gameCtx, 240, 0, 120, 40, 30, "#e67e22", "#d35400", "#ba4a00", "🥣 ADONAN");

  // Meja Kasir / Display di depan
  drawIsoBlock(gameCtx, 0, 340, 360, 40, 30, "#2ecc71", "#27ae60", "#219653", "🍞 MEJA KASIR");
}

function gameLoop() {
  if (!gameScreen.classList.contains("active")) return;

  updateMovement();

  // Render Canvas Isometric
  gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
  
  // Gambar Dapur & Meja
  drawKitchenIsometric();

  // Gambar Karakter
  const playerIsoPos = toIso(player.x, player.y);
  drawCharacter(gameCtx, playerIsoPos, player);

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