// api/subscribe.js
// Handles email waitlist signups via Resend

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    // Send notification email to you
    const notifyRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'Clippr Waitlist <onboarding@resend.dev>',
        to: ['eddiekostic04@gmail.com'],
        subject: '🎉 New Clippr Waitlist Signup',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #b5f03c;">New waitlist signup!</h2>
            <p>Someone just joined the Clippr waitlist:</p>
            <p style="font-size: 18px; font-weight: bold;">${email}</p>
            <hr style="border-color: #2a2d35;" />
            <p style="color: #7a7f8a; font-size: 12px;">Clippr Waitlist</p>
          </div>
        `
      })
    });

    // Send confirmation email to the user
    const confirmRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'Clippr <onboarding@resend.dev>',
        to: [email],
        subject: "You're on the Clippr waitlist 🛒",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #0e0f11; color: #f0f1f3; padding: 40px; border-radius: 16px;">
            <h1 style="font-size: 28px; letter-spacing: -1px; margin-bottom: 8px;">You're on the list! <span style="color: #b5f03c;">✓</span></h1>
            <p style="color: #7a7f8a; line-height: 1.6;">Thanks for signing up for early access to Clippr. We'll let you know the moment the Android app launches.</p>
            <div style="margin: 32px 0; padding: 20px; background: #17191d; border-radius: 12px; border: 1px solid #2a2d35;">
              <p style="margin: 0; font-size: 14px; color: #7a7f8a;">In the meantime, try the web app:</p>
              <a href="https://clippr-indol.vercel.app/index.html" style="color: #b5f03c; font-weight: bold; font-size: 16px;">Open Clippr →</a>
            </div>
            <p style="color: #7a7f8a; font-size: 12px;">You're receiving this because you signed up at clippr-indol.vercel.app. No spam, ever.</p>
          </div>
        `
      })
    });

    if (!notifyRes.ok && !confirmRes.ok) {
      throw new Error('Failed to send emails');
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Resend error:', err.message);
    return res.status(500).json({ error: 'Failed to subscribe' });
  }
}