import { Resend } from 'resend';

// Initialize the Resend instance with the API key
const resend = new Resend('re_7TG5PEYv_LQD5WUTA28has2k3kjfY5SrP');

async function sendEmail() {
  try {
    console.log('Sending test email with Bun...');
    
    const { data, error } = await resend.emails.send({
      from: 'Acme <onboarding@resend.dev>',
      to: ['hrdykrystof@gmail.com'], // Replace with your email if needed
      subject: 'Test Email from VEB',
      html: '<p>it works with Bun!</p>',
      replyTo: 'onboarding@resend.dev',
    });
    
    if (error) {
      console.error('Error sending email:', error);
      return;
    }
    
    console.log('Email sent successfully with Bun!');
    console.log('Response data:', data);
  } catch (error) {
    console.error('Exception sending email:', error);
  }
}

// Run the email sending function
sendEmail();

// To run this script with Bun:
// $ bun run email-test.js