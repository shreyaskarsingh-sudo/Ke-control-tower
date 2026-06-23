import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'

const APP_NAME = process.env.APP_NAME || 'ke-control-tower'
const TABLE = `${APP_NAME}-tokens`

function getDb() {
  return DynamoDBDocumentClient.from(new DynamoDBClient({}))
}

export async function saveToken(email: string, service: 'slack' | 'gmail', token: string): Promise<void> {
  await getDb().send(new PutCommand({
    TableName: TABLE,
    Item: { tokenKey: `${service}:${email}`, value: token },
  }))
}

export async function getToken(email: string, service: 'slack' | 'gmail'): Promise<string | null> {
  const result = await getDb().send(new GetCommand({
    TableName: TABLE,
    Key: { tokenKey: `${service}:${email}` },
  }))
  return (result.Item?.value as string) ?? null
}

export async function hasToken(email: string, service: 'slack' | 'gmail'): Promise<boolean> {
  const result = await getDb().send(new GetCommand({
    TableName: TABLE,
    Key: { tokenKey: `${service}:${email}` },
  }))
  return !!result.Item
}
