import { APIGatewayProxyHandler } from 'aws-lambda';
import { exerciseService } from '../services/exercise-service';
import { AppError, AuthenticationError, BadRequestError } from '../utils/error-util';
import { exerciseFiltersSchema } from '../utils/validation-util';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import OpenAI from 'openai';

const verifier = CognitoJwtVerifier.create({
	userPoolId: process.env.COGNITO_USER_POOL_ID!,
	tokenUse: 'access',
	clientId: process.env.COGNITO_CLIENT_ID!,
});

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

async function extractFiltersFromQuery(aiQuery: string): Promise<any> {
	const prompt = `
		You are an assistant that extracts exercise filter criteria from user queries. The possible filters are:
		- name: string
		- force: one or more of 'static', 'pull', 'push'
		- level: one or more of 'beginner', 'intermediate', 'expert'
		- mechanic: one or more of 'isolation', 'compound'
		- equipment: one or more of 'medicine ball', 'dumbbell', 'body only', 'bands', 'kettlebells', 'foam roll', 'cable', 'machine', 'barbell', 'exercise ball', 'e-z curl bar', 'other'
		- muscle: one or more of 'abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms', 'glutes', 'hamstrings', 'lats', 'lower back', 'middle back', 'neck', 'quadriceps', 'shoulders', 'traps', 'triceps'
		- category: one or more of 'powerlifting', 'strength', 'stretching', 'cardio', 'olympic weightlifting', 'strongman', 'plyometrics'

		Extract the relevant filters from the user's query and output them in JSON format. If a filter is not mentioned, omit it from the JSON. For each filter, if the query implies multiple values (e.g., 'dumbbell or barbell' for equipment), return an array of the relevant values. For the muscle filter, include all relevant muscle groups based on the query (e.g., 'legs' might map to ['quadriceps', 'glutes', 'hamstrings', 'calves']). Ensure the output is a valid JSON object.

		User query: "${aiQuery}"
  `;

	try {
		const response = await openai.chat.completions.create({
			model: 'gpt-4o-mini',
			messages: [
				{ role: 'system', content: prompt },
				{ role: 'user', content: aiQuery },
			],
			temperature: 0,
		});

		let content = response.choices[0].message.content;
		if (!content) {
			throw new Error('No content returned from AI');
		}

		const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
		if (jsonMatch && jsonMatch[1]) {
			content = jsonMatch[1].trim();
		} else {
			content = content.trim();
		}

		return JSON.parse(content);
	} catch (error) {
		console.error('Error extracting filters from AI:', error);
		throw new AppError('Failed to extract filters from AI query', 500, 'FAILED_AI_FILTER_EXTRACT');
	}
}

export const getAllExercises: APIGatewayProxyHandler = async (event) => {
	try {
		const queryParams = event.queryStringParameters || {};

		const { error, value } = exerciseFiltersSchema.validate(queryParams);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}

		let userId: string | undefined;
		const authHeader = event.headers['Authorization'] || event.headers['authorization'];
		if (authHeader && authHeader.startsWith('Bearer ')) {
			const token = authHeader.split(' ')[1];
			try {
				const payload = await verifier.verify(token);
				userId = payload.sub;
			} catch (err) {
				console.error('Invalid token provided:', err);
				throw new AuthenticationError('Invalid access token provided');
			}
		}

		const { aiQuery, page, pageSize } = value;
		let filters: any = {};

		if (aiQuery) {
			const aiFilters = await extractFiltersFromQuery(aiQuery);

			if (aiFilters.name) {
				filters.name = aiFilters.name.toLowerCase();
			}

			for (const key of ['force', 'level', 'mechanic', 'equipment', 'muscle', 'category']) {
				if (aiFilters[key]) {
					if (typeof aiFilters[key] === 'string') {
						filters[key] = [aiFilters[key].toLowerCase()];
					} else if (Array.isArray(aiFilters[key])) {
						filters[key] = aiFilters[key].map((value) => String(value).toLowerCase());
					} else {
						console.error(`Unexpected type for aiFilters[${key}]:`, aiFilters[key]);

						continue;
					}
				}
			}
		} else {
			if (value.name) {
				filters.name = value.name.toLowerCase();
			}
			for (const key of ['force', 'level', 'mechanic', 'equipment', 'muscle', 'category']) {
				if (value[key] && value[key].length > 0) {
					filters[key] = value[key];
				}
			}
		}

		const result = await exerciseService.getAllExercises(filters, page, pageSize, userId);

		if (aiQuery) {
			result['ai'] = { query: aiQuery, filters };
		}

		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(result),
		};
	} catch (error) {
		console.error('Error:', error);
		if (error instanceof AppError) {
			return {
				statusCode: error.statusCode,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: error.message, code: error.code }),
			};
		}
		return {
			statusCode: 500,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Internal server error' }),
		};
	}
};
