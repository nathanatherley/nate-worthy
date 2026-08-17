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

// Sends a "report a problem" submission to you (the app owner), not the
// user -- this is a notification email, not a user-facing one. Reuses the
// same Resend setup as the magic-link email. FEEDBACK_TO_EMAIL lets you
// control where these land without touching code (defaults to EMAIL_FROM's
// address if not set, but you'll likely want your own inbox here instead).
async function sendFeedbackEmail({ fromUserEmail, message, page }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`\n[DEV] Feedback from ${fromUserEmail} (${page}):\n${message}\n`);
    return;
  }
  const to = process.env.FEEDBACK_TO_EMAIL;
  if (!to) throw new Error('FEEDBACK_TO_EMAIL not set — nowhere to send feedback');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Nate-Worthy <onboarding@resend.dev>',
      to,
      // Setting reply-to as the reporting user's email means you can just
      // hit "reply" in your inbox to respond to them directly.
      reply_to: fromUserEmail,
      subject: `Nate-Worthy feedback from ${fromUserEmail}`,
      html: `<p><strong>From:</strong> ${fromUserEmail}</p><p><strong>Page:</strong> ${page || 'unknown'}</p><p><strong>Message:</strong></p><p>${message}</p>`,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error('Feedback email send failed: ' + body);
  }
}

// Sends an invite email on a signed-in user's behalf, to someone they want
// to invite. Only ever sends a small fixed template -- toEmail, fromName,
// and shareUrl are the only client-supplied values, never free-text body
// content -- so this endpoint can't be turned into an open email relay.
async function sendInviteEmail({ toEmail, fromName, shareUrl }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`\n[DEV] Invite from ${fromName} to ${toEmail}:\n${shareUrl}\n`);
    return;
  }
  const safeFromName = fromName || 'A friend';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Nate-Worthy <onboarding@resend.dev>',
      to: toEmail,
      subject: `${safeFromName} invited you to Nate-Worthy`,
      html: `<p><strong>${safeFromName}</strong> thinks you'd like Nate-Worthy — a restaurant recommendation app weighted by people you actually trust, not random internet reviews.</p><p><a href="${shareUrl}">${shareUrl}</a></p>`,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error('Invite email send failed: ' + body);
  }
}

module.exports = { sendMagicLinkEmail, sendFeedbackEmail, sendInviteEmail };
