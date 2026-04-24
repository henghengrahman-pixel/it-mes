require("dotenv").config();
const express = require("express");
const session = require("express-session");
const fs = require("fs-extra");
const http = require("http");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = require("socket.io")(server);

// ======================
// PATH CONFIG
// ======================
const BASE_DIR = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(BASE_DIR, "data");

// pastikan folder data ada
fs.ensureDirSync(DATA_DIR);

// ======================
// MIDDLEWARE
// ======================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(BASE_DIR, "public")));

// FIX VIEW PATH (WAJIB)
app.set("views", path.join(BASE_DIR, "views"));
app.set("view engine", "ejs");

// ======================
// SESSION (RAILWAY SAFE)
// ======================
app.set("trust proxy", 1); // penting di Railway

app.use(session({
  secret: process.env.SESSION_SECRET || "secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Railway pakai proxy
    httpOnly: true,
    sameSite: "lax"
  }
}));

// ======================
// DATABASE FILE
// ======================
const DB = {
  users: path.join(DATA_DIR, "users.json"),
  izin: path.join(DATA_DIR, "izin.json")
};

function read(file) {
  try {
    return fs.existsSync(file) ? fs.readJsonSync(file) : [];
  } catch {
    return [];
  }
}

function write(file, data) {
  try {
    fs.writeJsonSync(file, data, { spaces: 2 });
  } catch (e) {
    console.error("WRITE ERROR:", e);
  }
}

// ======================
// AUTH
// ======================
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

// ======================
// ROUTES
// ======================

// login page
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

// login process
app.post("/login", (req, res) => {
  const { id, password } = req.body;

  if (
    id === process.env.ADMIN_ID &&
    password === process.env.ADMIN_PASSWORD
  ) {
    req.session.user = id;
    return res.redirect("/");
  }

  // kirim error ke view (biar tidak blank)
  res.render("login", { error: "ID atau Password salah" });
});

// dashboard
app.get("/", requireLogin, (req, res) => {
  const users = read(DB.users);
  const izin = read(DB.izin);

  res.render("dashboard", { users, izin });
});

// ======================
// API
// ======================

// izin keluar
app.post("/api/izin", (req, res) => {
  if (req.headers["x-api-key"] !== process.env.API_KEY) {
    return res.sendStatus(403);
  }

  const data = read(DB.izin);

  data.push({
    ...req.body,
    status: "aktif",
    keluar: new Date(),
    kembali: new Date(Date.now() + 20 * 60000),
    denda: 0
  });

  write(DB.izin, data);
  io.emit("update");

  res.json({ ok: true });
});

// kembali
app.post("/api/kembali", (req, res) => {
  if (req.headers["x-api-key"] !== process.env.API_KEY) {
    return res.sendStatus(403);
  }

  let data = read(DB.izin);

  data = data.map(i => {
    if (i.user_id == req.body.user_id && i.status === "aktif") {
      const now = new Date();
      const telat = Math.floor((now - new Date(i.kembali)) / 60000);

      i.status = telat > 5 ? "telat" : "selesai";
      i.kembali_real = now;

      if (telat > 5) {
        i.denda = telat * 50000;
      }
    }
    return i;
  });

  write(DB.izin, data);
  io.emit("update");

  res.json({ ok: true });
});

// ======================
// SOCKET
// ======================
io.on("connection", () => {
  console.log("Admin connected");
});

// ======================
// ERROR HANDLER (ANTI CRASH)
// ======================
app.use((err, req, res, next) => {
  console.error("ERROR:", err);
  res.status(500).send("Internal Server Error");
});

// ======================
// START
// ======================
server.listen(process.env.PORT || 3000, () => {
  console.log("RUNNING");
});
