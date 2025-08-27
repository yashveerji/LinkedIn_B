import nodemailer from 'nodemailer';

let cachedTransporter = null;

async function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) {
    throw new Error('EMAIL_USER and EMAIL_PASS are required for Gmail SMTP');
  }
  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return cachedTransporter;
}

export const sendOtpMail = async (to, otp) => {
  const fromAddr = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@example.com';
  const mailOptions = {
    from: fromAddr,
    to,
    subject: 'Your OTP for Signup',
    html: `<h2>Your OTP is: <b>${otp}</b></h2><p>This OTP is valid for 10 minutes.</p>`
  };
  const transporter = await getTransporter();
  await transporter.sendMail(mailOptions);
};
