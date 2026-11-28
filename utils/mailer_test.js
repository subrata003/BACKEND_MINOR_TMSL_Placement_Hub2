const nodemailer = require("nodemailer");

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error("Email credentials are missing");
}
const transporter = nodemailer.createTransport({
    service: "gmail",
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

module.exports = transporter;