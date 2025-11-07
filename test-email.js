import { Resend } from 'resend';

// Initialize the Resend instance
const resend = new Resend('re_7TG5PEYv_LQD5WUTA28has2k3kjfY5SrP');

async function testEmail() {
  try {
    const { data, error } = await resend.emails.send({
      from: 'hi@no-reply.overload.studio',
      to: ['hrdykrystof@gmail.com'], // Replace with your email
      subject: 'Test Email from VEB',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h1>Test Email</h1>
          <p>This is a test email from VEB registration system.</p>
          <p>Verification code: <strong>123456</strong></p>
        </div>
      `
    });

    if (error) {
      console.error('Failed to send email:', {
        error,
        statusCode: error.statusCode,
        name: error.name,
        message: error.message,
        details: error.details
      });
      return;
    }

    console.log('Email sent successfully!');
    console.log('Response data:', {
      id: data.id,
      from: data.from,
      to: data.to
    });
  } catch (error) {
    console.error('Error sending email:', error.message);
  }
}

// Run the test
testEmail();