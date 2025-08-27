import mongoose from "mongoose"

const postSchema=new mongoose.Schema({
author:{
   type: mongoose.Schema.Types.ObjectId,
   ref:"User",
   required:true
},
// If this is a repost, store the original author
repostedFrom: {
   type: mongoose.Schema.Types.ObjectId,
   ref: "User",
   default: null
},
description:{
    type:String,
    default:""
},
image:{
    type:String
},
// Optional quote text when reposting with commentary
quote: {
    type: String,
    default: ""
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

postSchema.index({ createdAt: -1 });
postSchema.index({ author: 1, createdAt: -1 });

const Post=mongoose.model("Post",postSchema)
export default Post