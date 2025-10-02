const mongoose=require("mongoose")
async function connectDB() {
    return mongoose.connect(`${process.env.MONGODB_URI}`)
}

module.exports ={connectDB}