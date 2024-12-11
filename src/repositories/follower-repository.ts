import { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const TABLE_NAME = process.env.DYNAMODB_TABLE;

const dynamoDbClient = new DynamoDBClient({
	region: process.env.AWS_REGION || 'localhost',
	...(process.env.IS_OFFLINE && { endpoint: 'http://localhost:8000' }),
});

const ddbDocClient = DynamoDBDocumentClient.from(dynamoDbClient);

export const followerRepository = {
	async createUserFollower(followedUserId: string, followerUserId: string): Promise<void> {
		const now = new Date().toISOString();

		await ddbDocClient.send(
			new PutCommand({
				TableName: TABLE_NAME,
				Item: {
					PK: `USER#${followedUserId}`,
					SK: `FOLLOWER#${followerUserId}`,
					createdAt: now,
				},
				ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
			})
		);
	},

	async deleteUserFollower(followedUserId: string, followerUserId: string): Promise<void> {
		await ddbDocClient.send(
			new DeleteCommand({
				TableName: TABLE_NAME,
				Key: { PK: `USER#${followedUserId}`, SK: `FOLLOWER#${followerUserId}` },
			})
		);
	},

	async getUserFollowers(followedUserId: string): Promise<{ followerUserId: string; createdAt: string }[]> {
		const result = await ddbDocClient.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				KeyConditionExpression: 'PK = :pk and begins_with(SK, :sk)',
				ExpressionAttributeValues: {
					':pk': `USER#${followedUserId}`,
					':sk': 'FOLLOWER#',
				},
			})
		);

		return result.Items
			? result.Items.map((item) => ({
					followerUserId: item.SK.split('#')[1],
					createdAt: item.createdAt || '1970-01-01T00:00:00Z',
			  }))
			: [];
	},

	async getUserFollowings(followerUserId: string): Promise<{ followedUserId: string; createdAt: string }[]> {
		const result = await ddbDocClient.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				IndexName: 'GSI2',
				KeyConditionExpression: 'SK = :sk',
				ExpressionAttributeValues: {
					':sk': `FOLLOWER#${followerUserId}`,
				},
			})
		);
		return result.Items
			? result.Items.map((item) => ({
					followedUserId: item.PK.split('#')[1],
					createdAt: item.createdAt || '1970-01-01T00:00:00Z',
			  }))
			: [];
	},

	async createListFollower(listId: string, followerUserId: string): Promise<void> {
		const now = new Date().toISOString();

		await ddbDocClient.send(
			new PutCommand({
				TableName: TABLE_NAME,
				Item: {
					PK: `LIST#${listId}`,
					SK: `FOLLOWER#${followerUserId}`,
					createdAt: now,
				},
				ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
			})
		);
	},

	async deleteListFollower(listId: string, followerUserId: string): Promise<void> {
		await ddbDocClient.send(
			new DeleteCommand({
				TableName: TABLE_NAME,
				Key: { PK: `LIST#${listId}`, SK: `FOLLOWER#${followerUserId}` },
			})
		);
	},

	async getListFollowers(listId: string): Promise<{ followerUserId: string; createdAt: string }[]> {
		const result = await ddbDocClient.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				KeyConditionExpression: 'PK = :pk and begins_with(SK, :sk)',
				ExpressionAttributeValues: {
					':pk': `LIST#${listId}`,
					':sk': 'FOLLOWER#',
				},
			})
		);

		return result.Items
			? result.Items.map((item) => ({
					followerUserId: item.SK.split('#')[1],
					createdAt: item.createdAt || '1970-01-01T00:00:00Z',
			  }))
			: [];
	},

	async incrementUserFollowerCount(userId: string): Promise<void> {
		await ddbDocClient.send(
			new UpdateCommand({
				TableName: TABLE_NAME,
				Key: { PK: `USER#${userId}`, SK: 'METADATA' },
				UpdateExpression: 'SET followerCount = if_not_exists(followerCount, :zero) + :inc',
				ExpressionAttributeValues: { ':inc': 1, ':zero': 0 },
			})
		);
	},

	async decrementUserFollowerCount(userId: string): Promise<void> {
		await ddbDocClient.send(
			new UpdateCommand({
				TableName: TABLE_NAME,
				Key: { PK: `USER#${userId}`, SK: 'METADATA' },
				UpdateExpression: 'SET followerCount = followerCount - :dec',
				ConditionExpression: 'followerCount > :zero',
				ExpressionAttributeValues: { ':dec': 1, ':zero': 0 },
			})
		);
	},

	async incrementListFollowerCount(userId: string, listId: string): Promise<void> {
		await ddbDocClient.send(
			new UpdateCommand({
				TableName: TABLE_NAME,
				Key: { PK: `USER#${userId}`, SK: `LIST#${listId}` },
				UpdateExpression: 'SET followerCount = if_not_exists(followerCount, :zero) + :inc',
				ExpressionAttributeValues: { ':inc': 1, ':zero': 0 },
			})
		);
	},

	async decrementListFollowerCount(userId: string, listId: string): Promise<void> {
		await ddbDocClient.send(
			new UpdateCommand({
				TableName: TABLE_NAME,
				Key: { PK: `USER#${userId}`, SK: `LIST#${listId}` },
				UpdateExpression: 'SET followerCount = followerCount - :dec',
				ConditionExpression: 'followerCount > :zero',
				ExpressionAttributeValues: { ':dec': 1, ':zero': 0 },
			})
		);
	},
};
