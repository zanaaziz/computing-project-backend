import { APIGatewayProxyHandler } from 'aws-lambda';
import { commentService } from '../services/comment-service';
import { AppError, BadRequestError, ForbiddenError } from '../utils/error-util';
import { createCommentSchema, deleteCommentSchema, getCommentsSchema } from '../utils/validation-util';
import { userService } from '../services/user-service';

export const createComment: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}
		const body = JSON.parse(event.body || '{}');

		const { error } = createCommentSchema.validate(body);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}
		const comment = await commentService.createComment(body.exerciseId, userId, body.content);
		const user = await userService.getUser(userId);
		return {
			statusCode: 201,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				commentId: comment.commentId,
				exerciseId: comment.exerciseId,
				userId: comment.userId,
				content: comment.content,
				createdAt: comment.createdAt,
				updatedAt: comment.updatedAt,
				user: {
					name: user!.name,
					profilePhotoUrl: user!.profilePhotoUrl,
				},
			}),
		};
	} catch (error) {
		console.error('Error creating comment:', error);
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

export const deleteComment: APIGatewayProxyHandler = async (event) => {
	try {
		const userId = event.requestContext.authorizer?.jwt.claims.sub;
		if (!userId) {
			throw new BadRequestError('Missing user identity');
		}
		const queryParams = event.queryStringParameters || {};

		const { error } = deleteCommentSchema.validate(queryParams);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}

		const comment = await commentService.getComments(undefined, queryParams.commentId!);
		if (!comment || comment.userId !== userId) {
			throw new ForbiddenError('You do not have permission to delete this comment');
		}
		await commentService.deleteComment(queryParams.commentId!);
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Comment deleted' }),
		};
	} catch (error) {
		console.error('Error deleting comment:', error);
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

export const getComments: APIGatewayProxyHandler = async (event) => {
	try {
		const queryParams = event.queryStringParameters || {};
		const { error } = getCommentsSchema.validate(queryParams);
		if (error) {
			throw new BadRequestError(error.details[0].message);
		}
		const exerciseId = queryParams.exerciseId;
		const commentId = queryParams.commentId;
		const comments = await commentService.getComments(exerciseId, commentId);
		return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(comments) };
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
