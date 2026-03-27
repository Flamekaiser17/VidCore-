import {v2 as cloudinary} from "cloudinary"
import fs from "fs"
import { extractPublicId } from "cloudinary-build-url";

// Configuration
cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY,    
    api_secret: process.env.CLOUDINARY_API_SECRET 
});

const uploadOnCloudinary = async(localFilePath,path)=>{
    try {
        if (!localFilePath) return null 
        //upload on cloudinary
        const response = await cloudinary.uploader.upload(localFilePath,{
            folder:path,
            resource_type:"auto"
        })
        //file uploaded
        //console.log("File uploaded successfully",response.url);
        fs.unlinkSync(localFilePath) //remove the locally saved temp file
        console.log(response);
        
        return response
        
    } catch (error) {
        console.error("Cloudinary upload error:", error);
        if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath) 
        return null
    }
}

const deleteFromCloudinary = async(cloudinaryUrl, resourceType = "image")=>{
    try {
        if (!cloudinaryUrl) {
            return null;
        }
        ///get publicId
        const publicId = extractPublicId(cloudinaryUrl)

        //destroy
        const response = await cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType
        });

        console.log('Successfully deleted from Cloudinary:', publicId);
        return response;

    } catch (error) {
        console.error('Error deleting from Cloudinary:', error.message);
        return null;
    }
}


export {uploadOnCloudinary,deleteFromCloudinary}