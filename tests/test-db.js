import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: './.env' });

const DB_NAME = "mytube";

const connectDB = async () => {
    try {
        const url = `${process.env.MONGODB_URL}/${DB_NAME}`
        console.log("Connecting to:", url);
        const connectionInstance = await mongoose.connect(url);
        console.log(`\n MongoDB connected !! DB host: ${connectionInstance.connection.host}`);
        process.exit(0);
    } catch (error) {
        console.log("MONGODB connection Failed", error);
        process.exit(1);
    }
}

connectDB();
