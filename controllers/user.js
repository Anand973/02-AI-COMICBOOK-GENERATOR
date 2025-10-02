const User = require("../models/user");
const {setUser}=require('../service/auth')
async function handleSignup(req,res) {
    const {email,pass} =req.body;
       await  User.create({
            email,
            pass
        })
   return res.redirect('/user/login')

    
}

async function handleLogin(req,res) {
    const {email,pass} =req.body;
       const user= await User.findOne({email,pass})
       if(!user){
       return  res.render('login')
       }
       
      const token= setUser(user)
       res.cookie('uid',token) 
   return res.redirect('/')

    
}
module.exports={handleSignup,handleLogin}