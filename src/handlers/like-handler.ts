import { APIGatewayProxyHandler } from 'aws-lambda';
import { likeService } from '../services/like-service';
import { AppError, BadRequestError } from '../utils/error-util';
import { createLikeSchema, deleteLikeSchema } from '../utils/validation-util';

export const createLike: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}

		const body = JSON.parse(event.body || '{}');

		const { error } = createLikeSchema.validate(body);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}

		await likeService.likeExercise(body.exerciseId, userId);
		return { statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Like added' }) };
	} catch (error) {
		console.error('Error:', error);
		if (error instanceof AppError) {
			return {
				statusCode: error.statusCode,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: error.message, code: error.code }),
			};
		}
		return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Internal server error' }) };
	}
};

export const deleteLike: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}

		const queryParams = event.queryStringParameters || {};

		const { error } = deleteLikeSchema.validate(queryParams);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}

		await likeService.unlikeExercise(queryParams.exerciseId!, userId!);
		return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Like removed' }) };
	} catch (error) {
		console.error('Error:', error);
		if (error instanceof AppError) {
			return {
				statusCode: error.statusCode,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: error.message, code: error.code }),
			};
		}
		return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Internal server error' }) };
	}
};
