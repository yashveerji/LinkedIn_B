import Notification from "../models/notification.model.js"

export const getNotifications=async (req,res)=>{
    try {
        
    let notification=await Notification.find({receiver:req.userId})
    .sort({ createdAt: -1 })
    .populate("relatedUser","firstName lastName profileImage userName")
    .populate("relatedPost","image description")
    return res.status(200).json(notification)
    } catch (error) {
        return res.status(500).json({message:`get notification error ${error}`})
    }
}
export const deleteNotification=async (req,res)=>{
    try {
        let {id}=req.params
   await Notification.findOneAndDelete({
    _id:id,
    receiver:req.userId
   })
    return res.status(200).json({message:" notification deleted successfully"})
    } catch (error) {
        return res.status(500).json({message:`delete notification error ${error}`})
    }
}
export const clearAllNotification=async (req,res)=>{
    try {
   await Notification.deleteMany({
    receiver:req.userId
   })
    return res.status(200).json({message:" notification deleted successfully"})
    } catch (error) {
        return res.status(500).json({message:`delete all notification error ${error}`})
    }
}

export const markRead = async (req, res) => {
    try {
        const { id } = req.params;
        await Notification.findOneAndUpdate({ _id: id, receiver: req.userId }, { $set: { read: true } });
        return res.status(200).json({ message: 'marked read' });
    } catch (error) {
        return res.status(500).json({ message: `mark read error ${error}` });
    }
}

export const markAllRead = async (req, res) => {
    try {
        await Notification.updateMany({ receiver: req.userId, read: { $ne: true } }, { $set: { read: true } });
        return res.status(200).json({ message: 'all marked read' });
    } catch (error) {
        return res.status(500).json({ message: `mark all read error ${error}` });
    }
}