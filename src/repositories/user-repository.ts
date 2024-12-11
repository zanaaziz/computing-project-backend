import {
	DynamoDBDocumentClient,
	GetCommand,
	PutCommand,
	UpdateCommand,
	DeleteCommand,
	QueryCommand,
	BatchWriteCommand,
	BatchGetCommand,
} from '@aws-sdk/lib-dynamodb';
import { User } from '../models/user-model';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const TABLE_NAME = process.env.DYNAMODB_TABLE;

const dynamoDbClient = new DynamoDBClient({
	region: process.env.AWS_REGION || 'localhost',
	...(process.env.IS_OFFLINE && { endpoint: 'http://localhost:8000' }),
});

const ddbDocClient = DynamoDBDocumentClient.from(dynamoDbClient);

export const userRepository = {
	async getUser(userId: string): Promise<User | null> {
		const result = await ddbDocClient.send(
			new GetCommand({
				TableName: TABLE_NAME,
				Key: { PK: `USER#${userId}`, SK: 'METADATA' },
			})
		);
		return result.Item ? (result.Item as User) : null;
	},

	async getUserByEmail(email: string): Promise<User | null> {
		const normalizedEmail = email.toLowerCase();
		const result = await ddbDocClient.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				IndexName: 'GSI4',
				KeyConditionExpression: 'GSI4PK = :email AND GSI4SK = :sk',
				ExpressionAttributeValues: {
					':email': normalizedEmail,
					':sk': 'METADATA',
				},
			})
		);

		return result.Items && result.Items.length > 0 ? (result.Items[0] as User) : null;
	},

	async createUser(user: User): Promise<void> {
		await ddbDocClient.send(
			new PutCommand({
				TableName: TABLE_NAME,
				Item: {
					PK: `USER#${user.userId}`,
					SK: 'METADATA',
					GSI1PK: 'USER',
					GSI1SK: `USER#${user.userId}`,
					GSI4PK: user.email.toLowerCase(),
					GSI4SK: 'METADATA',
					...user,
					followerCount: 0,
				},
			})
		);

		await ddbDocClient.send(
			new PutCommand({
				TableName: TABLE_NAME,
				Item: {
					PK: `USER#${user.userId}`,
					SK: 'LIKES',
					likedExercises: new Set<string>(),
				},
			})
		);
	},

	async updateUser(userId: string, updates: Partial<User>): Promise<void> {
		const now = new Date().toISOString();
		const updateFields = { ...updates };
		if (updates.email) {
			updateFields.GSI4PK = updates.email.toLowerCase();
		}
		const updateExpression =
			'set ' +
			Object.keys(updateFields)
				.map((key) => `#${key} = :${key}`)
				.join(', ') +
			', #updatedAt = :updatedAt';
		const expressionAttributeNames = Object.keys(updateFields).reduce((acc, key) => ({ ...acc, [`#${key}`]: key }), { '#updatedAt': 'updatedAt' });
		const expressionAttributeValues = {
			...Object.keys(updateFields).reduce((acc, key) => ({ ...acc, [`:${key}`]: updateFields[key] }), {}),
			':updatedAt': now,
		};
		await ddbDocClient.send(
			new UpdateCommand({
				TableName: TABLE_NAME,
				Key: { PK: `USER#${userId}`, SK: 'METADATA' },
				UpdateExpression: updateExpression,
				ExpressionAttributeNames: expressionAttributeNames,
				ExpressionAttributeValues: expressionAttributeValues,
				ConditionExpression: 'attribute_exists(PK)',
			})
		);
	},

	async deleteUser(userId: string): Promise<void> {
		await ddbDocClient.send(
			new DeleteCommand({
				TableName: TABLE_NAME,
				Key: { PK: `USER#${userId}`, SK: 'METADATA' },
				ConditionExpression: 'attribute_exists(PK)',
			})
		);
	},

	async getAllUsers(): Promise<User[]> {
		const result = await ddbDocClient.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				IndexName: 'GSI1',
				KeyConditionExpression: 'GSI1PK = :gsi1pk',
				ExpressionAttributeValues: { ':gsi1pk': 'USER' },
			})
		);
		return result.Items ? (result.Items as User[]) : [];
	},

	async getAllUserItems(userId: string): Promise<any[]> {
		const userItems = await ddbDocClient.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				KeyConditionExpression: 'PK = :pk',
				ExpressionAttributeValues: { ':pk': `USER#${userId}` },
			})
		);

		const commentItems = await ddbDocClient.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				IndexName: 'GSI1',
				KeyConditionExpression: 'GSI1PK = :gsi1pk',
				ExpressionAttributeValues: { ':gsi1pk': `USER#${userId}` },
			})
		);

		return [...(userItems.Items || []), ...(commentItems.Items || [])];
	},

	async deleteItems(items: any[]): Promise<void> {
		if (items.length === 0) return;

		const deleteRequests = items.map((item) => ({
			DeleteRequest: {
				Key: { PK: item.PK, SK: item.SK },
			},
		}));

		await ddbDocClient.send(
			new BatchWriteCommand({
				RequestItems: {
					[TABLE_NAME!]: deleteRequests,
				},
			})
		);
	},

	async getUsersByIds(userIds: string[]): Promise<User[]> {
		if (userIds.length === 0) {
			return [];
		}

		const keys = userIds.map((userId) => ({
			PK: `USER#${userId}`,
			SK: 'METADATA',
		}));

		const result = await ddbDocClient.send(
			new BatchGetCommand({
				RequestItems: {
					[TABLE_NAME!]: {
						Keys: keys,
					},
				},
			})
		);

		return (result.Responses?.[TABLE_NAME!] || []) as User[];
	},
};
