import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({})
const db = DynamoDBDocumentClient.from(client)

const APP_NAME = process.env.APP_NAME || 'ke-control-tower'

export function tableName(name: string): string {
  return `${APP_NAME}-${name}`
}

export { db, GetCommand, PutCommand, DeleteCommand }
