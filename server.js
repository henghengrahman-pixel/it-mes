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
// CONFIG PATH (PENTING)
// ======================
const BASE_DIR = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(BASE_DIR, "data");

// pastikan folder data ada
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ======================
// MIDDLEWARE
// ======================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// static fix
app.use(express.static(path.join(BASE_DIR, "public")));

// views fix (INI YANG BIKIN ERROR KAMU SEBELUMNYA)
app.set("views", path.join(BASE_DIR, "views"));
app.set("view engine", "ejs");

// session
app.use(session({
  secret: process.env.SESSION_SECRET || "secret",
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false // Railway pakai proxy, aman false
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
  return fs.existsSync(file) ? fs.readJsonSync(file) : [];
}

function write(file, data) {
  fs.writeJsonSync(file, data, { spaces: 2 });
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
app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", (req, res) => {
  const { id, password } = req.body;

  if (
    id === process.env.ADMIN_ID &&
    password === process.env.ADMIN_PASSWORD
  ) {
    req.session.user = id;
    return res.redirect("/");
  }

  res.send("Login gagal");
});

app.get("/", requireLogin, (req, res) => {
  const users = read(DB.users);
  const izin = read(DB.izin);

  res.render("dashboard", { users, izin });
});

// ======================
// API
// ======================
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
// START
// ======================
server.listen(process.env.PORT || 3000, () => {
  console.log("RUNNING");
});
