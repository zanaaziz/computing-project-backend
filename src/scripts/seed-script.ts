import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { readFileSync } from 'fs';
import { join } from 'path';

const IS_OFFLINE = process.env.IS_OFFLINE === 'true';
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'exercisely-dev';

const dynamoDbClient = new DynamoDBClient({
	region: process.env.AWS_REGION || 'localhost',
	...(IS_OFFLINE && { endpoint: 'http://localhost:8000' }),
});

const ddbDocClient = DynamoDBDocumentClient.from(dynamoDbClient);

interface ExerciseData {
	name: string;
	force: string | null;
	level: string;
	mechanic: string | null;
	equipment: string | null;
	primaryMuscles: string[];
	secondaryMuscles: string[];
	instructions: string[];
	category: string;
	images: string[];
	id: string;
}

async function seed() {
	try {
		const exercisesPath = join(__dirname, '..', '..', 'data.json');
		const exercises: ExerciseData[] = JSON.parse(readFileSync(exercisesPath, 'utf-8'));

		const items = [];

		for (const exercise of exercises) {
			const exerciseId = exercise.id;
			const now = new Date().toISOString();

			const metadataItem = {
				PK: `EXERCISE#${exerciseId}`,
				SK: 'METADATA',
				exerciseId: exerciseId,
				name: exercise.name.toLowerCase(),
				force: exercise.force ? exercise.force.toLowerCase() : null,
				level: exercise.level.toLowerCase(),
				mechanic: exercise.mechanic ? exercise.mechanic.toLowerCase() : null,
				equipment: exercise.equipment ? exercise.equipment.toLowerCase() : null,
				primaryMuscles: exercise.primaryMuscles.map((m) => m.toLowerCase()),
				secondaryMuscles: exercise.secondaryMuscles.map((m) => m.toLowerCase()),
				instructions: exercise.instructions,
				category: exercise.category.toLowerCase(),
				images: exercise.images.map((img) => `https://raw.githubusercontent.com/yuhonas/free-exercise-db/refs/heads/main/exercises/${img}`),
				likeCount: 0,
				commentCount: 0,
				createdAt: now,
				updatedAt: now,
				GSI1PK: 'EXERCISES',
				GSI1SK: `EXERCISE#${exerciseId}`,
			};
			items.push({ PutRequest: { Item: metadataItem } });

			for (const muscle of exercise.primaryMuscles) {
				const muscleItem = {
					PK: `CATEGORY#MUSCLE#${muscle.toLowerCase()}`,
					SK: `EXERCISE#${exerciseId}`,
					exercise_id: exerciseId,
					name: exercise.name,
					thumbnail_url: metadataItem.images[0],
					level: exercise.level.toLowerCase(),
				};
				items.push({ PutRequest: { Item: muscleItem } });
			}
		}

		const batches = chunkArray(items, 25);
		for (const batch of batches) {
			await ddbDocClient.send(
				new BatchWriteCommand({
					RequestItems: {
						[TABLE_NAME]: batch,
					},
				})
			);
		}

		console.log('Database seeded successfully!');
	} catch (error) {
		console.error('Error seeding database:', error);
		throw error;
	}
}

function chunkArray(array: any[], size: number) {
	const chunks = [];
	for (let i = 0; i < array.length; i += size) {
		chunks.push(array.slice(i, i + size));
	}
	return chunks;
}

seed();
