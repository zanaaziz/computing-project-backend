import { APIGatewayProxyHandler } from 'aws-lambda';
import { followerService } from '../services/follower-service';
import { listService } from '../services/list-service';
import { AppError, BadRequestError, ForbiddenError } from '../utils/error-util';
import { createFollowerSchema, deleteFollowerSchema, getFollowersSchema } from '../utils/validation-util';

export const createFollower: APIGatewayProxyHandler = async (event) => {
	try {
		const selfUserId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!selfUserId) {
			throw new BadRequestError('Missing user identity');
		}
		const body = JSON.parse(event.body || '{}');

		const { error } = createFollowerSchema.validate(body);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}

		if (body.userId && body.userId === selfUserId) {
			throw new BadRequestError('Cannot follow yourself');
		}
		if (body.listId) {
			const canFollow = await listService.canFollowList(selfUserId, body.listId);
			if (!canFollow) {
				throw new ForbiddenError('Cannot follow this list');
			}
		}
		await followerService.createFollower(selfUserId, body.userId, body.listId);
		return {
			statusCode: 201,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Followed successfully' }),
		};
	} catch (error) {
		console.error('Error creating follower:', error);
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

export const deleteFollower: APIGatewayProxyHandler = async (event) => {
	try {
		const selfUserId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!selfUserId) {
			throw new BadRequestError('Missing user identity');
		}
		const queryParams = event.queryStringParameters || {};

		const { error } = deleteFollowerSchema.validate(queryParams);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}
		await followerService.deleteFollower(selfUserId, queryParams.userId, queryParams.listId);
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Unfollowed successfully' }),
		};
	} catch (error) {
		console.error('Error deleting follower:', error);
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

export const getFollowers: APIGatewayProxyHandler = async (event) => {
	try {
		const queryParams = event.queryStringParameters || {};

		const { error } = getFollowersSchema.validate(queryParams);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}
		const followers = await followerService.getFollowers(queryParams.userId, queryParams.listId);
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(followers),
		};
	} catch (error) {
		console.error('Error fetching followers:', error);
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
