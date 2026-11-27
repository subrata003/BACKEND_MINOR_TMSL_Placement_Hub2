const { v2: cloudinary } = require("cloudinary");
const dotenv = require("dotenv");

dotenv.config({ path: "./.env" });

// Cloudinary configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});


// console.log(" cloudinary cloud name",process.env.CLOUDINARY_CLOUD_NAME);
// console.log("cld key",process.env.CLOUDINARY_API_KEY);
// console.log("cld api secret",process.env.CLOUDINARY_API_SECRET);

// Export Cloudinary
module.exports = { cloudinary };