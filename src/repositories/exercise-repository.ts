import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Exercise } from '../models/exercise-model';

const TABLE_NAME = process.env.DYNAMODB_TABLE;

const dynamoDbClient = new DynamoDBClient({
	region: process.env.AWS_REGION || 'localhost',
	...(process.env.IS_OFFLINE && { endpoint: 'http://localhost:8000' }),
});

const ddbDocClient = DynamoDBDocumentClient.from(dynamoDbClient);

let cachedExercises: any[] | null = null;

function applyFilters(exercises: any[], filters: any): any[] {
	let result = exercises;

	if (filters.name) {
		const nameLower = filters.name;
		result = result.filter((ex) => ex.name.toLowerCase().includes(nameLower));
	}

	if (filters.force) {
		result = result.filter((ex) => ex.force && filters.force.includes(ex.force));
	}

	if (filters.level) {
		result = result.filter((ex) => filters.level.includes(ex.level));
	}

	if (filters.mechanic) {
		result = result.filter((ex) => ex.mechanic && filters.mechanic.includes(ex.mechanic));
	}

	if (filters.equipment) {
		result = result.filter((ex) => ex.equipment && filters.equipment.includes(ex.equipment));
	}

	if (filters.muscle) {
		result = result.filter((ex) => filters.muscle.some((m: string) => ex.primaryMuscles.includes(m) || ex.secondaryMuscles.includes(m)));
	}

	if (filters.category) {
		result = result.filter((ex) => filters.category.includes(ex.category));
	}

	return result;
}

export const exerciseRepository = {
	async getExercise(exerciseId: string): Promise<Exercise | null> {
		const result = await ddbDocClient.send(
			new GetCommand({
				TableName: TABLE_NAME,
				Key: { PK: `EXERCISE#${exerciseId}`, SK: 'METADATA' },
			})
		);
		return result.Item ? (result.Item as Exercise) : null;
	},

	async putExercise(exercise: Exercise): Promise<void> {
		await ddbDocClient.send(
			new PutCommand({
				TableName: TABLE_NAME,
				Item: exercise,
			})
		);
	},

	async getAllExercises(filters: any): Promise<any[]> {
		if (!cachedExercises) {
			const result = await ddbDocClient.send(
				new QueryCommand({
					TableName: TABLE_NAME,
					IndexName: 'GSI1',
					KeyConditionExpression: 'GSI1PK = :gsi1pk',
					ExpressionAttributeValues: { ':gsi1pk': 'EXERCISES' },
				})
			);
			cachedExercises = result.Items ? result.Items : [];
		}

		return applyFilters(cachedExercises, filters);
	},

	async getExercisesByIds(exerciseIds: string[]): Promise<Exercise[]> {
		if (exerciseIds.length === 0) return [];
		const keys = exerciseIds.map((id) => ({ PK: `EXERCISE#${id}`, SK: 'METADATA' }));
		const command = new BatchGetCommand({
			RequestItems: {
				[TABLE_NAME!]: {
					Keys: keys,
				},
			},
		});
		const result = await ddbDocClient.send(command);
		return result.Responses && result.Responses[TABLE_NAME!] ? (result.Responses[TABLE_NAME!] as Exercise[]) : [];
	},

	async updateCachedExercises(exercises: Exercise[]): Promise<void> {
		if (cachedExercises) {
			exercises.forEach((updatedExercise) => {
				const index = cachedExercises!.findIndex((ex) => ex.PK === updatedExercise.PK);
				if (index !== -1) {
					cachedExercises![index] = updatedExercise;
				}
			});
		}
	},
};
