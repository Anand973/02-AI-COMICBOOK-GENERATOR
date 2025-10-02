const mongoose=require("mongoose")
const UserSchema=mongoose.Schema({
    email:{
        type:String,
        required: true,
        
    },
    pass:{
         type:String,
        required: true,
        
    }
})

const User=mongoose.model('user',UserSchema)
module.exports=User