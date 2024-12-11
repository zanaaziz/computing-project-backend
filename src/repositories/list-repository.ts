import { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand, UpdateCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { List } from '../models/list-model';

const TABLE_NAME = process.env.DYNAMODB_TABLE;

const dynamoDbClient = new DynamoDBClient({
	region: process.env.AWS_REGION || 'localhost',
	...(process.env.IS_OFFLINE && { endpoint: 'http://localhost:8000' }),
});

const ddbDocClient = DynamoDBDocumentClient.from(dynamoDbClient);

export const listRepository = {
	async createList(list: List): Promise<void> {
		await ddbDocClient.send(
			new PutCommand({
				TableName: TABLE_NAME,
				Item: list,
			})
		);
	},

	async deleteList(userId: string, listId: string): Promise<void> {
		await ddbDocClient.send(
			new DeleteCommand({
				TableName: TABLE_NAME,
				Key: { PK: `USER#${userId}`, SK: `LIST#${listId}` },
			})
		);
	},

	async getOwnedLists(userId: string): Promise<List[]> {
		const result = await ddbDocClient.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				KeyConditionExpression: 'PK = :pk and begins_with(SK, :sk)',
				ExpressionAttributeValues: {
					':pk': `USER#${userId}`,
					':sk': 'LIST#',
				},
			})
		);
		return result.Items ? (result.Items as List[]) : [];
	},

	async getFollowedLists(userId: string): Promise<List[]> {
		const followerResult = await ddbDocClient.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				IndexName: 'GSI2',
				KeyConditionExpression: 'SK = :sk',
				ExpressionAttributeValues: {
					':sk': `FOLLOWER#${userId}`,
				},
			})
		);

		const listIds = followerResult.Items ? followerResult.Items.map((item) => item.PK.split('#')[1]) : [];

		const lists = await Promise.all(
			listIds.map(async (listId) => {
				const listResult = await ddbDocClient.send(
					new QueryCommand({
						TableName: TABLE_NAME,
						IndexName: 'GSI3',
						KeyConditionExpression: 'GSI3PK = :gsi3pk AND GSI3SK = :gsi3sk',
						ExpressionAttributeValues: {
							':gsi3pk': listId,
							':gsi3sk': 'METADATA',
						},
					})
				);
				return listResult.Items && listResult.Items.length > 0 ? (listResult.Items[0] as List) : null;
			})
		);

		const publicLists = lists.filter((list): list is List => list !== null && list.visibility === 'public');
		return publicLists;
	},

	async getSharedLists(userId: string): Promise<List[]> {
		const result = await ddbDocClient.send(
			new ScanCommand({
				TableName: TABLE_NAME,
				FilterExpression: 'contains(sharedWith, :userId)',
				ExpressionAttributeValues: {
					':userId': userId,
				},
			})
		);
		return result.Items ? (result.Items as List[]) : [];
	},

	async getPublicListsByUser(userId: string): Promise<List[]> {
		const result = await ddbDocClient.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				KeyConditionExpression: 'PK = :pk and begins_with(SK, :sk)',
				FilterExpression: 'visibility = :visibility',
				ExpressionAttributeValues: {
					':pk': `USER#${userId}`,
					':sk': 'LIST#',
					':visibility': 'public',
				},
			})
		);
		return result.Items ? (result.Items as List[]) : [];
	},

	async getSharedListsByUser(ownerId: string, sharedWithUserId: string): Promise<List[]> {
		const result = await ddbDocClient.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				KeyConditionExpression: 'PK = :pk and begins_with(SK, :sk)',
				FilterExpression: 'contains(sharedWith, :sharedWithUserId)',
				ExpressionAttributeValues: {
					':pk': `USER#${ownerId}`,
					':sk': 'LIST#',
					':sharedWithUserId': sharedWithUserId,
				},
			})
		);
		return result.Items ? (result.Items as List[]) : [];
	},

	async updateList(userId: string, listId: string, updates: Partial<List>): Promise<void> {
		const updateExpression =
			'set ' +
			Object.keys(updates)
				.map((key) => `#${key} = :${key}`)
				.join(', ');
		const expressionAttributeNames = Object.keys(updates).reduce((acc, key) => ({ ...acc, [`#${key}`]: key }), {});
		const expressionAttributeValues = Object.keys(updates).reduce((acc, key) => ({ ...acc, [`:${key}`]: updates[key] }), {});

		await ddbDocClient.send(
			new UpdateCommand({
				TableName: TABLE_NAME,
				Key: { PK: `USER#${userId}`, SK: `LIST#${listId}` },
				UpdateExpression: updateExpression,
				ExpressionAttributeNames: expressionAttributeNames,
				ExpressionAttributeValues: expressionAttributeValues,
			})
		);
	},

	async addExerciseToList(userId: string, listId: string, exerciseId: string): Promise<void> {
		await ddbDocClient.send(
			new UpdateCommand({
				TableName: TABLE_NAME,
				Key: { PK: `USER#${userId}`, SK: `LIST#${listId}` },
				UpdateExpression: 'SET exercises = list_append(if_not_exists(exercises, :empty_list), :exercise)',
				ConditionExpression: 'NOT contains(exercises, :exerciseId)',
				ExpressionAttributeValues: {
					':exercise': [exerciseId],
					':empty_list': [],
					':exerciseId': exerciseId,
				},
			})
		);
	},

	async removeExerciseFromList(userId: string, listId: string, exerciseId: string): Promise<void> {
		const list = await this.getList(userId, listId);
		if (!list || !list.exercises.includes(exerciseId)) return;
		const updatedExercises = list.exercises.filter((id) => id !== exerciseId);
		await this.updateList(userId, listId, { exercises: updatedExercises });
	},

	async getList(userId: string, listId: string): Promise<List | null> {
		const result = await ddbDocClient.send(
			new GetCommand({
				TableName: TABLE_NAME,
				Key: { PK: `USER#${userId}`, SK: `LIST#${listId}` },
			})
		);
		return result.Item ? (result.Item as List) : null;
	},

	async getListById(listId: string): Promise<List | null> {
		const result = await ddbDocClient.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				IndexName: 'GSI3',
				KeyConditionExpression: 'GSI3PK = :gsi3pk and GSI3SK = :gsi3sk',
				ExpressionAttributeValues: {
					':gsi3pk': listId,
					':gsi3sk': 'METADATA',
				},
			})
		);
		return result.Items && result.Items.length > 0 ? (result.Items[0] as List) : null;
	},
};
