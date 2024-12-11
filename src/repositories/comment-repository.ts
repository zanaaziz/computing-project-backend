import { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Comment } from '../models/comment-model';

const TABLE_NAME = process.env.DYNAMODB_TABLE;

const dynamoDbClient = new DynamoDBClient({
	region: process.env.AWS_REGION || 'localhost',
	...(process.env.IS_OFFLINE && { endpoint: 'http://localhost:8000' }),
});

const ddbDocClient = DynamoDBDocumentClient.from(dynamoDbClient);

export const commentRepository = {
	async putComment(comment: Comment): Promise<void> {
		await ddbDocClient.send(
			new PutCommand({
				TableName: TABLE_NAME,
				Item: comment,
			})
		);
	},

	async deleteComment(pk: string, sk: string): Promise<void> {
		await ddbDocClient.send(
			new DeleteCommand({
				TableName: TABLE_NAME,
				Key: { PK: pk, SK: sk },
			})
		);
	},

	async getCommentsByExercise(exerciseId: string): Promise<Comment[]> {
		const result = await ddbDocClient.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				KeyConditionExpression: 'PK = :pk and begins_with(SK, :sk)',
				ExpressionAttributeValues: {
					':pk': `EXERCISE#${exerciseId}`,
					':sk': 'COMMENT#',
				},
			})
		);
		return result.Items ? (result.Items as Comment[]) : [];
	},

	async getCommentBySK(sk: string): Promise<Comment | null> {
		const result = await ddbDocClient.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				IndexName: 'GSI2',
				KeyConditionExpression: 'SK = :sk',
				ExpressionAttributeValues: {
					':sk': sk,
				},
			})
		);
		return result.Items && result.Items.length > 0 ? (result.Items[0] as Comment) : null;
	},

	async incrementCommentCount(exerciseId: string): Promise<void> {
		await ddbDocClient.send(
			new UpdateCommand({
				TableName: TABLE_NAME,
				Key: { PK: `EXERCISE#${exerciseId}`, SK: 'METADATA' },
				UpdateExpression: 'SET commentCount = commentCount + :inc',
				ExpressionAttributeValues: { ':inc': 1 },
			})
		);
	},

	async decrementCommentCount(exerciseId: string): Promise<void> {
		await ddbDocClient.send(
			new UpdateCommand({
				TableName: TABLE_NAME,
				Key: { PK: `EXERCISE#${exerciseId}`, SK: 'METADATA' },
				UpdateExpression: 'SET commentCount = commentCount - :dec',
				ConditionExpression: 'commentCount > :zero',
				ExpressionAttributeValues: { ':dec': 1, ':zero': 0 },
			})
		);
	},
};
