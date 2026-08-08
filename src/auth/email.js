// Sends the magic-link email. Uses Resend (resend.com) since it's simple,
// cheap, and has a generous free tier well suited to friend-group scale —
// swap this out for SendGrid, Postmark, or plain SMTP if you prefer.
// Requires RESEND_API_KEY in your environment.

async function sendMagicLinkEmail(email, link) {
  if (!process.env.RESEND_API_KEY) {
    // Development fallback: just log it so you can click it manually
    // without needing real email configured yet.
    console.log(`\n[DEV] Magic link for ${email}:\n${link}\n`);
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Nate-Worthy <onboarding@resend.dev>',
      to: email,
      subject: 'Your Nate-Worthy sign-in link',
      html: `<p>Click below to sign in — this link expires in 15 minutes.</p><p><a href="${link}">${link}</a></p>`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error('Email send failed: ' + body);
  }
}

module.exports = { sendMagicLinkEmail };
