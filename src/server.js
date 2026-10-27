import dotenv from "dotenv";
import connectDB from "./db/index.js";
import { app } from "./app.js";
import { redis } from "./redis/index.js";

dotenv.config({
  path: "./.env",
});

connectDB()
  .then(() => {
    app.on("error", (error) => {
      console.log("error:", error);
      throw error;
    });

    const port = process.env.PORT || 8000;
    app.listen(port, () => {
      console.log(`vidvore app running on port ${port}`);
    });

    // Redis imported from ./redis/index.js (shared instance)
  })
  .catch((error) => {
    console.log("MongoDB connection Failed!!", error);
  });

/*
import express from "express"
const app = express()

(async()=>{
    try {
       await mongoose.connect(`${process.env.MONGODB_URL}/${DB_NAME}`);

       app.on("error",(error)=>{
        console.log("Error: ",error)
        throw error
       });

       app.listen(process.env.PORT,()=>{
        console.log(`App is listening on port ${process.env.PORT}`)
       })


    } catch (error) {
        console.error("ERROR: ",error)
        throw error
    }
})()

 */
