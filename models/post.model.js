import mongoose from "mongoose"

const postSchema=new mongoose.Schema({
author:{
   type: mongoose.Schema.Types.ObjectId,
   ref:"User",
   required:true
},
description:{
    type:String,
    default:""
},
image:{
    type:String
},
reactions:[
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        type: {
            type: String,
            enum: ["like", "love", "wow", "sad", "angry"],
            default: "like"
        }
    }
],
comment:[
    {
        content:{type:String},
        user:{
            type: mongoose.Schema.Types.ObjectId,
            ref:"User" 
        }
    }
]


},{timestamps:true})

const Post=mongoose.model("Post",postSchema)
export default Post