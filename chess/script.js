// ===== Chess rules (uppercase = White, lowercase = Black, "." = empty) =====
const START = ["rnbqkbnr", "pppppppp", "........", "........",
               "........", "........", "PPPPPPPP", "RNBQKBNR"];
const GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟\uFE0E" };

const isWhite = p => p === p.toUpperCase();
const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const copy = b => b.map(row => row.slice());

function pseudoMoves(b, r, c) {
  const p = b[r][c], white = isWhite(p), type = p.toLowerCase(), out = [];
  const slide = dirs => dirs.forEach(([dr, dc]) => {
    let rr = r + dr, cc = c + dc;
    while (inBounds(rr, cc)) {
      const q = b[rr][cc];
      if (q === ".") out.push([rr, cc]);
      else { if (isWhite(q) !== white) out.push([rr, cc]); break; }
      rr += dr; cc += dc;
    }
  });
  const step = dirs => dirs.forEach(([dr, dc]) => {
    const rr = r + dr, cc = c + dc;
    if (inBounds(rr, cc) && (b[rr][cc] === "." || isWhite(b[rr][cc]) !== white)) out.push([rr, cc]);
  });
  const straight = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const diagonal = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  if (type === "r") slide(straight);
  else if (type === "b") slide(diagonal);
  else if (type === "q") slide(straight.concat(diagonal));
  else if (type === "n") step([[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]);
  else if (type === "k") step(straight.concat(diagonal));
  else if (type === "p") {
    const dir = white ? -1 : 1, start = white ? 6 : 1;
    if (inBounds(r + dir, c) && b[r + dir][c] === ".") {
      out.push([r + dir, c]);
      if (r === start && b[r + 2 * dir][c] === ".") out.push([r + 2 * dir, c]);
    }
    [-1, 1].forEach(dc => {
      const rr = r + dir, cc = c + dc;
      if (inBounds(rr, cc) && b[rr][cc] !== "." && isWhite(b[rr][cc]) !== white) out.push([rr, cc]);
    });
  }
  return out;
}

function makeMove(b, [fr, fc], [tr, tc]) {
  const nb = copy(b);
  let p = nb[fr][fc];
  if (p === "P" && tr === 0) p = "Q";
  if (p === "p" && tr === 7) p = "q";
  nb[tr][tc] = p;
  nb[fr][fc] = ".";
  return nb;
}

function findKing(b, white) {
  const k = white ? "K" : "k";
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (b[r][c] === k) return [r, c];
}

function inCheck(b, white) {
  const [kr, kc] = findKing(b, white);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c];
    if (p !== "." && isWhite(p) !== white &&
        pseudoMoves(b, r, c).some(([a, d]) => a === kr && d === kc)) return true;
  }
  return false;
}

function legalMoves(b, r, c) {
  const white = isWhite(b[r][c]);
  return pseudoMoves(b, r, c).filter(to => !inCheck(makeMove(b, [r, c], to), white));
}

function hasAnyMove(b, white) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c];
    if (p !== "." && isWhite(p) === white && legalMoves(b, r, c).length) return true;
  }
  return false;
}

// ===== Game state =====
let board, whiteTurn, selected, legal, lastMove, gameOver;
let mode = null;        // "local" or "online"
let myWhite = true;     // which colour you play online
let conn = null;        // PeerJS connection to the opponent
let peer = null;

const $ = id => document.getElementById(id);
const boardEl = $("board"), statusEl = $("status");

function newGame() {
  board = START.map(row => row.split(""));
  whiteTurn = true; selected = null; legal = []; lastMove = null; gameOver = false;
  render();
}

function applyMove(from, to) {
  board = makeMove(board, from, to);
  lastMove = [from, to];
  whiteTurn = !whiteTurn;
  selected = null; legal = [];
  const check = inCheck(board, whiteTurn);
  if (!hasAnyMove(board, whiteTurn)) gameOver = check ? "mate" : "stalemate";
  render(check);
}

function onSquare(r, c) {
  if (gameOver) return;
  if (mode === "online" && whiteTurn !== myWhite) return;       // not your turn
  if (selected && legal.some(([a, d]) => a === r && d === c)) {
    const from = selected;
    applyMove(from, [r, c]);
    if (mode === "online" && conn) conn.send({ type: "move", from, to: [r, c] });
    return;
  }
  const p = board[r][c];
  if (p !== "." && isWhite(p) === whiteTurn) { selected = [r, c]; legal = legalMoves(board, r, c); }
  else { selected = null; legal = []; }
  render(inCheck(board, whiteTurn));
}

