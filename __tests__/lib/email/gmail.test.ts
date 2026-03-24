jest.mock('googleapis', () => ({
  google: {
    auth: {
      JWT: jest.fn().mockImplementation(() => ({ authorizeAsync: jest.fn() })),
    },
    gmail: jest.fn().mockReturnValue({
      users: {
        messages: {
          send: jest.fn().mockResolvedValue({ data: { id: 'msg_001' } }),
        },
      },
    }),
  },
}))

import { sendEmail } from '@/lib/email/gmail'
import { google } from 'googleapis'

const mockGmailSend = (google.gmail({} as never) as ReturnType<typeof google.gmail>).users.messages
  .send as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  process.env.GMAIL_SERVICE_ACCOUNT_KEY = JSON.stringify({
    type: 'service_account',
    client_email: 'noreply@navo-marine.iam.gserviceaccount.com',
    private_key: '-----BEGIN RSA PRIVATE KEY-----\nMOCK\n-----END RSA PRIVATE KEY-----\n',
  })
  process.env.GMAIL_FROM_ADDRESS = 'noreply@navomarine.com'
})

it('calls gmail.users.messages.send with a base64url-encoded raw message', async () => {
  await sendEmail('captain@test.com', 'Test Subject', '<p>Hello</p>')
  expect(mockGmailSend).toHaveBeenCalledTimes(1)
  const call = mockGmailSend.mock.calls[0][0]
  expect(call.userId).toBe('me')
  const decoded = Buffer.from(call.requestBody.raw, 'base64').toString('utf-8')
  expect(decoded).toContain('To: captain@test.com')
  expect(decoded).toContain(`Subject: =?UTF-8?B?${Buffer.from('Test Subject').toString('base64')}?=`)
  expect(decoded).toContain('<p>Hello</p>')
})

it('throws when GMAIL_SERVICE_ACCOUNT_KEY is not set', async () => {
  delete process.env.GMAIL_SERVICE_ACCOUNT_KEY
  await expect(sendEmail('a@b.com', 'S', 'B')).rejects.toThrow('GMAIL_SERVICE_ACCOUNT_KEY')
})

it('throws when GMAIL_FROM_ADDRESS is not set', async () => {
  delete process.env.GMAIL_FROM_ADDRESS
  await expect(sendEmail('a@b.com', 'S', 'B')).rejects.toThrow('GMAIL_FROM_ADDRESS')
})
