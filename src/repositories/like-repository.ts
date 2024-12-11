import { DynamoDBDocumentClient, PutCommand, DeleteCommand, UpdateCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BadRequestError } from '../utils/error-util';

const TABLE_NAME = process.env.DYNAMODB_TABLE;

const dynamoDbClient = new DynamoDBClient({
	region: process.env.AWS_REGION || 'localhost',
	...(process.env.IS_OFFLINE && { endpoint: 'http://localhost:8000' }),
});

const ddbDocClient = DynamoDBDocumentClient.from(dynamoDbClient);

export const likeRepository = {
	async createLike(exerciseId: string, userId: string): Promise<void> {
		try {
			await ddbDocClient.send(
				new PutCommand({
					TableName: TABLE_NAME,
					Item: {
						PK: `EXERCISE#${exerciseId}`,
						SK: `LIKE#${userId}`,
					},
					ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
				})
			);

			await ddbDocClient.send(
				new UpdateCommand({
					TableName: TABLE_NAME,
					Key: {
						PK: `USER#${userId}`,
						SK: 'LIKES',
					},
					UpdateExpression: 'ADD likedExercises :exerciseId',
					ExpressionAttributeValues: {
						':exerciseId': new Set([exerciseId]),
					},
				})
			);
		} catch (error: any) {
			console.error('Error:', error);
			if (error.name === 'ConditionalCheckFailedException') {
				throw new BadRequestError('Already liked');
			}
			throw error;
		}
	},

	async deleteLike(exerciseId: string, userId: string): Promise<void> {
		try {
			await ddbDocClient.send(
				new DeleteCommand({
					TableName: TABLE_NAME,
					Key: { PK: `EXERCISE#${exerciseId}`, SK: `LIKE#${userId}` },
					ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
				})
			);

			await ddbDocClient.send(
				new UpdateCommand({
					TableName: TABLE_NAME,
					Key: {
						PK: `USER#${userId}`,
						SK: 'LIKES',
					},
					UpdateExpression: 'DELETE likedExercises :exerciseId',
					ExpressionAttributeValues: {
						':exerciseId': new Set([exerciseId]),
					},
				})
			);
		} catch (error: any) {
			console.error('Error:', error);
			if (error.name === 'ConditionalCheckFailedException') {
				throw new BadRequestError('Not liked');
			}
			throw error;
		}
	},

	async incrementLikeCount(exerciseId: string): Promise<void> {
		await ddbDocClient.send(
			new UpdateCommand({
				TableName: TABLE_NAME,
				Key: { PK: `EXERCISE#${exerciseId}`, SK: 'METADATA' },
				UpdateExpression: 'SET likeCount = likeCount + :inc',
				ExpressionAttributeValues: { ':inc': 1 },
			})
		);
	},

	async decrementLikeCount(exerciseId: string): Promise<void> {
		await ddbDocClient.send(
			new UpdateCommand({
				TableName: TABLE_NAME,
				Key: { PK: `EXERCISE#${exerciseId}`, SK: 'METADATA' },
				UpdateExpression: 'SET likeCount = likeCount - :dec',
				ConditionExpression: 'likeCount > :zero',
				ExpressionAttributeValues: { ':dec': 1, ':zero': 0 },
			})
		);
	},

	async getUserLikedExerciseIds(userId: string): Promise<string[]> {
		try {
			const result = await ddbDocClient.send(
				new GetCommand({
					TableName: TABLE_NAME,
					Key: {
						PK: `USER#${userId}`,
						SK: 'LIKES',
					},
				})
			);

			const item = result.Item;
			if (!item || !item.likedExercises) {
				return [];
			}

			return Array.from(item.likedExercises);
		} catch (error: any) {
			console.error('Error fetching liked exercises:', error);
			throw error;
		}
	},
};