function render(check = false) {
  boardEl.innerHTML = "";
  const flip = mode === "online" && !myWhite;     // Black sees their own pieces at the bottom
  const kingPos = check || gameOver === "mate" ? findKing(board, whiteTurn) : null;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const r = flip ? 7 - i : i, c = flip ? 7 - j : j;
    const sq = document.createElement("button");
    const p = board[r][c];
    sq.type = "button";
    sq.className = "sq " + ((r + c) % 2 ? "d" : "l");
    if (p !== ".") { sq.textContent = GLYPH[p.toLowerCase()]; sq.classList.add(isWhite(p) ? "w" : "b"); }
    if (lastMove && lastMove.some(([a, d]) => a === r && d === c)) sq.classList.add("last");
    if (selected && selected[0] === r && selected[1] === c) sq.classList.add("sel");
    if (kingPos && kingPos[0] === r && kingPos[1] === c) sq.classList.add("check");
    if (legal.some(([a, d]) => a === r && d === c)) sq.classList.add(p === "." ? "move" : "cap");
    sq.setAttribute("aria-label", `${"abcdefgh"[c]}${8 - r}${p === "." ? "" : " " + p}`);
    sq.addEventListener("click", () => onSquare(r, c));
    boardEl.appendChild(sq);
  }
  statusEl.textContent = statusText(check);
}

function statusText(check) {
  if (gameOver === "left") return "Your opponent left the game.";
  if (gameOver === "mate") return `Checkmate. ${whiteTurn ? "Black" : "White"} wins.`;
  if (gameOver === "stalemate") return "Stalemate. The game is a draw.";
  const side = whiteTurn ? "White" : "Black";
  if (mode === "local") return `${side}'s turn${check ? " – check!" : ""}`;
  const you = myWhite ? "White" : "Black";
  return `You are ${you}. ` + (whiteTurn === myWhite ? "Your turn" : "Waiting for opponent") + (check ? " – check!" : "");
}

// ===== Screens =====
function showGame() { $("lobby").hidden = true; $("game").hidden = false; newGame(); }

// ===== Online play (PeerJS, peer-to-peer; no server of your own) =====
const PREFIX = "pchess-";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

function wireConnection(c) {
  conn = c;
  conn.on("data", msg => {
    if (msg.type === "move") {
      // Validate: it must be the opponent's turn and the move must be legal
      if (gameOver || whiteTurn === myWhite) return;
      const [fr, fc] = msg.from;
      if (!board[fr] || board[fr][fc] === "." || isWhite(board[fr][fc]) !== whiteTurn) return;
      if (legalMoves(board, fr, fc).some(([a, d]) => a === msg.to[0] && d === msg.to[1])) applyMove(msg.from, msg.to);
    } else if (msg.type === "new") {
      newGame();
    }
  });
  conn.on("close", () => { gameOver = "left"; render(); });
}

function createGame() {
  mode = "online"; myWhite = true;
  $("lobbyMsg").textContent = "Setting up your game…";
  const code = randomCode();
  peer = new Peer(PREFIX + code);
  peer.on("open", () => {
    $("codeShown").textContent = code;
    $("shareLink").value = location.origin + location.pathname + "?join=" + code;
    $("share").hidden = false;
    $("lobbyMsg").textContent = "Waiting for your opponent to join. Keep this page open.";
  });
  peer.on("connection", c => {
    if (conn) { c.close(); return; }                // only one opponent
    c.on("open", () => { wireConnection(c); showGame(); });
  });
  peer.on("error", e => { $("lobbyMsg").textContent = "Connection problem (" + e.type + "). Refresh and try again."; });
}

function joinGame(code) {
  code = code.trim().toUpperCase();
  if (code.length !== 5) { $("lobbyMsg").textContent = "Enter the 5-character game code."; return; }
  mode = "online"; myWhite = false;
  $("lobbyMsg").textContent = "Connecting…";
  peer = new Peer();
  peer.on("open", () => {
    const c = peer.connect(PREFIX + code, { reliable: true });
    c.on("open", () => { wireConnection(c); showGame(); });
  });
  peer.on("error", e => {
    $("lobbyMsg").textContent = e.type === "peer-unavailable"
      ? "No game found with that code. Check it and try again."
      : "Connection problem (" + e.type + "). Refresh and try again.";
  });
}

// ===== Buttons =====
$("create").addEventListener("click", createGame);
$("join").addEventListener("click", () => joinGame($("codeInput").value));
$("local").addEventListener("click", () => { mode = "local"; showGame(); });
$("copy").addEventListener("click", () => {
  navigator.clipboard.writeText($("shareLink").value)
    .then(() => { $("lobbyMsg").textContent = "Link copied."; })
    .catch(() => $("shareLink").select());
});
$("restart").addEventListener("click", () => {
  newGame();
  if (mode === "online" && conn) conn.send({ type: "new" });
});
$("leave").addEventListener("click", () => location.reload());

// Opened from an invite link like  ...?join=ABCDE
const invited = new URLSearchParams(location.search).get("join");
if (invited) { $("codeInput").value = invited; joinGame(invited); }
