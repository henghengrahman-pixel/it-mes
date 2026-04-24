
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const fs = require("fs-extra");
const http = require("http");

const app = express();
const server = http.createServer(app);
const io = require("socket.io")(server);

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

const DB = {
  users: "./data/users.json",
  izin: "./data/izin.json"
};

function read(file){ return fs.existsSync(file) ? fs.readJsonSync(file) : []; }
function write(file,data){ fs.writeJsonSync(file,data,{spaces:2}); }

function requireLogin(req,res,next){
  if(!req.session.user) return res.redirect("/login");
  next();
}

app.get("/login",(req,res)=>res.render("login"));
app.post("/login",(req,res)=>{
  if(req.body.id===process.env.ADMIN_ID && req.body.password===process.env.ADMIN_PASSWORD){
    req.session.user=true;
    return res.redirect("/");
  }
  res.send("Login gagal");
});

app.get("/", requireLogin,(req,res)=>{
  res.render("dashboard",{users:read(DB.users),izin:read(DB.izin)});
});

app.post("/api/izin",(req,res)=>{
  if(req.headers['x-api-key']!==process.env.API_KEY) return res.sendStatus(403);
  const data = read(DB.izin);
  data.push({...req.body,status:"aktif",time:new Date()});
  write(DB.izin,data);
  io.emit("update");
  res.json({ok:true});
});

app.post("/api/kembali",(req,res)=>{
  if(req.headers['x-api-key']!==process.env.API_KEY) return res.sendStatus(403);
  let data = read(DB.izin);
  data = data.map(i=>{
    if(i.user_id==req.body.user_id && i.status==="aktif"){
      i.status="selesai";
      i.kembali_real=new Date();
    }
    return i;
  });
  write(DB.izin,data);
  io.emit("update");
  res.json({ok:true});
});

server.listen(process.env.PORT || 3000,()=>console.log("RUNNING"));
