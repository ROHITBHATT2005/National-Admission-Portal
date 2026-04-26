const express = require("express");
const session = require("express-session");
const path = require("path");
const db = require("./db");
const studentRoutes = require("./routes/studentRoutes");
const adminRoutes = require("./routes/adminRoutes");
const instituteRoutes = require("./routes/instituteRoutes");
const publicRoutes = require("./routes/publicRoutes");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: "secret123",
    resave: false,
    saveUninitialized: false
}));
app.use(express.static(path.join(__dirname, "publicpages")));
app.use(express.static(path.join(__dirname, "student-portal")));
app.use(express.static(path.join(__dirname, "static")));
app.use(express.static(path.join(__dirname, "adminportal")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.get("/",(req,res) =>{
    res.sendFile(path.join(__dirname,"publicpages","HomePage.html"));
}); 
app.use(studentRoutes);
app.use(adminRoutes);
app.use(instituteRoutes);
app.use(publicRoutes);
app.use((req, res) => {
    res.status(404).send("Page not found");
});
module.exports = app;