import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: './.env' });

const DB_NAME = "mytube";

const checkVideos = async () => {
    try {
        await mongoose.connect(`${process.env.MONGODB_URL}/${DB_NAME}`);
        const VideoSchema = new mongoose.Schema({ title: String, videoFile: String });
        const Video = mongoose.model("Video", VideoSchema);
        
        const videos = await Video.find({}).limit(5);
        if (videos.length === 0) {
            console.log("Empty DB");
        } else {
            console.log("Found Videos:");
            videos.forEach(v => console.log(`ID: ${v._id}, Title: ${v.title}`));
        }
        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

checkVideos();
