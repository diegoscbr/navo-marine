import { google } from 'googleapis'

function getAuth() {
  const keyJson = process.env.GMAIL_SERVICE_ACCOUNT_KEY
  if (!keyJson) throw new Error('GMAIL_SERVICE_ACCOUNT_KEY is not set')

  const fromAddress = process.env.GMAIL_FROM_ADDRESS
  if (!fromAddress) throw new Error('GMAIL_FROM_ADDRESS is not set')

  const key = JSON.parse(keyJson) as { client_email: string; private_key: string }

  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    subject: fromAddress,
  })
}

function makeRaw(to: string, subject: string, htmlBody: string): string {
  const from = process.env.GMAIL_FROM_ADDRESS!
  const message = [
    `From: NAVO Marine <${from}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody,
  ].join('\r\n')

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function sendEmail(to: string, subject: string, htmlBody: string): Promise<void> {
  const auth = getAuth()
  const gmail = google.gmail({ version: 'v1', auth })

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: makeRaw(to, subject, htmlBody) },
  })
}
