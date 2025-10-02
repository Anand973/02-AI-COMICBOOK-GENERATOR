const express=require("express");
const {handleSignup, handleLogin}=require('../controllers/user');
const { route } = require("../ch");
const router=express.Router();
router.get('/signup', (req, res) => {
    res.render('signup');
});
router.get('/login', (req, res) => {
    res.render('login');
});
router.get('/logout',(req,res)=>{
    return res.redirect('/user/login')
})
router.post('/signup',handleSignup)
router.post('/login',handleLogin)
module.exports=router