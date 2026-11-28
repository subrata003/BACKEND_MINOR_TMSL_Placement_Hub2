const dns = require("node:dns");

// Fix Node.js DNS SRV resolution
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI is missing. Check your .env file.");
        }

        await mongoose.connect(process.env.MONGO_URI);

        console.log("MongoDB connected successfully");
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        throw error;
    }
};

module.exports = connectDB;