const User = require("../models/user");
const bcrypt = require("bcrypt");     // <-- ADD THIS
const { setUser } = require('../service/auth');

async function handleSignup(req, res) {
    const { email, pass } = req.body;

    // Hash password before saving
    const hashedPassword = await bcrypt.hash(pass, 10);

    await User.create({
        email,
        pass: hashedPassword   // <-- CHANGE THIS LINE
    });

    return res.redirect('/user/login');
}

async function handleLogin(req, res) {
    const { email, pass } = req.body;

    // First find user by email only (not password)
    const user = await User.findOne({ email });   // <-- CHANGE THIS LINE

    if (!user) {
        return res.render('login', { error: "User not found" });
    }

    // Compare entered password with hashed password
    const isMatch = await bcrypt.compare(pass, user.pass);   // <-- ADD THIS

    if (!isMatch) {
        return res.render('login', { error: "Invalid password" });
    }

    const token = setUser(user);
    res.cookie('uid', token);

    return res.redirect('/');
}

module.exports = { handleSignup, handleLogin };
