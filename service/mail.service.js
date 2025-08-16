import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // e.g. yourbusiness@yourdomain.com
    pass: process.env.EMAIL_PASS, // App Password (not normal Gmail password!)
  },
});

export const sendOtpMail = async (to, otp) => {
  try {
    const mailOptions = {
      from: `"My App" <${process.env.EMAIL_USER}>`, // better formatting
      to,
      subject: "Your OTP for Signup",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Your OTP is: <b>${otp}</b></h2>
          <p>This OTP is valid for 10 minutes.</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ OTP Email sent: " + info.response);
    return info;
  } catch (error) {
    console.error("❌ Error sending OTP email:", error);
    throw error;
  }
};
